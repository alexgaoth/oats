#!/usr/bin/env node
// The return benchmark: inside one conversation, is a drawn "came back" right,
// and does a real return get drawn at the right moment? The method is in
// docs/link-eval.md ("The gold for returns").
//
//   node scripts/topic-loop-eval.mjs --variant d1 --ami <dir> --set all --trace-lanes --json d1.json
//   node scripts/return-eval.mjs score --input d1.json --split tune
//
// Corpus: AMI's human topic annotations (manual annotations 1.6.2, CC BY 4.0).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { amiRecognized, amiReference, annotationsDir, topicNames } from "./lib/topic-corpus.mjs";
import { splitOfMeeting } from "./lib/link-split.mjs";
import { meetingReturns } from "./lib/return-truth.mjs";
import {
  chancePairs,
  scoreMeeting,
  summarizeReturns,
  verdictOf,
} from "./lib/return-score.mjs";
import { percentile } from "./lib/fast-models.mjs";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(os.homedir(), "oats-asr-cache", "AMI") },
    input: { type: "string" },
    split: { type: "string", default: "tune" },
    level: { type: "string", default: "fine,top" },
    show: { type: "boolean", default: false },
    model: { type: "string" },
    runs: { type: "string" },
    loop: { type: "string" },
    replay: { type: "string" },
    chars: { type: "string", default: "800" },
    controls: { type: "string", default: "40" },
    "local-model": { type: "string" },
    "llama-server": { type: "string" },
  },
});

const DIR = annotationsDir(args.ami);
const NAMES = topicNames(DIR);

/** The meetings of a trace on one side of the split, each with its gold at one level. */
export function meetingsOf(results, split, level) {
  return results
    .filter((result) => split === "all" || splitOfMeeting(result.id) === split)
    .map((result) => {
      const conversation = args.replay
        ? amiRecognized(
            DIR,
            result.id,
            NAMES,
            JSON.parse(fs.readFileSync(path.join(args.replay, `${result.id}.json`), "utf8")).segments
          )
        : amiReference(DIR, result.id, NAMES);
      return {
        id: result.id,
        result,
        conversation,
        gold: meetingReturns(conversation, { level }),
      };
    });
}

function rowsOf(meetings, drawnOf) {
  return meetings.map((meeting) => {
    const { verdicts, found } = scoreMeeting(meeting, drawnOf(meeting));
    const count = (verdict) => verdicts.filter((item) => item.verdict === verdict).length;
    return {
      id: meeting.id,
      right: count("right"),
      wrong: count("wrong"),
      unverifiable: count("unverifiable"),
      goldFound: found.filter((item) => item.match).length,
      gold: found.length,
      verdicts,
      found,
    };
  });
}

const fmt = (value) => (value == null ? "  -  " : value.toFixed(2));
const ci = (value, interval) => `${fmt(value)} [${fmt(interval?.[0])}, ${fmt(interval?.[1])}]`;

function line(name, rows) {
  const s = summarizeReturns(rows);
  const drawn = s.right + s.wrong + s.unverifiable;
  console.log(
    `${name.padEnd(30)} drawn ${String(drawn).padStart(4)} right ${String(s.right).padStart(3)} wrong ${String(s.wrong).padStart(3)} unverifiable ${String(s.unverifiable).padStart(3)}` +
      `  P ${ci(s.precision, s.intervals.precision)}  strict ${ci(s.strict, s.intervals.strict)}  R ${ci(s.recall, s.intervals.recall)} (${s.goldFound}/${s.gold})`
  );
  return s;
}

