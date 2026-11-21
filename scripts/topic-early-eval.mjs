#!/usr/bin/env node
/**
 * Early topic proposals: how soon a "maybe" mark for a change of subject can show,
 * and how often it is right, before the change detector (src/helpers/topicChange.mjs)
 * decides. Method and results: docs/topic-early.md.
 *
 *   node scripts/topic-early-eval.mjs --ami <dir> [--set learn83|eval24|test|tune|all]
 *     [--meetings a,b] [--model-dir <all-MiniLM-L6-v2 dir>] [--cache <dir>]
 *     [--lags 5,10,15,20,30] [--slices 5,10,15,20,30]
 *     [--thresholds 0.3,0.35,...] [--caps 1,2] [--json out.json] [--top 3]
 *     [--bands --grey-floors 0.30,0.35,0.40] [--approvals verdicts.jsonl]
 *     [--dump-candidates candidates.jsonl --dump-read 15 --dump-threshold 0.30]
 *
 * For each meeting, on manual words cut as the app cuts speech (0.4 s pauses,
 * 20 s at most, scripts/lib/topic-corpus.mjs):
 *   1. The app's detector, live (lag 45 s, hold 15 s, spacing 90 s, the long
 *      split): when it draws each cut. This is what the map shows today.
 *   2. Each pause's score with only r s heard after it: the same features and the
 *      same trees, with the far side cut to r s (`gapFeatures(..., { lag: r })`),
 *      and the time when those r s have landed (the end of every turn they read).
 *   3. For each rule (a schedule of r, a threshold, a slice length, a cap on open
 *      marks), every `slice` seconds: the strongest pause of the last 65 s whose
 *      latest score passes the threshold becomes a grey mark, unless the cap is
 *      full, a mark is within one slice of it, or it is within 90 s after a drawn
 *      cut (the detector cannot cut there). A grey mark turns solid when the
 *      detector draws a cut within `--confirm` s of it, and fades 65 s after its
 *      pause when it does not. Marks never move and never return.
 *
 * --bands replays the two-band rule with a real detector. --approvals also
 * replays cached verdicts at their recorded request latency. It makes no calls.
 *
 * Scored against AMI's top-level topic changes, within 60 s (docs/topic-split.md).
 * Public data only (AMI, CC BY 4.0). Nothing leaves the computer.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { createEmbedder } from "./lib/minilm.mjs";
import {
  amiMeetingIds,
  amiReference,
  annotationsDir,
  referenceLabels,
  topicNames,
} from "./lib/topic-corpus.mjs";
import { contentWords } from "../src/helpers/conversationTopics.mjs";
import { LONG_TOPIC_SPLIT, TopicChangeDetector, makeTurn } from "../src/helpers/topicChange.mjs";
import {
  EARLY_READ_S,
  GREY_FLOOR,
  PROPOSAL_RULE,
  TopicProposals,
  approvalWindow,
  proposalScore,
} from "../src/helpers/topicProposals.mjs";

const { values: args } = parseArgs({
  options: {
    ami: { type: "string" },
    set: { type: "string", default: "learn83" },
    meetings: { type: "string" },
    "model-dir": { type: "string" },
    cache: {
      type: "string",
      default: path.join(os.homedir(), "oats-asr-cache", "topic-early", "vectors"),
    },
    lags: { type: "string", default: "5,10,15,20,30" },
    slices: { type: "string", default: "5,10,15,20,30" },
    thresholds: { type: "string", default: "0.30,0.35,0.40,0.45,0.50,0.55,0.60,0.65,0.70" },
    caps: { type: "string", default: "1,2" },
    confirm: { type: "string", default: "20" },
    tolerance: { type: "string", default: "60" },
    json: { type: "string" },
    top: { type: "string", default: "3" },
    // r=DIR,...: out-of-fold scores of trees learned for an r s read
    // (scripts/topic-early-train.py), in place of the shipped trees.
    early: { type: "string" },
    "list-set": { type: "boolean", default: false },
    // Frozen rules only, with 95% meeting-bootstrap intervals:
    // "slice:schedule:threshold:cap;..." with the schedule as "30" or "15/30".
    rules: { type: "string" },
    "compare-fade-cap": { type: "boolean", default: false },
    bands: { type: "boolean", default: false },
    "grey-floors": { type: "string", default: String(GREY_FLOOR) },
    "dump-candidates": { type: "string" },
    "dump-read": { type: "string", default: String(EARLY_READ_S) },
    "dump-threshold": { type: "string", default: "0.3" },
    approvals: { type: "string" },
    "approve-at": { type: "string", default: "0.8" },
  },
});
if (!args.ami) {
  console.error("--ami <dir> [--set learn83] [--model-dir <dir>] [--json out.json]");
  process.exit(2);
}

const numbers = (text) => text.split(",").map(Number).filter(Number.isFinite);
const LAGS = [
  ...new Set([
    ...numbers(args.lags),
    ...(args.bands || args.approvals ? [EARLY_READ_S, 30] : []),
    ...(args["dump-candidates"] ? [Number(args["dump-read"])] : []),
  ]),
].sort((a, b) => a - b);
const SLICES = numbers(args.slices);
const THRESHOLDS = numbers(args.thresholds);
const CAPS = numbers(args.caps);
const CONFIRM_S = Number(args.confirm);
const TOLERANCE_S = Number(args.tolerance);
const APPROVALS = new Map();
if (args.approvals) {
  for (const line of fs.readFileSync(args.approvals, "utf8").split("\n").filter(Boolean)) {
    const v = JSON.parse(line);
    APPROVALS.set(`${v.meeting}#${v.g}`, v);
  }
}
// Each scheduled r alone, and two steps that grow with what is heard.
const SCHEDULES = [
  ...LAGS.map((r) => [r]),
  ...[
    [10, 20, 30],
    [15, 30],
    [5, 15, 30],
  ].filter((s) => s.every((r) => LAGS.includes(r))),
  // "c5": the 5 s score, only where the turn after the pause opens with a strong cue
  // ("next", "moving on", "let's talk about", "we need to"): a change somebody announces.
  ...[["c5", 30], ["c5", 15, 30], ["c10", 30], ["c5"]].filter((s) =>
    s.every((r) => LAGS.includes(typeof r === "string" ? Number(r.slice(1)) : r))
  ),
];

// --- Meetings: the same sets as scripts/topic-loop-eval.mjs.

function evalSet(dir) {
  const ids = amiMeetingIds(dir);
  const test = ids.filter((id) => /^(ES2004|IS1009|TS3003)/.test(id));
  const tune = ids.filter((id) => !test.includes(id));
  const step = Math.floor(tune.length / 12);
  const spread = Array.from(
    { length: 12 },
    (_, index) => tune[index * step + Math.floor(step / 2)]
  );
  const eval24 = [...test, ...spread];
  const series = (id) => id.replace(/[a-d]$/, "");
  const held = new Set(eval24.map(series));
  const learn83 = tune.filter((id) => !held.has(series(id)));
  return { test, tune, eval24, learn83, all: ids };
}

const dir = annotationsDir(args.ami);
const names = topicNames(dir);
const sets = evalSet(dir);
const ids = args.meetings ? args.meetings.split(",") : sets[args.set];
if (!ids) {
  console.error(`unknown set ${args.set}`);
  process.exit(2);
}
if (args["list-set"]) {
  console.log(ids.join(","));
  process.exit(0);
}
const EARLY = new Map(
  (args.early ?? "")
    .split(",")
    .filter(Boolean)
    .map((item) => [Number(item.split("=")[0]), item.slice(item.indexOf("=") + 1)])
);
const embedder = await createEmbedder({
  cacheDir: args.cache,
  modelDir: args["model-dir"],
  threads: 4,
});

// --- One meeting: turns, the live detector, early scores, real changes.

async function loadMeeting(id) {
  const conversation = amiReference(dir, id, names);
  const { utterances } = conversation;
  const vectors = await embedder.embed(utterances.map((utterance) => utterance.text));
  const firstSeen = new Map();
  const turns = utterances.map((utterance, index) => {
    const keys = contentWords(utterance.text);
    for (const key of keys) if (!firstSeen.has(key)) firstSeen.set(key, index);
    const turn = makeTurn({
      id: utterance.id,
      text: utterance.text,
      start: utterance.start,
      end: utterance.end,
      words: utterance.text.trim().split(/\s+/).length,
      keys,
    });
    turn.vector = vectors[index];
    return turn;
  });

  // 1. The app's detector, live: turns land at their end, vectors at once.
  const detector = new TopicChangeDetector({ split: LONG_TOPIC_SPLIT });
  const drawn = [];
  for (const [index, turn] of turns.entries()) {
    const { id: turnId, keys, words, start, end } = turn;
    detector.addTurn({ id: turnId, text: utterances[index].text, keys, words, start, end });
    detector.addVector(turn.id, turn.vector);
    detector.advance(turn.end);
    while (drawn.length < detector.cuts.length) {
      const g = detector.cuts[drawn.length];
      drawn.push({ g, at: turns[g].start, drawnAt: turn.end });
    }
  }

  // 2. Early scores: the far side cut to r s.
  const early = new Map();
  for (const r of LAGS) {
    const score = new Float64Array(turns.length).fill(Number.NaN);
    const learned = EARLY.has(r)
      ? JSON.parse(fs.readFileSync(path.join(EARLY.get(r), `${id}.json`), "utf8")).scores
      : null;
    if (learned && learned.length !== turns.length - 1) {
      throw new Error(`${id}: ${learned.length} early scores for ${turns.length - 1} pauses`);
    }
    for (let g = 1; g < turns.length; g += 1) {
      score[g] = proposalScore({ turns, firstSeen }, g, r, learned?.[g - 1]);
    }
    early.set(r, score);
  }

  // Real changes: where AMI's top-level topic changes.
  const labels = referenceLabels(conversation);
  const real = [];
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index] !== labels[index - 1]) real.push(utterances[index].start);
  }
  const end = turns.length ? turns.at(-1).end : 0;
  return { id, turns, firstSeen, drawn, early, real, end, texts: utterances.map((u) => u.text) };
}

// --- Grey marks under one rule.

function simulate(meeting, rule) {
  const { turns, firstSeen, drawn, early } = meeting;
  const replay = { turns: [], firstSeen, cuts: [] };
  const marks = new Map();
  const proposals = new TopicProposals(replay, {
    rule: { maxFadesPerHour: Infinity, ...rule, confirm: CONFIRM_S },
    score: (g, r) => early.get(r)[g],
    onChange(mark) {
      if (mark.state === "grey") marks.set(mark.id, { ...mark, raisedAt: mark.since });
      else Object.assign(marks.get(mark.id), { state: mark.state, resolvedAt: mark.since });
    },
  });
  let nextDrawn = 0;
  const last = meeting.end + PROPOSAL_RULE.expiresAfter + rule.slice;
  for (let now = rule.slice; now <= last; now += rule.slice) {
    while (replay.turns.length < turns.length && turns[replay.turns.length].end <= now) {
      replay.turns.push(turns[replay.turns.length]);
    }
    while (nextDrawn < drawn.length && drawn[nextDrawn].drawnAt <= now) {
      const cut = drawn[nextDrawn++];
      replay.cuts.push(cut.g);
      proposals.observeCuts(cut.drawnAt);
    }
    proposals.advance(now, Math.min(now, turns[replay.turns.length]?.start ?? now));
  }
  return [...marks.values()];
}

// --- Scores.

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const near = (times, at, tolerance) => times.some((time) => Math.abs(time - at) <= tolerance);

/** For each real change: when the first mark near it shows, grey or solid. */
function firstMarks(meeting, marks) {
  const out = [];
  for (const change of meeting.real) {
    const solid = meeting.drawn.filter((cut) => Math.abs(cut.at - change) <= TOLERANCE_S);
    const grey = marks.filter((mark) => Math.abs(mark.at - change) <= TOLERANCE_S);
    const solidAt = solid.length ? Math.min(...solid.map((cut) => cut.drawnAt)) : null;
    const greyAt = grey.length ? Math.min(...grey.map((mark) => mark.raisedAt)) : null;
    out.push({ change, solidAt, greyAt });
  }
  return out;
}

