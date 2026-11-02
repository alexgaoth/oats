// Removing a microphone's DC offset before anything measures how loud it is.
//
// Some built-in microphones deliver a signal that does not sit on zero. The
// AMD digital microphone in a Family 17h laptop, measured on 2026-10-25,
// carried a constant +1539 (4.7% of full scale, -26.6 dBFS) under every
// sample. Chromium passes it through untouched with the processing constraints
// off, and the segmenter's RMS counts it as sound: the room floor came out at
// -26.9 dB, speech had to clear -17.4 dB, and a voice at -38 dB never did. A
// 25 s recording closed no segment at all, and the screen showed a moving
// level meter over an empty transcript. Dictation never saw it, because Opus
// rejects DC when MediaRecorder encodes.
//
// A one-pole high-pass, y[n] = x[n] - x[n-1] + R * y[n-1], with its corner
// near 13 Hz: far below any voice, with a 12.5 ms time constant. The
// state carries across `process` calls, so live chunks filter as one stream,
// and starts from the first sample, so an offset present from the start is
// not turned into a thump at the start.
//
// Pure and DOM-free: 16 kHz mono Int16 in and out. Pinned by
// test/helpers/dcBlocker.test.js.

const R = 0.995;

export class DcBlocker {
  constructor() {
    this.lastIn = null;
    this.lastOut = 0;
  }

  /**
   * @param {Int16Array} samples
   * @returns {Int16Array} the same samples with the offset removed
   */
  process(samples) {
    const out = new Int16Array(samples.length);
    if (samples.length === 0) return out;
    if (this.lastIn === null) this.lastIn = samples[0];
    let lastIn = this.lastIn;
    let lastOut = this.lastOut;
    for (let i = 0; i < samples.length; i += 1) {
      const x = samples[i];
      lastOut = x - lastIn + R * lastOut;
      lastIn = x;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(lastOut)));
    }
    this.lastIn = lastIn;
    this.lastOut = lastOut;
    return out;
  }
}