function score() {
  const { results, summary } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  console.log(`${summary?.label ?? args.input}, split ${args.split}`);
  for (const level of args.level.split(",")) {
    const meetings = meetingsOf(results, args.split, level);
    console.log(`\n${level}: ${meetings.length} meetings, ${meetings.reduce((n, m) => n + m.gold.returns.length, 0)} gold returns`);
    const record = rowsOf(meetings, (meeting) => meeting.result.lanes.record.returns);
    line("record (Connections)", record);
    const chance = rowsOf(meetings, (meeting) => chancePairs(meeting.result.lanes.record.runs));
    const c = chance.reduce(
      (sum, row) => ({ right: sum.right + row.right, wrong: sum.wrong + row.wrong, un: sum.un + row.unverifiable }),
      { right: 0, wrong: 0, un: 0 }
    );
    console.log(`${"chance, all non-adjacent runs".padEnd(30)} P ${fmt(c.right / (c.right + c.wrong))}  strict ${fmt(c.right / (c.right + c.wrong + c.un))} (${c.right + c.wrong + c.un} pairs)`);
    const live = rowsOf(meetings, (meeting) => meeting.result.lanes.live.filter((item) => item.current));
    line("live, still drawn at the end", live);
    const ever = rowsOf(meetings, (meeting) => meeting.result.lanes.live);
    line("live, ever drawn", ever);
    const delays = ever.flatMap((row) =>
      row.found.filter((item) => item.match).map((item) => (item.match.shownAt - item.gold.start * 1000) / 1000)
    );
    const placement = ever.flatMap((row) =>
      row.found.filter((item) => item.match).map((item) => (item.match.at - item.gold.start * 1000) / 1000)
    );
    if (delays.length) {
      console.log(
        `  found returns: shown ${percentile(delays, 50).toFixed(0)} s after the room came back (median; p90 ${percentile(delays, 90).toFixed(0)} s); the bend ${percentile(placement, 50).toFixed(0)} s from it (p10 ${percentile(placement, 10).toFixed(0)}, p90 ${percentile(placement, 90).toFixed(0)})`
      );
    }
    if (args.show && level === "fine") {
      for (const row of record) {
        for (const item of row.verdicts) {
          console.log(`  ${row.id} ${item.verdict.padEnd(12)} at ${Math.round(item.drawn.at / 1000)} s topic ${item.drawn.topic} ${item.subject ?? ""}`);
        }
      }
    }
  }
}

/**
 * Other ways to decide a return, over thresholds, on the record's own cuts.
 * Tuning meetings only, unless --split says otherwise.
 */
async function sweep() {
  const { createEmbedder } = await import("./lib/minilm.mjs");
  const methods = await import("./lib/return-methods.mjs");
  const embedder = await createEmbedder({
    cacheDir: path.join(os.homedir(), ".cache", "oats", "link-eval", "vectors"),
    threads: 2,
  });
  const { results } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const meetings = meetingsOf(results, args.split, "fine");
  const prepared = [];
  for (const meeting of meetings) {
    const stretches = methods.stretchesOf(meeting.conversation, meeting.result.recordAssignment);
    const texts = [...new Set(meeting.conversation.utterances.map((turn) => turn.text))];
    const embedded = await embedder.embed(texts);
    const vectors = new Map(texts.map((text, index) => [text, embedded[index]]));
    const raw = stretches.map((stretch) =>
      methods.stretchVector(stretch, (text) => vectors.get(text))
    );
    const weights = stretches.map((stretch) =>
      stretch.turns.reduce((sum, turn) => sum + turn.text.split(/\s+/).length, 0)
    );
    prepared.push({ meeting, stretches, raw, centered: methods.centered(raw, weights) });
  }
  const dot = (a, b) => (a && b ? a.reduce((sum, value, index) => sum + value * b[index], 0) : -1);
  const grid = Array.from({ length: 17 }, (_, index) => Math.round(index * 5) / 100);
  for (const [name, key, thresholds] of [
    ["raw cosine", "raw", grid.map((value) => 0.55 + value)],
    ["centred cosine", "centered", grid.map((value) => value - 0.1)],
  ]) {
    for (const link of ["mean", "max"]) {
      console.log(`\n${name}, ${link} of the group`);
      for (const threshold of thresholds) {
        const rows = rowsOf(
          prepared.map((item) => item.meeting),
          (meeting) => {
            const item = prepared.find((other) => other.meeting === meeting);
            const list = item[key];
            const { groups } = methods.groupStretches(
              list.length,
              (j, i) => dot(list[j], list[i]),
              threshold,
              { link }
            );
            return methods.drawnReturns(meeting.conversation, item.stretches, groups);
          }
        );
        line(`t ${threshold.toFixed(2)}`, rows);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A model decides the returns at Finish, from the record's own cuts.

const CACHE = path.join(os.homedir(), ".cache", "oats", "link-eval", "returns");
const slug = (spec) => String(spec).replace(/[^a-zA-Z0-9.-]+/g, "_");

const DECIDE_SYSTEM = [
  "You read the parts of one conversation, in the order they happened. Each part is a few lines of it. The lines come from speech recognition: expect errors and half sentences.",
  "",
  "Find the parts that come back to the subject of an earlier part: the room was on a specific subject, left it for at least one whole part, and came back to the same subject.",
  "",
  "What the whole conversation is about is not a subject: a project or product that every part touches does not come back. Two parts about one project come back only when the same specific part of it is discussed in both (its price, one feature, one decision), and the part between them is about something else.",
  "",
  "Be strict. A wrong answer is worse than a missing one. Most conversations have none.",
  "",
  'Reply with JSON only, an empty list when there is none: {"returns":[{"part":4,"earlier":2,"subject":"Battery life"}]}',
].join("\n");

const DECIDE_SCHEMA = {
  name: "conversation_returns",
  schema: {
    type: "object",
    properties: {
      returns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            part: { type: "integer" },
            earlier: { type: "integer" },
            subject: { type: "string" },
          },
          required: ["part", "earlier", "subject"],
          additionalProperties: false,
        },
      },
    },
    required: ["returns"],
    additionalProperties: false,
  },
};

/** Apple's model takes this subset of JSON Schema. */
const DECIDE_BRIDGE_SCHEMA = {
  type: "object",
  order: ["returns"],
  required: ["returns"],
  properties: {
    returns: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        order: ["part", "earlier", "subject"],
        required: ["part", "earlier", "subject"],
        properties: {
          part: { type: "integer" },
          earlier: { type: "integer" },
          subject: { type: "string" },
        },
      },
    },
  },
};