function bandReplay(meeting, greyFloor, useApprovals) {
  const { turns, texts, early, id, end } = meeting;
  const detector = new TopicChangeDetector({ split: LONG_TOPIC_SPLIT });
  const drawn = [];
  const marks = new Map();
  const pending = [];
  let asked = 0;
  let answered = 0;
  const proposals = new TopicProposals(detector, {
    greyFloor,
    score: (g, lag) => early.get(lag)[g],
    onChange(mark) {
      if (mark.state === "grey") marks.set(mark.id, { ...mark });
      else marks.get(mark.id).state = mark.state;
    },
    onCut(g, now, source) {
      drawn.push({ g, at: turns[g].start, drawnAt: now, source });
    },
    onGrey(mark, g) {
      if (!useApprovals) return;
      asked++;
      const verdict = APPROVALS.get(`${id}#${g}`);
      if (!verdict?.ok) return;
      answered++;
      pending.push({ id: mark.id, verdict, at: mark.since + Math.max(0, verdict.ms ?? 0) / 1000 });
      pending.sort((left, right) => left.at - right.at);
    },
  });
  const slice = PROPOSAL_RULE.slice;
  let i = 0;
  let tick = slice;
  let landed = 0;
  const last = end + PROPOSAL_RULE.expiresAfter + slice;
  for (;;) {
    const nextTurn = turns[i]?.end ?? Infinity;
    const nextVerdict = pending[0]?.at ?? Infinity;
    const now = Math.min(nextTurn, tick, nextVerdict, proposals.deadline());
    if (now > last) break;
    while (turns[i]?.end <= now) {
      const turn = turns[i];
      detector.addTurn({ ...turn, text: texts[i++] });
      detector.addVector(turn.id, turn.vector);
      landed = turn.end;
      detector.advance(landed);
      while (drawn.length < detector.cuts.length) {
        const g = detector.cuts[drawn.length];
        drawn.push({ g, at: turns[g].start, drawnAt: now, source: "detector" });
      }
    }
    proposals.advance(now, landed);
    if (tick === now) tick += slice;
    while (pending[0]?.at <= now) {
      const { id: markId, verdict } = pending.shift();
      proposals.approve(markId, verdict, now, Number(args["approve-at"]));
    }
  }
  return { drawn, marks: [...marks.values()], asked, answered };
}

