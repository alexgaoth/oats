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
import { PROPOSAL_RULE, TopicProposals, proposalScore } from "../src/helpers/topicProposals.mjs";

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
  },
});
if (!args.ami) {
  console.error("--ami <dir> [--set learn83] [--model-dir <dir>] [--json out.json]");
  process.exit(2);
}

const numbers = (text) => text.split(",").map(Number).filter(Number.isFinite);
const LAGS = numbers(args.lags).sort((a, b) => a - b);
const SLICES = numbers(args.slices);
const THRESHOLDS = numbers(args.thresholds);
const CAPS = numbers(args.caps);
const CONFIRM_S = Number(args.confirm);
const TOLERANCE_S = Number(args.tolerance);
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
  return { id, turns, firstSeen, drawn, early, real, end };
}

// --- Grey marks under one rule.

function simulate(meeting, rule) {
  const { turns, firstSeen, drawn, early } = meeting;
  const replay = { turns: [], firstSeen, cuts: [] };
  const marks = new Map();
  const proposals = new TopicProposals(replay, {
    rule: { ...rule, confirm: CONFIRM_S },
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

const meetings = [];
for (const id of ids) {
  meetings.push(await loadMeeting(id));
  process.stderr.write(".");
}
process.stderr.write("\n");

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
  const bootstrap = (perMeeting, draws = 2000) => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const values = [];
    for (let draw = 0; draw < draws; draw += 1) {
      let top = 0;
      let bottom = 0;
      for (let index = 0; index < perMeeting.length; index += 1) {
        const pick = perMeeting[Math.floor(random() * perMeeting.length)];
        top += pick[0];
        bottom += pick[1];
      }
      values.push(bottom ? top / bottom : 0);
    }
    values.sort((a, b) => a - b);
    return [values[Math.floor(draws * 0.025)], values[Math.floor(draws * 0.975)]];
  };
  for (const text of args.rules.split(";")) {
    const [slice, schedule, threshold, cap] = text.split(":");
    const rule = {
      slice: Number(slice),
      schedule: schedule.split("/").map((r) => (r.startsWith("c") ? r : Number(r))),
      threshold: Number(threshold),
      cap: Number(cap),
    };
    const fades = [];
    const right = [];
    const gain = [];
    const early = [];
    let gains = [];
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
        gains.push(mark.solidAt - first);
      }
      gain.push([saved, count]);
      early.push([before, count]);
    }
    const sum = (pairs, at) => pairs.reduce((total, pair) => total + pair[at], 0);
    const ratio = (pairs) => sum(pairs, 0) / Math.max(1e-9, sum(pairs, 1));
    const show = (pairs, scale = 1, digits = 2) => {
      const [low, high] = bootstrap(pairs);
      return `${(ratio(pairs) * scale).toFixed(digits)} [${(low * scale).toFixed(digits)}, ${(high * scale).toFixed(digits)}]`;
    };
    console.log(`\nFrozen rule ${text}:`);
    console.log(`  faded marks an hour: ${show(fades, 1, 1)}`);
    console.log(`  grey marks within ${TOLERANCE_S} s of a real change: ${show(right)}`);
    console.log(`  solid cuts with an earlier grey mark: ${show(early)}`);
    console.log(
      `  seconds earlier than the line, mean over found changes: ${show(gain, 1, 1)}; median ${median(gains)?.toFixed(0)} s`
    );
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
