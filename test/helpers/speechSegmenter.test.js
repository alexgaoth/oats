const test = require("node:test");
const assert = require("node:assert/strict");

let SpeechSegmenter, SAMPLE_RATE;

test.before(async () => {
  ({ SpeechSegmenter, SAMPLE_RATE } = await import("../../src/helpers/speechSegmenter.mjs"));
});

// Deterministic noise, so a failing run fails the same way twice.
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/**
 * `[kind, seconds, loudness]` pieces: "speech" is a loud tone with jitter, at
 * `loudness` (1 by default; a voice across the table is a fraction of it),
 * "murmur" a steady low tone at `loudness` (a breath, a chair, somebody
 * starting), "quiet" is the room.
 */
function signal(pieces, { room = 0 } = {}) {
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const [kind, seconds, loudness = 1] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const bed = room * noise();
      // Shaped like speech rather than a held note: a voiced tone whose
      // loudness rises and falls about four times a second, as syllables do.
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      const voice =
        kind === "speech"
          ? loudness *
            syllable *
            (0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) + 0.02 * noise())
          : kind === "murmur"
            ? loudness * 0.2 * Math.sin((2 * Math.PI * 150 * i) / SAMPLE_RATE)
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

// A voice across the table reaches a laptop a few dB over the room: its
// loudest syllables pass 2.5 times the floor, the rest of its words sit under
// that. Until 2026-10-26 every frame had to pass three times the floor, so a
// voice like this was never a segment: replayed AMI meetings with a fan under
// them kept 23% of their speech (scripts/room-replay.js).
test("a voice a few dB over a fan is one segment, held through its softer syllables", () => {
  const segments = run(
    signal(
      [
        ["quiet", 3],
        ["speech", 3, 0.3],
        ["quiet", 1],
      ],
      { room: 0.03 }
    )
  );
  assert.equal(segments.length, 1);
  assert.ok(segments[0].startMs <= 3100, `starts at ${segments[0].startMs}`);
  assert.ok(segments[0].endMs >= 5900, `ends at ${segments[0].endMs}`);
});

test("the fan alone is not speech", () => {
  assert.equal(run(signal([["quiet", 12]], { room: 0.03 })).length, 0);
});

// Once a segment is open it holds while frames pass 1.5 times the floor, so a
// sentence that trails off keeps its end instead of closing at its first soft
// word and dropping the rest as too short.
test("a sentence that trails off keeps its end", () => {
  const segments = run(
    signal(
      [
        ["quiet", 1],
        ["speech", 1.5],
        ["speech", 1.5, 0.1],
        ["quiet", 1],
      ],
      { room: 0.01 }
    )
  );
  assert.equal(segments.length, 1);
  assert.ok(segments[0].endMs >= 3900, `ends at ${segments[0].endMs}`);
});

// Without automatic gain a microphone can be quiet: a far voice near -50 dBFS
// over a room near -70. A fixed minimum of 0.004 (-48 dBFS) heard none of it.
test("a quiet microphone still hears a voice", () => {
  const segments = run(
    signal(
      [
        ["quiet", 2],
        ["speech", 2, 0.02],
        ["quiet", 1],
      ],
      { room: 0.0005 }
    )
  );
  assert.equal(segments.length, 1);
  assert.ok(segments[0].endMs - segments[0].startMs >= 1900);
});

// Held open through soft speech, a segment would also hold through the soft
// gap between two people, and the speaker pass labels a whole segment with one
// voice. So a long one splits in a soft pause once the next turn has gone on
// for half a second — contiguous, nothing dropped.
test("two turns with no quiet between them are still two segments", () => {
  const segments = run(
    signal(
      [
        ["quiet", 1],
        ["speech", 3],
        ["murmur", 0.4, 0.07],
        ["speech", 3],
        ["quiet", 1],
      ],
      { room: 0.01 }
    )
  );
  assert.equal(segments.length, 2);
  // In the murmur between them (4.0–4.4 s), not in either turn.
  assert.ok(
    segments[0].endMs >= 4000 && segments[0].endMs <= 4400,
    `split at ${segments[0].endMs}`
  );
  assert.equal(segments[1].startSample, segments[0].endSample, "nothing between them");
  assert.ok(segments[1].endMs >= 7400, `ends at ${segments[1].endMs}`);
});