function lineComparison(meeting, result) {
  const first = (line, change) => {
    const times = line
      .filter((cut) => near([change], cut.at, TOLERANCE_S))
      .map((cut) => cut.drawnAt);
    return times.length ? Math.min(...times) - change : null;
  };
  const baseFirsts = meeting.real.map((change) => first(meeting.drawn, change));
  const nextFirsts = meeting.real.map((change) => first(result.drawn, change));
  const gain = baseFirsts.flatMap((delay, i) =>
    delay !== null && nextFirsts[i] !== null ? [delay - nextFirsts[i]] : []
  );
  const line = (cuts, delays) => ({
    cuts: cuts.length,
    right: cuts.filter((cut) => near(meeting.real, cut.at, TOLERANCE_S)).length,
    delays: delays.filter((delay) => delay !== null),
  });
  return {
    h: meeting.end / 3600,
    changes: meeting.real.length,
    gain,
    base: line(meeting.drawn, baseFirsts),
    next: line(result.drawn, nextFirsts),
    grey: result.marks.length,
    faded: result.marks.filter((mark) => mark.state === "faded").length,
    settled: result.marks.filter((mark) => mark.state === "solid").length,
    greyRight: result.marks.filter((mark) => near(meeting.real, mark.at, TOLERANCE_S)).length,
    asked: result.asked,
    answered: result.answered,
    sources: result.drawn.map((cut) => cut.source),
  };
}

