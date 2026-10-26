#!/usr/bin/env node
/**
 * Repairing recognition errors with a fast model: does it lower the word error
 * rate of what the app heard in a room, and how often does it make a segment
 * worse or invent words?
 *
 * Input: `scripts/room-replay.js` (#122) output for AMI meetings recorded with
 * a far-field microphone (the app's live room path, its real recognition
 * errors), and the AMI manual word transcripts (CC BY 4.0) as the reference.
 * Each segment is sent as the app would have it live: in order, with the few
 * segments before it as context, and the model may only fix clear recognition
 * errors (no new content, no paraphrase). A guard keeps an answer only when it
 * changed few words; the score is reported with and without it.
 *
 *   node scripts/asr-repair-eval.mjs --replay <room-replay.json> --ami <dir>
 *     --model <provider:model[@opts]> [--meetings a,b] [--concurrency 8]
 *     [--local-model <gguf> --llama-server <binary>] [--json out.json]
 *
 * WER is scored as room-replay.js scores it: Whisper's English normalisation in
 * small (case and punctuation dropped, fillers removed, numbers spelled out),
 * AMI's truncated words left out, and one alignment per meeting over every
 * speaker's words in time order. Per segment, the reference is the words whose
 * middle falls inside the segment.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  ask,
  bootstrapMean,
  parseSpec,
  percentile,
  startLocalServer,
  stopLocalServers,
} from "./lib/fast-models.mjs";
import { annotationsDir, loadAmiWords, topicNames } from "./lib/topic-corpus.mjs";

const { values: args } = parseArgs({
  options: {
    replay: { type: "string" },
    ami: { type: "string" },
    model: { type: "string" },
    meetings: { type: "string" },
    concurrency: { type: "string", default: "8" },
    context: { type: "string", default: "3" },
    json: { type: "string" },
    "local-model": { type: "string" },
    "llama-server": { type: "string" },
    "local-port": { type: "string", default: "18471" },
    "max-segments": { type: "string" },
  },
});
if (!args.replay || !args.ami || !args.model) {
  console.error("--replay <room-replay.json> --ami <dir> --model <provider:model>");
  process.exit(2);
}
const SPEC = args.model;
const CONTEXT = Number(args.context);

// --- Scoring, as room-replay.js scores.

const FILLERS = new Set(["um", "uh", "hmm", "mm", "mhm", "mmm", "hm", "uhm", "erm"]);
const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " "
  );
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

function spellInteger(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1000)
    return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${spellInteger(n % 100)}` : ""}`;
  if (n < 1_000_000)
    return `${spellInteger(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${spellInteger(n % 1000)}` : ""}`;
  return String(n);
}

function spellNumbers(text) {
  return text
    .replace(/([$€£])\s?(\d[\d,]*(?:\.\d+)?)/g, (_, symbol, number) => {
      const unit = { $: "dollars", "€": "euros", "£": "pounds" }[symbol];
      return `${number} ${unit}`;
    })
    .replace(/(\d)%/g, "$1 percent")
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, number) => {
      const spelled = spellInteger(Number(number)).split(" ");
      const last = spelled.pop();
      const irregular = {
        one: "first",
        two: "second",
        three: "third",
        five: "fifth",
        eight: "eighth",
        nine: "ninth",
        twelve: "twelfth",
      };
      const ordinal =
        irregular[last] || (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
      return [...spelled, ordinal].join(" ");
    })
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (number) => number.replace(/,/g, ""))
    .replace(
      /\b(\d+)\.(\d+)\b/g,
      (_, whole, fraction) =>
        `${spellInteger(Number(whole))} point ${[...fraction].map((d) => ONES[Number(d)]).join(" ")}`
    )
    .replace(/\b\d+\b/g, (number) => spellInteger(Number(number)));
}

function normalise(text) {
  return spellNumbers(String(text || ""))
    .toLowerCase()
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/\b(mm-hmm|uh-huh|mm-mm|uh-uh|um-hum|hmm-mm|mm-hm|uh-hum)\b/g, " ")
    .replace(/\b(?:[a-z]_)+/g, (letters) => letters.replace(/_/g, ""))
    .replace(/\bo\.k\.?|\bok\b|(^|\s)'kay\b/g, (_, before = "") => `${before}okay`)
    .replace(/\balright\b/g, "all right")
    .replace(/[-–—/]/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/(^|\s)'+|'+(\s|$)/g, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLERS.has(word));
}

/** Levenshtein errors between two token lists (substitutions, deletions, insertions). */
function editErrors(reference, hypothesis) {
  const n = reference.length;
  const m = hypothesis.length;
  let previous = new Int32Array(m + 1);
  let current = new Int32Array(m + 1);
  for (let j = 0; j <= m; j += 1) previous[j] = j;
  // Track insertions along the best path with a parallel table.
  let prevIns = new Int32Array(m + 1);
  let curIns = new Int32Array(m + 1);
  for (let j = 0; j <= m; j += 1) prevIns[j] = j;
  for (let i = 1; i <= n; i += 1) {
    current[0] = i;
    curIns[0] = 0;
    for (let j = 1; j <= m; j += 1) {
      const same = reference[i - 1] === hypothesis[j - 1];
      let best = previous[j - 1] + (same ? 0 : 1);
      let ins = prevIns[j - 1];
      if (previous[j] + 1 < best) {
        best = previous[j] + 1;
        ins = prevIns[j];
      }
      if (current[j - 1] + 1 < best) {
        best = current[j - 1] + 1;
        ins = curIns[j - 1] + 1;
      }
      current[j] = best;
      curIns[j] = ins;
    }
    [previous, current] = [current, previous];
    [prevIns, curIns] = [curIns, prevIns];
  }
  return { errors: previous[m], insertions: prevIns[m] };
}

