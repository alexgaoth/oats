const test = require("node:test");
const assert = require("node:assert/strict");

let SpeechSegmenter, SAMPLE_RATE;

test.before(async () => {
  ({ SpeechSegmenter, SAMPLE_RATE } = await import("../../src/helpers/speechSegmenter.mjs"));
});

// Deterministic noise, so a failing run fails the same way twice.
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** `[kind, seconds]` pieces: "speech" is a loud tone with jitter, "quiet" is the room. */
function signal(pieces, { room = 0 } = {}) {
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const [kind, seconds] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const bed = room * noise();
      // Shaped like speech rather than a held note: a voiced tone whose
      // loudness rises and falls about four times a second, as syllables do.
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      const voice =
        kind === "speech"
          ? syllable * (0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) + 0.02 * noise())
          : 0;
      out[at + i] = Math.max(-32768, Math.min(32767, Math.round((bed + voice) * 32767)));
    }
    at += n;
  }
  return out;
}

/** Feed in 100 ms pieces, the way live audio arrives, then flush. */
function run(samples, options) {
  const segmenter = new SpeechSegmenter(options);
  const out = [];
  const step = SAMPLE_RATE / 10;
  for (let i = 0; i < samples.length; i += step)
    out.push(...segmenter.push(samples.subarray(i, i + step)));
  out.push(...segmenter.flush());
  return out;
}

test("two turns separated by a pause are two segments, placed where they were said", () => {
  const segments = run(
    signal([
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 0.8],
      ["speech", 1.5],
      ["quiet", 1],
    ])
  );
  assert.equal(segments.length, 2);
  // Within a lead-in and a tail of the true boundaries (1.0–3.0 s, 3.8–5.3 s).
  assert.ok(Math.abs(segments[0].startMs - 1000) <= 200, `starts at ${segments[0].startMs}`);
  assert.ok(Math.abs(segments[0].endMs - 3000) <= 150, `ends at ${segments[0].endMs}`);
  assert.ok(Math.abs(segments[1].startMs - 3800) <= 200, `starts at ${segments[1].startMs}`);
  assert.equal(segments[0].samples.length, segments[0].endSample - segments[0].startSample);
});

test("a breath inside a sentence does not split it", () => {
  const segments = run(
    signal([
      ["speech", 1.2],
      ["quiet", 0.2],
      ["speech", 1.2],
      ["quiet", 1],
    ])
  );
  assert.equal(segments.length, 1);
});

// The live path used to send whatever 5 s had accumulated. A monologue still
// has to be cut, but never so long that one request spans two Whisper windows,
// and never losing a sample at the cut.
test("a monologue is cut before the window limit, and nothing is lost at the cuts", () => {
  const segments = run(
    signal([
      ["speech", 47],
      ["quiet", 1],
    ]),
    { maxSegmentMs: 20_000 }
  );
  assert.ok(segments.length >= 3, `${segments.length} segments`);
  for (const segment of segments) assert.ok(segment.endMs - segment.startMs <= 20_000);
  for (let i = 1; i < segments.length; i += 1) {
    assert.equal(segments[i].startSample, segments[i - 1].endSample, "contiguous across the cut");
  }
});

// A fan sits above any fixed threshold for a whole meeting. A segmenter that
// cannot hear a pause over it degrades to fixed cuts.
test("pauses are still heard over a steady room noise", () => {
  const segments = run(
    signal(
      [
        ["quiet", 3],
        ["speech", 2],
        ["quiet", 0.8],
        ["speech", 2],
        ["quiet", 1],
      ],
      { room: 0.03 }
    )
  );
  assert.equal(segments.length, 2);
});

test("a click or a cough is not a segment", () => {
  assert.equal(
    run(
      signal([
        ["quiet", 1],
        ["speech", 0.15],
        ["quiet", 1.5],
      ])
    ).length,
    0
  );
});

test("the last thing said is not lost at stop", () => {
  const segments = run(
    signal([
      ["quiet", 0.5],
      ["speech", 1.5],
    ])
  );
  assert.equal(segments.length, 1);
  assert.ok(segments[0].endMs >= 1900);
});