const ratio = (pairs) => {
  const numerator = pairs.reduce((sum, pair) => sum + pair[0], 0);
  const denominator = pairs.reduce((sum, pair) => sum + pair[1], 0);
  return denominator ? numerator / denominator : 0;
};

function bootstrap(perMeeting, statistic, draws = 2000) {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const values = [];
  for (let draw = 0; draw < draws; draw += 1) {
    const sample = perMeeting.map(() => perMeeting[Math.floor(random() * perMeeting.length)]);
    values.push(statistic(sample));
  }
  values.sort((a, b) => a - b);
  return [values[Math.floor(draws * 0.025)], values[Math.floor(draws * 0.975)]];
}

function reportBands(data, label) {
  const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
  const compare = (name, stat, scale = 100) => {
    const diff = (rows) => scale * (stat(rows, "next") - stat(rows, "base"));
    const [lo, hi] = bootstrap(data, diff);
    console.log(
      `  ${name}: ${(scale * stat(data, "base")).toFixed(2)} -> ${(scale * stat(data, "next")).toFixed(2)}; delta ${diff(data).toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`
    );
  };
  console.log(`\nTwo bands (${label}):`);
  const h = sum(data, (d) => d.h);
  const grey = sum(data, (d) => d.grey);
  compare("cuts/h", (rows, side) => sum(rows, (r) => r[side].cuts) / sum(rows, (r) => r.h), 1);
  compare("line precision (%)", (rows, side) =>
    ratio(rows.map((r) => [r[side].right, r[side].cuts]))
  );
  compare("changes found (%)", (rows, side) =>
    ratio(rows.map((r) => [r[side].delays.length, r.changes]))
  );
  compare("first line median (s)", (rows, side) => median(rows.flatMap((r) => r[side].delays)), 1);
  const gain = (rows) => ratio(rows.map((r) => [r.gain.reduce((a, b) => a + b, 0), r.gain.length]));
  const bounds = bootstrap(data, gain).map((x) => x.toFixed(2));
  console.log(`  lead where both find it (s): ${gain(data).toFixed(2)} [${bounds.join(", ")}]`);
  console.log(
    `  grey/h ${(grey / h).toFixed(3)}, fades/h ${(sum(data, (d) => d.faded) / h).toFixed(3)}, ${((100 * sum(data, (d) => d.settled)) / (grey || 1)).toFixed(1)}% settled, ${((100 * sum(data, (d) => d.greyRight)) / (grey || 1)).toFixed(1)}% right`
  );
  const sources = Object.create(null);
  for (const row of data)
    for (const source of row.sources) sources[source] = (sources[source] ?? 0) + 1;
  console.log(`  cuts by source: ${JSON.stringify(sources)}`);
  if (sum(data, (d) => d.asked)) {
    console.log(
      `  cached verdicts found: ${sum(data, (d) => d.answered)} of ${sum(data, (d) => d.asked)} grey marks`
    );
  }
}