test("a last word after a soft pause stays with its turn", () => {
  const segments = run(
    signal(
      [
        ["quiet", 1],
        ["speech", 3],
        ["murmur", 0.4, 0.07],
        ["speech", 0.3],
        ["quiet", 1.5],
      ],
      { room: 0.01 }
    )
  );
  assert.equal(segments.length, 1);
  assert.ok(segments[0].endMs >= 4650, `ends at ${segments[0].endMs}`);
});

test("a short turn is not split, however soft its pauses", () => {
  // A soft pause 1 s in: the piece before it would be under `splitAfterMs`.
  const segments = run(
    signal(
      [
        ["quiet", 1],
        ["speech", 1],
        ["murmur", 0.4, 0.07],
        ["speech", 1.5],
        ["quiet", 1],
      ],
      { room: 0.01 }
    )
  );
  assert.equal(segments.length, 1);
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

// A live partial (partialScheduler.mjs) reads the segment still being spoken.
test("the open segment is what will close, as far as it has got", () => {
  const samples = signal([
    ["quiet", 1],
    ["speech", 2],
    ["quiet", 1],
  ]);
  const segmenter = new SpeechSegmenter();
  const step = SAMPLE_RATE / 10;
  const seen = [];
  let closed = null;
  for (let i = 0; i < samples.length && !closed; i += step) {
    [closed = null] = segmenter.push(samples.subarray(i, i + step));
    if (!closed && segmenter.open) seen.push({ ...segmenter.open, audio: segmenter.openSamples() });
  }
  assert.ok(closed, "the pause closed it");
  assert.ok(seen.length >= 15, `${seen.length} looks while it was open`);
  for (const look of seen) {
    // One segment, named by where it starts, and its audio so far is the
    // start of what the final sends.
    assert.equal(look.startSample, closed.startSample);
    assert.equal(look.startMs, closed.startMs);
    assert.equal(look.audio.length, (look.lengthMs / 1000) * SAMPLE_RATE);
    // (A look inside the closing pause holds more of it than the final keeps.)
    const n = Math.min(look.audio.length, closed.samples.length);
    assert.deepEqual(look.audio.subarray(0, n), closed.samples.subarray(0, n));
  }
  // Speech accumulates while it is said, and is never more than the segment.
  const speech = seen.map((look) => look.speechMs);
  assert.deepEqual(
    speech,
    [...speech].sort((a, b) => a - b)
  );
  assert.ok(speech[speech.length - 1] >= 1500, `${speech[speech.length - 1]} ms of speech`);
  assert.ok(seen.every((look) => look.speechMs <= look.lengthMs));
  // Closed, nothing is open.
  assert.equal(segmenter.open, null);
  assert.equal(segmenter.openSamples().length, 0);
});

test("nothing is open in a quiet room", () => {
  const segmenter = new SpeechSegmenter();
  segmenter.push(signal([["quiet", 2]], { room: 0.01 }));
  assert.equal(segmenter.open, null);
});

test("a monologue's carry-over after a cut is a new open segment", () => {
  const segmenter = new SpeechSegmenter({ maxSegmentMs: 20_000 });
  const samples = signal([["speech", 25]]);
  const step = SAMPLE_RATE / 10;
  let cut = null;
  for (let i = 0; i < samples.length && !cut; i += step) {
    [cut = null] = segmenter.push(samples.subarray(i, i + step));
  }
  assert.ok(cut, "cut at the cap");
  const open = segmenter.open;
  assert.equal(open.startSample, cut.endSample);
  assert.ok(open.speechMs > 0, "what was carried over is already speech");
});