/** The client a model spec needs: a cloud model, a GGUF here, or Apple's. */
async function clientFor(spec) {
  const fast = await import("./lib/fast-models.mjs");
  if (spec.startsWith("fm:")) {
    const { fmBridge } = await import("./lib/fm-bridge.mjs");
    const bridge = fmBridge();
    return {
      ask: (request) => bridge.ask({ ...request, schema: DECIDE_BRIDGE_SCHEMA, maxTokens: 400 }),
      close: () => bridge.close(),
    };
  }
  if (spec.startsWith("local:")) {
    await fast.startLocalServer(fast.parseSpec(spec).model, {
      binary: args["llama-server"],
      model: args["local-model"],
      port: 18474,
      contextSize: 8192,
    });
  }
  return { ask: (request) => fast.ask(spec, request), close: () => fast.stopLocalServers() };
}

/** Each meeting's parts as a model reads them. */
async function partsOf(meeting) {
  const methods = await import("./lib/return-methods.mjs");
  const { topicExcerpt } = await import("../src/helpers/topicNaming.mjs");
  const stretches = methods.stretchesOf(meeting.conversation, meeting.result.recordAssignment);
  return {
    stretches,
    text: stretches
      .map((stretch, index) => {
        const lines = topicExcerpt(
          stretch.turns.map((turn) => turn.text),
          { budget: Number(args.chars) }
        );
        return `Part ${index + 1}\n${lines.map((line) => `- ${line}`).join("\n")}`;
      })
      .join("\n\n"),
  };
}