const meetings = [];
for (const id of ids) {
  meetings.push(await loadMeeting(id));
  process.stderr.write(".");
}
process.stderr.write("\n");

if (args["dump-candidates"]) {
  const lag = Number(args["dump-read"]);
  const floor = Number(args["dump-threshold"]);
  const lines = [];
  for (const { id, turns, texts, early } of meetings) {
    for (let g = 1; g < turns.length; g++) {
      const score = early.get(lag)[g];
      if (score < floor) continue;
      const at = turns[g].start;
      const window = approvalWindow(turns, g, (_, i) => texts[i], lag);
      const last = g + window.after.length - 1;
      const ready = Math.max(at + lag, ...turns.slice(g, last + 1).map((turn) => turn.end));
      lines.push(JSON.stringify({ meeting: id, g, at, ready, score, ...window }));
    }
  }
  fs.writeFileSync(args["dump-candidates"], lines.join("\n") + "\n");
  console.error(`${lines.length} candidates at r ${lag}, score ${floor} or more`);
}

if (args.bands || args.approvals) {
  for (const floor of numbers(args["grey-floors"])) {
    reportBands(
      meetings.map((m) => lineComparison(m, bandReplay(m, floor, false))),
      `floor ${floor}, no judge`
    );
    if (args.approvals) {
      reportBands(
        meetings.map((m) => lineComparison(m, bandReplay(m, floor, true))),
        `floor ${floor}, cached judge ${args.approvals}`
      );
    }
  }
  process.exit(0);
}

