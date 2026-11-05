// Where the subject changes, read from the turns as they land.
//
// The tracker in conversationTopics.mjs cuts where two windows of words share
// least, and it draws a cut only once later words cannot move it: a median of
// 3.9 minutes after the room moved on. Its live view scored no better than one
// topic for the whole meeting (Pk 0.356 against 0.345 on 24 AMI meetings), and on
// real research meetings much worse (ICSI: 0.510 against 0.278).
//
// This reads each pause with what a person would use: how alike the talk is on
// its two sides, in meaning (the sentence vectors the app already makes for the
// names) and in words, over four sizes of window; how much of what follows was
// never said before; how fast people are talking; how long the pause is; and
// whether the next turn opens like a new subject ("okay, so", "let's look at").
// A small set of decision trees, learned from meetings people segmented, turns
// those into one number (scripts/topic-change-train.py, topicChangeModel.mjs).
// Nothing here calls a model or the network: it is arithmetic on numbers the
// app has, about a quarter of a millisecond a turn. On the same 24 meetings,
// which it never saw: live Pk 0.264, a real change drawn after 1.1 minutes, and
// 29 old lines moved an hour against 206 (docs/topics-round-2.md).
//
// A pause is read `lag` seconds after it, when the talk on its far side has
// landed, and it becomes a cut once `hold` more seconds brought no stronger one.
// `spacing` keeps two cuts apart. Everything here works in seconds of
// conversation.
//
// Pure and DOM-free, so it unit-tests under node:test, and the trainer learns
// from exactly these features (`gapFeatures`, read by
// scripts/topic-change-features.mjs).

import { CHANGE_MODEL } from "./topicChangeModel.mjs";

/** Seconds of talk on each side of a pause. */
export const SCALES = Object.freeze([30, 60, 120, 240]);

/** Turn settings of the detector (see the header). */
export const CHANGE_RULE = Object.freeze({ lag: 45, hold: 15, spacing: 90 });

/** When a turn has no time of its own: about this many words a second. */
const WORDS_PER_SECOND = 2.5;

/** A turn's vector is waited for this much longer than the lag, then done without. */
const VECTOR_GRACE_S = 20;

/** No vector for this long while people talk: the feeder has stopped. */
const VECTORS_STOPPED_S = 120;

const FILLERS = new Set("um uh mm mm-hmm hmm mhm".split(" "));
const OPENERS = new Set("okay ok so right alright now well anyway".split(" "));
const CLEAR_OPENERS = new Set("okay ok alright right".split(" "));
const HEAD_WORDS = 8;
const OPENER_WORDS = 3;

const CUES = Object.freeze({
  phnext: /\bnext\b|\bmov(e|ing) on\b|\banyway\b|\bagenda\b/,
  phlets:
    /\blet'?s (talk|look|go|move|start|see|discuss|have|begin|get)\b|\bwe (now )?(need|have|want|should|gotta|got) to\b|\b(talk|talking|discuss|discussing) about\b/,
  phfirst: /\bfirst( of all)?\b|\b(finally|lastly|last thing)\b/,
  phpresent: /\b(present|presentation|slide|slides)\b/,
});

function plainWords(text) {
  return String(text ?? "")
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/all right/g, "alright")
    .replace(/[^\p{L}\p{N}_'\- ]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** How a turn opens: the discourse cues read from its first words. */
export function openingCues(text) {
  const words = plainWords(text);
  const spoken = words.filter((word) => !FILLERS.has(word));
  const head = words.slice(0, HEAD_WORDS).join(" ");
  const cues = {
    cue: spoken.slice(0, OPENER_WORDS).some((word) => OPENERS.has(word)) ? 1 : 0,
    okay: CLEAR_OPENERS.has(spoken[0]) ? 1 : 0,
  };
  for (const [name, pattern] of Object.entries(CUES)) cues[name] = pattern.test(head) ? 1 : 0;
  return cues;
}

/** A turn as the detector keeps it. */
export function makeTurn({ id, text, start, end, words, keys }) {
  return {
    id: String(id),
    start,
    end,
    words: Math.max(1, words),
    keys,
    cues: openingCues(text),
    vector: null,
  };
}

function bagCosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [key, count] of left) {
    leftNorm += count * count;
    dot += count * (right.get(key) ?? 0);
  }
  for (const count of right.values()) rightNorm += count * count;
  const norm = Math.sqrt(leftNorm * rightNorm);
  return norm > 0 ? dot / norm : 0;
}

function vectorCosine(left, right) {
  if (!left || !right) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / (Math.sqrt(leftNorm * rightNorm) + 1e-9);
}

function addVector(sum, vector, weight) {
  if (!vector) return sum;
  const out = sum ?? new Float64Array(vector.length);
  if (vector.length === out.length) {
    for (let index = 0; index < out.length; index += 1) out[index] += vector[index] * weight;
  }
  return out;
}

/**
 * The numbers read at the pause before `turns[g]`, by name. `firstSeen` is the
 * first turn each word was said in.
 *
 * @param {Array<ReturnType<typeof makeTurn>>} turns
 * @param {number} g
 * @param {{ lag: number, firstSeen: Map<string, number> }} options
 */
