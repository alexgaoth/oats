#!/usr/bin/env node
/**
 * Measure the topic names a writing model gives, against human topic labels.
 *
 * Corpus: the AMI meeting corpus (CC BY 4.0), manual annotations 1.6.2
 * (`ami_public_manual_1.6.2`): per-speaker word transcripts with times, speaker
 * segments, and human topic segments, each with a description or a type from
 * the corpus's topic list. Nothing of Oats' users is read.
 *
 * Two runs per meeting:
 *
 *   tracker  The meeting replayed turn by turn through the app's own topic
 *            tracker (`conversationTopics.mjs`), with the app's own namer
 *            (`topicNamer.mjs`) asking the model while it "records" on a
 *            virtual clock, then its final pass. This is what a person would
 *            see: on-device labels, then the model's names.
 *   oracle   Each human topic segment named directly with the same prompt, as
 *            if topic detection were perfect. This measures naming alone.
 *
 * Requests use the app's request shape for OpenAI (`inferenceProviders/openai.ts`):
 * the Responses API, the system prompt and the prompt as two messages,
 * `store: false`, 4096 output tokens, a temperature only where the model takes
 * one, and no reasoning setting. A judge model then grades every name (the
 * on-device label and the model's name, shuffled, unlabelled): relevance to
 * what was said and specificity, 1 to 5, and whether it names the same
 * subject as the human annotators' description, 0 to 2.
 *
 *   OPENAI_API_KEY=… node scripts/topic-names-eval.mjs --ami <dir>
 *       [--meetings ES2004a,IS1009a] [--model gpt-5.6-luna] [--judge gpt-5.6-sol]
 *       [--no-judge] [--no-oracle] [--tracker <conversationTopics.mjs>] [--json out.json]
 *
 * `<dir>` is the corpus folder holding `annotations/` (words, segments,
 * topics, ontologies). The key is read from the environment only and never
 * written anywhere.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = (name) => import(path.join(ROOT, "src/helpers", name));
// `--tracker <file>` replays through another topic tracker with the same
// snapshot shape, for example one being changed in another worktree.
const trackerAt = process.argv.indexOf("--tracker");
const { ConversationTopicTracker } = await (trackerAt !== -1 && process.argv[trackerAt + 1]
  ? import(path.resolve(process.argv[trackerAt + 1]))
  : helper("conversationTopics.mjs"));
const { countWords } = await helper("recordingCounters.mjs");
const { TopicNamer } = await helper("topicNamer.mjs");
const { buildTopicNamePrompt, isNameableTopic, parseTopicName, topicExcerpt } =
  await helper("topicNaming.mjs");

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const AMI = arg("ami", path.join(process.env.HOME ?? "", "oats-asr-cache/AMI"));
const ANNOTATIONS = fs.existsSync(path.join(AMI, "annotations"))
  ? path.join(AMI, "annotations")
  : AMI;
const MEETINGS = arg(
  "meetings",
  "ES2004a,ES2004b,ES2004c,ES2004d,IS1009a,IS1009b,TS3003a,TS3003b"
).split(",");
const MODEL = arg("model", "gpt-5.6-luna");
const JUDGE = arg("judge", "gpt-5.6-sol");
const JUDGING = !process.argv.includes("--no-judge");
const ORACLE = !process.argv.includes("--no-oracle");
const JSON_OUT = arg("json");
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}

// Standard-tier prices per million tokens, from OpenAI's pricing page
// (developers.openai.com/api/docs/pricing, read 2026-10-26).
const PRICES = {
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4-nano": { input: 0.2, cached: 0.02, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-5-nano": { input: 0.05, cached: 0.005, output: 0.4 },
  "gpt-5-mini": { input: 0.25, cached: 0.025, output: 2 },
};

// --- The corpus.

const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
// XML's five entities, in one pass, so "&amp;lt;" stays "&lt;".
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);

function loadOntology() {
  const xml = fs.readFileSync(path.join(ANNOTATIONS, "ontologies/default-topics.xml"), "latin1");
  const names = new Map();
  for (const match of xml.matchAll(/<topicname [^>]*nite:id="([^"]+)"[^>]*name="([^"]*)"/g)) {
    names.set(match[1], match[2]);
  }
  return names;
}

function loadWords(meeting) {
  const bySpeaker = new Map();
  const files = fs
    .readdirSync(path.join(ANNOTATIONS, "words"))
    .filter((file) => file.startsWith(`${meeting}.`));
  for (const file of files) {
    const speaker = file.split(".")[1];
    const xml = fs.readFileSync(path.join(ANNOTATIONS, "words", file), "latin1");
    const list = [];
    for (const match of xml.matchAll(
      /<(w|vocalsound|disfmarker|gap|nonvocalsound|comment|pause)\b([^>]*?)(\/>|>([^<]*)<\/\1>)/g
    )) {
      const [, kind, attrs, , text] = match;
      list.push({
        id: attr(attrs, "nite:id"),
        kind,
        start: Number(attr(attrs, "starttime")),
        end: Number(attr(attrs, "endtime")),
        punc: attr(attrs, "punc") === "true",
        text: kind === "w" ? decode(text ?? "") : "",
      });
    }
    bySpeaker.set(speaker, list);
  }
  return bySpeaker;
}

function expandRange(href, words) {
  const match = /^([^#]+)#id\(([^)]+)\)(?:\.\.id\(([^)]+)\))?$/.exec(href ?? "");
  if (!match) return [];
  const list = words.get(match[1].split(".")[1]) ?? [];
  const from = list.findIndex((word) => word.id === match[2]);
  const to = match[3] ? list.findIndex((word) => word.id === match[3]) : from;
  return from < 0 || to < 0 ? [] : list.slice(from, to + 1);
}

/** Human topics, innermost first: each word belongs to the innermost topic around it. */
function loadTopics(meeting, words, ontology) {
  const xml = fs.readFileSync(path.join(ANNOTATIONS, "topics", `${meeting}.topic.xml`), "latin1");
  const stack = [];
  const topics = [];
  const owner = new Map();
  for (const match of xml.matchAll(
    /<topic\b([^>]*)>|<\/topic>|<nite:pointer\b([^>]*)\/>|<nite:child\b([^>]*)\/>/g
  )) {
    if (match[0].startsWith("<topic")) {
      const topic = {
        index: topics.length,
        description: attr(match[1], "description") || attr(match[1], "other_description"),
        type: null,
        parent: stack.at(-1) ?? null,
      };
      topics.push(topic);
      stack.push(topic);
    } else if (match[0] === "</topic>") {
      stack.pop();
    } else if (match[0].startsWith("<nite:pointer")) {
      const ref = /id\(([^)]+)\)/.exec(attr(match[2], "href") ?? "")?.[1];
      if (stack.length) stack.at(-1).type = ontology.get(ref) ?? ref;
    } else if (stack.length) {
      for (const word of expandRange(attr(match[3], "href"), words))
        owner.set(word.id, stack.at(-1).index);
    }
  }
  for (const topic of topics) {
    const own = topic.description || (topic.type && topic.type !== "other" ? topic.type : null);
    const parent = topic.parent?.description || topic.parent?.type || null;
    topic.label = own || parent || "other";
  }
  return { topics, owner };
}

