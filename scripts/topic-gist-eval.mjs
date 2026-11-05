#!/usr/bin/env node
/**
 * Topic gists, measured: one or two sentences for each topic of a conversation,
 * from the topic's own turns (`docs/topics-round-2.md`).
 *
 * A topic here is a stretch AMI's annotators marked as one top-level topic (60
 * words or more), so the gist is judged apart from how the topics were cut. The
 * gold is the annotators' label and the sentences of their summary that rest on
 * this stretch (AMI's `summlink` files tie summary sentences to dialogue acts).
 *
 *   node scripts/topic-gist-eval.mjs generate --model <provider:model[@opts]> --ami <dir> --out <dir>
 *        [--set eval24|learn12] [--meetings a,b] [--replay <dir>] [--tag name] [--prompt v1]
 *        [--budget 3000] [--concurrency 4] [--gguf <file> --llama-server <binary>] [--fm-bridge <binary>]
 *   node scripts/topic-gist-eval.mjs judge --judge <spec> --ami <dir> --out <dir> [--keys a,b] [--chunk 10]
 *   node scripts/topic-gist-eval.mjs report --out <dir> [--baseline key] [--judges a,b] [--json file]
 *
 * Public AMI data only for any cloud model. Keys come from the environment, and
 * every request is in the spend ledger (FM_LEDGER), stopped at FM_BUDGET_USD.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  ask,
  bootstrapMean,
  costOf,
  mean,
  parseSpec,
  percentile,
  seeded,
  startFmBridge,
  startLocalServer,
  stopFmBridge,
  stopLocalServers,
} from "./lib/fast-models.mjs";
import { EVAL24, linkedSummary, spanTranscript } from "./lib/summary-corpus.mjs";
import {
  amiRecognized,
  amiReference,
  annotationsDir,
  humanSegments,
  topicNames,
} from "./lib/topic-corpus.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildGistPrompt, parseTopicGist, GIST_SYSTEM_VARIANTS } = await import(
  pathToFileURL(path.join(ROOT, "scripts/lib/topic-gist.mjs")).href
);

export const LEARN12 =
  "ES2002a ES2005b ES2008c ES2011d IS1000a IS1003b IS1006c IS1008d TS3004a TS3008b TS3009c TS3012d".split(
    " "
  );

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    ami: { type: "string" },
    out: { type: "string" },
    set: { type: "string", default: "eval24" },
    meetings: { type: "string" },
    replay: { type: "string" },
    tag: { type: "string" },
    prompt: { type: "string", default: "v1" },
    budget: { type: "string", default: "3000" },
    concurrency: { type: "string", default: "4" },
    gguf: { type: "string" },
    "llama-server": { type: "string" },
    "fm-bridge": { type: "string" },
    port: { type: "string", default: "18452" },
    judge: { type: "string" },
    keys: { type: "string" },
    chunk: { type: "string", default: "10" },
    baseline: { type: "string" },
    judges: { type: "string" },
    batch: { type: "boolean", default: false },
    json: { type: "string" },
    "min-words": { type: "string", default: "60" },
  },
});
const command = positionals[0];
const MIN_WORDS = Number(args["min-words"]);

const hash = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
const safe = (text) => text.replace(/[^\w.@-]+/g, "_");

function topicsOf(meeting, { replay } = {}) {
  const dir = annotationsDir(args.ami);
  const names = topicNames(dir);
  let conversation;
  if (replay) {
    const file = path.join(replay, `${meeting}.json`);
    if (!fs.existsSync(file)) return [];
    const recording = JSON.parse(fs.readFileSync(file, "utf8"));
    conversation = amiRecognized(dir, meeting, names, recording.segments);
  } else {
    conversation = amiReference(dir, meeting, names);
  }
  const linked = linkedSummary(args.ami, meeting);
  return humanSegments(conversation, { minWords: MIN_WORDS }).map((segment) => {
    const turns = conversation.utterances.slice(segment.from, segment.to + 1).map((u) => u.text);
    // The summary sentences that rest on this stretch: at least a third of their links.
    const gold = linked
      .filter((sentence) => {
        const inside = sentence.spans.filter(
          (span) =>
            (span.start + span.end) / 2 >= segment.start &&
            (span.start + span.end) / 2 <= segment.end
        ).length;
        return inside && inside / sentence.spans.length >= 1 / 3;
      })
      .map((sentence) => ({ id: sentence.id, section: sentence.section, text: sentence.text }));
    return {
      item: `${meeting}@${Math.round(segment.start)}`,
      meeting,
      start: segment.start,
      end: segment.end,
      words: segment.words,
      label: segment.label,
      turns,
      gold,
    };
  });
}

function meetingList() {
  if (args.meetings) return args.meetings.split(",");
  if (args.set === "eval24") return EVAL24;
  if (args.set === "learn12") return LEARN12;
  throw new Error(`Unknown --set ${args.set}`);
}

async function pool(items, size, work) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await work(items[index], index);
      }
    })
  );
}

// --- generate

function keyOf() {
  const base = args.tag ?? `${args.model}${args.prompt === "v1" ? "" : `+${args.prompt}`}`;
  return safe(args.replay ? `${base}+${path.basename(args.replay)}` : base);
}

/**
 * Gists with no writing model. `extract:last`: the line the flow card quotes
 * today (`quotedUtterance`, the topic's last turn). `extract:central`: the turn
 * of 8 words or more nearest the topic's mean vector.
 */
