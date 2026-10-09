// Cutting a live conversation where people pause, instead of every five seconds.
//
// The local conversation path used to hand Whisper whatever had accumulated in
// the last 5 s, wherever that landed — usually mid-word. Measured over nine
// LibriSpeech conversations (921 s, `base`): fixed 5 s windows 15.15% WER,
// segments cut at pauses 6.17%, the true turns 5.47%. The model was never the
// problem; the scissors were. A word cut in half is two wrong words, and a
// sentence cut in half loses the context Whisper uses to spell the rest.
//
// So audio is cut where the room goes quiet: a pause of `pauseMs` after at
// least `minSpeechMs` of speech closes a segment. A long monologue is cut at
// its quietest recent frame once it reaches `maxSegmentMs`, which also keeps
// every request inside one 30 s Whisper window — the case where
// `--no-timestamps` is safe (docs/dictation-accuracy.md).
//
// "Quiet" is relative to the room, not absolute: a fan or an air conditioner
// sits above any fixed threshold for a whole meeting, and a segmenter that
// never hears a pause degrades to fixed cuts. The floor follows the quietest
// recent frames, and speech is energy well above it.
//
// Every segment carries its exact sample offsets from the start of the
// recording, so its words can be placed on the timeline — and matched to the
// speakers a diarizer finds there — without guessing from wall-clock arrival.
//
// Pure and DOM-free: 16 kHz mono Int16 in, segments out. Pinned by
// test/helpers/speechSegmenter.test.js.

export const SAMPLE_RATE = 16000;
const FRAME_MS = 20;
const FRAME = (SAMPLE_RATE * FRAME_MS) / 1000;

export const SEGMENTER_DEFAULTS = Object.freeze({
  pauseMs: 400,
  minSpeechMs: 500,
  maxSegmentMs: 20_000,
  /** Speech is this many times the room's floor (in RMS)… */
  speechRatio: 3,
  /** …and never quieter than this, so digital silence is not a floor of zero. */
  minSpeechRms: 0.004,
  /** Frames of context kept before speech starts, so a soft onset is not clipped. */
  leadFrames: 8,
});

function frameRms(samples, start) {
  let sum = 0;
  for (let i = start; i < start + FRAME; i += 1) {
    const n = samples[i] / 0x8000;
    sum += n * n;
  }
  return Math.sqrt(sum / FRAME);
}

export class SpeechSegmenter {
  constructor(options = {}) {
    this.options = { ...SEGMENTER_DEFAULTS, ...options };
    this.pending = new Int16Array(0); // samples not yet framed
    this.offset = 0; // sample index of pending[0] in the recording
    this.frames = []; // { start, rms } of the open region, in samples
    this.speaking = false;
    this.speechFrames = 0;
    this.quietRun = 0;
    this.floor = null; // RMS of the room when nobody is speaking
    this.recent = []; // recent frame RMS, for the floor
    this.buffer = []; // Int16Array pieces of the open segment
    this.segmentStart = null; // sample index the open segment starts at
  }

  _isSpeech(rms) {
    const { speechRatio, minSpeechRms } = this.options;
    const floor = this.floor ?? minSpeechRms / speechRatio;
    return rms > Math.max(minSpeechRms, floor * speechRatio);
  }

  _track(rms) {
    // The floor is the 5th percentile of the last 10 s of frames: low enough to
    // be the room rather than a voice — speech dips between syllables and words
    // many times a second, so even a monologue leaves the room audible in its
    // quietest frames — and high enough to follow a fan.
    this.recent.push(rms);
    if (this.recent.length > 500) this.recent.shift();
    if (this.recent.length >= 25) {
      const sorted = [...this.recent].sort((a, b) => a - b);
      this.floor = sorted[Math.floor(sorted.length * 0.05)];
    }
  }

  /**
   * Feed samples; returns the segments that closed.
   *
   * @param {Int16Array} samples 16 kHz mono
   * @returns {Array<{ samples: Int16Array, startSample: number, endSample: number,
   *   startMs: number, endMs: number }>}
   */
  push(samples) {
    const joined = new Int16Array(this.pending.length + samples.length);
    joined.set(this.pending, 0);
    joined.set(samples, this.pending.length);
    const out = [];
    let at = 0;
    for (; at + FRAME <= joined.length; at += FRAME) {
      const start = this.offset + at;
      const frame = joined.subarray(at, at + FRAME);
      const rms = frameRms(joined, at);
      const speech = this._isSpeech(rms);
      this._track(rms);
      this._frame(start, frame, rms, speech, out);
    }
    this.pending = joined.slice(at);
    this.offset += at;
    return out;
  }

