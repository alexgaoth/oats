const test = require("node:test");
const assert = require("node:assert/strict");

let addLevelSample, byteToLevel, decodeLoudness, encodeLoudness, levelToByte, LOUDNESS_STEP_MS;

test.before(async () => {
  ({ addLevelSample, byteToLevel, decodeLoudness, encodeLoudness, levelToByte, LOUDNESS_STEP_MS } =
    await import("../../src/helpers/conversationLoudness.mjs"));
});

const T0 = 1_760_000_000_000; // on a whole second
const SECOND = 1000;

/** Ten samples a second, as MeetingRecordingMount publishes them. */
function record(levelsPerSecond, start = T0) {
  const seconds = [];
  levelsPerSecond.forEach((level, index) => {
    for (let tick = 0; tick < 10; tick += 1) {
      addLevelSample(seconds, start + index * SECOND + tick * 100, level);
    }
  });
  return seconds;
}

test("each second keeps the RMS of its samples, as the live line does", () => {
  const seconds = [];
  addLevelSample(seconds, T0 + 100, 0.3);
  addLevelSample(seconds, T0 + 600, 0.4);
  addLevelSample(seconds, T0 + 1200, 0.1);
  assert.equal(seconds.length, 2);
  assert.equal(seconds[0].at, T0);
  assert.ok(Math.abs(seconds[0].level - Math.sqrt((0.09 + 0.16) / 2)) < 1e-12);
  assert.equal(seconds[1].at, T0 + SECOND);
  assert.equal(seconds[1].level, 0.1);
  addLevelSample(seconds, NaN, 0.2);
  assert.equal(seconds.length, 2);
});

test("a byte holds a level to within a quarter of a decibel", () => {
  for (const level of [0.0004, 0.003, 0.02, 0.085, 0.2, 0.9]) {
    const back = byteToLevel(levelToByte(level));
    const db = Math.abs(20 * Math.log10(back / level));
    assert.ok(db <= 0.18, `${level}: ${db.toFixed(3)} dB off`);
  }
  // Silence and anything quieter than -90 dBFS is the floor, never "no sample".
  assert.equal(levelToByte(0), 1);
  assert.equal(levelToByte(1e-7), 1);
  assert.equal(levelToByte(1), 255);
  assert.equal(levelToByte(2), 255);
  assert.equal(byteToLevel(0), null);
});

test("one byte a second: an hour is 3600 bytes, under 5 KB stored", () => {
  const hour = record(Array.from({ length: 3600 }, (_, index) => 0.002 + (index % 50) / 400));
  const stored = encodeLoudness(null, hour);
  const parsed = JSON.parse(stored);
  assert.equal(parsed.v, 1);
  assert.equal(parsed.runs.length, 1);
  assert.equal(parsed.runs[0].at, T0);
  assert.equal(atob(parsed.runs[0].b).length, 3600);
  assert.ok(stored.length < 5000, `${stored.length} characters`);
});

test("what is stored decodes to the seconds that were measured", () => {
  const levels = [0.003, 0.08, 0.2, 0.15, 0.004];
  const decoded = decodeLoudness(encodeLoudness(null, record(levels)));
  assert.deepEqual(
    decoded.map((second) => second.at),
    levels.map((_, index) => T0 + index * SECOND)
  );
  decoded.forEach((second, index) => {
    assert.ok(Math.abs(20 * Math.log10(second.level / levels[index])) <= 0.18);
  });
});

test("a second with no sample is kept as a gap, not as silence", () => {
  const seconds = record([0.1, 0.1]);
  // Nothing for two seconds, then more.
  seconds.push(...record([0.2], T0 + 4 * SECOND));
  const stored = JSON.parse(encodeLoudness(null, seconds));
  assert.equal(stored.runs.length, 1);
  assert.deepEqual([...atob(stored.runs[0].b)].map((c) => c.charCodeAt(0) > 0), [
    true,
    true,
    false,
    false,
    true,
  ]);
  assert.deepEqual(
    decodeLoudness(JSON.stringify(stored)).map((second) => (second.at - T0) / SECOND),
    [0, 1, 4]
  );
});

test("a resumed conversation keeps its earlier sittings and adds this one", () => {
  const first = encodeLoudness(null, record([0.1, 0.12, 0.08]));
  const later = T0 + 20 * 60_000;
  const both = encodeLoudness(first, record([0.05, 0.06], later));
  const runs = JSON.parse(both).runs;
  assert.deepEqual(
    runs.map((run) => run.at),
    [T0, later]
  );
  assert.equal(decodeLoudness(both).length, 5);
  // A sitting that heard nothing changes nothing.
  assert.equal(encodeLoudness(first, []), first);
});

test("nothing heard is nothing stored, and anything unreadable is no loudness", () => {
  assert.equal(encodeLoudness(null, []), null);
  assert.equal(encodeLoudness(null, null), null);
  for (const raw of [null, undefined, "", "not json", "{}", '{"v":2,"runs":[]}', '{"v":1}']) {
    assert.deepEqual(decodeLoudness(raw), []);
  }
  assert.deepEqual(decodeLoudness('{"v":1,"runs":[{"at":1,"b":"%%%"}]}'), []);
  // A corrupted earlier value is dropped, not carried forward.
  const fresh = encodeLoudness("garbage", record([0.1]));
  assert.equal(JSON.parse(fresh).runs.length, 1);
});

test("one bucket of the live line is one stored second", () => {
  assert.equal(LOUDNESS_STEP_MS, 1000);
});
