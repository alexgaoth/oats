// Live words in a room, while somebody is still talking.
//
// A room is transcribed in segments cut where people pause
// (speechSegmenter.mjs), and a segment is only sent once it closes: after a
// 400 ms pause, or at the 20 s cap. So the first words of a turn reached the
// screen 4–6 s after they were said, and about 20 s into a monologue — while
// local Whisper `base` answers 5–20 s of audio in 60–200 ms. Recognition was
// never the wait; the segment was.
//
// So while a segment is open, the audio it holds so far is transcribed again
// with the same model and options as the finals, and sent as a `partial`: the
// live line the renderer already draws for the streaming providers.
//
// The finals are the transcript and a partial is only a preview, so a partial
// must never cost a final anything. The local whisper-server answers one
// request at a time (a 5 s request sent during a 20 s one took 350 ms against
// 126 ms alone), so the rules are:
//
//   1. A segment's first partial starts as soon as it holds `minSpeechMs` of
//      speech and nothing else needs the server.
//   2. After that, one partial every `intervalMs`, on a fixed beat. A beat
//      that cannot run — the previous partial still running, a final, a
//      dictation — is skipped, never queued, so partials slower than the beat
//      leave the server gaps rather than a backlog.
//   3. Finals first: no partial starts while a final is queued or running.
//   4. One partial at a time, and its result is dropped if its segment closed
//      while it was being read: the final replaces it, so a preview never
//      lands after its final, or instead of it.
//   5. A final replaces the live line. One with words clears it in the
//      renderer (`meetingRecordingStore` empties `micPartial` on a final); one
//      with none, or one that failed, does not, so the caller sends an empty
//      partial.
//
// Measured (2026-10-10, `base`, the app's server arguments, two conversations
// and a monologue replayed in real time): the first words of a turn appeared
// 1.1–1.3 s after they were said, against 4.0–6.0 s, and 1.5 s into a 33 s
// monologue against 20.2 s. Finals were not slower in conversation (every turn
// within ±0.08 s); the one cost is a final that waits behind a partial already
// on the server, at most one partial long — 0.15–0.25 s at Stop in the
// monologue. Partials kept the server busy for 8–10% of the time somebody was
// talking, 16% in the monologue, where each re-reads up to 20 s.
//
// Pure: time and the server's state come in as arguments. Pinned by
// test/helpers/partialScheduler.test.js.

export const PARTIAL_DEFAULTS = Object.freeze({
  /** Speech the open segment must hold before its first partial. */
  minSpeechMs: 1000,
  /** Then one partial per beat of this length, at most. */
  intervalMs: 1200,
});

export class PartialScheduler {
  constructor(options = {}) {
    this.options = { ...PARTIAL_DEFAULTS, ...options };
    this.segment = null; // `startSample` of the open segment the beat belongs to
    this.nextTickAt = null; // its next beat; null until its first partial starts
    this.inFlight = null; // { id, segment } of the one partial being transcribed
    this.lastId = 0;
    this.shown = ""; // the words on the live line, until a final replaces them
  }

  /**
   * Whether to transcribe the open segment now. Call it as audio arrives.
   *
   * @param {object} state
   * @param {number} state.now Milliseconds, on any clock that only moves forward.
   * @param {{ startSample: number, speechMs: number } | null} state.open
   *   The segmenter's open segment (`SpeechSegmenter#open`).
   * @param {number} [state.finalsPending] Finals queued or being transcribed.
   * @param {boolean} [state.serverBusy] The server is answering somebody else,
   *   or is not up yet.
   * @returns {{ start: true, id: number } | { start: false, reason: string }}
   */
  tick({ now, open, finalsPending = 0, serverBusy = false }) {
    const { minSpeechMs, intervalMs } = this.options;
    if (!open || open.startSample !== this.segment) {
      // A new segment, or silence: its beat starts again from nothing.
      this.segment = open ? open.startSample : null;
      this.nextTickAt = null;
    }
    if (!open || open.speechMs < minSpeechMs) return { start: false, reason: "too-little-speech" };

    const first = this.nextTickAt === null;
    if (!first) {
      if (now < this.nextTickAt) return { start: false, reason: "not-due" };
      // A later beat is spent whether or not it runs: skipped, never queued.
      const missed = Math.floor((now - this.nextTickAt) / intervalMs);
      this.nextTickAt += (missed + 1) * intervalMs;
    }
    // The first waits instead: its words are the ones this exists for, and
    // what holds it back is usually a final about to land.

    if (finalsPending > 0) return { start: false, reason: "final-pending" };
    if (this.inFlight) return { start: false, reason: "partial-in-flight" };
    if (serverBusy) return { start: false, reason: "server-busy" };

    if (first) this.nextTickAt = now + intervalMs;
    this.lastId += 1;
    this.inFlight = { id: this.lastId, segment: open.startSample };
    return { start: true, id: this.lastId };
  }

  /**
   * A partial came back. Returns the words to send, or null to send nothing.
   *
   * @param {number} id From the `tick` that started it.
   * @param {string} text What it heard; empty when it failed.
   * @param {{ startSample: number } | null} open The segmenter's open segment now.
   * @returns {string | null}
   */
  settle(id, text, open) {
    if (!this.inFlight || this.inFlight.id !== id) return null;
    const { segment } = this.inFlight;
    this.inFlight = null;
    // Its segment closed while it was being read. The final replaces it.
    if (!open || open.startSample !== segment) return null;
    const words = String(text ?? "").trim();
    // Nothing heard, or nothing new: leave the line as it is.
    if (!words || words === this.shown) return null;
    this.shown = words;
    return words;
  }

  /**
   * A final was sent (`sent`), or came back with no words, or failed.
   * Returns true when the live line still shows a partial that nothing will
   * replace: send an empty partial to clear it.
   *
   * Only one final can be owed a shown partial — partials start only when no
   * final is pending, and only the open segment can close next — so this is
   * always that final.
   *
   * @param {boolean} sent
   * @returns {boolean}
   */
  finalSettled(sent) {
    const stranded = !sent && this.shown !== "";
    this.shown = "";
    return stranded;
  }
}
