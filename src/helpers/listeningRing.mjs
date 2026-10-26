// The record dot's ring: how loud the room is right now, read against itself.
//
// While a conversation is recorded, a ring behind the red dot grows with the
// microphone level, which MeetingRecordingMount samples ten times a second. It
// replaced a fixed `animate-ping`, which pulsed the same way through speech,
// silence and a dead microphone, so it said nothing.
//
// A fixed scale fails both ways: a quiet microphone never moves the ring, and
// a hot one holds it open. So the level is read against this room, as the live
// contour reads it: `levelScale` (conversationContour.mjs) learns the room's
// loud speech from the 97th percentile of the recent level, and that fills the
// ring. A level under the ring's rest leaves it still, so the dot is still
// while nobody speaks: under three times the room's floor, or under 0.004.
// Those were the speech segmenter's own levels until 2026-10-26; it now opens
// at 2.5 times the floor, down to 0.001, so it transcribes far voices the ring
// stays still for (speechSegmenter.mjs). Ordinary speech sits in the middle of
// the range and moves the ring visibly.
//
// The floor for that rest is the 5th percentile, as in the segmenter, and not
// `levelScale`'s 20th: a stretch of steady talk fills more than a fifth of a
// window, and three times its 20th percentile is ordinary speech, which then
// left the ring still through a monologue.
//
// Pure: levels in, scales out. Pinned by test/helpers/listeningRing.test.js.

import { levelScale } from "./conversationContour.mjs";

export const RING_DEFAULTS = Object.freeze({
  /**
   * Samples the room's floor is learned from: three minutes at 10 Hz, so a
   * long turn does not become the floor. `levelScale` reads the last minute of
   * them for the loud end.
   */
  historySamples: 1800,
  /** The range is learned again every this many samples: once a second. */
  refreshEvery: 10,
  /** Samples heard before the ring moves at all: one second. */
  minSamples: 10,
  /** The room's floor: this percentile of the history (the segmenter's 5th). */
  floorPercentile: 0.05,
  /** Room tone reaches up to this multiple of the floor (the segmenter's, until 2026-10-26). */
  restRatio: 3,
  /** And never rests below this level (the segmenter's `minSpeechRms`, until 2026-10-26). */
  minRest: 0.004,
  /** The least level span from rest to full (`levelScale`'s minimum range). */
  minSpan: 0.01,
  /** Loudness above rest, raised to this power: under 1 lifts soft speech. */
  curve: 0.6,
  /** The ring's largest size, as a multiple of the dot: 22 px, clear of the clock. */
  maxScale: 2.2,
});

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The p-th percentile (0..1) of a list of numbers, as `levelScale` takes it. */
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
}

/**
 * The levels this room moves the ring between.
 *
 * @param {number[]} levels Recent microphone levels (0..1), oldest first.
 * @param {object} [options] Overrides of `RING_DEFAULTS`.
 * @returns {{ rest: number, top: number }} At or under `rest` the ring rests;
 *   at `top` it is full.
 */
export function ringRange(levels, options = {}) {
  const { floorPercentile, restRatio, minRest, minSpan } = { ...RING_DEFAULTS, ...options };
  const rest = Math.max(minRest, percentile(levels, floorPercentile) * restRatio);
  const { floor, range } = levelScale(levels.map((level) => ({ level })));
  // Loud speech, but never closer to rest than `minSpan`: after a minute of
  // room tone alone, a cough must not read as the loudest voice in the room.
  const top = Math.max(floor + range, rest + minSpan);
  return { rest, top };
}

/**
 * The ring's size for one level: 1 (hidden behind the dot) at rest, up to
 * `maxScale` for the loudest speech.
 *
 * @param {number} level The microphone level now (0..1).
 * @param {{ rest: number, top: number } | null} range From `ringRange`; null
 *   while the room is not yet known.
 * @param {object} [options] Overrides of `RING_DEFAULTS`.
 */
export function ringScale(level, range, options = {}) {
  const { curve, maxScale } = { ...RING_DEFAULTS, ...options };
  if (!range || !Number.isFinite(level)) return 1;
  const share = clamp01((level - range.rest) / (range.top - range.rest));
  if (share === 0) return 1;
  return 1 + (maxScale - 1) * Math.pow(share, curve);
}

/**
 * The ring for one recording: feed it each level as it is sampled.
 */
export class ListeningRing {
  constructor(options = {}) {
    this.options = { ...RING_DEFAULTS, ...options };
    this.history = [];
    this.range = null;
    this.sinceRefresh = 0;
  }

  /**
   * @param {number} level The microphone level just sampled (0..1).
   * @returns {number} The ring's scale for it.
   */
  push(level) {
    if (!Number.isFinite(level)) return ringScale(0, this.range, this.options);
    const { historySamples, refreshEvery, minSamples } = this.options;
    this.history.push(level);
    if (this.history.length > historySamples) this.history.shift();
    this.sinceRefresh += 1;
    if (this.history.length >= minSamples && (!this.range || this.sinceRefresh >= refreshEvery)) {
      this.range = ringRange(this.history, this.options);
      this.sinceRefresh = 0;
    }
    return ringScale(level, this.range, this.options);
  }
}