async function decide() {
  const spec = args.model;
  if (!spec) throw new Error("--model");
  const { results } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const meetings = meetingsOf(results, args.split, "fine");
  const dir = path.join(CACHE, "decide", `${slug(spec)}~${args.chars}`);
  fs.mkdirSync(dir, { recursive: true });
  const client = await clientFor(spec);
  let next = 0;
  const onDevice = spec.startsWith("local:") || spec.startsWith("fm:");
  const work = async () => {
    while (next < meetings.length) {
      const meeting = meetings[next];
      next += 1;
      const file = path.join(dir, `${meeting.id}.json`);
      if (fs.existsSync(file)) continue;
      const { stretches, text } = await partsOf(meeting);
      if (stretches.length < 3) {
        fs.writeFileSync(file, JSON.stringify({ id: meeting.id, ok: true, returns: [] }));
        continue;
      }
      const answer = await client.ask({
        system: DECIDE_SYSTEM,
        user: text,
        schema: DECIDE_SCHEMA,
        maxTokens: onDevice ? 600 : 4000,
        timeoutMs: 180_000,
        purpose: "return-eval:decide",
      });
      let returns = null;
      try {
        const start = answer.text.indexOf("{");
        const value = JSON.parse(answer.text.slice(start, answer.text.lastIndexOf("}") + 1));
        returns = Array.isArray(value.returns) ? value.returns : null;
      } catch {
        returns = null;
      }
      fs.writeFileSync(
        file,
        JSON.stringify({
          id: meeting.id,
          ok: Boolean(returns),
          returns: returns ?? [],
          parts: stretches.length,
          ms: answer.ms,
          cost: answer.cost,
          error: answer.ok ? null : answer.error,
        })
      );
    }
  };
  try {
    await Promise.all(Array.from({ length: onDevice ? 1 : 6 }, work));
  } finally {
    client.close();
  }
  console.log(`${spec}: ${meetings.length} meetings decided`);
}

/** The returns a model decided, as the lanes would draw them. */
async function decidedReturns(meeting, dir) {
  const methods = await import("./lib/return-methods.mjs");
  const answer = JSON.parse(fs.readFileSync(path.join(dir, `${meeting.id}.json`), "utf8"));
  const stretches = methods.stretchesOf(meeting.conversation, meeting.result.recordAssignment);
  const groupOf = stretches.map((_, index) => index);
  for (const item of [...answer.returns].sort((a, b) => a.part - b.part)) {
    const j = Number(item.part) - 1;
    const i = Number(item.earlier) - 1;
    if (!(j > i + 1) || i < 0 || j >= stretches.length) continue;
    if (j && groupOf[j - 1] === groupOf[i]) continue;
    groupOf[j] = groupOf[i];
  }
  const groups = [...new Set(groupOf)].map((group) =>
    groupOf.flatMap((value, index) => (value === group ? [index] : []))
  );
  return methods.drawnReturns(meeting.conversation, stretches, groups);
}

async function decided() {
  const { results } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  for (const level of args.level.split(",")) {
    const meetings = meetingsOf(results, args.split, level);
    console.log(`\n${level}: ${meetings.length} meetings`);
    for (const run of args.runs.split(",")) {
      const dir = path.join(CACHE, "decide", run);
      const drawn = new Map();
      for (const meeting of meetings) drawn.set(meeting.id, await decidedReturns(meeting, dir));
      line(run, rowsOf(meetings, (meeting) => drawn.get(meeting.id)));
    }
  }
}

// ---------------------------------------------------------------------------
// A blind judge reads what a drawn return claims, and control pairs with no
// return drawn. It sees the transcript, never which method drew the pair.

const JUDGE_SYSTEM = [
  "You read three stretches of one meeting, in the order they happened: EARLIER, BETWEEN and LATER. Each is some of its lines. They come from a transcript of speech: expect filler and half sentences.",
  "",
  "A tool claims the meeting came back in LATER to something it had been on in EARLIER and had left. Decide whether that is true.",
  "",
  "- came_back: LATER is on the same specific subject as EARLIER, and BETWEEN is on something else.",
  "- never_left: LATER is on the same specific subject as EARLIER, and so is BETWEEN.",
  "- different: LATER is not on the same specific subject as EARLIER. The whole meeting being about one project or product does not make two stretches one subject.",
  "- cannot_tell: the lines do not say.",
  "",
  'Reply with JSON only: {"verdict":"came_back","subject":"the shared subject, or empty"}',
].join("\n");

const JUDGE_SCHEMA = {
  name: "return_verdict",
  schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["came_back", "never_left", "different", "cannot_tell"] },
      subject: { type: "string" },
    },
    required: ["verdict", "subject"],
    additionalProperties: false,
  },
};

const within = (meeting, intervals) =>
  meeting.conversation.utterances.filter((turn) =>
    intervals.some(([from, to]) => turn.at >= from && turn.at < to)
  );