// --- The request.

const SYSTEM = [
  "You fix speech recognition errors in the live transcript of a meeting, one segment at a time. The microphone is across the room, so the transcript has errors: words heard as other words that sound alike, and words split or joined wrongly.",
  "",
  "Rules:",
  "- Change a word only when it is clearly misheard: it sounds like the right word and makes no sense where it is, and the right word is clear from the segment or the context.",
  "- Do not add words that were not said, and do not drop words. Do not rephrase, reorder, finish sentences or fix grammar. Keep filler, repetitions and false starts as they are.",
  "- Keep names and terms you do not know.",
  "- When no word is clearly wrong, return the segment unchanged. Most segments need no change.",
  "",
  'Reply with JSON only: {"text": "<the segment, corrected>"}',
].join("\n");

const SCHEMA = {
  name: "repair",
  schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
};

/** The guard: an answer is kept only when it changed at most this share of the segment's words (and at least 2). */
const GUARD_SHARE = 0.34;

function guard(original, repaired) {
  const a = normalise(original);
  const b = normalise(repaired);
  const { errors } = editErrors(a, b);
  const limit = Math.max(2, Math.floor(a.length * GUARD_SHARE));
  return (
    errors <= limit && Math.abs(b.length - a.length) <= Math.max(1, Math.floor(a.length * 0.2))
  );
}

// --- Main.

const dir = annotationsDir(args.ami);
const names = topicNames(dir);
const replay = JSON.parse(fs.readFileSync(args.replay, "utf8"));
const wanted = args.meetings ? new Set(args.meetings.split(",")) : null;
const recordings = replay.recordings.filter(
  (recording) => !wanted || wanted.has(recording.summary.meeting)
);

if (parseSpec(SPEC).provider === "local") {
  await startLocalServer(parseSpec(SPEC).model, {
    binary: args["llama-server"],
    model: args["local-model"],
    port: Number(args["local-port"]),
    contextSize: 4096,
  });
}

