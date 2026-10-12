// How far behind the conversation the transcript is, measured, not guessed.
//
// A badge beside the recording clock says "3.2 s behind" once the text on
// screen trails the room by more than 2 s, and turns to the warning tone past
// 5 s. This module is the whole rule, in two halves:
//
//   Main (`AudioClock`, `speechChanges`): for a room recorded locally, the
//   speech segmenter knows which audio is speech and every sample's place in
//   the recording. The clock turns a sample into the wall-clock moment it was
//   heard, anchored on when each chunk of audio reached main: a sample is
//   heard (newest arrival) − (samples since it) / rate. Main sends that moment
//   with every partial and final ("audioEndedAt": where its audio ended), and
//   sends when speech starts and stops.
//
//   Renderer (`TranscriptLag`): the lag is the speech that has been heard and
//   is not yet on screen. Each text that arrives covers the audio up to its
//   `audioEndedAt`; while somebody keeps talking past it, the lag grows, and a
//   text arriving mid-speech reads exactly as its arrival minus its audio end.
//   Only speech counts: while nobody speaks there is nothing to lag behind, so
//   the lag cannot grow in a silence, and a final that lands in the pause
//   after its turn is not lag at all.
//
// Why it is honest:
//
//   - The anchor is when audio reached main, which is after it was spoken, so
//     a moment can only come out late, never early. A burst of buffered audio
//     at the start, a dropped buffer, a stall in main: each makes the audio
//     look more recent and the lag smaller. The badge can understate; it
//     cannot invent lag.
//   - Speech is the segmenter's own: the audio it cuts into what gets
//     transcribed. A fan is not speech to it, and a cough it drops is dropped
//     here too, so neither leaves the lag growing.
//   - Audio whose final comes back with no words still counts as shown: main
//     sends its end, so a hallucination filter cannot strand the lag.
//
// The one overstatement is bounded: until the segmenter closes a turn, 400 ms
// into the pause, the renderer counts the turn as still going. The badge's
// smoothing (below) makes that worth a few milliseconds.
//
// Where it is off: a provider that streams to the cloud reports no audio
// positions this can anchor, and Parakeet sends finals only, so its text is
// behind by a whole turn by design. Neither sends these fields, and with no
// measurements the badge shows nothing.
//
// Pure: time comes in as arguments. Pinned by test/helpers/transcriptLag.test.js.

/** The badge: when it shows, when it warns, and how it is smoothed. */
export const LAG_DEFAULTS = Object.freeze({
  /** Appears once the smoothed lag reaches this... */
  showAtMs: 2000,
  /** ...and goes once it is back under this, so it does not flicker at 2 s. */
  hideBelowMs: 1500,
  /** The warning tone from here... */
  warnAtMs: 5000,
  /** ...back to the quiet tone under this. */
  calmBelowMs: 4500,
  /**
   * The smoothing's time constants. A rise is measured in speech time, so the
   * badge cannot grow while nobody speaks; a fall in wall time, so it goes
   * once the text has caught up, talking or not.
   */
  riseMs: 1500,
  fallMs: 1500,
  /**
   * And it never shows more than the lag actually reached in this long (this
   * read and the one before): once the text catches up, the badge goes at the
   * next read instead of counting down a lag that is no longer there.
   */
  peakWindowMs: 1500,
});

/**
 * Main side: a sample's place in the recording, as the wall-clock moment it
 * was heard.
 */
export class AudioClock {
  /** @param {number} sampleRate Samples per second (the segmenter's 16 kHz). */
  constructor(sampleRate) {
    this.rate = sampleRate;
    this.samples = 0;
    this.at = null;
  }

  /**
   * A chunk of audio arrived.
   * @param {number} count Its samples.
   * @param {number} now Wall-clock ms (Date.now()).
   */
  arrived(count, now) {
    this.samples += count;
    this.at = now;
  }

  /**
   * When a sample was heard, in wall-clock ms; null before any audio.
   * @param {number} sample Its index in the recording.
   */
  wallAt(sample) {
    if (this.at === null || !Number.isFinite(sample)) return null;
    return Math.round(this.at - ((this.samples - sample) * 1000) / this.rate);
  }
}

/**
 * Main side: what changed in the speech after the segmenter took a chunk.
 *
 * @param {number | null} wasOpen The open segment's `startSample` before the
 *   chunk, or null.
 * @param {Array<{ startSample: number, endSample: number }>} closed The
 *   segments the chunk closed.
 * @param {{ startSample: number } | null} open The open segment after it.
 * @returns {Array<{ speaking: boolean, sample: number, dropped?: boolean }>}
 *   In order. Speech started at `sample`; or it stopped there; or what began
 *   was not speech after all (`dropped`: a cough, a click, which the
 *   segmenter does not transcribe).
 */
