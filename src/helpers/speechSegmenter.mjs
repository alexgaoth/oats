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
// "Well above" has two levels (2026-10-26). A segment opens on a frame 2.5
// times the floor (8 dB) and stays open while frames pass 1.5 times it
// (3.5 dB). A voice across the table reaches a laptop a few dB over the room:
// its loudest syllables pass the first level, its softer words only the
// second. With one level — every frame three times the floor — such a voice
// never opened a segment, or opened one on a syllable and lost it 400 ms later
// as a cough. A real conversation, its quietest seconds only a few dB under its
// speech, kept segments over 19% of its 28 minutes. AMI meetings replayed at
// that room's levels kept 23% of their speech, and keep 85% now; at a quiet
// room's levels, 72% and 98% (scripts/room-replay.js,
// docs/dictation-accuracy.md).
//
// Held open through soft speech, a segment is also held through the soft gap
// where one person stops and the next starts. So a segment longer than
// `splitAfterMs` splits at a soft pause — `softPauseMs` under the opening
// level, though the room is not quiet — at its quietest frame, once
// `minSpeechMs` of speech follows it. Nothing is dropped at a split, and each
// turn stays its own segment for the speaker pass. Unsplit, a lively meeting's
// segments ran 14 s at the median: the speaker pass would give a whole
// segment's words to one voice, and the question cards would wait for it.
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
/** Frames of the closing pause kept after the last speech. */
const TAIL_FRAMES = 5;