/**
 * The meeting as the app would receive it from a room: turns in the order
 * they were said, none longer than the segmenter's 20 seconds.
 */
function loadTurns(meeting, words) {
  const turns = [];
  const files = fs
    .readdirSync(path.join(ANNOTATIONS, "segments"))
    .filter((file) => file.startsWith(`${meeting}.`));
  for (const file of files) {
    const xml = fs.readFileSync(path.join(ANNOTATIONS, "segments", file), "latin1");
    for (const match of xml.matchAll(/<segment\b([^>]*)>([\s\S]*?)<\/segment>/g)) {
      const spoken = [];
      for (const child of match[2].matchAll(/<nite:child\b([^>]*)\/>/g)) {
        spoken.push(
          ...expandRange(attr(child[1], "href"), words).filter((word) => word.kind === "w")
        );
      }
      let current = [];
      for (const word of spoken) {
        if (current.length && !word.punc && word.end - current[0].start > 20) {
          turns.push(current);
          current = [];
        }
        current.push(word);
      }
      if (current.length) turns.push(current);
    }
  }
  return turns
    .map((list) => {
      const timed = list.filter((word) => Number.isFinite(word.start));
      const start = timed[0]?.start ?? 0;
      const end = timed.at(-1)?.end ?? start;
      let text = "";
      for (const word of list) text += word.punc ? word.text : `${text ? " " : ""}${word.text}`;
      return { start, end, words: list, text: text.trim() };
    })
    .filter((turn) => turn.text)
    .sort((a, b) => a.start - b.start)
    .map((turn, index) => ({ ...turn, id: `t${index}` }));
}

