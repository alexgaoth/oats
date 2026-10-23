const test = require("node:test");
const assert = require("node:assert/strict");

let edgePath, offsetClock, resolveFlowView, FLOW_VIEWS, DEFAULT_FLOW_VIEW;

test.before(async () => {
  ({ edgePath, offsetClock, resolveFlowView, FLOW_VIEWS, DEFAULT_FLOW_VIEW } =
    await import("../../src/helpers/conversationFlow.mjs"));
});

// ----------------------------------------------------------- resolveFlowView

test("the flow card's views are Lanes and Graph, and Lanes is the default", () => {
  assert.deepEqual(FLOW_VIEWS, ["lanes", "graph"]);
  assert.equal(DEFAULT_FLOW_VIEW, "lanes");
});

// Auto and Stack were the choices the lanes replaced. A person who chose either
// gets the lanes, whose rows are the stack's rows; a person who chose the graph
// keeps it.
test("a stored Auto or Stack becomes Lanes, and a stored Graph stays", () => {
  assert.equal(resolveFlowView("auto"), "lanes");
  assert.equal(resolveFlowView("stack"), "lanes");
  assert.equal(resolveFlowView("graph"), "graph");
  assert.equal(resolveFlowView("lanes"), "lanes");
});

test("anything unknown is Lanes", () => {
  for (const stored of [null, undefined, "", "Graph", "sideways", 3]) {
    assert.equal(resolveFlowView(stored), "lanes");
  }
});

// ---------------------------------------------------------------- edgePath

const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("an edge runs rim to rim, not centre to centre", () => {
  const d = edgePath({ x1: 0, y1: 50, x2: 200, y2: 50, r1: 6, r2: 9 });
  const [sx, sy, , , ex, ey] = numbers(d);
  assert.ok(Math.abs(Math.hypot(sx - 0, sy - 50) - 6) < 0.15, "starts on the first rim");
  assert.ok(Math.abs(Math.hypot(ex - 200, ey - 50) - 9) < 0.15, "ends on the second rim");
});

test("a forward edge sags and a return arches, so the two never overlap", () => {
  const forward = numbers(edgePath({ x1: 20, y1: 50, x2: 220, y2: 50 }));
  const back = numbers(edgePath({ x1: 220, y1: 50, x2: 20, y2: 50 }));
  assert.ok(forward[3] > 50, "left to right bows below (screen y grows down)");
  assert.ok(back[3] < 50, "right to left bows above");
});

test("the bow is capped, so a long edge does not balloon", () => {
  const [, , , cy] = numbers(edgePath({ x1: 0, y1: 0, x2: 1000, y2: 0, maxBow: 28 }));
  assert.equal(cy, 28);
});

test("dots too close to have a line between them draw no edge", () => {
  assert.equal(edgePath({ x1: 0, y1: 0, x2: 10, y2: 0, r1: 6, r2: 6 }), null);
  assert.equal(edgePath({ x1: 5, y1: 5, x2: 5, y2: 5 }), null);
});

// ------------------------------------------------------------- offsetClock

test("a quote's time reads like the recording clock", () => {
  assert.equal(offsetClock(0), "0:00");
  assert.equal(offsetClock(65_400), "1:05");
  assert.equal(offsetClock(3_723_000), "1:02:03");
});

test("a moment before this sitting, or no moment, shows no time", () => {
  assert.equal(offsetClock(-1), "");
  assert.equal(offsetClock(null), "");
  assert.equal(offsetClock(Number.NaN), "");
});
