// Ways to decide that a stretch of a finished conversation comes back to an
// earlier one, for the return benchmark. The cuts stay the tracker's: a stretch
// is a run of turns the record holds on one topic. Only the decision "this
// stretch is the same topic as that one" changes, and the result goes through
// the app's `topicLanes`, so what is scored is what would be drawn.

import { contentWords } from "../../src/helpers/conversationTopics.mjs";
import { topicLanes } from "../../src/helpers/topicLanes.mjs";
import { returnsOfLanes } from "./return-score.mjs";

/** The record's stretches, in order: the runs of `assignment` (one topic per turn). */
export function stretchesOf(conversation, assignment) {
  const stretches = [];
  conversation.utterances.forEach((utterance, index) => {
    const last = stretches.at(-1);
    if (last && last.topic === assignment[index]) last.turns.push(utterance);
    else stretches.push({ topic: assignment[index], turns: [utterance] });
  });
  return stretches;
}

function unit(values) {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm);
  return norm > 0 ? values.map((value) => value / norm) : values;
}

/** A stretch's vector: the mean of its turns' vectors, weighted by content words, as the record's. */
export function stretchVector(stretch, vectorOf) {
  let sum = null;
  for (const turn of stretch.turns) {
    const weight = contentWords(turn.text).length;
    const vector = vectorOf(turn.text);
    if (!weight || !vector) continue;
    if (!sum) sum = new Float64Array(vector.length);
    for (let index = 0; index < sum.length; index += 1) sum[index] += vector[index] * weight;
  }
  return sum ? unit(sum) : null;
}

/** Each vector minus the conversation's mean, unit length: what sets a stretch apart inside it. */
export function centered(vectors, weights) {
  const known = vectors.filter(Boolean);
  if (!known.length) return vectors;
  const mean = new Float64Array(known[0].length);
  vectors.forEach((vector, index) => {
    if (!vector) return;
    for (let k = 0; k < mean.length; k += 1) mean[k] += vector[k] * weights[index];
  });
  const total = vectors.reduce((sum, vector, index) => sum + (vector ? weights[index] : 0), 0);
  return vectors.map((vector) =>
    vector ? unit(Float64Array.from(vector, (value, k) => value - mean[k] / total)) : null
  );
}

const dot = (a, b) => {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return total;
};

/**
 * Groups stretches the tracker's way: in order, each joins the group it is most
 * alike, never the group of the stretch just before, when that reaches
 * `threshold`. `pairScore(j, i)` is how alike stretches j and i are; a group
 * counts its best member (`link: "max"`) or its mean (`link: "mean"`).
 */
export function groupStretches(count, pairScore, threshold, { link = "mean" } = {}) {
  const groups = [];
  const groupOf = [];
  for (let j = 0; j < count; j += 1) {
    let best = -1;
    let bestScore = -Infinity;
    groups.forEach((members, group) => {
      if (j && groupOf[j - 1] === group) return;
      const scores = members.map((i) => pairScore(j, i));
      const score =
        link === "max"
          ? Math.max(...scores)
          : scores.reduce((sum, value) => sum + value, 0) / scores.length;
      if (score > bestScore) {
        best = group;
        bestScore = score;
      }
    });
    if (best >= 0 && bestScore >= threshold) {
      groups[best].push(j);
      groupOf.push(best);
    } else {
      groupOf.push(groups.length);
      groups.push([j]);
    }
  }
  return { groups, groupOf };
}

/** What the lanes draw for a grouping of the stretches. */
export function drawnReturns(conversation, stretches, groups) {
  const segments = conversation.utterances.map((utterance) => ({
    id: utterance.id,
    timestamp: utterance.at,
  }));
  const nodes = groups.map((members, index) => {
    const turns = members.flatMap((member) => stretches[member].turns);
    let durationMs = 0;
    for (const member of members) {
      const list = stretches[member].turns;
      for (let at = 1; at < list.length; at += 1) durationMs += list[at].at - list[at - 1].at;
    }
    return {
      id: index + 1,
      label: `topic ${index + 1}`,
      state: "open",
      durationMs,
      utteranceIds: turns.map((turn) => turn.id),
      firstAt: turns[0].at,
      lastAt: turns.at(-1).at,
      returns: members.length - 1,
    };
  });
  return returnsOfLanes(topicLanes({ snapshot: { nodes }, segments }));
}