export function speechChanges(wasOpen, closed, open) {
  const was = wasOpen ?? null;
  const segments = Array.isArray(closed) ? closed : [];
  const last = segments.length ? segments[segments.length - 1] : null;
  if (!last) {
    if (was === null) return open ? [{ speaking: true, sample: open.startSample }] : [];
    if (open && open.startSample === was) return [];
    // What was open went away without a segment: never speech after all.
    const changes = [{ speaking: false, sample: null, dropped: true }];
    if (open) changes.push({ speaking: true, sample: open.startSample });
    return changes;
  }
  const changes = [];
  // Opened and closed inside one chunk: only the flush at Stop can.
  if (was === null) changes.push({ speaking: true, sample: segments[0].startSample });
  // A turn cut at the segmenter's 20 s cap carries straight on: the next
  // segment starts where the last ended, and nobody stopped talking.
  if (open && open.startSample === last.endSample) return changes;
  changes.push({ speaking: false, sample: last.endSample });
  if (open) changes.push({ speaking: true, sample: open.startSample });
  return changes;
}

/**
 * Renderer side: the lag, from what main reports, and the badge that shows it.
 */
export class TranscriptLag {
  constructor(options = {}) {
    this.options = { ...LAG_DEFAULTS, ...options };
    this.reset();
  }

  /** A new recording: nothing heard, nothing shown, nothing measured. */
  reset() {
    this.runs = []; // speech: { start, end } in wall ms; end is null while it goes on
    this.covered = null; // the audio the text on screen reaches, wall ms
    this.measured = false; // main has reported speech or an audio position
    this.disabled = false;
    this.shown = 0;
    this.lastRead = null;
    this.recent = []; // { at, raw } of recent reads, for the peak
    this.visible = false;
    this.warning = false;
  }

  /** Main stopped measuring for this recording: show nothing from now on. */
  off() {
    this.disabled = true;
  }

  /**
   * Speech started or stopped (`speechChanges`, through main's clock).
   * @param {{ speaking: boolean, at?: number | null, dropped?: boolean }} change
   */
  speech({ speaking, at, dropped }) {
    if (this.disabled) return;
    const open = this.runs.length && this.runs[this.runs.length - 1].end === null;
    if (speaking) {
      if (!Number.isFinite(at)) return;
      this.measured = true;
      if (open) this.runs[this.runs.length - 1].end = at;
      this.runs.push({ start: at, end: null });
      return;
    }
    if (!open) return;
    if (dropped) {
      // Never speech: nothing will be transcribed for it, so nothing is owed.
      this.runs.pop();
      return;
    }
    if (Number.isFinite(at)) this.runs[this.runs.length - 1].end = at;
  }

  /**
   * Text reached the screen: words for the audio up to `audioEndedAt`, or a
   * final with no words, which accounts for its audio all the same.
   * @param {{ audioEndedAt?: number | null }} text
   */
  text({ audioEndedAt }) {
    if (this.disabled || !Number.isFinite(audioEndedAt)) return;
    this.measured = true;
    this.covered = this.covered === null ? audioEndedAt : Math.max(this.covered, audioEndedAt);
  }

  /** Speech within (from, to], in ms. */
  _speechBetween(from, to) {
    let total = 0;
    for (const run of this.runs) {
      const end = run.end === null ? to : Math.min(run.end, to);
      const start = Math.max(run.start, from);
      if (end > start) total += end - start;
    }
    return total;
  }

  /**
   * The speech heard and not yet on screen, at `now`: the raw lag.
   * @param {number} now Wall-clock ms.
   */
  pendingMs(now) {
    if (this.disabled || !Number.isFinite(now)) return 0;
    return this._speechBetween(this.covered ?? -Infinity, now);
  }

  /**
   * The badge at `now`. Call it on a steady beat (once a second); each call
   * moves the smoothing on by the time since the last.
   *
   * @param {number} now Wall-clock ms.
   * @returns {{ visible: boolean, behindMs: number, warning: boolean }}
   *   `behindMs` is the smoothed lag, to the nearest 100 ms.
   */
  read(now) {
    if (this.disabled || !this.measured || !Number.isFinite(now)) {
      return { visible: false, behindMs: 0, warning: false };
    }
    const { riseMs, fallMs, peakWindowMs, showAtMs, hideBelowMs, warnAtMs, calmBelowMs } =
      this.options;
    const from = this.lastRead ?? now;
    const raw = this.pendingMs(now);
    if (raw > this.shown) {
      // Up only by the speech since the last read: a silence moves nothing.
      const spoken = this._speechBetween(from, now);
      this.shown += (raw - this.shown) * (1 - Math.exp(-spoken / riseMs));
    } else {
      const elapsed = Math.max(0, now - from);
      this.shown += (raw - this.shown) * (1 - Math.exp(-elapsed / fallMs));
    }
    this.recent = this.recent.filter((read) => read.at > now - peakWindowMs);
    this.recent.push({ at: now, raw });
    this.shown = Math.min(this.shown, Math.max(...this.recent.map((read) => read.raw)));
    this.lastRead = now;
    // What the text has passed and the smoothing no longer needs.
    const settled = Math.min(this.covered ?? -Infinity, now);
    this.runs = this.runs.filter((run) => run.end === null || run.end > settled);

    if (!this.visible && this.shown >= showAtMs) this.visible = true;
    else if (this.visible && this.shown < hideBelowMs) this.visible = false;
    if (!this.warning && this.shown >= warnAtMs) this.warning = true;
    else if (this.warning && this.shown < calmBelowMs) this.warning = false;
    return {
      visible: this.visible,
      behindMs: Math.round(this.shown / 100) * 100,
      warning: this.visible && this.warning,
    };
  }
}