async function repairMeeting(recording) {
  const meeting = recording.summary.meeting;
  const { words } = loadAmiWords(dir, meeting, names);
  const segments = [...recording.segments]
    .filter((segment) => String(segment.text ?? "").trim())
    .sort((a, b) => a.start - b.start)
    .slice(0, args["max-segments"] ? Number(args["max-segments"]) : undefined);
  const out = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const text = String(segment.text).trim();
    const tokens = normalise(text);
    if (!tokens.length) {
      out.push({ ...segment, original: text, repaired: text, kept: text, called: false });
      continue;
    }
    const before = segments
      .slice(Math.max(0, index - CONTEXT), index)
      .map((item) => String(item.text).trim())
      .filter(Boolean);
    const user = [
      "Context (the segments before, as heard):",
      ...(before.length ? before.map((line) => `- ${line}`) : ["- (none)"]),
      "",
      `Segment: ${text}`,
    ].join("\n");
    const result = await ask(SPEC, {
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 300,
      parseJson: true,
      purpose: "repair",
    });
    const repaired =
      result.ok && typeof result.json?.text === "string" ? result.json.text.trim() : null;
    const valid = repaired !== null && repaired.length > 0;
    const kept = valid && guard(text, repaired) ? repaired : text;
    out.push({
      start: segment.start,
      end: segment.end,
      original: text,
      repaired: valid ? repaired : text,
      kept,
      called: true,
      ok: result.ok,
      malformed: result.ok && !valid,
      guarded: valid && kept === text && repaired !== text,
      ms: result.ms,
      usage: result.usage,
      cost: result.cost,
    });
  }
  // Scores: the meeting as one alignment, and each segment against its own reference words.
  const reference = words.filter((word) => normalise(word.text).length);
  const refTokens = reference.flatMap((word) => normalise(word.text));
  const score = (key) => {
    const hypothesis = out.flatMap((segment) => normalise(segment[key]));
    const { errors, insertions } = editErrors(refTokens, hypothesis);
    return { errors, insertions, words: refTokens.length, wer: errors / refTokens.length };
  };
  const mids = reference.map((word) => (word.start + word.end) / 2);
  for (const segment of out) {
    const refWords = reference
      .filter((_, k) => mids[k] >= segment.start && mids[k] <= segment.end)
      .flatMap((word) => normalise(word.text));
    segment.refWords = refWords.length;
    for (const key of ["original", "repaired", "kept"]) {
      segment[`${key}Errors`] = editErrors(refWords, normalise(segment[key])).errors;
    }
    // Words the model brought in: in its answer, not in what was heard, and not
    // in what was said there (nor in the second around it).
    const near = new Set(
      reference
        .filter((_, k) => mids[k] >= segment.start - 1 && mids[k] <= segment.end + 1)
        .flatMap((word) => normalise(word.text))
    );
    const heard = new Map();
    for (const token of normalise(segment.original)) heard.set(token, (heard.get(token) ?? 0) + 1);
    for (const key of ["repaired", "kept"]) {
      const left = new Map(heard);
      let added = 0;
      let invented = 0;
      for (const token of normalise(segment[key])) {
        if ((left.get(token) ?? 0) > 0) {
          left.set(token, left.get(token) - 1);
          continue;
        }
        added += 1;
        if (!near.has(token)) invented += 1;
      }
      segment[`${key}Added`] = added;
      segment[`${key}Invented`] = invented;
    }
  }
  return {
    meeting,
    segments: out,
    original: score("original"),
    repaired: score("repaired"),
    kept: score("kept"),
  };
}

const results = [];
const queue = [...recordings];
const concurrency = parseSpec(SPEC).provider === "local" ? 1 : Number(args.concurrency);
try {
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const recording = queue.shift();
        const result = await repairMeeting(recording);
        results.push(result);
        console.error(
          `${result.meeting}: WER ${(result.original.wer * 100).toFixed(1)}% -> ${(result.repaired.wer * 100).toFixed(1)}% (guarded ${(result.kept.wer * 100).toFixed(1)}%)`
        );
      }
    })
  );
} finally {
  stopLocalServers();
}