async function extractGist(kind, turns) {
  const usable = turns.map((turn) => turn.trim()).filter(Boolean);
  if (kind === "last") return usable.at(-1) ?? null;
  const long = usable.filter((turn) => turn.split(/\s+/).length >= 8);
  const pool = long.length ? long : usable;
  const { createEmbedder, dot } = await import("./lib/minilm.mjs");
  embedder ??= await createEmbedder({ cacheDir: path.join(args.out, "vectors") });
  const vectors = await embedder.embed(pool);
  const mean = new Float32Array(vectors[0].length);
  for (const vector of vectors) vector.forEach((value, index) => (mean[index] += value));
  let best = 0;
  let bestScore = -Infinity;
  vectors.forEach((vector, index) => {
    const score = dot(vector, mean);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return pool[best];
}

let embedder = null;

async function generate() {
  const spec = args.model;
  const { provider, model } = parseSpec(spec);
  const key = keyOf();
  const dir = path.join(args.out, "gists");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}.json`);
  const done = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { key, spec, gists: {} };
  const local = provider === "local";
  const system = provider === "fm";
  if (local) {
    await startLocalServer(model, {
      binary: args["llama-server"],
      model: args.gguf,
      port: Number(args.port),
      contextSize: 8192,
    });
  }
  if (system) await startFmBridge(args["fm-bridge"]);
  const topics = meetingList().flatMap((meeting) => topicsOf(meeting, { replay: args.replay }));
  const missing = topics.filter((topic) => !done.gists[topic.item]);
  console.error(`${key}: ${missing.length} of ${topics.length} topics to do`);
  let count = 0;
  try {
    await pool(missing, local || system ? 1 : Number(args.concurrency), async (topic) => {
      if (provider === "extract") {
        const started = performance.now();
        const gist = parseTopicGist(await extractGist(model, topic.turns));
        done.gists[topic.item] = { gist, raw: "", ms: performance.now() - started, cost: 0 };
        count += 1;
        return;
      }
      const prompt = buildGistPrompt({
        turns: topic.turns,
        budget: Number(args.budget),
        variant: args.prompt,
      });
      const result = await ask(spec, {
        system: prompt.system,
        user: prompt.text,
        maxTokens: 160,
        purpose: "gist",
        timeoutMs: 90_000,
      });
      done.gists[topic.item] = {
        gist: result.ok ? parseTopicGist(result.text) : null,
        raw: result.ok ? result.text.slice(0, 600) : `error: ${result.error}`,
        ms: result.ms,
        cost: result.cost,
        input: result.usage?.input ?? null,
        output: result.usage?.output ?? null,
      };
      count += 1;
      if (count % 20 === 0) {
        fs.writeFileSync(file, JSON.stringify(done, null, 1));
        console.error(`  ${count}/${missing.length}`);
      }
    });
  } finally {
    if (local) stopLocalServers();
    if (system) stopFmBridge();
  }
  fs.writeFileSync(file, JSON.stringify(done, null, 1));
  summarizeKey(done);
}

function summarizeKey(run) {
  const rows = Object.values(run.gists);
  const ok = rows.filter((row) => row.gist);
  const ms = ok.map((row) => row.ms);
  console.log(
    `${run.key}: ${ok.length}/${rows.length} gists, ${Math.round(mean(ok.map((row) => row.gist.split(/\s+/).length)))} words, p50 ${Math.round(percentile(ms, 50) ?? 0)} ms p95 ${Math.round(percentile(ms, 95) ?? 0)} ms, $${rows.reduce((sum, row) => sum + (row.cost ?? 0), 0).toFixed(3)}`
  );
}

// --- judge

const JUDGE_SYSTEM = `You grade gists of one part of a recorded meeting. A gist is one or two sentences that tell a person what that part was about. You are careful and strict, and you grade each gist on its own.

You get:
1. LABEL: the annotators' label for this part.
2. TRANSCRIPT: the manual transcript of this part, what was really said. Each line is a speaker and their words. Speech overlaps, so some lines are fragments.
3. REFERENCE: sentences a person wrote about the meeting that rest on this part, ids like A1, D1, T1, P1. The list can be empty.
4. CANDIDATES: gists written by different systems, each with an id. Some were written from an automatic transcript with many recognition errors. Their order means nothing.

For each candidate, give:
- "gist": 1 to 5. How well does it tell a participant what this part was about? 5: accurate, states the point of this part, easy to read. 4: accurate and states most of the point. 3: some value, but vague or with a real gap. 2: mostly vague, or partly wrong. 1: misleading or of no use.
- "covered": the ids of the REFERENCE items whose substance it states (a paraphrase counts; a passing mention of the subject without the point does not).
- "unsupported": every claim in it that the TRANSCRIPT of this part does not support. Count invented facts, wrong numbers or prices, decisions or agreements that were not made, actions nobody took on, and things attributed to the wrong person. Do not count omissions, vague but true statements, or other words for what was said. Quote each claim briefly, 15 words or fewer.

Answer with JSON only: {"grades": [{"id": "...", "gist": 4, "covered": ["D1"], "unsupported": ["..."]}]}, one entry per candidate, in any order.`;

const JUDGE_SCHEMA = {
  name: "gist_grades",
  schema: {
    type: "object",
    properties: {
      grades: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            gist: { type: "integer" },
            covered: { type: "array", items: { type: "string" } },
            unsupported: { type: "array", items: { type: "string" } },
          },
          required: ["id", "gist", "covered", "unsupported"],
          additionalProperties: false,
        },
      },
    },
    required: ["grades"],
    additionalProperties: false,
  },
};

function loadRuns(keys) {
  const dir = path.join(args.out, "gists");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")))
    .filter((run) => !keys || keys.includes(run.key));
}

async function judge() {
  const spec = args.judge;
  const keys = args.keys ? args.keys.split(",") : null;
  const runs = loadRuns(keys);
  const dir = path.join(args.out, "judge", safe(spec));
  fs.mkdirSync(dir, { recursive: true });
  const meetings = [
    ...new Set(runs.flatMap((run) => Object.keys(run.gists).map((item) => item.split("@")[0]))),
  ];
  const jobs = [];
  for (const meeting of meetings) {
    const transcript = new Map();
    for (const topic of topicsOf(meeting)) transcript.set(topic.item, topic);
    const items = new Set(
      runs.flatMap((run) => Object.keys(run.gists).filter((item) => item.startsWith(`${meeting}@`)))
    );
    for (const item of items) {
      const gists = new Map();
      for (const run of runs) {
        const gist = run.gists[item]?.gist;
        if (gist) gists.set(gist, gist);
      }
      const topic = transcript.get(item) ?? nearestTopic(transcript, item);
      if (!topic) continue;
      const missing = [...gists.keys()].filter(
        (gist) => !fs.existsSync(path.join(dir, `${hash(`${item}\n${gist}`)}.json`))
      );
      if (!missing.length) continue;
      const random = seeded(Number.parseInt(hash(item).slice(0, 8), 16));
      const shuffled = missing
        .map((gist) => ({ gist, order: random() }))
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.gist);
      const chunk = Number(args.chunk);
      for (let at = 0; at < shuffled.length; at += chunk) {
        jobs.push({ item, topic, candidates: shuffled.slice(at, at + chunk) });
      }
    }
  }
  console.error(`${spec}: ${jobs.length} requests`);
  let done = 0;
  const judgePrompt = (job, ids) =>
    [
      `LABEL: ${job.topic.label}`,
      "",
      "TRANSCRIPT:",
      spanTranscript(args.ami, job.topic.meeting, job.topic.start, job.topic.end).slice(0, 14_000),
      "",
      "REFERENCE:",
      ...(job.topic.gold.length
        ? job.topic.gold.map((item) => `${item.id}. ${item.text}`)
        : ["(none)"]),
      "",
      "CANDIDATES:",
      ...job.candidates.map((gist, index) => `${ids[index]}: ${gist}`),
    ].join("\n");
  const save = (job, ids, json) => {
    const grades = new Map((json?.grades ?? []).map((grade) => [String(grade.id), grade]));
    job.candidates.forEach((gist, index) => {
      const grade = grades.get(ids[index]);
      if (!grade || !Number.isInteger(grade.gist)) return;
      fs.writeFileSync(
        path.join(dir, `${hash(`${job.item}\n${gist}`)}.json`),
        JSON.stringify({ item: job.item, gist, grade, gold: job.topic.gold.length })
      );
    });
  };
  if (args.batch && parseSpec(spec).provider === "anthropic") {
    await judgeBatch(spec, jobs, judgePrompt, save);
    return;
  }
  await pool(jobs, parseSpec(spec).provider === "anthropic" ? 6 : 8, async (job) => {
    const ids = job.candidates.map((_, index) => `G${index + 1}`);
    const result = await ask(spec, {
      system: JUDGE_SYSTEM,
      user: judgePrompt(job, ids),
      schema: JUDGE_SCHEMA,
      maxTokens: 3000,
      parseJson: true,
      purpose: "gist-judge",
      timeoutMs: 180_000,
      attempts: 3,
    });
    save(job, ids, result.json);
    done += 1;
    if (done % 20 === 0) console.error(`  ${done}/${jobs.length}`);
  });
}

/** One judge's requests through Anthropic's Message Batches, at half the price. */
async function judgeBatch(spec, jobs, judgePrompt, save) {
  const { model, options } = parseSpec(spec);
  const effort = options.find((option) => /^(low|medium|high)$/.test(option)) ?? "low";
  const headers = {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  const byId = new Map();
  const requests = jobs.map((job, index) => {
    const ids = job.candidates.map((_, at) => `G${at + 1}`);
    byId.set(`job${index}`, { job, ids });
    return {
      custom_id: `job${index}`,
      params: {
        model,
        max_tokens: 6000,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: judgePrompt(job, ids) }],
        output_config: { effort, format: { type: "json_schema", schema: JUDGE_SCHEMA.schema } },
      },
    };
  });
  const created = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers,
    body: JSON.stringify({ requests }),
  });
  if (!created.ok)
    throw new Error(`batch: HTTP ${created.status}: ${(await created.text()).slice(0, 300)}`);
  let status = await created.json();
  console.error(`batch ${status.id}: ${requests.length} requests`);
  while (status.processing_status !== "ended") {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${status.id}`, {
      headers,
    });
    status = await res.json();
    console.error(`  ${status.processing_status} ${JSON.stringify(status.request_counts)}`);
  }
  const text = await (await fetch(status.results_url, { headers })).text();
  const ledger = process.env.FM_LEDGER;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const entry = byId.get(row.custom_id);
    const message = row.result?.message;
    if (!message || !entry) continue;
    const usage = {
      input:
        (message.usage?.input_tokens ?? 0) +
        (message.usage?.cache_read_input_tokens ?? 0) +
        (message.usage?.cache_creation_input_tokens ?? 0),
      cached: message.usage?.cache_read_input_tokens ?? 0,
      written: message.usage?.cache_creation_input_tokens ?? 0,
      output: message.usage?.output_tokens ?? 0,
    };
    // Batches cost half.
    const cost = (costOf(spec, usage) ?? 0) / 2;
    if (ledger) {
      fs.appendFileSync(
        ledger,
        `${JSON.stringify({ at: new Date().toISOString(), spec, purpose: "gist-judge-batch", ...usage, cost })}\n`
      );
    }
    const answer = (message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    try {
      save(entry.job, entry.ids, JSON.parse(answer));
    } catch {}
  }
}