const hours = meetings.reduce((sum, meeting) => sum + meeting.end, 0) / 3600;
const realCount = meetings.reduce((sum, meeting) => sum + meeting.real.length, 0);

// Today: solid cuts only.
const today = { cuts: 0, right: 0, found: 0, delays: [] };
for (const meeting of meetings) {
  today.cuts += meeting.drawn.length;
  today.right += meeting.drawn.filter((cut) => near(meeting.real, cut.at, TOLERANCE_S)).length;
  for (const mark of firstMarks(meeting, [])) {
    if (mark.solidAt !== null) {
      today.found += 1;
      today.delays.push(mark.solidAt - mark.change);
    }
  }
}

const rows = [];
for (const slice of SLICES) {
  for (const schedule of SCHEDULES) {
    for (const threshold of THRESHOLDS) {
      for (const cap of CAPS) {
        const rule = { slice, schedule, threshold, cap };
        const total = { marks: 0, faded: 0, solid: 0, right: 0, rightFaded: 0, early: 0, found: 0 };
        const leads = [];
        const firstDelays = [];
        const solidDelays = [];
        for (const meeting of meetings) {
          const marks = simulate(meeting, rule);
          total.marks += marks.length;
          for (const mark of marks) {
            const right = near(meeting.real, mark.at, TOLERANCE_S);
            if (right) total.right += 1;
            if (mark.state === "faded") {
              total.faded += 1;
              if (right) total.rightFaded += 1;
            } else {
              total.solid += 1;
              leads.push(mark.resolvedAt - mark.raisedAt);
            }
          }
          for (const mark of firstMarks(meeting, marks)) {
            const seen = [mark.solidAt, mark.greyAt].filter((value) => value !== null);
            if (seen.length) total.found += 1;
            if (mark.solidAt !== null) {
              solidDelays.push(mark.solidAt - mark.change);
              firstDelays.push(Math.min(...seen) - mark.change);
              if (mark.greyAt !== null && mark.greyAt < mark.solidAt) total.early += 1;
            }
          }
        }
        rows.push({
          slice,
          schedule: schedule.join("/"),
          threshold,
          cap,
          marksPerHour: total.marks / hours,
          fadesPerHour: total.faded / hours,
          turnedSolid: total.marks ? total.solid / total.marks : null,
          greyRight: total.marks ? total.right / total.marks : null,
          rightButFaded: total.rightFaded / hours,
          foundByAny: total.found / realCount,
          solidWithEarlyGrey: today.found ? total.early / today.found : null,
          medianLead: median(leads),
          medianFirstMark: median(firstDelays),
          medianSolid: median(solidDelays),
        });
      }
    }
  }
}

const pct = (value) => (value === null ? "-" : `${Math.round(value * 100)}%`);
const sec = (value) => (value === null ? "-" : `${Math.round(value)} s`);
const one = (value) => value.toFixed(1);

