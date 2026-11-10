#!/usr/bin/env node
/**
 * How long topics get, and whether a long one holds several of the annotators'
 * finer subjects: read from runs of `scripts/topic-loop-eval.mjs` (their
 * `liveAssignment` and `recordAssignment`) against AMI. `docs/topic-split.md`
 * has the method and the results.
 *
 *   node scripts/topic-split-eval.mjs --ami <dir> --runs a.json,b.json [--base a.json]
 *     [--long-minutes 5] [--even <minutes>] [--only ES2004,IS1009] [--json out.json]
 *
 * The last two rows are the annotators' own topics, top level and finest, read
 * by the same measures.
 *
 * For each run and each view (live at the end, and the record):
 *   - Pk and WindowDiff against AMI's top-level topics and its finest level,
 *     with the paired difference against `--base` (95% bootstrap over meetings),
 *   - topics and runs a meeting, boundary precision and recall at both levels
 *     (a drawn change within a minute of a real one),
 *   - the length of each topic, in words and in minutes (the time of its runs),
 *   - long topics (`--long-minutes` or more) a meeting, and how many of them
 *     hold two or more fine subtopics: fine runs of 40 words or more with most
 *     of their words in the topic.
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { bootstrapMean, mean, percentile } from "./lib/fast-models.mjs";
import {
  amiReference,
  annotationsDir,
  referenceLabels,
  segmentationScores,
  topicNames,
} from "./lib/topic-corpus.mjs";

const { values: args } = parseArgs({
  options: {
    ami: { type: "string" },
    runs: { type: "string" },
    base: { type: "string" },
    "long-minutes": { type: "string", default: "5" },
    even: { type: "string" },
    only: { type: "string" },
    json: { type: "string" },
  },
});
if (!args.ami || !args.runs) {
  console.error("--ami <dir> --runs a.json,b.json [--base a.json]");
  process.exit(2);
}
const LONG_S = Number(args["long-minutes"]) * 60;
const FINE_MIN_WORDS = 40;
const ONLY = args.only ? args.only.split(",") : null;

const dir = annotationsDir(args.ami);
const names = topicNames(dir);
const conversations = new Map();
const conversationOf = (id) => {
  if (!conversations.has(id)) conversations.set(id, amiReference(dir, id, names));
  return conversations.get(id);
};

const wordsOf = (utterance) => utterance.text.split(/\s+/).filter(Boolean).length;

/** Runs of equal labels: `{ label, from, to }`, `to` included. */
function runsOf(labels) {
  const runs = [];
  labels.forEach((label, index) => {
    const last = runs.at(-1);
    if (last && last.label === label) last.to = index;
    else runs.push({ label, from: index, to: index });
  });
  return runs;
}

/** Each topic of one assignment: its words, its minutes, and the fine subtopics it holds. */
function topicsOf(conversation, assignment) {
  const { utterances } = conversation;
  const fine = referenceLabels(conversation, { fine: true });
  const topics = new Map();
  const topicOf = (label) => {
    if (!topics.has(label)) topics.set(label, { label, words: 0, seconds: 0, runs: 0, fine: 0 });
    return topics.get(label);
  };
  utterances.forEach((utterance, index) => {
    topicOf(assignment[index]).words += wordsOf(utterance);
  });
  for (const run of runsOf(assignment)) {
    const topic = topicOf(run.label);
    topic.runs += 1;
    // A run lasts until the next one starts: the pause after its last turn is its own.
    const end = utterances[run.to + 1]?.start ?? utterances[run.to].end;
    topic.seconds += Math.max(0, end - utterances[run.from].start);
  }
  for (const run of runsOf(fine)) {
    const inside = new Map();
    let total = 0;
    for (let index = run.from; index <= run.to; index += 1) {
      const count = wordsOf(utterances[index]);
      total += count;
      inside.set(assignment[index], (inside.get(assignment[index]) ?? 0) + count);
    }
    if (total < FINE_MIN_WORDS) continue;
    for (const [label, count] of inside) {
      if (count * 2 > total) topicOf(label).fine += 1;
    }
  }
  return [...topics.values()];
}

