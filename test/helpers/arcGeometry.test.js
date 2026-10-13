const test = require("node:test");
const assert = require("node:assert/strict");

let arcs;

test.before(async () => {
  arcs = await import("../../src/components/global/arcGeometry.ts");
});

const DAY = 86400000;
const conversations = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, createdAt: 1000 + index * DAY }));

test("conversations sit in date order, evenly spaced, whatever order they arrive in", () => {
  const { layoutArcTimeline } = arcs;
  const shuffled = [
    { id: 7, createdAt: 3 * DAY },
    { id: 3, createdAt: 1 * DAY },
    { id: 9, createdAt: 2 * DAY },
    // A tie in time is broken by id, so the order never flickers between renders.
    { id: 4, createdAt: 2 * DAY },
  ];
  const result = layoutArcTimeline({ conversations: shuffled, edges: [], width: 600, height: 280 });
  assert.deepEqual(result.order, [3, 4, 9, 7]);
  const xs = result.order.map((id) => result.x.get(id));
  const gaps = xs.slice(1).map((x, index) => x - xs[index]);
  for (const gap of gaps) assert.ok(Math.abs(gap - gaps[0]) < 1e-9, "every gap is the same");
  assert.equal(result.scrolls, false);
});

test("under 56 px a conversation, the card scrolls sideways instead of squeezing", () => {
  const { layoutArcTimeline, MIN_STEP, MARGIN } = arcs;
  const roomy = layoutArcTimeline({
    conversations: conversations(10),
    edges: [],
    width: 900,
    height: 280,
  });
  assert.equal(roomy.scrolls, false);
  assert.ok(roomy.step >= MIN_STEP);

  const many = layoutArcTimeline({
    conversations: conversations(200),
    edges: [],
    width: 900,
    height: 280,
  });
  assert.ok(many.step >= MIN_STEP && many.step < MIN_STEP * 1.1);
  assert.equal(many.scrolls, true);
  assert.equal(many.contentWidth, MARGIN * 2 + many.step * 200);
  // Whole columns fill the card exactly, so a scroll stopped on a column shows
  // every date and title whole.
  const columns = (900 - MARGIN * 2) / many.step;
  assert.ok(Math.abs(columns - Math.round(columns)) < 1e-9, `${columns} columns in view`);
  const last = many.x.get(200);
  assert.ok(last < many.contentWidth, "the last conversation is inside the scrolled width");
});

test("an arc's height is in proportion to its reach, and the tallest fits the card", () => {
  const { layoutArcTimeline, TOP } = arcs;
  const edges = [
    { from: 1, to: 2 },
    { from: 1, to: 3 },
    { from: 2, to: 5 },
    { from: 1, to: 6 },
  ];
  const result = layoutArcTimeline({
    conversations: conversations(6),
    edges,
    width: 1100,
    height: 300,
  });
  assert.equal(result.arcs.length, 4);
  const ratios = result.arcs.map((arc) => arc.ry / arc.rx);
  for (const ratio of ratios)
    assert.ok(Math.abs(ratio - ratios[0]) < 1e-9, "one ratio for every arc");
  for (const arc of result.arcs) {
    assert.ok(arc.ry <= result.baseline - TOP, "no arc rises past the top of the card");
    assert.equal(arc.rx, (arc.right - arc.left) / 2);
  }
  // Tallest first, so the short arcs are drawn over the long ones.
  const reach = result.arcs.map((arc) => arc.rx);
  assert.deepEqual(
    reach,
    [...reach].sort((a, b) => b - a)
  );
});

test("on a long timeline, short arcs keep their height and only the longest are capped", () => {
  const { layoutArcTimeline, MIN_ARC_HEIGHT, MIN_STEP } = arcs;
  const edges = [
    { from: 1, to: 2 },
    { from: 1, to: 150 },
  ];
  const result = layoutArcTimeline({
    conversations: conversations(200),
    edges,
    width: 900,
    height: 280,
  });
  const short = result.arcs.find((arc) => arc.to === 2);
  const long = result.arcs.find((arc) => arc.to === 150);
  assert.ok(Math.abs(short.rx - result.step / 2) < 1e-9);
  assert.ok(result.step >= MIN_STEP);
  assert.ok(
    Math.abs(short.ry - MIN_ARC_HEIGHT) < 1e-9,
    `an arc between neighbours is ${short.ry.toFixed(1)} px tall`
  );
  assert.ok(long.ry > short.ry);
  assert.ok(
    long.ry < long.rx * (short.ry / short.rx),
    "the longest arc is held to the card's height"
  );
});

test("on a timeline that fits, every arc keeps its proportion and none is capped", () => {
  const { layoutArcTimeline, TOP } = arcs;
  // Seven conversations in a wide card: the case the board opens with.
  const edges = [
    { from: 1, to: 7 },
    { from: 2, to: 7 },
    { from: 2, to: 3 },
    { from: 6, to: 7 },
  ];
  const result = layoutArcTimeline({
    conversations: conversations(7),
    edges,
    width: 1150,
    height: 200,
  });
  const tallest = result.baseline - TOP - 6;
  const longest = result.arcs[0];
  assert.equal(longest.to, 7);
  assert.ok(Math.abs(longest.ry - tallest) < 1e-9, "the longest arc reaches the top");
  const reaches = new Set(result.arcs.map((arc) => Math.round(arc.rx)));
  const heights = new Set(result.arcs.map((arc) => Math.round(arc.ry)));
  assert.equal(heights.size, reaches.size, "arcs of different reach have different heights");
});

test("an edge is drawn once, whichever way round it is listed", () => {
  const { layoutArcTimeline, edgeKey } = arcs;
  const result = layoutArcTimeline({
    conversations: conversations(3),
    edges: [
      { from: 1, to: 3 },
      { from: 3, to: 1 },
      { from: 2, to: 2 },
      { from: 2, to: 99 },
    ],
    width: 600,
    height: 280,
  });
  assert.deepEqual(
    result.arcs.map((arc) => arc.key),
    [edgeKey(1, 3)]
  );
  assert.equal(edgeKey(3, 1), edgeKey(1, 3));
});

test("pointing finds the conversation whose column it is in, below the arcs only", () => {
  const { layoutArcTimeline, conversationAt } = arcs;
  const result = layoutArcTimeline({
    conversations: conversations(4),
    edges: [],
    width: 400,
    height: 280,
  });
  const x2 = result.x.get(2);
  assert.equal(conversationAt(result, x2, result.baseline), 2);
  assert.equal(conversationAt(result, x2 + result.step / 2 - 1, result.baseline + 40), 2);
  assert.equal(
    conversationAt(result, x2, result.baseline - 60),
    null,
    "the arcs' space is not a column"
  );
  assert.equal(conversationAt(result, -20, result.baseline), null);
});

test("only the arcs that reach into the visible part of a scrolled card are drawn", () => {
  const { layoutArcTimeline, arcsBetween } = arcs;
  const result = layoutArcTimeline({
    conversations: conversations(100),
    edges: [
      { from: 1, to: 2 },
      { from: 1, to: 90 },
      { from: 80, to: 81 },
    ],
    width: 500,
    height: 280,
  });
  const left = result.x.get(40);
  const right = result.x.get(50);
  const visible = arcsBetween(result.arcs, left, right).map((arc) => arc.to);
  assert.deepEqual(visible, [90], "only the arc spanning the window crosses it");
});
