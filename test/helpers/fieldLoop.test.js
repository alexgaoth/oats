const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/components/conversation/field/fieldLoop.ts");

// Vsync timestamps after a frame drawn at 0, at a display's refresh rate.
const vsyncs = (hz, count) => Array.from({ length: count }, (_, i) => ((i + 1) * 1000) / hz);

test("the wind is drawn at 30 frames a second at most", async () => {
  const { FIELD_FPS, FRAME_INTERVAL_MS } = await load();
  assert.equal(FIELD_FPS, 30);
  assert.equal(FRAME_INTERVAL_MS, 1000 / 30);
});

// A frame can only land on a vsync. On 120 and 60 Hz the 30 fps frame is the
// fourth and the second vsync: never earlier, and never one late because float
// error made the due vsync measure a hair early.
for (const [hz, nth] of [
  [120, 4],
  [60, 2],
]) {
  test(`at ${hz} Hz the next frame is due on vsync ${nth}`, async () => {
    const { frameDue } = await load();
    const due = vsyncs(hz, 8).map((at) => frameDue(at, 0));
    assert.equal(due.indexOf(true), nth - 1);
  });
}

test("on a display that does not divide 30, frames are never closer than the cap", async () => {
  const { frameDue, FRAME_INTERVAL_MS, FRAME_SLACK_MS } = await load();
  for (const hz of [48, 50, 75, 90, 144, 165, 240]) {
    const first = vsyncs(hz, 40).find((at) => frameDue(at, 0));
    assert.ok(first >= FRAME_INTERVAL_MS - FRAME_SLACK_MS, `${hz} Hz drew after ${first}ms`);
    assert.ok(
      first < FRAME_INTERVAL_MS + 1000 / hz,
      `${hz} Hz waited past the vsync after the interval`
    );
  }
});

test("the loop sleeps until just before the frame is due, and no longer", async () => {
  const { frameDelay, frameDue, FRAME_INTERVAL_MS, FRAME_SLACK_MS } = await load();
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
  // Just drawn at 100: sleep most of an interval, waking before the due vsync.
  near(frameDelay(100, 100), FRAME_INTERVAL_MS - FRAME_SLACK_MS);
  // Drawing took 3ms: those 3ms come off the sleep.
  near(frameDelay(103, 100), FRAME_INTERVAL_MS - FRAME_SLACK_MS - 3);
  // Already late: ask for the next vsync at once, and it may draw.
  assert.equal(frameDelay(200, 100), 0);
  assert.equal(frameDue(200, 100), true);
  // Whenever the sleep ends, the vsync that follows is due.
  for (let spent = 0; spent < FRAME_INTERVAL_MS; spent += 1.7) {
    const wake = 100 + spent + frameDelay(100 + spent, 100);
    assert.ok(frameDue(wake, 100), `woke at ${wake} and was not due`);
  }
});

test("the first frame after a stop is due at once", async () => {
  const { frameDue } = await load();
  assert.equal(frameDue(5, -Infinity), true);
});

test("a capped frame is not a slow frame", async () => {
  const { FRAME_BUDGET_MS, FRAME_INTERVAL_MS } = await load();
  // At 30 fps the interval between frames is ~33ms, and on a 50 Hz display 40.
  // Judged by the old 60 fps budget (20.5ms) every one of them counted as slow
  // and the field thinned itself twice within seconds.
  assert.ok(FRAME_BUDGET_MS > FRAME_INTERVAL_MS);
  assert.ok(FRAME_BUDGET_MS > 40, "a 50 Hz display must not thin the field");
});

test("a still field draws once; a moving one only while somebody can see it", async () => {
  const { fieldLoopState } = await load();
  const at = (animate, reduced, visible) => fieldLoopState({ animate, reduced, visible });

  assert.equal(at(true, false, true), "moving");
  assert.equal(at(true, false, false), "paused", "nobody can see it: no frames at all");
  // Still is one frame per change, so it is drawn whether or not anybody is
  // looking, and the canvas is right the moment somebody does.
  assert.equal(at(false, false, true), "still");
  assert.equal(at(false, false, false), "still");
  // prefers-reduced-motion is one still frame, never a loop.
  assert.equal(at(true, true, true), "still");
  assert.equal(at(true, true, false), "still");
});

test("the clock is the wall clock while it runs", async () => {
  const { createFieldClock } = await load();
  const clock = createFieldClock(1000);
  assert.equal(clock.elapsed(1000), 0);
  assert.equal(clock.elapsed(8000), 7000);
  assert.equal(clock.paused, false);
});

// The reason the clock exists: a field that comes back from the tray resumes
// where it was left, instead of jumping by however long it was away.
test("time spent paused is not animation time", async () => {
  const { createFieldClock } = await load();
  const clock = createFieldClock(0);
  clock.pause(5000);
  assert.equal(clock.paused, true);
  assert.equal(clock.elapsed(5000), 5000);
  assert.equal(clock.elapsed(65000), 5000, "a paused clock does not move");
  clock.resume(65000);
  assert.equal(clock.elapsed(65000), 5000, "no jump on return");
  assert.equal(clock.elapsed(65033), 5033);

  // Pausing twice keeps the first pause; resuming twice adds nothing.
  clock.pause(70000);
  clock.pause(80000);
  clock.resume(90000);
  clock.resume(95000);
  assert.equal(clock.elapsed(95000), 5000 + 5000 + 5000);
});

test("the clock never runs backwards past its start", async () => {
  const { createFieldClock } = await load();
  const clock = createFieldClock(1000);
  // A rAF timestamp can be a hair older than the moment the clock started.
  assert.equal(clock.elapsed(990), 0);
  clock.pause(2000);
  clock.resume(1990);
  assert.equal(clock.elapsed(2000), 1000);
});

test("easing covers the same ground per second at any frame rate", async () => {
  const { easeToward } = await load();
  const run = (fps) => {
    let value = 0;
    for (let i = 0; i < fps / 2; i += 1) value = easeToward(value, 1, 1000 / fps, 0.18);
    return value; // half a second
  };
  const at60 = run(60);
  for (const fps of [30, 120, 20]) {
    assert.ok(Math.abs(run(fps) - at60) < 1e-9, `${fps} fps reached ${run(fps)}, 60 fps ${at60}`);
  }
  // One 60 Hz frame is exactly the old per-frame step.
  assert.ok(Math.abs(easeToward(0, 1, 1000 / 60, 0.18) - 0.18) < 1e-12);
});

test("easing with no time passed changes nothing, and never overshoots", async () => {
  const { easeToward } = await load();
  assert.equal(easeToward(0.4, 1, 0, 0.18), 0.4);
  assert.equal(easeToward(0.4, 1, -50, 0.18), 0.4);
  const long = easeToward(0, 1, 10_000, 0.18);
  assert.ok(long <= 1 && long > 0.999);
  const down = easeToward(1, 0, 33, 0.18);
  assert.ok(down > 0 && down < 1);
});