/** A recognized meeting's stretch may start a little off the manual one's: the closest within 90 s. */
function nearestTopic(topics, item) {
  const at = Number(item.split("@")[1]);
  let best = null;
  for (const topic of topics.values()) {
    if (!best || Math.abs(topic.start - at) < Math.abs(best.start - at)) best = topic;
  }
  return best && Math.abs(best.start - at) <= 90 ? best : null;
}

// --- report

function report() {
  const judgeDirs = fs.readdirSync(path.join(args.out, "judge"));
  const judges = args.judges ? args.judges.split(",").map(safe) : judgeDirs;
  const runs = loadRuns(args.keys ? args.keys.split(",") : null);
  const table = [];
  const gradesOf = (run, judgeName) => {
    const rows = [];
    for (const [item, row] of Object.entries(run.gists)) {
      if (!row.gist) {
        rows.push({ item, meeting: item.split("@")[0], missing: true });
        continue;
      }
      const file = path.join(args.out, "judge", judgeName, `${hash(`${item}\n${row.gist}`)}.json`);
      if (!fs.existsSync(file)) continue;
      const { grade, gold } = JSON.parse(fs.readFileSync(file, "utf8"));
      rows.push({
        item,
        meeting: item.split("@")[0],
        gist: Math.min(5, Math.max(1, grade.gist)),
        unsupported: (grade.unsupported ?? []).length,
        covered: gold ? new Set(grade.covered ?? []).size / gold : null,
      });
    }
    return rows;
  };
  const byMeeting = (rows, key) => {
    const meetings = new Map();
    for (const row of rows) {
      if (row[key] == null) continue;
      const list = meetings.get(row.meeting) ?? [];
      list.push(row[key]);
      meetings.set(row.meeting, list);
    }
    return meetings;
  };
  for (const run of runs) {
    const line = { key: run.key, judges: {} };
    const ok = Object.values(run.gists).filter((row) => row.gist);
    line.done = ok.length;
    line.topics = Object.keys(run.gists).length;
    line.ms50 = percentile(
      ok.map((row) => row.ms),
      50
    );
    line.ms95 = percentile(
      ok.map((row) => row.ms),
      95
    );
    line.words = mean(ok.map((row) => row.gist.split(/\s+/).length));
    line.dollars = Object.values(run.gists).reduce((sum, row) => sum + (row.cost ?? 0), 0);
    for (const name of judges) {
      const rows = gradesOf(run, name).filter((row) => !row.missing);
      if (!rows.length) continue;
      line.judges[name] = {
        n: rows.length,
        gist: mean(rows.map((row) => row.gist)),
        unsupported: mean(rows.map((row) => row.unsupported)),
        covered: mean(rows.map((row) => row.covered).filter((value) => value != null)),
      };
    }
    const pooled = (key) => mean(Object.values(line.judges).map((judgeRow) => judgeRow[key]));
    line.gist = pooled("gist");
    line.unsupported = pooled("unsupported");
    line.covered = pooled("covered");
    table.push(line);
  }
  table.sort((a, b) => (b.gist ?? 0) - (a.gist ?? 0));
  const f = (value, digits = 2) =>
    value == null || Number.isNaN(value) ? "n/a" : value.toFixed(digits);
  for (const line of table) {
    const each = Object.entries(line.judges)
      .map(([name, row]) => `${name.split(/[:@]/)[1] ?? name} ${f(row.gist)}/${f(row.unsupported)}`)
      .join(" ");
    console.log(
      `${line.key.padEnd(52)} gist ${f(line.gist)} invented ${f(line.unsupported)} covered ${f((line.covered ?? 0) * 100, 0)}% (${line.done}/${line.topics}; ${each}) ${f(line.words, 0)} w, p50 ${f((line.ms50 ?? 0) / 1000, 1)} s p95 ${f((line.ms95 ?? 0) / 1000, 1)} s, $${f(line.dollars, 3)}`
    );
  }
  if (args.baseline) {
    const base = runs.find((run) => run.key === args.baseline);
    for (const run of runs) {
      if (run === base) continue;
      const parts = [];
      for (const key of ["gist", "unsupported"]) {
        const diffs = [];
        for (const name of judges) {
          const a = byMeeting(gradesOf(base, name), key);
          const b = byMeeting(gradesOf(run, name), key);
          for (const [meeting, values] of a) {
            if (!b.has(meeting)) continue;
            diffs.push({ meeting, value: mean(b.get(meeting)) - mean(values) });
          }
        }
        const perMeeting = new Map();
        for (const { meeting, value } of diffs) {
          perMeeting.set(meeting, [...(perMeeting.get(meeting) ?? []), value]);
        }
        const stat = bootstrapMean([...perMeeting.values()].map((values) => mean(values)));
        parts.push(`${key} ${f(stat.mean)} [${f(stat.low)}, ${f(stat.high)}]`);
      }
      console.log(`  ${run.key} against ${base.key}: ${parts.join("  ")}`);
    }
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(table, null, 1));
}

const commands = { generate, judge, report };
if (!commands[command]) {
  console.error("topic-gist-eval.mjs generate|judge|report (see the header)");
  process.exit(2);
}
await commands[command]();
