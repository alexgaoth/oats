#!/usr/bin/env node
/**
 * Topic names from one model, on topics a person drew: which model names a
 * topic best, with segmentation held fixed.
 *
 * For each AMI meeting, each top-level topic the annotators marked (40 words
 * or more) is named with the app's own naming request (#121,
 * `helpers/topicNaming.mjs`: its system prompt, its excerpt of 3,000
 * characters, "Other topics" holding the names this model gave the meeting's
 * earlier topics), and the answer goes through the app's own check
 * (`parseTopicName`). Requests are one at a time per meeting, as the app sends
 * them. The output is in `scripts/topic-loop-eval.mjs`'s shape, the name as
 * the record's, so `scripts/topic-names-judge.mjs --which record` grades every
 * model's names for a topic together, blind and shuffled.
 *
 *   node scripts/topic-names-oracle.mjs --model <provider:model[@opts]> --ami <dir>
 *     [--set test|eval24 | --meetings a,b] [--concurrency 4] --json out.json
 *
 * Public AMI data only. Keys come from the environment, and every request is
 * in the spend ledger (`scripts/lib/fast-models.mjs`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { ask, bootstrapMean, mean, percentile } from "./lib/fast-models.mjs";
import {
  amiMeetingIds,
  amiReference,
  annotationsDir,
  humanSegments,
  segmentExcerpt,
  topicNames,
} from "./lib/topic-corpus.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildTopicNamePrompt, parseTopicName } = await import(
  pathToFileURL(path.join(ROOT, "src/helpers/topicNaming.mjs")).href
);

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    ami: { type: "string" },
    set: { type: "string", default: "test" },
    meetings: { type: "string" },
    concurrency: { type: "string", default: "4" },
    json: { type: "string" },
  },
});
if (!args.model || !args.ami || !args.json) {
  console.error("--model provider:model --ami <dir> --json out.json");
  process.exit(2);
}

const dir = annotationsDir(args.ami);
const names = topicNames(dir);
const ids = amiMeetingIds(dir);
const test = ids.filter((id) => /^(ES2004|IS1009|TS3003)/.test(id));
const tune = ids.filter((id) => !test.includes(id));
const step = Math.floor(tune.length / 12);
const spread = Array.from({ length: 12 }, (_, index) => tune[index * step + Math.floor(step / 2)]);
const sets = { test, eval24: [...test, ...spread] };
const meetings = args.meetings ? args.meetings.split(",") : sets[args.set];
if (!meetings) {
  console.error(`Unknown --set ${args.set}`);
  process.exit(2);
}

async function nameMeeting(id) {
  const conversation = amiReference(dir, id, names);
  const given = [];
  const entries = [];
  const calls = [];
  for (const segment of humanSegments(conversation)) {
    const turns = conversation.utterances.slice(segment.from, segment.to + 1).map((u) => u.text);
    const prompt = buildTopicNamePrompt({ turns, others: given });
    const result = await ask(args.model, {
      system: prompt.system,
      user: prompt.text,
      maxTokens: 100,
      purpose: "names-oracle",
      timeoutMs: 60_000,
    });
    const name = result.ok
      ? parseTopicName(result.text, { others: given, excerpt: prompt.excerpt })
      : null;
    if (name) given.push(name);
    calls.push({ ok: result.ok, ms: result.ms, usage: result.usage, cost: result.cost });
    entries.push({
      key: segment.key,
      words: segment.words,
      label: segment.label,
      subtopics: segment.subtopics,
      excerpt: segmentExcerpt(conversation, segment),
      live: null,
      record: name ? { name } : null,
      raw: result.ok ? result.text.slice(0, 200) : `error: ${result.error}`,
    });
  }
  return { id, source: conversation.source, names: entries, calls };
}

const results = new Array(meetings.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(Number(args.concurrency), meetings.length) }, async () => {
    while (next < meetings.length) {
      const index = next++;
      results[index] = await nameMeeting(meetings[index]);
      const named = results[index].names.filter((entry) => entry.record).length;
      console.error(`${meetings[index]}: ${named}/${results[index].names.length} named`);
    }
  })
);

const calls = results.flatMap((result) => result.calls);
const ok = calls.filter((call) => call.ok);
const entries = results.flatMap((result) => result.names);
const summary = {
  model: args.model,
  meetings: meetings.length,
  topics: entries.length,
  named: entries.filter((entry) => entry.record).length,
  failed: calls.length - ok.length,
  latencyP50: percentile(
    ok.map((call) => call.ms),
    50
  ),
  latencyP95: percentile(
    ok.map((call) => call.ms),
    95
  ),
  inputPerRequest: mean(ok.map((call) => call.usage?.input ?? 0)),
  outputPerRequest: mean(ok.map((call) => call.usage?.output ?? 0)),
  dollarsPerRequest: bootstrapMean(ok.map((call) => call.cost ?? 0)).mean,
  dollars: ok.reduce((total, call) => total + (call.cost ?? 0), 0),
};
console.log(
  `${args.model}: ${summary.named}/${summary.topics} topics named (${summary.failed} failed requests), latency p50 ${Math.round(summary.latencyP50 ?? 0)} ms p95 ${Math.round(summary.latencyP95 ?? 0)} ms, ${Math.round(summary.inputPerRequest ?? 0)} in / ${Math.round(summary.outputPerRequest ?? 0)} out tokens, $${summary.dollars.toFixed(4)}`
);
fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
fs.writeFileSync(
  args.json,
  JSON.stringify({ summary, results: results.map(({ calls: _calls, ...rest }) => rest) }, null, 1)
);
