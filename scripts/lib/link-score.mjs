// Scores for the link benchmark (`scripts/link-eval.mjs`): precision, recall,
// F1 and the false-link rate of a set of predicted links against the ground
// truth (`link-truth.mjs`), per category of pair, with 95% intervals.
//
// Pairs share meetings, so they are not independent: the intervals resample
// series (a team's four meetings), not pairs. A replicate draws the series of
// each group with replacement; a pair counts once for every way its two
// meetings' series were drawn (w(a) x w(b), or w(s)^2 inside one series).
// The non-scenario group has two series, too few to resample: its counts are
// given as they are, with Wilson intervals that treat its pairs as independent.

import { seeded, percentile } from "./fast-models.mjs";

/** Confusion counts of predictions over pairs, each pair weighted. */
export function confusion(pairs, predicted, weightOf = () => 1) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const pair of pairs) {
    const weight = weightOf(pair);
    if (!weight) continue;
    const yes = predicted(pair);
    if (pair.linked && yes) counts.tp += weight;
    else if (pair.linked) counts.fn += weight;
    else if (yes) counts.fp += weight;
    else counts.tn += weight;
  }
  return counts;
}

export function rates({ tp, fp, fn, tn }) {
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 =
    precision != null && recall != null && precision + recall
      ? (2 * precision * recall) / (precision + recall)
      : tp + fp + fn
        ? 0
        : null;
  const falseLinks = fp + tn ? fp / (fp + tn) : null;
  return { precision, recall, f1, falseLinks };
}

/** 95% Wilson score interval of k successes in n. */
export function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.96;
  const p = k / n;
  const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Point estimates and series-bootstrap intervals of precision, recall, F1 and
 * the false-link rate.
 *
 * @param {Array<{ a: string, b: string, linked: boolean }>} pairs
 * @param {(pair) => boolean} predicted
 * @param {{ seriesOf: (id: string) => string, groupOf: (id: string) => string,
 *   samples?: number, seed?: number, pairWeight?: (pair) => number }} options
 *   `pairWeight` weights a pair in every replicate (a sampled pair's inverse
 *   inclusion probability); 1 by default.
 */
export function scoreWithIntervals(
  pairs,
  predicted,
  { seriesOf, groupOf, samples = 1000, seed = 11, pairWeight = () => 1 }
) {
  const point = confusion(pairs, predicted, pairWeight);
  const estimate = rates(point);
  const groups = new Map();
  for (const pair of pairs) {
    for (const id of [pair.a, pair.b]) {
      const group = groupOf(id);
      if (!groups.has(group)) groups.set(group, new Set());
      groups.get(group).add(seriesOf(id));
    }
  }
  // Too few series to resample in some group the pairs touch: no bootstrap.
  const resamplable = [...groups.values()].every((series) => series.size >= 5);
  const intervals = {};
  if (resamplable) {
    const random = seeded(seed);
    const draws = { precision: [], recall: [], f1: [], falseLinks: [] };
    const seriesLists = new Map([...groups].map(([group, series]) => [group, [...series]]));
    for (let sample = 0; sample < samples; sample += 1) {
      const weight = new Map();
      for (const list of seriesLists.values()) {
        for (let index = 0; index < list.length; index += 1) {
          const drawn = list[Math.floor(random() * list.length)];
          weight.set(drawn, (weight.get(drawn) ?? 0) + 1);
        }
      }
      const counts = confusion(
        pairs,
        predicted,
        (pair) =>
          (weight.get(seriesOf(pair.a)) ?? 0) *
          (weight.get(seriesOf(pair.b)) ?? 0) *
          pairWeight(pair)
      );
      const value = rates(counts);
      for (const key of Object.keys(draws)) if (value[key] != null) draws[key].push(value[key]);
    }
    for (const [key, values] of Object.entries(draws)) {
      intervals[key] = values.length ? [percentile(values, 2.5), percentile(values, 97.5)] : null;
    }
  } else {
    intervals.precision = wilson(point.tp, point.tp + point.fp);
    intervals.recall = wilson(point.tp, point.tp + point.fn);
    intervals.falseLinks = wilson(point.fp, point.fp + point.tn);
    intervals.f1 = null;
    intervals.wilson = true;
  }
  return { counts: point, ...estimate, intervals };
}

/** Area under the ROC curve of scores against the truth (ties count half). */
export function auc(pairs, scoreOf) {
  const positives = [];
  const negatives = [];
  for (const pair of pairs) (pair.linked ? positives : negatives).push(scoreOf(pair));
  if (!positives.length || !negatives.length) return null;
  const all = [
    ...positives.map((score) => [score, 1]),
    ...negatives.map((score) => [score, 0]),
  ].sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  let index = 0;
  while (index < all.length) {
    let end = index;
    while (end + 1 < all.length && all[end + 1][0] === all[index][0]) end += 1;
    const rank = (index + end) / 2 + 1;
    for (let at = index; at <= end; at += 1) if (all[at][1]) rankSum += rank;
    index = end + 1;
  }
  const n1 = positives.length;
  const n0 = negatives.length;
  return (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

/**
 * The threshold with the best balanced accuracy (true-link rate minus
 * false-link rate) over `pairs`, from `grid`. Balanced accuracy does not move
 * with how many pairs are linked, which differs between the corpus (three in
 * four scenario pairs) and a person's own conversations (few).
 */
export function bestThreshold(pairs, linkedAt, grid) {
  let best = grid[0];
  let bestScore = -Infinity;
  for (const threshold of grid) {
    const { tp, fp, fn, tn } = confusion(pairs, (pair) => linkedAt(pair, threshold));
    const tpr = tp + fn ? tp / (tp + fn) : 0;
    const fpr = fp + tn ? fp / (fp + tn) : 0;
    const score = tpr - fpr;
    if (score > bestScore + 1e-12) {
      best = threshold;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The difference in balanced accuracy (true-link rate minus false-link rate)
 * between two methods on the same pairs, with a series-bootstrap interval: the
 * same replicate weights for both, so the interval is of the paired difference.
 */
export function pairedBalance(
  pairs,
  predictedA,
  predictedB,
  { seriesOf, groupOf, samples = 1000, seed = 13, pairWeight = () => 1 }
) {
  const balance = (counts) => {
    const tpr = counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : 0;
    const fpr = counts.fp + counts.tn ? counts.fp / (counts.fp + counts.tn) : 0;
    return tpr - fpr;
  };
  const delta = (weightOf) =>
    balance(confusion(pairs, predictedA, weightOf)) -
    balance(confusion(pairs, predictedB, weightOf));
  const point = delta(pairWeight);
  const groups = new Map();
  for (const pair of pairs) {
    for (const id of [pair.a, pair.b]) {
      const group = groupOf(id);
      if (!groups.has(group)) groups.set(group, new Set());
      groups.get(group).add(seriesOf(id));
    }
  }
  const random = seeded(seed);
  const lists = [...groups.values()].map((series) => [...series]);
  const draws = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const weight = new Map();
    for (const list of lists) {
      for (let index = 0; index < list.length; index += 1) {
        const drawn = list[Math.floor(random() * list.length)];
        weight.set(drawn, (weight.get(drawn) ?? 0) + 1);
      }
    }
    draws.push(
      delta(
        (pair) =>
          (weight.get(seriesOf(pair.a)) ?? 0) *
          (weight.get(seriesOf(pair.b)) ?? 0) *
          pairWeight(pair)
      )
    );
  }
  return { delta: point, interval: [percentile(draws, 2.5), percentile(draws, 97.5)] };
}
