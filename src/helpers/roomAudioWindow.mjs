// The last stretch of a room's stream, kept in memory by sample.
//
// A segment is short, and Parakeet reads 15 s at once: it hears a segment far
// better with the seconds before it (docs/speech-round-2.md). The segment's read
// starts after the segment has closed, so this holds more than those seconds: the
// longest segment (20 s), plus a backlog of reads. Nothing here reaches the disk.
//
// Pure: 16 kHz mono Int16 in, a copy out.

export class RoomAudioWindow {
  /** @param {number} capacity samples held */
  constructor(capacity) {
    this.ring = new Int16Array(capacity);
    /** How many samples of the stream have arrived. */
    this.total = 0;
  }

  /** @param {Int16Array} samples */
  push(samples) {
    const { ring } = this;
    const fresh = samples.length > ring.length ? samples.subarray(-ring.length) : samples;
    const at = (this.total + samples.length - fresh.length) % ring.length;
    const first = Math.min(fresh.length, ring.length - at);
    ring.set(fresh.subarray(0, first), at);
    ring.set(fresh.subarray(first), 0);
    this.total += samples.length;
  }

  /**
   * The `count` samples before `startSample`, or as many of them as are still here.
   * @returns {Int16Array}
   */
  before(startSample, count) {
    const { ring, total } = this;
    const end = Math.min(startSample, total);
    const start = Math.max(0, end - count, total - ring.length);
    const out = new Int16Array(Math.max(0, end - start));
    for (let i = 0; i < out.length; i += 1) out[i] = ring[(start + i) % ring.length];
    return out;
  }
}
