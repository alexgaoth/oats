const test = require("node:test");
const assert = require("node:assert/strict");

let DcBlocker, SpeechSegmenter, SAMPLE_RATE;

test.before(async () => {
  ({ DcBlocker } = await import("../../src/helpers/dcBlocker.mjs"));
  ({ SpeechSegmenter, SAMPLE_RATE } = await import("../../src/helpers/speechSegmenter.mjs"));
});

// The offset measured on the microphone that broke in-room transcription.
const OFFSET = 1539;

let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** `[kind, seconds]` pieces over a quiet room, with `offset` added under everything. */
function signal(pieces, offset) {
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const [kind, seconds] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const room = 0.0015 * noise();
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      // A voice about as loud as that microphone heard one: near -38 dB.
      const voice =
        kind === "speech" ? syllable * 0.03 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) : 0;
      out[at + i] = Math.round((room + voice) * 32767) + offset;
    }
    at += n;
  }
  return out;
}

const rms = (samples) =>
  Math.sqrt(samples.reduce((sum, v) => sum + (v / 32768) ** 2, 0) / samples.length);

/** Feed 100 ms pieces through an optional blocker into a segmenter; count closed segments. */
function segments(samples, blocker) {
  const segmenter = new SpeechSegmenter();
  let closed = 0;
  for (let i = 0; i < samples.length; i += SAMPLE_RATE / 10) {
    const piece = samples.subarray(i, i + SAMPLE_RATE / 10);
    closed += segmenter.push(blocker ? blocker.process(piece) : piece).length;
  }
  return closed;
}

test("a constant offset comes out as silence, with no thump at the start", () => {
  const out = new DcBlocker().process(new Int16Array(SAMPLE_RATE).fill(OFFSET));
  assert.equal(Math.max(...out.map(Math.abs)), 0);
});

test("a voice-band tone passes at its own loudness", () => {
  const tone = Int16Array.from({ length: SAMPLE_RATE }, (_, i) =>
    Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE))
  );
  const out = new DcBlocker().process(tone);
  const ratio = rms(out.subarray(1600)) / rms(tone.subarray(1600));
  assert.ok(ratio > 0.99 && ratio < 1.01, `gain at 220 Hz was ${ratio}`);
});

test("an offset that appears mid-stream is gone within 100 ms", () => {
  const input = new Int16Array(SAMPLE_RATE);
  input.fill(OFFSET, SAMPLE_RATE / 2);
  const out = new DcBlocker().process(input);
  const settled = out.subarray(SAMPLE_RATE / 2 + 1600);
  assert.ok(Math.max(...settled.map(Math.abs)) <= 1);
});

test("live chunks filter exactly as one stream", () => {
  const input = signal([["speech", 1]], OFFSET);
  const whole = new DcBlocker().process(input);
  const blocker = new DcBlocker();
  const pieces = [];
  for (let i = 0; i < input.length; i += 1234)
    pieces.push(...blocker.process(input.subarray(i, i + 1234)));
  assert.deepEqual(Int16Array.from(pieces), whole);
});

test("speech over an offset closes segments only once the offset is removed", () => {
  const conversation = signal(
    [
      ["quiet", 2],
      ["speech", 2],
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 1],
    ],
    OFFSET
  );
  assert.equal(segments(conversation, null), 0);
  assert.equal(segments(conversation, new DcBlocker()), 3);
});
