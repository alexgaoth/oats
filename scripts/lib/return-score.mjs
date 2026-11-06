// Scores for the return benchmark (`scripts/return-eval.mjs`): is a drawn "came
// back" right, and is a real return drawn? The rules are in docs/link-eval.md,
// "The gold for returns", written before any method was scored.

import { seeded, percentile } from "./fast-models.mjs";

/**
 * The returns of `topicLanes`, on the clock: each run that comes back to a row,
 * with the topic's earlier runs. What the scores read.
 */
export function returnsOfLanes(lanes) {
  const time = (fraction) => Math.round(lanes.start + fraction * lanes.span);
  const seen = new Set();
  const out = [];
  lanes.runs.forEach((run, index) => {
    if (seen.has(run.topic)) {
      const earlier = lanes.runs
        .slice(0, index)
        .filter((other) => other.topic === run.topic)
        .map((other) => [time(other.from), time(other.to)]);
      out.push({ topic: run.topic, at: time(run.from), end: time(run.to), earlier });
    }
    seen.add(run.topic);
  });
  return out;
}

/** A subject's share of a stretch for it to count as what the stretch is about. */
export const SHARE = 0.3;

/** A gold return is found by a drawn return that starts from this long before it. */
export const FOUND_BEFORE_MS = 60_000;

const words = (text) => text.split(/\s+/).filter(Boolean).length;

/**
 * Word shares of each subject over the turns inside some intervals (ms, on the
 * clock turns are finalized on).
 *
 * @param {{ conversation: any, gold: any }} meeting
 * @param {Array<[number, number]>} intervals
 */
export function sharesIn(meeting, intervals) {
  const shares = new Map();
  let total = 0;
  meeting.conversation.utterances.forEach((utterance, index) => {
    if (!intervals.some(([from, to]) => utterance.at >= from && utterance.at < to)) return;
    const count = words(utterance.text);
    total += count;
    for (const subject of meeting.gold.subjectsOf(index)) {
      shares.set(subject, (shares.get(subject) ?? 0) + count);
    }
  });
  for (const [subject, count] of shares) shares.set(subject, count / Math.max(1, total));
  return { shares, total };
}

const heldBy = ({ shares }) =>
  new Set([...shares].filter(([, share]) => share >= SHARE).map(([subject]) => subject));

/**
 * One drawn return's verdict. `earlier` are the intervals of the topic's
 * earlier runs, `at` to `end` the run it starts, and `previousEnd`..`at` is
 * empty: what lies between is from the last earlier run's end to `at`.
 *
 * @returns {{ verdict: "right" | "wrong" | "unverifiable", subject: string | null,
 *   held: Set<string> }} `held`: the subjects on both sides.
 */
export function verdictOf(meeting, drawn) {
  const after = heldBy(sharesIn(meeting, [[drawn.at, drawn.end]]));
  const before = heldBy(sharesIn(meeting, drawn.earlier));
  const lastEnd = Math.max(...drawn.earlier.map(([, to]) => to));
  const between = sharesIn(meeting, [[lastEnd, drawn.at]]);
  const held = new Set([...after].filter((subject) => before.has(subject)));
  const left = [...held].filter((subject) => (between.shares.get(subject) ?? 0) < SHARE);
  if (left.length) return { verdict: "right", subject: left[0], held };
  if (!after.size || !before.size) return { verdict: "unverifiable", subject: null, held };
  return { verdict: "wrong", subject: null, held };
}

/** Every drawn return of a meeting scored, and every gold return found or not. */
export function scoreMeeting(meeting, drawnReturns) {
  const verdicts = drawnReturns.map((drawn) => ({ drawn, ...verdictOf(meeting, drawn) }));
  const found = meeting.gold.returns.map((gold) => {
    const from = gold.start * 1000 - FOUND_BEFORE_MS;
    const to = gold.end * 1000;
    const match = verdicts
      .filter(({ drawn, held }) => drawn.at >= from && drawn.at <= to && held.has(gold.subject))
      .sort((a, b) => a.drawn.at - b.drawn.at)[0];
    return { gold, match: match?.drawn ?? null };
  });
  return { verdicts, found };
}

/** What chance gets: the same rule on every pair of non-adjacent runs. */
export function chancePairs(runs) {
  const out = [];
  for (let j = 2; j < runs.length; j += 1) {
    for (let i = 0; i + 1 < j; i += 1) {
      out.push({
        topic: -1,
        at: runs[j][1],
        end: runs[j][2],
        earlier: [[runs[i][1], runs[i][2]]],
      });
    }
  }
  return out;
}

function ratio(right, wrong) {
  return right + wrong ? right / (right + wrong) : null;
}

/** Totals over meetings; each meeting is { right, wrong, unverifiable, goldFound, gold }. */
function totals(rows, weight) {
  const sum = { right: 0, wrong: 0, unverifiable: 0, goldFound: 0, gold: 0 };
  rows.forEach((row, index) => {
    const w = weight ? weight[index] : 1;
    for (const key of Object.keys(sum)) sum[key] += row[key] * w;
  });
  return {
    ...sum,
    precision: ratio(sum.right, sum.wrong),
    strict: ratio(sum.right, sum.wrong + sum.unverifiable),
    recall: sum.gold ? sum.goldFound / sum.gold : null,
  };
}

/** Point estimates and a 95% bootstrap over meetings. */
export function summarizeReturns(rows, { samples = 2000, seed = 17 } = {}) {
  const point = totals(rows);
  const random = seeded(seed);
  const draws = { precision: [], strict: [], recall: [] };
  for (let sample = 0; sample < samples; sample += 1) {
    const weight = new Array(rows.length).fill(0);
    for (let k = 0; k < rows.length; k += 1) weight[Math.floor(random() * rows.length)] += 1;
    const value = totals(rows, weight);
    for (const key of Object.keys(draws)) if (value[key] != null) draws[key].push(value[key]);
  }
  const intervals = Object.fromEntries(
    Object.entries(draws).map(([key, values]) => [
      key,
      values.length ? [percentile(values, 2.5), percentile(values, 97.5)] : null,
    ])
  );
  return { ...point, intervals };
}

/** The paired difference of a rate between two methods on the same meetings. */
export function pairedReturns(rowsA, rowsB, key, { samples = 2000, seed = 19 } = {}) {
  const point = totals(rowsA)[key] - totals(rowsB)[key];
  const random = seeded(seed);
  const draws = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const weight = new Array(rowsA.length).fill(0);
    for (let k = 0; k < rowsA.length; k += 1) weight[Math.floor(random() * rowsA.length)] += 1;
    const a = totals(rowsA, weight)[key];
    const b = totals(rowsB, weight)[key];
    if (a != null && b != null) draws.push(a - b);
  }
  return { delta: point, interval: [percentile(draws, 2.5), percentile(draws, 97.5)] };
}