console.log(
  `${meetings.length} meetings, ${hours.toFixed(1)} h, ${realCount} real changes (set ${args.set}).`
);
console.log(
  `Today (solid only): ${one(today.cuts / hours)} cuts an hour, ${pct(today.right / today.cuts)} within ${TOLERANCE_S} s of a real change, ` +
    `${pct(today.found / realCount)} of real changes found, drawn a median ${sec(median(today.delays))} after the change.`
);
const TOP = Number(args.top);
for (const budget of [1, 2, 4]) {
  console.log(
    `\nAt most ${budget} faded mark(s) an hour: the rules that put a grey mark before the most solid cuts.`
  );
  console.log(
    "slice | r schedule | threshold | cap | grey/h | faded/h | turn solid | grey right | solid cuts with an earlier grey | first mark | lead"
  );
  for (const slice of SLICES) {
    const best = rows
      .filter((row) => row.slice === slice && row.fadesPerHour <= budget)
      .sort(
        (a, b) => b.solidWithEarlyGrey - a.solidWithEarlyGrey || a.fadesPerHour - b.fadesPerHour
      )
      .slice(0, TOP);
    for (const row of best) {
      console.log(
        `${row.slice} s | ${row.schedule} | ${row.threshold} | ${row.cap} | ${one(row.marksPerHour)} | ${one(row.fadesPerHour)} | ` +
          `${pct(row.turnedSolid)} | ${pct(row.greyRight)} | ${pct(row.solidWithEarlyGrey)} | ${sec(row.medianFirstMark)} | ${sec(row.medianLead)}`
      );
    }
  }
}
if (args.rules) {
  const measure = (rule) => {
    const fades = [];
    const right = [];
    const gain = [];
    const early = [];
    for (const meeting of meetings) {
      const marks = simulate(meeting, rule);
      const hoursHere = meeting.end / 3600;
      fades.push([marks.filter((mark) => mark.state === "faded").length, hoursHere]);
      right.push([
        marks.filter((mark) => near(meeting.real, mark.at, TOLERANCE_S)).length,
        marks.length,
      ]);
      let saved = 0;
      let count = 0;
      let before = 0;
      for (const mark of firstMarks(meeting, marks)) {
        if (mark.solidAt === null) continue;
        const first = mark.greyAt !== null ? Math.min(mark.greyAt, mark.solidAt) : mark.solidAt;
        saved += mark.solidAt - first;
        count += 1;
        if (mark.greyAt !== null && mark.greyAt < mark.solidAt) before += 1;
      }
      gain.push([saved, count]);
      early.push([before, count]);
    }
    return { fades, right, early, gain };
  };
  const show = (pairs, statistic = ratio) => {
    const [low, high] = bootstrap(pairs, statistic);
    return `${statistic(pairs).toFixed(3)} [${low.toFixed(3)}, ${high.toFixed(3)}]`;
  };
  for (const text of args.rules.split(";")) {
    const [slice, schedule, threshold, cap] = text.split(":");
    const rule = {
      slice: Number(slice),
      schedule: schedule.split("/").map((r) => (r.startsWith("c") ? r : Number(r))),
      threshold: Number(threshold),
      cap: Number(cap),
    };
    const metrics = [
      ["fades", "faded marks an hour"],
      ["right", `grey marks within ${TOLERANCE_S} s of a real change`],
      ["early", "solid cuts with an earlier grey mark"],
      ["gain", "seconds earlier than the line, mean over found changes"],
    ];
    const baseline = measure(rule);
    console.log(`\nFrozen rule ${text}:`);
    for (const [key, label] of metrics) console.log(`  ${label}: ${show(baseline[key])}`);
    if (args["compare-fade-cap"]) {
      const capped = measure({ ...rule, maxFadesPerHour: PROPOSAL_RULE.maxFadesPerHour });
      console.log(`\nWith ${PROPOSAL_RULE.maxFadesPerHour} fades/h cap (paired deltas):`);
      const difference = (sample) =>
        ratio(sample.map((pair) => pair[1])) - ratio(sample.map((pair) => pair[0]));
      for (const [key, label] of metrics) {
        const paired = baseline[key].map((value, index) => [value, capped[key][index]]);
        console.log(`  ${label}: ${show(capped[key])}; delta ${show(paired, difference)}`);
      }
    }
  }
}
if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      {
        set: args.set,
        meetings: meetings.length,
        hours,
        realCount,
        today: { ...today, delays: undefined, medianDelay: median(today.delays) },
        rows,
      },
      null,
      1
    )
  );
}
