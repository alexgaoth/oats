const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A pure `.mjs` helper reached through a dynamic import, like
// conversationContour.test.js.
let ListeningRing, RING_DEFAULTS, ringRange, ringScale;

test.before(async () => {
  ({ ListeningRing, RING_DEFAULTS, ringRange, ringScale } =
    await import("../../src/helpers/listeningRing.mjs"));
});

/** A deterministic wobble in [-1, 1], so no test depends on Math.random. */
const wobble = (index) => Math.sin(index * 12.9898) * 0.5 + Math.sin(index * 4.1414) * 0.5;

/** Room tone: a quiet floor that moves by up to half of itself. */
const roomTone = (count, floor = 0.0012) =>
  Array.from({ length: count }, (_, index) => floor * (1 + 0.5 * wobble(index)));

/** Speech: levels spread between soft and loud, as a talking voice is. */
const speech = (count, soft = 0.02, loud = 0.2) =>
  Array.from({ length: count }, (_, index) => soft + ((loud - soft) * (wobble(index + 7) + 1)) / 2);

/** A conversation: alternating seconds of talk and pauses, ten samples a second. */
function conversation(seconds) {
  const levels = [];
  for (let second = 0; second < seconds; second += 1) {
    const talking = second % 5 !== 4;
    levels.push(...(talking ? speech(10) : roomTone(10)));
  }
  return levels;
}

test("room tone leaves the ring at rest", () => {
  const ring = new ListeningRing();
  const scales = roomTone(600).map((level) => ring.push(level));
  assert.ok(
    scales.every((scale) => scale === 1),
    "a minute of room tone never moves it"
  );
});

test("ordinary speech moves the ring visibly, and the loudest fills it", () => {
  const ring = new ListeningRing();
  for (const level of conversation(60)) ring.push(level);
  const { rest, top } = ring.range;
  // The middle of this room's speech is well away from rest and from full.
  const middle = ringScale((rest + top) / 2, ring.range);
  assert.ok(middle > 1.6 && middle < RING_DEFAULTS.maxScale, `middle at ${middle}`);
  // Soft speech still shows.
  assert.ok(ringScale(0.03, ring.range) > 1.2);
  assert.equal(ringScale(top, ring.range), RING_DEFAULTS.maxScale);
  assert.equal(ringScale(1, ring.range), RING_DEFAULTS.maxScale);
  // And the pauses between the turns are still.
  assert.equal(ringScale(0.0015, ring.range), 1);
});

test("the range is this room's, not a fixed scale", () => {
  // The same voice through a quiet microphone and a hot one: each reads its
  // own speech as speech, and neither pins the ring at one end.
  const quiet = ringRange(conversation(60).map((level) => level / 8));
  const hot = ringRange(conversation(60).map((level) => level * 3));
  assert.ok(quiet.top < hot.top / 10, `${quiet.top} against ${hot.top}`);
  for (const range of [quiet, hot]) {
    const middle = ringScale((range.rest + range.top) / 2, range);
    assert.ok(middle > 1.6 && middle < RING_DEFAULTS.maxScale, `middle at ${middle}`);
  }
});

test("a long turn does not become the floor: a monologue still moves the ring", () => {
  // Three minutes of conversation, then a minute and a half of one voice with
  // no pause long enough to reach the room: its louder half still shows.
  const ring = new ListeningRing();
  for (const level of conversation(180)) ring.push(level);
  const monologue = speech(900).map((level) => ring.push(level));
  const moving = monologue.filter((scale) => scale > 1.2).length / monologue.length;
  assert.ok(moving > 0.5, `${Math.round(moving * 100)}% of the monologue moved the ring`);
});

test("a fan above the fixed floor is still room tone", () => {
  // A room whose floor sits well over 0.004: three times its floor rests.
  const fan = roomTone(600, 0.01);
  const ring = new ListeningRing();
  assert.ok(fan.map((level) => ring.push(level)).every((scale) => scale === 1));
  assert.equal(ringScale(0.012, ring.range), 1);
});

test("after a minute of quiet, a sound moves the ring but does not need to be loud", () => {
  const ring = new ListeningRing();
  for (const level of roomTone(600)) ring.push(level);
  // `minSpan`: a cough is not mistaken for the loudest voice in the room...
  const cough = ringScale(0.006, ring.range);
  assert.ok(cough > 1 && cough < RING_DEFAULTS.maxScale);
  // ...and a voice fills it.
  assert.equal(ringScale(0.05, ring.range), RING_DEFAULTS.maxScale);
});

test("it waits a second before moving, and survives bad samples", () => {
  const ring = new ListeningRing();
  // Nine samples: too few to know the room.
  for (let i = 0; i < RING_DEFAULTS.minSamples - 1; i += 1) assert.equal(ring.push(0.2), 1);
  assert.equal(ring.push(Number.NaN), 1);
  assert.equal(ringScale(Number.NaN, { rest: 0.01, top: 0.1 }), 1);
  assert.equal(ringScale(0.5, null), 1);
});

test("the range is learned again once a second; loud speech from the last minute", () => {
  const ring = new ListeningRing();
  for (const level of conversation(180)) ring.push(level);
  const before = ring.range;
  // The microphone moves closer: within a minute the loud end is the new one.
  for (const level of conversation(60).map((value) => value * 4)) ring.push(level);
  assert.equal(ring.history.length, RING_DEFAULTS.historySamples);
  assert.ok(ring.range.top > before.top * 3, `${ring.range.top} against ${before.top}`);
  // Between refreshes, the range holds still.
  const held = ring.range;
  ring.push(0.5);
  assert.equal(ring.range, held);
});

// Source-level: the component needs a browser, a store and an audio graph.
const SOURCE = fs.readFileSync(
  path.join(__dirname, "../../src/components/conversation/ListeningRing.tsx"),
  "utf8"
);

test("the ring is written straight to the element, ten times a second, with no React state", () => {
  // A selector or a state update per sample would re-render the status card
  // ten times a second, on the one screen where nothing may compete with the
  // room.
  assert.match(SOURCE, /useMeetingRecordingStore\.subscribe\(/);
  assert.match(SOURCE, /\.style\.transform = /);
  assert.doesNotMatch(SOURCE, /useState|useMeetingRecordingStore\(\s*\(/);
  // Reduced motion: a still dot, no ring.
  assert.match(SOURCE, /motion-reduce:hidden/);
});
