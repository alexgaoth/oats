// The voices of a room conversation's lines, gathered while it is recorded.
//
// Each line the segmenter closes is given its voice at once, in the ONNX
// worker, while the conversation goes on (30 to 50 ms a line on one core): at
// Stop only the grouping is left. The voices are numbers, about 200 a line,
// kept in memory and dropped when the pass ends; no audio of the room is
// written anywhere for them.
//
// Pure: the embedding comes from outside (`extract`). Pinned by
// test/helpers/roomVoiceTracker.test.js.

/** A line shorter than this carries no voice (roomVoices.mjs MIN_EMBED_MS). */
export const MIN_VOICE_MS = 500;
/** At Stop, how long the voices still being computed are waited for. */
export const VOICE_WAIT_MS = 20_000;

export class RoomVoiceTracker {
  /**
   * @param {{ extract: ((samples: Int16Array) => Promise<Float32Array | null>) | null }} options
   *   null when the voice model is missing: nothing is gathered
   */
  constructor({ extract }) {
    this.extract = extract;
    this.lines = [];
    this.dropped = false;
  }

  get enabled() {
    return !!this.extract && !this.dropped;
  }

  /**
   * A closed segment: its place in the recording and its samples. Its voice
   * is computed in the background; a failure leaves the line without one.
   * @param {{ startMs: number, endMs: number, samples: Int16Array }} segment
   */
  add(segment) {
    if (!this.enabled || !segment?.samples?.length) return;
    if (!(segment.endMs - segment.startMs >= MIN_VOICE_MS)) return;
    const embedding = Promise.resolve()
      .then(() => this.extract(segment.samples))
      .catch(() => null);
    this.lines.push({ startMs: segment.startMs, endMs: segment.endMs, embedding });
  }

  /**
   * Every line with its voice, or null where none came within `waitMs`.
   * @returns {Promise<Array<{ startMs: number, endMs: number, embedding: Float32Array | null }>>}
   */
  async collect(waitMs = VOICE_WAIT_MS) {
    const lines = this.lines;
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(resolve, waitMs, null);
    });
    try {
      return await Promise.all(
        lines.map(async (line) => ({
          startMs: line.startMs,
          endMs: line.endMs,
          embedding: await Promise.race([line.embedding, late]),
        }))
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Forget every voice: the pass ended, or the recording was abandoned. */
  drop() {
    this.dropped = true;
    this.lines = [];
  }
}
