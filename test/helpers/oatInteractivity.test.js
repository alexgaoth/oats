const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isPointInsideBounds,
  shouldIgnoreMouseEvents,
} = require("../../src/helpers/oatInteractivity");

const OAT = { x: 1800, y: 1000, width: 96, height: 96 };
const idle = { platform: "linux", hold: false, cursorInside: false, dragging: false };

test("the oat is click-through only when nothing wants the mouse", () => {
  assert.equal(shouldIgnoreMouseEvents(idle), true);
  assert.equal(shouldIgnoreMouseEvents({ ...idle, cursorInside: true }), false);
  assert.equal(shouldIgnoreMouseEvents({ ...idle, hold: true }), false);
});

// The regression this file exists for. On Linux a click-through window receives
// no mouse events at all, so if a drag could turn it click-through mid-flight,
// nothing inside the page could ever turn it back on: the oat could be dragged
// exactly once and was inert from then until the app restarted.
test("a drag keeps the oat interactive even when nothing else does", () => {
  assert.equal(
    shouldIgnoreMouseEvents({ ...idle, dragging: true }),
    false,
    "a drag must outrank a pointer that has slipped off the seed"
  );
  // And the moment the drag ends, the cursor's real position decides — not a
  // `mouseenter` that will never be delivered.
  assert.equal(shouldIgnoreMouseEvents({ ...idle, dragging: false, cursorInside: true }), false);
  assert.equal(shouldIgnoreMouseEvents({ ...idle, dragging: false, cursorInside: false }), true);
});

test("Windows keeps the panel interactive regardless", () => {
  assert.equal(shouldIgnoreMouseEvents({ ...idle, platform: "win32" }), false);
});

test("the cursor counts as over the oat on its edges and not past them", () => {
  assert.equal(isPointInsideBounds({ x: 1840, y: 1040 }, OAT), true);
  assert.equal(isPointInsideBounds({ x: 1800, y: 1000 }, OAT), true);
  assert.equal(isPointInsideBounds({ x: 1896, y: 1096 }, OAT), true);
  assert.equal(isPointInsideBounds({ x: 1897, y: 1040 }, OAT), false);
  assert.equal(isPointInsideBounds({ x: 1840, y: 999 }, OAT), false);
  assert.equal(isPointInsideBounds(null, OAT), false);
  assert.equal(isPointInsideBounds({ x: 0, y: 0 }, null), false);
});