  _frame(start, frame, rms, speech, out) {
    const { pauseMs, minSpeechMs, maxSegmentMs, leadFrames } = this.options;
    if (!this.speaking) {
      this.buffer.push(frame.slice());
      this.frames.push({ start, rms });
      // Still learning the room: hold everything and decide nothing. Deciding
      // against a guessed floor turned the first half-second of a fan into a
      // "segment", which Whisper answers with a hallucinated "Thank you".
      if (this.floor === null) return;
      // Once the room is known — including on the frame that teaches it, when
      // the whole opening is still held — speech starts at its first frame,
      // with a short lead-in so the first syllable is not cut off.
      const first = this.frames.findIndex((f) => this._isSpeech(f.rms));
      if (first === -1) {
        const excess = this.frames.length - leadFrames;
        if (excess > 0) {
          this.buffer.splice(0, excess);
          this.frames.splice(0, excess);
        }
        return;
      }
      const from = Math.max(0, first - leadFrames);
      this.buffer = this.buffer.slice(from);
      this.frames = this.frames.slice(from);
      this.speaking = true;
      this.speechFrames = this.frames.filter((f) => this._isSpeech(f.rms)).length;
      this.quietRun = 0;
      this.segmentStart = this.frames[0].start;
      return;
    }
    this.buffer.push(frame.slice());
    this.frames.push({ start, rms });
    if (speech) {
      this.speechFrames += 1;
      this.quietRun = 0;
    } else {
      this.quietRun += 1;
    }
    const lengthMs = this.frames.length * FRAME_MS;
    if (this.quietRun * FRAME_MS >= pauseMs) {
      if (this.speechFrames * FRAME_MS >= minSpeechMs) {
        // Close at the start of the pause, keeping a little of it as tail.
        const keep = this.frames.length - this.quietRun + Math.min(this.quietRun, 5);
        out.push(this._close(keep));
      } else {
        this._reset(); // a cough, a click: not a segment
      }
      return;
    }
    if (lengthMs >= maxSegmentMs) {
      // A monologue: cut at the quietest frame of the last third, carrying the
      // rest into the next segment.
      const from = Math.floor((this.frames.length * 2) / 3);
      let cut = from;
      for (let i = from; i < this.frames.length; i += 1) {
        if (this.frames[i].rms < this.frames[cut].rms) cut = i;
      }
      out.push(this._close(cut + 1, true));
    }
  }

  _close(keepFrames, carryOn = false) {
    const kept = this.buffer.slice(0, keepFrames);
    const samples = new Int16Array(kept.length * FRAME);
    kept.forEach((piece, i) => samples.set(piece, i * FRAME));
    const startSample = this.segmentStart;
    const endSample = startSample + samples.length;
    const segment = {
      samples,
      startSample,
      endSample,
      startMs: Math.round((startSample / SAMPLE_RATE) * 1000),
      endMs: Math.round((endSample / SAMPLE_RATE) * 1000),
    };
    if (carryOn) {
      this.buffer = this.buffer.slice(keepFrames);
      this.frames = this.frames.slice(keepFrames);
      this.segmentStart = this.frames.length ? this.frames[0].start : endSample;
      this.speechFrames = this.frames.length;
      this.quietRun = 0;
    } else {
      this._reset();
    }
    return segment;
  }

  _reset() {
    this.speaking = false;
    this.speechFrames = 0;
    this.quietRun = 0;
    this.buffer = [];
    this.frames = [];
    this.segmentStart = null;
  }

  /**
   * Close whatever is open — at stop, so the last thing said is not lost.
   * @returns {Array} zero or one segment
   */
  flush() {
    const out = [];
    if (this.speaking && this.speechFrames * FRAME_MS >= this.options.minSpeechMs / 2) {
      out.push(this._close(this.buffer.length));
    } else {
      this._reset();
    }
    return out;
  }
}