export function gapFeatures(turns, g, { lag, firstSeen }) {
  const out = {};
  const at = turns[g].start;
  for (const scale of SCALES) {
    const reach = Math.min(scale, lag);
    let from = g - 1;
    while (from > 0 && turns[from - 1].start >= at - scale) from -= 1;
    let to = g;
    while (to + 1 < turns.length && turns[to + 1].start < at + reach) to += 1;
    let leftVector = null;
    let rightVector = null;
    let leftWords = 0;
    let rightWords = 0;
    const leftBag = new Map();
    const rightBag = new Map();
    for (let index = from; index < g; index += 1) {
      const turn = turns[index];
      leftWords += turn.words;
      leftVector = addVector(leftVector, turn.vector, turn.words);
      for (const key of turn.keys) leftBag.set(key, (leftBag.get(key) ?? 0) + 1);
    }
    let fresh = 0;
    let total = 0;
    for (let index = g; index <= to; index += 1) {
      const turn = turns[index];
      rightWords += turn.words;
      rightVector = addVector(rightVector, turn.vector, turn.words);
      for (const key of turn.keys) {
        rightBag.set(key, (rightBag.get(key) ?? 0) + 1);
        total += 1;
        if ((firstSeen.get(key) ?? g) >= g) fresh += 1;
      }
    }
    out[`E${scale}`] = vectorCosine(leftVector, rightVector);
    out[`L${scale}`] = bagCosine(leftBag, rightBag);
    out[`N${scale}`] = total ? fresh / total : 0;
    out[`WL${scale}`] = leftWords / scale;
    out[`WR${scale}`] = rightWords / reach;
  }
  out.gap = Math.log1p(Math.max(0, at - turns[g - 1].end));
  out.len = Math.log1p(turns[g].words);
  out.lenp = Math.log1p(turns[g - 1].words);
  return Object.assign(out, turns[g].cues);
}

/** The model's number for one pause: the chance a change of subject is near it. */
export function changeScore(features, model = CHANGE_MODEL) {
  const values = model.features.map((name) => features[name] ?? 0);
  let total = model.base ?? 0;
  for (const tree of model.trees) {
    let node = 0;
    while (node >= 0) {
      node = values[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node];
    }
    total += tree.v[-node - 1];
  }
  return 1 / (1 + Math.exp(-total));
}

export class TopicChangeDetector {
  /**
   * @param {{ lag?: number, hold?: number, spacing?: number, threshold?: number,
   *   model?: typeof CHANGE_MODEL }} [options]
   *   A lower `threshold` proposes more, for a model that checks each one
   *   (topicLoop.mjs).
   */
  constructor({
    lag = CHANGE_RULE.lag,
    hold = CHANGE_RULE.hold,
    spacing = CHANGE_RULE.spacing,
    model = CHANGE_MODEL,
    threshold = model.threshold,
  } = {}) {
    Object.assign(this, { lag, hold, spacing, threshold, model });
    this.turns = [];
    this.byId = new Map();
    this.firstSeen = new Map();
    /** The next pause to read: the one before this turn. */
    this.next = 1;
    /** Turn indexes that start a topic, in order. */
    this.cuts = [];
    this.candidate = null;
    this.lastVectorAt = null;
  }

  /** A finalized turn, in order. Times in seconds of conversation. */
  addTurn({ id, text, keys, words, start, end }) {
    const finish = Number.isFinite(end) ? end : 0;
    const turn = makeTurn({
      id,
      text,
      keys,
      words,
      end: finish,
      start: Number.isFinite(start) ? start : finish - words / WORDS_PER_SECOND,
    });
    const index = this.turns.length;
    this.turns.push(turn);
    this.byId.set(turn.id, turn);
    for (const key of keys) if (!this.firstSeen.has(key)) this.firstSeen.set(key, index);
    return turn;
  }

  /** A turn's sentence vector, unit length. Says whether the turn was known. */
  addVector(id, vector) {
    const turn = this.byId.get(String(id));
    if (!turn) return false;
    turn.vector = vector;
    this.lastVectorAt = Math.max(this.lastVectorAt ?? turn.start, turn.start);
    return true;
  }

  /** Whether the vectors stopped coming: a pause with none is not a change of subject. */
  stalled(now) {
    return this.lastVectorAt !== null && now - this.lastVectorAt > VECTORS_STOPPED_S;
  }

  /** Whether every turn this pause's far side reads has its vector, or the wait is over. */
  _ready(g, now) {
    const at = this.turns[g].start;
    if (now - at < this.lag) return false;
    if (now - at >= this.lag + VECTOR_GRACE_S) return true;
    for (let index = g; index < this.turns.length; index += 1) {
      if (this.turns[index].start >= at + this.lag) break;
      if (!this.turns[index].vector) return false;
    }
    return true;
  }

  _read(g, state) {
    const features = gapFeatures(this.turns, g, { lag: this.lag, firstSeen: this.firstSeen });
    const score = changeScore(features, this.model);
    const at = this.turns[g].start;
    if (state.candidate && at > state.candidate.at + this.hold) {
      state.cuts.push(state.candidate.turn);
      state.candidate = null;
    }
    const last = state.cuts.at(-1);
    const clear = last === undefined || at - this.turns[last].start >= this.spacing;
    if (score >= this.threshold && clear && (!state.candidate || score > state.candidate.score)) {
      state.candidate = { turn: g, at, score };
    }
  }

  /** Reads every pause whose far side has landed by `now` (seconds). */
  advance(now) {
    while (this.next < this.turns.length && this._ready(this.next, now)) {
      this._read(this.next, this);
      this.next += 1;
    }
  }

  /** The turn a change being weighed starts at, or null. */
  proposedId() {
    return this.candidate ? this.turns[this.candidate.turn].id : null;
  }

  /** The cuts when the conversation has ended: the last pauses read with what followed them. */
  finalCuts() {
    const state = { cuts: [...this.cuts], candidate: this.candidate && { ...this.candidate } };
    for (let g = this.next; g < this.turns.length; g += 1) this._read(g, state);
    return state.candidate ? [...state.cuts, state.candidate.turn] : state.cuts;
  }
}
