/**
 * Score saved topic-loop-eval results against the public AMI reference.
 * Usage: node scripts/topic-finish-compare.mjs AMI LEARN83.txt DETECTOR.json RECUT.json
 * The detector file must cover all learn83. The re-cut file may cover a subset.
 * This script starts no models.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { ConversationTopicTracker } from "../src/helpers/conversationTopics.mjs";
import { RECORD_CHUNK_WORDS, RECORD_MINUTES_PER_TOPIC } from "../src/helpers/topicRecordCut.mjs";
import {
  amiReference,
  annotationsDir,
  assignmentOf,
  matchChanges,
  referenceLabels,
  segmentationScores,
  topicNames,
} from "./lib/topic-corpus.mjs";

const [ami, learnFile, detectorFile, recutFile] = process.argv.slice(2);
assert(recutFile, "Pass AMI, the learn83 list, and the detector and re-cut JSON files");
const read = (file) => fs.readFileSync(file, "utf8");
const ids = new Set(
  read(learnFile)
    .trim()
    .split(/[\s,]+/)
);
assert.equal(ids.size, 83, "Pass the learn83 list");
const detector = JSON.parse(read(detectorFile));
const recut = JSON.parse(read(recutFile));
assert(["v1", "d2"].includes(detector.summary.variant), "Expected a detector replay");
assert.equal(recut.summary.variant, "vf");
assert.equal(recut.summary.model, "local:gemma-4-e4b");
assert.deepEqual(recut.options, {
  chunkWords: RECORD_CHUNK_WORDS,
  minutesPerTopic: RECORD_MINUTES_PER_TOPIC,
});

function byMeeting(run) {
  const meetings = new Map(run.results.map((r) => [r.id, r]));
  assert.equal(meetings.size, run.results.length, "Duplicate meetings");
  assert(
    [...meetings.keys()].every((id) => ids.has(id)),
    "A meeting is outside learn83"
  );
  return meetings;
}

const device = byMeeting(detector);
const model = byMeeting(recut);
assert.equal(device.size, ids.size);
assert(model.size > 1, "A paired interval needs more than one meeting");
const dir = annotationsDir(ami);
const names = topicNames(dir);
const toleranceMs = 60_000;
const changes = (labels) =>
  labels.flatMap((label, i) => (i > 0 && label !== labels[i - 1] ? [i] : []));

function score(conversation, assignment, live) {
  const timeOf = (i) => conversation.utterances[i].start * 1000;
  const gold = changes(referenceLabels(conversation)).map(timeOf);
  const cuts = changes(assignment);
  const times = cuts.map(timeOf);
  const near = (t, list) => list.some((other) => Math.abs(t - other) <= toleranceMs);

  // Keep exact utterance matches first. Match the remaining live boundaries
  // to the nearest unused final boundary within 60 s, in live order.
  const liveSet = new Set(live);
  const cutSet = new Set(cuts);
  const missing = live.filter((i) => !cutSet.has(i));
  const replacements = cuts.filter((i) => !liveSet.has(i));
  const moved = matchChanges(missing.map(timeOf), replacements.map(timeOf), toleranceMs).length;
  const { pk, windowDiff } = segmentationScores(conversation, assignment);
  return {
    pk,
    windowDiff,
    cuts: cuts.length,
    right: times.filter((t) => near(t, gold)).length,
    found: gold.filter((t) => near(t, times)).length,
    gold: gold.length,
    live: live.length,
    moved,
    vanished: missing.length - moved,
    added: replacements.length - moved,
  };
}

const rows = [...device.values()].map((saved) => {
  const meeting = amiReference(dir, saved.id, names);
  const n = meeting.utterances.length;
  assert.equal(n, saved.utterances);
  assert.equal(n, saved.liveAssignment.length);
  assert.equal(n, saved.recordAssignment.length);
  const live = changes(saved.liveAssignment);
  const kept = score(meeting, saved.recordAssignment, live);
  assert.equal(kept.pk, saved.record.pk);
  assert.equal(kept.windowDiff, saved.record.windowDiff);
  const row = { hours: saved.minutes / 60, kept };
  const answer = model.get(saved.id);
  if (!answer) return row;
  assert.equal(answer.minutes, saved.minutes);
  assert.equal(answer.recordAssignment.length, n);
  assert(Number.isInteger(answer.variantStats?.ok), "Missing usable response count");
  if (answer.variantStats.ok === 0) return { ...row, replaced: kept, fallback: true };

  // The eval keeps the model's labels. The app takes only its starts and
  // groups returns itself. Score the assignment the app actually saves.
  const tracker = new ConversationTopicTracker();
  for (const turn of meeting.utterances) tracker.onUtterance(turn);
  const starts = changes(answer.recordAssignment);
  assert(tracker.setRecordCuts(starts.map((i) => meeting.utterances[i].id)));
  const snapshot = tracker.snapshot(meeting.utterances.at(-1).at, { final: true });
  const assigned = assignmentOf(meeting, snapshot.nodes);
  assert.deepEqual(changes(assigned), starts, `${saved.id}: record lost a model cut`);
  return { ...row, replaced: score(meeting, assigned, live), fallback: false };
});

function sum(rows, arm) {
  const totals = Object.fromEntries(Object.keys(rows[0][arm]).map((key) => [key, 0]));
  let hours = 0;
  for (const row of rows) {
    hours += row.hours;
    for (const key in totals) totals[key] += row[arm][key];
  }
  return { meetings: rows.length, hours, ...totals };
}

function metrics(t) {
  return {
    pk: t.pk / t.meetings,
    windowDiff: t.windowDiff / t.meetings,
    cutsPerHour: t.cuts / t.hours,
    precisionPct: (100 * t.right) / Math.max(1, t.cuts),
    foundPct: (100 * t.found) / Math.max(1, t.gold),
    movedPerHour: t.moved / t.hours,
    vanishedPerHour: t.vanished / t.hours,
    addedPerHour: t.added / t.hours,
  };
}

function differences(rows) {
  const a = metrics(sum(rows, "replaced"));
  const b = metrics(sum(rows, "kept"));
  return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] - b[key]]));
}

const paired = rows.filter((row) => row.replaced);
const count = 10_000;
let seed = 20261121;
const pick = (size) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((seed / 2 ** 32) * size);
};
const point = differences(paired);
const draws = Array.from({ length: count }, () =>
  differences(paired.map(() => paired[pick(paired.length)]))
);
const interval = Object.fromEntries(
  Object.keys(point).map((key) => {
    const values = draws.map((draw) => draw[key]).sort((a, b) => a - b);
    return [key, [point[key], values[count * 0.025], values[count * 0.975 - 1]]];
  })
);

for (const [label, sample, arm] of [
  ["detector, all learn83", rows, "kept"],
  ["detector, paired meetings", paired, "kept"],
  ["Gemma re-cut, paired meetings", paired, "replaced"],
]) {
  const totals = sum(sample, arm);
  console.log(label, { ...totals, ...metrics(totals) });
}
console.log("Meetings with no usable re-cut:", paired.filter((row) => row.fallback).length);
console.log("Gemma minus detector [difference, 95% paired meeting-bootstrap interval]", interval);