async function judge() {
  const { ask, ledgerTotal } = await import("./lib/fast-models.mjs");
  const { topicExcerpt } = await import("../src/helpers/topicNaming.mjs");
  const { results } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const loop = args.loop ? JSON.parse(fs.readFileSync(args.loop, "utf8")).results : [];
  const meetings = meetingsOf(results, args.split, "fine");
  const loopMeetings = meetingsOf(loop, args.split, "fine");
  const items = [];
  const add = (set, meeting, drawn) => items.push({ set, meeting, drawn });
  for (const meeting of meetings) {
    for (const drawn of meeting.result.lanes.record.returns) add("tracker, record", meeting, drawn);
  }
  for (const meeting of loopMeetings) {
    for (const drawn of meeting.result.lanes.live) add("loop, live", meeting, drawn);
  }
  for (const run of (args.runs ?? "").split(",").filter(Boolean)) {
    const dir = path.join(CACHE, "decide", run);
    for (const meeting of meetings) {
      for (const drawn of await decidedReturns(meeting, dir)) add(run, meeting, drawn);
    }
  }
  // Controls: pairs of non-adjacent runs, drawn at random with a fixed seed.
  let state = 20261105;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const controls = meetings.flatMap((meeting) =>
    chancePairs(meeting.result.lanes.record.runs).map((drawn) => ({ meeting, drawn }))
  );
  for (let count = 0; count < Number(args.controls) && controls.length; count += 1) {
    const { meeting, drawn } = controls.splice(Math.floor(random() * controls.length), 1)[0];
    add("control", meeting, drawn);
  }
  const dir = path.join(CACHE, "judge", slug(args.model));
  fs.mkdirSync(dir, { recursive: true });
  let next = 0;
  const order = items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
  const work = async () => {
    while (next < order.length) {
      const item = order[next];
      next += 1;
      const { meeting, drawn } = item;
      const key = `${meeting.id}-${drawn.at}-${drawn.earlier.map((pair) => pair.join("_")).join("-")}`;
      item.file = path.join(dir, `${key}.json`);
      if (fs.existsSync(item.file)) continue;
      const lastEnd = Math.max(...drawn.earlier.map(([, to]) => to));
      const quote = (intervals, budget) =>
        topicExcerpt(
          within(meeting, intervals).map((turn) => turn.text),
          { budget }
        )
          .map((text) => `- ${text}`)
          .join("\n");
      const user = [
        `EARLIER\n${quote(drawn.earlier, 1500)}`,
        `BETWEEN\n${quote([[lastEnd, drawn.at]], 800) || "- (nothing said)"}`,
        `LATER\n${quote([[drawn.at, drawn.end]], 1500)}`,
      ].join("\n\n");
      const answer = await ask(args.model, {
        system: JUDGE_SYSTEM,
        user,
        schema: JUDGE_SCHEMA,
        maxTokens: 600,
        timeoutMs: 120_000,
        parseJson: true,
        purpose: "return-eval:judge",
      });
      fs.writeFileSync(
        item.file,
        JSON.stringify({ verdict: answer.json?.verdict ?? null, subject: answer.json?.subject ?? "" })
      );
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  const sets = [...new Set(items.map((item) => item.set))];
  console.log(`${args.model}, ${args.split}: ${items.length} items, $${ledgerTotal().toFixed(3)} in the ledger`);
  for (const set of sets) {
    const counts = {};
    for (const item of items.filter((other) => other.set === set)) {
      const verdict = JSON.parse(fs.readFileSync(item.file, "utf8")).verdict ?? "none";
      counts[verdict] = (counts[verdict] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    console.log(
      `  ${set.padEnd(44)} n ${String(total).padStart(3)}  came back ${((counts.came_back ?? 0) / total).toFixed(2)}  ${JSON.stringify(counts)}`
    );
  }
}

const COMMANDS = { score, sweep, decide, decided, judge };
if (!COMMANDS[positionals[0]]) {
  console.error(`Usage: node scripts/return-eval.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
void verdictOf;
await COMMANDS[positionals[0]]();
