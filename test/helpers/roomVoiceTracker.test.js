const test = require("node:test");
const assert = require("node:assert/strict");

let RoomVoiceTracker, MIN_VOICE_MS;

test.before(async () => {
  ({ RoomVoiceTracker, MIN_VOICE_MS } = await import("../../src/helpers/roomVoiceTracker.mjs"));
});

const segment = (startMs, endMs) => ({
  startMs,
  endMs,
  samples: new Int16Array(Math.max(1, Math.round(((endMs - startMs) / 1000) * 16000))),
});

test("each line long enough gets its voice in the background, and Stop collects them in order", async () => {
  const asked = [];
  const tracker = new RoomVoiceTracker({
    extract: async (samples) => {
      asked.push(samples.length);
      return Float32Array.of(samples.length);
    },
  });
  tracker.add(segment(0, 3000));
  tracker.add(segment(3500, 3500 + MIN_VOICE_MS - 1)); // too short to carry a voice
  tracker.add(segment(4000, 4600));
  const lines = await tracker.collect();
  assert.deepEqual(
    lines.map((l) => [l.startMs, l.endMs, l.embedding[0]]),
    [
      [0, 3000, 48000],
      [4000, 4600, 9600],
    ]
  );
  assert.deepEqual(asked, [48000, 9600]);
});

test("a line whose voice failed or came too late is kept without one", async () => {
  const tracker = new RoomVoiceTracker({
    extract: async (samples) => {
      if (samples.length === 16000) throw new Error("worker crashed");
      if (samples.length === 32000) return new Promise(() => {});
      return Float32Array.of(1);
    },
  });
  tracker.add(segment(0, 1000));
  tracker.add(segment(2000, 4000));
  tracker.add(segment(5000, 8000));
  const lines = await tracker.collect(30);
  assert.deepEqual(
    lines.map((l) => l.embedding && l.embedding[0]),
    [null, null, 1]
  );
});

test("without the voice model nothing is gathered", async () => {
  const tracker = new RoomVoiceTracker({ extract: null });
  assert.equal(tracker.enabled, false);
  tracker.add(segment(0, 3000));
  assert.deepEqual(await tracker.collect(), []);
});

test("dropped voices are forgotten, and nothing is gathered after", async () => {
  let calls = 0;
  const tracker = new RoomVoiceTracker({
    extract: async () => {
      calls += 1;
      return Float32Array.of(1);
    },
  });
  tracker.add(segment(0, 3000));
  tracker.drop();
  assert.equal(tracker.enabled, false);
  tracker.add(segment(4000, 7000));
  assert.deepEqual(await tracker.collect(), []);
  assert.ok(calls <= 1);
});

test("a segment with no samples is skipped", async () => {
  const tracker = new RoomVoiceTracker({ extract: async () => Float32Array.of(1) });
  tracker.add({ startMs: 0, endMs: 3000, samples: new Int16Array(0) });
  tracker.add(null);
  assert.deepEqual(await tracker.collect(), []);
});