// --- Totals.
const sum = (key, part) => results.reduce((total, result) => total + result[part][key], 0);
const words = sum("words", "original");
const segments = results.flatMap((result) => result.segments);
const called = segments.filter((segment) => segment.called);
const scoredSegments = called.filter((segment) => segment.refWords > 0);
const hours = recordings.reduce((total, recording) => total + recording.summary.seconds, 0) / 3600;
const share = (list, test) => (list.length ? list.filter(test).length / list.length : null);
const summary = { model: SPEC, meetings: results.length, hours, segments: called.length };
for (const key of ["repaired", "kept"]) {
  summary[key] = {
    werBefore: sum("errors", "original") / words,
    werAfter: sum("errors", key) / words,
    insertionsBefore: sum("insertions", "original"),
    insertionsAfter: sum("insertions", key),
    changed: share(called, (segment) => segment[key] !== segment.original),
    worse: share(scoredSegments, (segment) => segment[`${key}Errors`] > segment.originalErrors),
    better: share(scoredSegments, (segment) => segment[`${key}Errors`] < segment.originalErrors),
    // Words brought in per 1,000 words heard, and those said nowhere near.
    addedPerK:
      (1000 * called.reduce((total, segment) => total + segment[`${key}Added`], 0)) /
      Math.max(1, sum("words", "original")),
    inventedPerK:
      (1000 * called.reduce((total, segment) => total + segment[`${key}Invented`], 0)) /
      Math.max(
        1,
        called.reduce((total, segment) => total + normalise(segment.original).length, 0)
      ),
    perMeeting: results.map((result) => ({
      meeting: result.meeting,
      before: result.original.wer,
      after: result[key].wer,
    })),
  };
  summary[key].deltaCi = bootstrapMean(
    results.map((result) => result[key].wer - result.original.wer)
  );
}
const ok = called.filter((segment) => segment.ok);
summary.failed = share(called, (segment) => !segment.ok);
summary.malformed = share(called, (segment) => segment.malformed);
summary.guarded = share(called, (segment) => segment.guarded);
summary.latencyP50 = percentile(
  ok.map((segment) => segment.ms),
  50
);
summary.latencyP95 = percentile(
  ok.map((segment) => segment.ms),
  95
);
summary.dollars = ok.reduce((total, segment) => total + (segment.cost ?? 0), 0);
summary.dollarsPerHour = summary.dollars / hours;
summary.inputPerHour =
  ok.reduce((total, segment) => total + (segment.usage?.input ?? 0), 0) / hours;
summary.outputPerHour =
  ok.reduce((total, segment) => total + (segment.usage?.output ?? 0), 0) / hours;

const pct = (value, digits = 1) => (value == null ? "n/a" : `${(value * 100).toFixed(digits)}%`);
console.log(
  `## ${SPEC}: ${results.length} meetings, ${hours.toFixed(1)} h, ${called.length} segments`
);
for (const key of ["repaired", "kept"]) {
  const s = summary[key];
  console.log(
    `${key === "kept" ? "guarded" : "raw    "} WER ${pct(s.werBefore)} -> ${pct(s.werAfter)} (Δ ${pct(s.deltaCi.mean, 2)} [${pct(s.deltaCi.low, 2)}, ${pct(s.deltaCi.high, 2)}] per meeting); insertions ${s.insertionsBefore} -> ${s.insertionsAfter}; segments changed ${pct(s.changed)}, better ${pct(s.better)}, worse ${pct(s.worse)}; words added ${s.addedPerK.toFixed(1)}/1000, invented ${s.inventedPerK.toFixed(1)}/1000`
  );
}
console.log(
  `cost    failed ${pct(summary.failed)}, malformed ${pct(summary.malformed)}, guard reverted ${pct(summary.guarded)}; latency p50 ${summary.latencyP50?.toFixed(0)} ms p95 ${summary.latencyP95?.toFixed(0)} ms; $${summary.dollarsPerHour.toFixed(4)}/h ($${summary.dollars.toFixed(4)} total), ${summary.inputPerHour.toFixed(0)} in and ${summary.outputPerHour.toFixed(0)} out per hour`
);
if (args.json) {
  fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify({ summary, results }, null, 1));
}