/** What the annotators said a set of turns was about: their labels by share of words. */
function humanLabels(turns, topics, owner) {
  const votes = new Map();
  let total = 0;
  for (const turn of turns) {
    for (const word of turn.words) {
      const index = owner.get(word.id);
      if (index == null) continue;
      const label = topics[index].label;
      votes.set(label, (votes.get(label) ?? 0) + 1);
      total += 1;
    }
  }
  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, share: total ? count / total : 0 }));
}

// --- The model, by the app's request shape.

const usage = new Map();

function record(model, json) {
  const entry = usage.get(model) ?? { requests: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
  entry.requests += 1;
  entry.input += json?.usage?.input_tokens ?? 0;
  entry.cached += json?.usage?.input_tokens_details?.cached_tokens ?? 0;
  entry.output += json?.usage?.output_tokens ?? 0;
  entry.reasoning += json?.usage?.output_tokens_details?.reasoning_tokens ?? 0;
  usage.set(model, entry);
}

function cost(model, entry) {
  const price = PRICES[model];
  if (!price || !entry) return null;
  return (
    ((entry.input - entry.cached) * price.input +
      entry.cached * price.cached +
      entry.output * price.output) /
    1e6
  );
}

async function respond(model, system, text, { attempts = 3 } = {}) {
  const takesTemperature = model.startsWith("gpt-4.1") || model.startsWith("gpt-4o");
  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    store: false,
    max_output_tokens: 4096,
    ...(takesTemperature ? { temperature: 0 } : {}),
  };
  for (let attempt = 1; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const started = performance.now();
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(`${response.status} ${json?.error?.message ?? ""}`);
      record(model, json);
      const message = (json.output ?? []).find((item) => item.type === "message");
      const answer = message?.content?.find((part) => part.type === "output_text")?.text ?? "";
      return {
        text: answer.trim(),
        ms: Math.round(performance.now() - started),
        usage: json.usage,
      };
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

// --- A virtual clock, so the namer's settle and gap timers run in meeting time.

function virtualClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => now,
    advance: (to) => {
      now = Math.max(now, to);
    },
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { due: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    /** The earliest timer due by `until`, removed, or null. */
    due(until) {
      let best = null;
      for (const [id, timer] of timers)
        if (timer.due <= until && (!best || timer.due < best[1].due)) best = [id, timer];
      if (!best) return null;
      timers.delete(best[0]);
      return best[1];
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function replay(meeting, turns) {
  const clock = virtualClock();
  const tracker = new ConversationTopicTracker({ now: clock.now });
  const latencies = [];
  const requests = { live: 0, final: 0 };
  let phase = "live";
  const shownAt = new Map(); // topic id -> labels shown over time
  const namer = new TopicNamer({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ask: async ({ system, text }) => {
      requests[phase] += 1;
      const answer = await respond(MODEL, system, text);
      latencies.push(answer.ms);
      // The name lands when it would have: the request took this long.
      clock.advance(clock.now() + answer.ms);
      return answer.text;
    },
  });
  const segments = [];
  // What the lanes would show, with the model and without it: one history of
  // labels per topic, a new entry each time the label changes.
  const deviceAt = new Map();
  const note = (history, node, extra = {}) => {
    const list = history.get(node.id) ?? [];
    if (list.at(-1)?.label !== node.label)
      list.push({ at: clock.now(), label: node.label, ...extra });
    history.set(node.id, list);
  };
  const show = () => {
    const raw = tracker.snapshot(clock.now());
    for (const node of raw.nodes) if (isNameableTopic(node)) note(deviceAt, node);
    for (const node of namer.apply(raw).nodes) {
      if (isNameableTopic(node)) note(shownAt, node, { device: !node.deviceLabel });
    }
  };
  const runTimers = async (until) => {
    for (;;) {
      const timer = clock.due(until);
      if (!timer) return;
      clock.advance(timer.due);
      timer.fn();
      await settle();
      if (namer.inFlight) await namer.inFlight;
      await settle();
      show();
    }
  };
  for (const turn of turns) {
    const at = Math.round(turn.end * 1000);
    await runTimers(at);
    clock.advance(at);
    tracker.onUtterance({ id: turn.id, text: turn.text, at });
    segments.push({ id: turn.id, text: turn.text, timestamp: at });
    namer.observe(tracker.snapshot(clock.now()), [...segments]);
    show();
  }
  const end = clock.now();
  await runTimers(end + 15_000);
  phase = "final";
  const final = tracker.snapshot(end, { final: true });
  const named = await namer.finish(final, [...segments]);
  return { final, named, requests, latencies, shownAt, deviceAt, stats: namer.stats };
}

// --- The judge.

const JUDGE_SYSTEM = [
  "You grade the names an app gave to topics of a meeting. A topic is a stretch of a transcribed meeting: you get an excerpt of what was said in it, and what human annotators wrote the stretch was about (their labels, with each label's share of the stretch).",
  "",
  "Grade every candidate name on three scales:",
  "- relevance, 1 to 5: 5 names exactly what was said in the excerpt; 3 is related but partly off or too broad; 1 is wrong or meaningless",
  '- specificity, 1 to 5: 5 is specific enough to tell this stretch apart from the rest of the meeting; 3 is somewhat generic; 1 is generic or empty ("Discussion", random words)',
  "- match, 0 to 2: 2 names the same subject as the annotators' main label; 1 is related or names a smaller part of it; 0 is a different subject",
  "",
  'Judge relevance and specificity from the excerpt; the annotators\' labels decide only match. Reply with JSON only: {"grades":[{"id":"A","relevance":5,"specificity":4,"match":2}]}',
].join("\n");

function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

async function judge({ turns, human, candidates, seed }) {
  const random = seeded(seed);
  const order = candidates
    .map((candidate) => ({ candidate, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ candidate }, index) => ({ ...candidate, id: String.fromCharCode(65 + index) }));
  const text = [
    "The meeting: a product design team at work (the AMI meeting corpus).",
    `Annotators' labels for this stretch: ${human.map((item) => `"${item.label}" (${Math.round(item.share * 100)}%)`).join(", ")}`,
    "",
    "Excerpt:",
    ...topicExcerpt(turns, { budget: 6000 }).map((line) => `- ${line}`),
    "",
    "Candidates:",
    ...order.map((item) => `${item.id}: "${item.name}"`),
  ].join("\n");
  const answer = await respond(JUDGE, JUDGE_SYSTEM, text);
  const json = JSON.parse(answer.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const grades = new Map((json.grades ?? []).map((grade) => [grade.id, grade]));
  return Object.fromEntries(
    order.map((item) => {
      const grade = grades.get(item.id) ?? {};
      return [
        item.kind,
        {
          relevance: grade.relevance ?? null,
          specificity: grade.specificity ?? null,
          match: grade.match ?? null,
        },
      ];
    })
  );
}

// --- Report.

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const pct = (list, p) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const fixed = (value, digits = 2) => (value == null ? "n/a" : value.toFixed(digits));

const ontology = loadOntology();
const results = [];
for (const meeting of MEETINGS) {
  const words = loadWords(meeting);
  const { topics, owner } = loadTopics(meeting, words, ontology);
  const turns = loadTurns(meeting, words);
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const before = {
    ...(usage.get(MODEL) ?? { requests: 0, input: 0, cached: 0, output: 0, reasoning: 0 }),
  };
  const run = await replay(meeting, turns);
  const after = usage.get(MODEL) ?? before;
  const runUsage = {
    requests: after.requests - before.requests,
    input: after.input - before.input,
    cached: after.cached - before.cached,
    output: after.output - before.output,
    reasoning: after.reasoning - before.reasoning,
  };
  const named = new Map(run.named.nodes.map((node) => [node.id, node]));
  const rows = [];
  for (const node of run.final.nodes.filter(isNameableTopic)) {
    const own = node.utteranceIds.map((id) => byId.get(id)).filter(Boolean);
    const shown = named.get(node.id);
    const model = shown?.deviceLabel ? shown.label : null;
    const changes = run.shownAt.get(node.id) ?? [];
    const liveNames = changes.filter((change) => !change.device).map((change) => change.label);
    rows.push({
      topic: node.id,
      words: own.reduce((total, turn) => total + countWords(turn.text), 0),
      turns: own.length,
      human: humanLabels(own, topics, owner).slice(0, 3),
      device: node.label,
      model,
      // The model's name the lanes showed when the recording stopped.
      live: liveNames.at(-1) ?? null,
      liveNames,
      text: own.map((turn) => turn.text),
    });
  }

  // The oracle: every human topic segment that is a stretch of its own.
  const oracle = [];
  if (ORACLE) {
    const stretches = [];
    for (const turn of turns) {
      const label = humanLabels([turn], topics, owner)[0]?.label ?? null;
      if (!label) continue;
      const last = stretches.at(-1);
      if (last && last.label === label) last.turns.push(turn);
      else stretches.push({ label, turns: [turn] });
    }
    const named = [];
    for (const stretch of stretches) {
      const count = stretch.turns.reduce((total, turn) => total + countWords(turn.text), 0);
      if (count < 40) continue;
      const prompt = buildTopicNamePrompt({
        turns: stretch.turns.map((turn) => turn.text),
        others: named,
      });
      const answer = await respond(MODEL, prompt.system, prompt.text);
      const name = parseTopicName(answer.text, { others: named, excerpt: prompt.excerpt });
      if (name) named.push(name);
      oracle.push({
        human: [{ label: stretch.label, share: 1 }],
        words: count,
        raw: answer.text,
        model: name,
        ms: answer.ms,
        text: stretch.turns.map((turn) => turn.text),
      });
    }
  }

  if (JUDGING) {
    let seed = 1;
    for (const row of rows) {
      const candidates = [{ kind: "device", name: row.device }];
      if (row.model) candidates.push({ kind: "model", name: row.model });
      if (row.live && row.live !== row.model) candidates.push({ kind: "live", name: row.live });
      row.grades = await judge({ turns: row.text, human: row.human, candidates, seed: seed++ });
    }
    for (const row of oracle) {
      if (!row.model) continue;
      row.grades = await judge({
        turns: row.text,
        human: row.human,
        candidates: [{ kind: "model", name: row.model }],
        seed: seed++,
      });
    }
  }

  const minutes = (turns.at(-1)?.end ?? 0) / 60;
  // Times a shown label changed while recording, after it first appeared.
  const changes = (history) =>
    [...history.values()].reduce((total, list) => total + Math.max(0, list.length - 1), 0);
  const liveChanges = { withoutModel: changes(run.deviceAt), withModel: changes(run.shownAt) };
  const runCost = cost(MODEL, runUsage);
  results.push({
    meeting,
    minutes,
    turns: turns.length,
    rows,
    oracle,
    run,
    runUsage,
    runCost,
    liveChanges,
  });

  console.log(
    `\n== ${meeting}: ${minutes.toFixed(1)} min, ${turns.length} turns, ${rows.length} topics shown`
  );
  console.log(
    `   requests: ${run.requests.live} while recording, ${run.requests.final} at the end; named ${run.stats.named}, unusable ${run.stats.unusable}, failed ${run.stats.failed}`
  );
  console.log(
    `   latency p50 ${pct(run.latencies, 50)} ms, p95 ${pct(run.latencies, 95)} ms; ${runUsage.input} input and ${runUsage.output} output tokens, $${fixed(runCost, 4)}`
  );
  console.log(
    `   label changes while recording: ${liveChanges.withoutModel} on-device only, ${liveChanges.withModel} with the model`
  );
  for (const row of rows) {
    const grade = (kind) =>
      row.grades?.[kind]
        ? ` [r${row.grades[kind].relevance} s${row.grades[kind].specificity} m${row.grades[kind].match}]`
        : "";
    console.log(
      `   #${row.topic} ${row.words}w | human: ${row.human.map((h) => `${h.label} ${Math.round(h.share * 100)}%`).join("; ")}`
    );
    console.log(
      `        device "${row.device}"${grade("device")}  model "${row.model ?? "-"}"${grade("model")}  live: ${row.liveNames.join(" > ") || "-"}${grade("live")}`
    );
  }
  for (const row of oracle) {
    const grade = row.grades?.model
      ? ` [r${row.grades.model.relevance} s${row.grades.model.specificity} m${row.grades.model.match}]`
      : "";
    console.log(
      `   oracle ${row.words}w | human "${row.human[0].label}" | model "${row.model ?? `(unusable: ${row.raw})`}"${grade}`
    );
  }
}

// --- Totals.

const all = results.flatMap((result) => result.rows);
const allOracle = results.flatMap((result) => result.oracle);
const scores = (list, kind) => ({
  relevance: mean(list.map((row) => row.grades?.[kind]?.relevance).filter(Number.isFinite)),
  specificity: mean(list.map((row) => row.grades?.[kind]?.specificity).filter(Number.isFinite)),
  match: mean(list.map((row) => row.grades?.[kind]?.match).filter(Number.isFinite)),
  n: list.filter((row) => row.grades?.[kind]).length,
});
const latencies = results.flatMap((result) => result.run.latencies);
console.log("\n== Totals");
console.log(`   naming model ${MODEL}, judge ${JUDGING ? JUDGE : "none"}`);
console.log(
  `   tracker topics: ${all.length}, named by the model: ${all.filter((row) => row.model).length}`
);
if (JUDGING) {
  const device = scores(all, "device");
  const model = scores(
    all.filter((row) => row.model),
    "model"
  );
  // The name shown when recording stopped: the final name where the end changed nothing.
  const liveEnd = all
    .filter((row) => row.live)
    .map((row) => ({
      grades: { model: row.grades?.live ?? (row.live === row.model ? row.grades?.model : null) },
    }));
  const live = scores(liveEnd, "model");
  const oracle = scores(allOracle, "model");
  console.log(
    `   on-device labels:      relevance ${fixed(device.relevance)}  specificity ${fixed(device.specificity)}  match ${fixed(device.match)}  (n=${device.n})`
  );
  console.log(
    `   model names:           relevance ${fixed(model.relevance)}  specificity ${fixed(model.specificity)}  match ${fixed(model.match)}  (n=${model.n})`
  );
  console.log(
    `   names at stop (live):  relevance ${fixed(live.relevance)}  specificity ${fixed(live.specificity)}  match ${fixed(live.match)}  (n=${live.n})`
  );
  console.log(
    `   oracle segments named: relevance ${fixed(oracle.relevance)}  specificity ${fixed(oracle.specificity)}  match ${fixed(oracle.match)}  (n=${oracle.n})`
  );
}
console.log(
  `   latency per request: p50 ${pct(latencies, 50)} ms, p95 ${pct(latencies, 95)} ms (n=${latencies.length})`
);
for (const [model, entry] of usage) {
  console.log(
    `   ${model}: ${entry.requests} requests, ${entry.input} input tokens (${entry.cached} cached), ${entry.output} output (${entry.reasoning} reasoning), $${fixed(cost(model, entry), 4)}`
  );
}
for (const result of results) {
  const { live, final } = result.run.requests;
  console.log(
    `   ${result.meeting}: ${result.minutes.toFixed(1)} min, ${live + final} requests (${live} live, ${final} final), $${fixed(result.runCost, 4)}; label changes ${result.liveChanges.withoutModel} on-device only, ${result.liveChanges.withModel} with the model`
  );
}

if (JSON_OUT) {
  fs.writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        model: MODEL,
        judge: JUDGING ? JUDGE : null,
        usage: Object.fromEntries(usage),
        meetings: results.map((result) => ({
          meeting: result.meeting,
          minutes: result.minutes,
          turns: result.turns,
          requests: result.run.requests,
          stats: result.run.stats,
          latencies: result.run.latencies,
          liveChanges: result.liveChanges,
          usage: result.runUsage,
          cost: result.runCost,
          rows: result.rows.map(({ text, ...row }) => row),
          oracle: result.oracle.map(({ text, ...row }) => row),
        })),
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${JSON_OUT}`);
}