function scoreRun(file) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = { file, label: path.basename(file, ".json"), options: value.options, views: {} };
  for (const view of ["live", "record"]) {
    const key = `${view}Assignment`;
    const meetings = value.results
      .filter((result) => result[key])
      .filter((result) => !ONLY || ONLY.some((prefix) => result.id.startsWith(prefix)))
      .map((result) => {
        const conversation = conversationOf(result.id);
        const assignment = result[key];
        const scores = segmentationScores(conversation, assignment);
        const topics = topicsOf(conversation, assignment);
        return {
          id: result.id,
          scores,
          topics,
          minutes: result.minutes,
          behaviour: result.behaviour,
        };
      });
    out.views[view] = meetings;
  }
  return out;
}

function summarize(meetings, base) {
  const all = meetings.flatMap((meeting) => meeting.topics);
  const long = all.filter((topic) => topic.seconds >= LONG_S);
  const sum = (pick) => meetings.reduce((total, meeting) => total + pick(meeting), 0);
  const paired = (pick) => {
    if (!base) return null;
    const byId = new Map(base.map((meeting) => [meeting.id, meeting]));
    const shared = meetings.filter((meeting) => byId.has(meeting.id));
    return bootstrapMean(shared.map((meeting) => pick(meeting) - pick(byId.get(meeting.id))));
  };
  const talk = all.reduce((total, topic) => total + topic.words, 0);
  const hours = sum((meeting) => meeting.minutes ?? 0) / 60;
  const perHour = (key) =>
    meetings.every((meeting) => meeting.behaviour)
      ? sum((meeting) => (meeting.behaviour[key] * meeting.minutes) / 60) / hours
      : null;
  return {
    meetings: meetings.length,
    pk: mean(meetings.map((meeting) => meeting.scores.pk)),
    windowDiff: mean(meetings.map((meeting) => meeting.scores.windowDiff)),
    finePk: mean(meetings.map((meeting) => meeting.scores.fine.pk)),
    fineWindowDiff: mean(meetings.map((meeting) => meeting.scores.fine.windowDiff)),
    pkDelta: paired((meeting) => meeting.scores.pk),
    finePkDelta: paired((meeting) => meeting.scores.fine.pk),
    topics: mean(meetings.map((meeting) => meeting.scores.topics)),
    runs: mean(meetings.map((meeting) => meeting.scores.runs)),
    refRuns: mean(meetings.map((meeting) => meeting.scores.refRuns)),
    fineRefRuns: mean(meetings.map((meeting) => meeting.scores.fine.refRuns)),
    precision:
      sum((m) => m.scores.boundaryHits) /
      Math.max(
        1,
        sum((m) => m.scores.boundaryDrawn)
      ),
    recall:
      sum((m) => m.scores.boundaryHits) /
      Math.max(
        1,
        sum((m) => m.scores.boundaryReal)
      ),
    finePrecision:
      sum((m) => m.scores.fine.boundaryHits) /
      Math.max(
        1,
        sum((m) => m.scores.fine.boundaryDrawn)
      ),
    fineRecall:
      sum((m) => m.scores.fine.boundaryHits) /
      Math.max(
        1,
        sum((m) => m.scores.fine.boundaryReal)
      ),
    minutes: [50, 75, 90].map((p) =>
      percentile(
        all.map((topic) => topic.seconds / 60),
        p
      )
    ),
    maxMinutes: Math.max(...all.map((topic) => topic.seconds / 60)),
    words: [50, 75, 90].map((p) =>
      percentile(
        all.map((topic) => topic.words),
        p
      )
    ),
    longPerMeeting: long.length / meetings.length,
    longShare: long.reduce((total, topic) => total + topic.words, 0) / Math.max(1, talk),
    longWithFine: long.filter((topic) => topic.fine >= 2).length,
    long: long.length,
    longFine: mean(long.map((topic) => topic.fine)),
    labelChangesPerHour: perHour("labelChangesPerHour"),
    linesMovedOldPerHour: perHour("linesMovedOldPerHour"),
  };
}

const fmt = (value, digits = 3) =>
  value == null || Number.isNaN(value) ? "n/a" : Number(value).toFixed(digits);
