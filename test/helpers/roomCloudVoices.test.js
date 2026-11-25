const test = require("node:test");
const assert = require("node:assert/strict");

let RoomCloudVoices;

test.before(async () => {
  ({ RoomCloudVoices } = await import("../../src/helpers/roomCloudVoices.mjs"));
});

/** 16 kHz: a soft room, with a voice-like tone for each [start, end] in seconds. */
function room(seconds, voiced) {
  const out = new Int16Array(seconds * 16000);
  let state = 7;
  for (let i = 0; i < out.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const t = i / 16000;
    const speaking = voiced.some(([a, b]) => t >= a && t < b);
    const noise = ((state / 4294967296) * 2 - 1) * 60;
    out[i] = Math.round(noise + (speaking ? 6000 * Math.sin(2 * Math.PI * 180 * t) : 0));
  }
  return out;
}

function feed(voices, samples, chunk = 4000) {
  for (let i = 0; i < samples.length; i += chunk) voices.push(samples.subarray(i, i + chunk));
}

test("the recording keeps its own clock, chunk by chunk", () => {
  const voices = new RoomCloudVoices({ extract: null, startedAt: 1000 });
  feed(voices, new Int16Array(16000 * 3));
  assert.equal(voices.recordedMs, 3000);
  assert.equal(voices.finish().startedAt, 1000);
});

test("each line the room's audio closes gets its voice; Stop closes the last", async () => {
  const asked = [];
  const voices = new RoomCloudVoices({
    extract: async (samples) => {
      asked.push(samples.length);
      return Float32Array.of(samples.length);
    },
  });
  feed(
    voices,
    room(12, [
      [1, 3.5],
      [5, 7.5],
      [9, 12],
    ])
  );
  const { voices: tracker } = voices.finish();
  const lines = await tracker.collect();
  assert.equal(lines.length, 3);
  assert.ok(
    lines[0].startMs >= 800 && lines[0].startMs <= 1200,
    `first line at ${lines[0].startMs}`
  );
  assert.ok(lines[2].endMs >= 11_500, "the last line closes at Stop");
  assert.equal(asked.length, 3);
});

test("without the voice model the clock still runs and nothing is cut", async () => {
  const voices = new RoomCloudVoices({ extract: null });
  feed(voices, room(6, [[1, 4]]));
  assert.equal(voices.recordedMs, 6000);
  assert.deepEqual(await voices.finish().voices.collect(), []);
});

test("an abandoned recording forgets its voices", async () => {
  const voices = new RoomCloudVoices({ extract: async () => Float32Array.of(1) });
  feed(voices, room(5, [[1, 3]]));
  voices.drop();
  assert.deepEqual(await voices.finish().voices.collect(), []);
});