export const SEGMENTER_DEFAULTS = Object.freeze({
  pauseMs: 400,
  minSpeechMs: 500,
  maxSegmentMs: 20_000,
  /** A segment opens on a frame this many times the room's floor (in RMS)… */
  speechRatio: 2.5,
  /** …and holds while frames pass this many times it… */
  holdRatio: 1.5,
  /**
   * …and neither level is under this (-60 dBFS), so digital silence is not a
   * floor of zero. It was 0.004 (-48 dBFS), over a far voice on a quiet
   * microphone: capture has no automatic gain (meetingRecordingStore.ts).
   */
  minSpeechRms: 0.001,
  /** A segment this long splits at a soft pause, once speech follows it… */
  splitAfterMs: 2000,
  /** …a pause this long under the opening level. */
  softPauseMs: 300,
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
    this.quietRun = 0; // frames in a row under the hold level
    this.softRun = 0; // frames in a row under the opening level
    this.splitAt = null; // the frame a soft pause would split the open segment at
    this.speechAfterSplit = 0;
    this.floor = null; // RMS of the room when nobody is speaking
    this.recent = []; // recent frame RMS, for the floor
    this.floors = []; // the floor every 100 ms over the last minute, for steadyFloor
    this.tracked = 0; // frames tracked
    this.buffer = []; // Int16Array pieces of the open segment
    this.segmentStart = null; // sample index the open segment starts at
  }

  /** The level a frame must pass to be speech: to open a segment, or to hold one open. */
  _threshold(open) {
    const { speechRatio, holdRatio, minSpeechRms } = this.options;
    const floor = this.floor ?? minSpeechRms / speechRatio;
    return Math.max(minSpeechRms, floor * (open ? holdRatio : speechRatio));
  }

  /** The level speech must pass now: the opening level, or the hold level while open. */
  get threshold() {
    return this._threshold(this.speaking);
  }

  _isSpeech(rms, open = this.speaking) {
    return rms > this._threshold(open);
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
    // The floor every 100 ms over the last minute, for steadyFloor.
    this.tracked += 1;
    if (this.tracked % 5 === 0 && this.floor !== null) {
      this.floors.push(this.floor);
      if (this.floors.length > 600) this.floors.shift();
    }
  }

  /**
   * The lowest the floor went over the last minute: the sound that never
   * stopped, an air conditioner rather than a minute of busy talk, whose
   * quietest frames are still speech. Null until the room is known.
   */
  get steadyFloor() {
    if (!this.floors.length) return this.floor;
    let low = Infinity;
    for (const floor of this.floors) if (floor < low) low = floor;
    return low;
  }

  /**
   * Feed samples; returns the segments that closed.
   *
   * @param {Int16Array} samples 16 kHz mono
   * @returns {Array<{ samples: Int16Array, startSample: number, endSample: number,
   *   startMs: number, endMs: number, steadyFloor: number|null }>}
   *   `steadyFloor` is the room's steady floor (RMS) when the segment closed,
   *   for what is done to it before Whisper (roomSegmentAudio.mjs).
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
    const { pauseMs, minSpeechMs, maxSegmentMs, splitAfterMs, softPauseMs, leadFrames } =
      this.options;
    if (!this.speaking) {
      this.buffer.push(frame.slice());
      this.frames.push({ start, rms });
      // Still learning the room: hold everything and decide nothing. Deciding
      // against a guessed floor turned the first half-second of a fan into a
      // "segment", which Whisper answers with a hallucinated "Thank you".
      if (this.floor === null) return;
      // Once the room is known — including on the frame that teaches it, when
      // the whole opening is still held — speech starts at its first frame
      // over the opening level, with a short lead-in so the first syllable is
      // not cut off.
      const first = this.frames.findIndex((f) => this._isSpeech(f.rms, false));
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
      this.speechFrames = this.frames.filter((f) => this._isSpeech(f.rms, true)).length;
      this.quietRun = 0;
      this.softRun = 0;
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
        const keep = this.frames.length - this.quietRun + Math.min(this.quietRun, TAIL_FRAMES);
        out.push(this._close(keep));
      } else {
        this._reset(); // a cough, a click: not a segment
      }
      return;
    }
    this.softRun = this._isSpeech(rms, false) ? 0 : this.softRun + 1;
    if (this.softRun * FRAME_MS >= softPauseMs) {
      // A soft pause in a long segment: its quietest frame is where to split,
      // if somebody goes on. Until then nothing is cut, so the end of a turn is
      // never left on its own to be thrown away as a cough.
      let cut = this.frames.length - this.softRun;
      for (let i = cut + 1; i < this.frames.length; i += 1) {
        if (this.frames[i].rms < this.frames[cut].rms) cut = i;
      }
      if (cut * FRAME_MS >= splitAfterMs) {
        this.splitAt = cut;
        this.speechAfterSplit = 0;
      }
    } else if (this.splitAt !== null && speech) {
      this.speechAfterSplit += 1;
      if (this.speechAfterSplit * FRAME_MS >= minSpeechMs) {
        // Somebody went on: one turn ends in the soft pause, the next starts there.
        out.push(this._close(this.splitAt, true));
        return;
      }
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

  /**
   * The segment still being spoken, as far as it has got — what a live partial
   * transcript reads (partialScheduler.mjs). Null while nobody is speaking.
   * `startSample` names the segment: the next one, a monologue's carry-over
   * or a split turn included, starts later.
   *
   * @returns {{ startSample: number, startMs: number, speechMs: number,
   *   lengthMs: number } | null}
   */
  get open() {
    if (!this.speaking) return null;
    return {
      startSample: this.segmentStart,
      startMs: Math.round((this.segmentStart / SAMPLE_RATE) * 1000),
      speechMs: this.speechFrames * FRAME_MS,
      lengthMs: this.frames.length * FRAME_MS,
    };
  }

  /** The open segment's audio so far, 16 kHz mono; empty while nobody is speaking. */
  openSamples() {
    if (!this.speaking) return new Int16Array(0);
    const samples = new Int16Array(this.buffer.length * FRAME);
    this.buffer.forEach((piece, i) => samples.set(piece, i * FRAME));
    return samples;
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
      steadyFloor: this.steadyFloor,
    };
    if (carryOn) {
      this.buffer = this.buffer.slice(keepFrames);
      this.frames = this.frames.slice(keepFrames);
      this.segmentStart = this.frames.length ? this.frames[0].start : endSample;
      this.speechFrames = this.frames.length;
      this.quietRun = 0;
      this.softRun = 0;
      this.splitAt = null;
      this.speechAfterSplit = 0;
    } else {
      this._reset();
    }
    return segment;
  }

  _reset() {
    this.speaking = false;
    this.speechFrames = 0;
    this.quietRun = 0;
    this.softRun = 0;
    this.splitAt = null;
    this.speechAfterSplit = 0;
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