const delta = (stat) =>
  stat ? `${stat.mean >= 0 ? "+" : ""}${fmt(stat.mean)} [${fmt(stat.low)}, ${fmt(stat.high)}]` : "";
const pct = (value) => `${fmt(value * 100, 0)}%`;

const base = args.base ? scoreRun(args.base) : null;
const runs = args.runs.split(",").map(scoreRun);
// `--even <minutes>`: a control that knows nothing of the talk. Each run of the
// first run's record longer than that is cut into equal pieces of time, at the
// turn nearest each cut, and each piece is a topic of its own.
if (args.even) {
  const piece = Number(args.even) * 60;
  const meetings = runs[0].views.record.map(({ id, minutes }) => {
    const conversation = conversationOf(id);
    const { utterances } = conversation;
    const source = JSON.parse(fs.readFileSync(runs[0].file, "utf8")).results.find(
      (result) => result.id === id
    ).recordAssignment;
    const assignment = [...source];
    for (const run of runsOf(source)) {
      const from = utterances[run.from].start;
      const span = utterances[run.to].end - from;
      const count = Math.floor(span / piece);
      if (count < 1) continue;
      let part = 0;
      for (let index = run.from; index <= run.to; index += 1) {
        while (part < count && utterances[index].start - from >= ((part + 1) * span) / (count + 1))
          part += 1;
        if (part) assignment[index] = `${source[index]}~${part}`;
      }
    }
    return {
      id,
      minutes,
      scores: segmentationScores(conversation, assignment),
      topics: topicsOf(conversation, assignment),
    };
  });
  runs.push({
    label: `even pieces, ${args.even} min`,
    views: { live: meetings, record: meetings },
  });
}
// The annotators' own topics, through the same measures, on the first run's meetings.
for (const [label, fine] of [
  ["AMI top level", false],
  ["AMI fine level", true],
]) {
  const meetings = runs[0].views.record.map(({ id, minutes }) => {
    const conversation = conversationOf(id);
    const assignment = referenceLabels(conversation, { fine });
    return {
      id,
      minutes,
      scores: segmentationScores(conversation, assignment),
      topics: topicsOf(conversation, assignment),
    };
  });
  runs.push({ label, views: { live: meetings, record: meetings } });
}
const report = [];
for (const view of ["live", "record"]) {
  console.log(`\n### ${view}, long = ${fmt(LONG_S / 60, 0)} min or more\n`);
  console.log(
    "| run | Pk top | Δ top | WD top | Pk fine | Δ fine | WD fine | topics | runs | P / R top | P / R fine | minutes p50 / p75 / p90 (max) | words p50 / p75 / p90 | long a meeting | of talk | long with 2+ fine | names changed an hour, live | old lines moved an hour, live |"
  );
  console.log("| --- ".repeat(19) + "|");
  for (const run of runs) {
    const s = summarize(run.views[view], base?.views[view]);
    report.push({ view, label: run.label, options: run.options, ...s });
    console.log(
      `| ${run.label} | ${fmt(s.pk)} | ${delta(s.pkDelta)} | ${fmt(s.windowDiff)} | ${fmt(s.finePk)} | ${delta(s.finePkDelta)} | ${fmt(s.fineWindowDiff)} | ${fmt(s.topics, 1)} | ${fmt(s.runs, 1)} | ${pct(s.precision)} / ${pct(s.recall)} | ${pct(s.finePrecision)} / ${pct(s.fineRecall)} | ${s.minutes.map((v) => fmt(v, 1)).join(" / ")} (${fmt(s.maxMinutes, 0)}) | ${s.words.map((v) => fmt(v, 0)).join(" / ")} | ${fmt(s.longPerMeeting, 2)} | ${pct(s.longShare)} | ${s.longWithFine} of ${s.long} | ${fmt(s.labelChangesPerHour, 1)} | ${fmt(s.linesMovedOldPerHour, 1)} |`
    );
  }
  const first = runs[0].views[view];
  console.log(
    `\nreference runs a meeting: top ${fmt(mean(first.map((m) => m.scores.refRuns)), 1)}, fine ${fmt(mean(first.map((m) => m.scores.fine.refRuns)), 1)}`
  );
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
