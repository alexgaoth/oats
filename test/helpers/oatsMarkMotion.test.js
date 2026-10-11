const test = require("node:test");
const assert = require("node:assert/strict");

// The symbol's toss. The first version rolled the grain about its long axis,
// which for a grain changes only the crease: at sidebar size it read as no
// animation at all. A toss tumbles it end over end, which shows.

let AIRBORNE, DEPTH_RATIO, FLIPS, HOP, tossFrame, tumbleHeight;

test.before(async () => {
  ({ AIRBORNE, DEPTH_RATIO, FLIPS, HOP, tossFrame, tumbleHeight } =
    await import("../../src/helpers/oatsMarkMotion.mjs"));
});

const samples = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

test("the toss starts and ends at rest, face on", () => {
  for (const p of [0, 1]) {
    const frame = tossFrame(p);
    assert.equal(frame.hop, 0, `hop at ${p}`);
    assert.equal(frame.squash, 0, `squash at ${p}`);
    assert.ok(Math.abs(frame.lean) < 1e-9, `lean at ${p}`);
    assert.ok(Math.abs(Math.cos(frame.phi) - 1) < 1e-9, `face on at ${p}`);
  }
  assert.ok(
    Math.abs(tossFrame(1).phi - FLIPS * 2 * Math.PI) < 1e-9,
    "it tumbles all the way round"
  );
});

test("it leaves the ground, and the crease turns away mid-flip", () => {
  const frames = samples(400).map(tossFrame);
  assert.ok(Math.max(...frames.map((f) => f.hop)) > HOP * 0.99);
  assert.ok(
    frames.some((f) => Math.cos(f.phi) < -0.9),
    "the back faces us at some point"
  );
});

test("the tumble is fast at first and slows into the landing", () => {
  const early = tossFrame(0.1).phi - tossFrame(0).phi;
  const late = tossFrame(AIRBORNE).phi - tossFrame(AIRBORNE - 0.1).phi;
  assert.ok(early > late * 4, `early ${early.toFixed(3)} against late ${late.toFixed(3)}`);
});

test("a grain foreshortens towards its end-on shape but never goes flat", () => {
  assert.equal(tumbleHeight(0), 1);
  assert.ok(Math.abs(tumbleHeight(Math.PI / 2) - DEPTH_RATIO) < 1e-9);
  const heights = samples(360).map((p) => tumbleHeight(p * 2 * Math.PI));
  assert.ok(Math.min(...heights) >= DEPTH_RATIO - 1e-9);
});

test("it squashes only once it has landed", () => {
  for (const p of samples(100)) {
    const frame = tossFrame(p);
    if (p < AIRBORNE) assert.equal(frame.squash, 0, `no squash in the air at ${p}`);
  }
  assert.ok(tossFrame(AIRBORNE + 0.1).squash > 0.5);
});

test("a frame outside the toss is a frame at its ends", () => {
  assert.deepEqual(tossFrame(-1), tossFrame(0));
  assert.deepEqual(tossFrame(2), tossFrame(1));
});
