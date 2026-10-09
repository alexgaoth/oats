const test = require("node:test");
const assert = require("node:assert/strict");

let buildThreadMap, quotedUtterance, unsettled, placeLabels, dotSize;

test.before(async () => {
  ({ buildThreadMap, quotedUtterance, unsettled, placeLabels, dotSize } =
    await import("../../src/helpers/liveThreadMap.mjs"));
});

const START = 1_800_000_000_000;
const NOW = START + 600_000; // ten minutes in

const node = (over = {}) => ({
  id: 1,
  label: "pricing",
  words: [],
  durationMs: 60_000,
  utteranceIds: [],
  firstAt: START,
  lastAt: START,
  returns: 0,
  state: "settled",
  ...over,
});

test("an empty conversation draws nothing rather than an empty frame", () => {
  for (const snapshot of [null, {}, { nodes: [] }, { nodes: "nope" }]) {
    const map = buildThreadMap({ snapshot, startedAt: START, now: NOW });
    assert.equal(map.empty, true);
    assert.deepEqual(map.points, []);
    assert.deepEqual(map.links, []);
  }
});

test("a topic that got a sentence is not a subject and is dropped", () => {
  const map = buildThreadMap({
    snapshot: { nodes: [node({ durationMs: 3000 })] },
    startedAt: START,
    now: NOW,
  });
  assert.equal(map.empty, true);
});

test("x is when it was first raised, so a node never slides as the talk grows", () => {
  const snapshot = {
    nodes: [
      node({ id: 1, label: "early", firstAt: START }),
      node({ id: 2, label: "late", firstAt: START + 300_000 }),
    ],
  };
  const atTen = buildThreadMap({ snapshot, startedAt: START, now: NOW });
  const early = atTen.points.find((p) => p.id === 1);
  const late = atTen.points.find((p) => p.id === 2);
  assert.ok(early.x < late.x, "earlier subject must sit left of the later one");

  // Ten minutes later the same subjects keep their order.
  const atTwenty = buildThreadMap({ snapshot, startedAt: START, now: NOW + 600_000 });
  assert.ok(atTwenty.points.find((p) => p.id === 1).x < atTwenty.points.find((p) => p.id === 2).x);
});

test("unsettled rides high: dropped above open above settled", () => {
  assert.ok(unsettled(node({ state: "dropped" })) > unsettled(node({ state: "open" })));
  assert.ok(unsettled(node({ state: "open" })) > unsettled(node({ state: "settled" })));
});

test("y is screen space, so the least settled sits nearest the top", () => {
  const map = buildThreadMap({
    snapshot: {
      nodes: [node({ id: 1, state: "dropped" }), node({ id: 2, state: "settled", firstAt: START })],
    },
    startedAt: START,
    now: NOW,
  });
  const dropped = map.points.find((p) => p.id === 1);
  const settled = map.points.find((p) => p.id === 2);
  assert.ok(dropped.y < settled.y, "dropped must be higher up the screen (smaller y)");
});

test("coming back to a subject lifts it, but cannot push it off the canvas", () => {
  const once = unsettled(node({ state: "open", returns: 0 }));
  const often = unsettled(node({ state: "open", returns: 12 }));
  assert.ok(often > once);
  assert.ok(often <= 1);
});

test("radius follows area, not time, so twice as long is not four times as big", () => {
  const map = buildThreadMap({
    snapshot: {
      nodes: [node({ id: 1, durationMs: 400_000 }), node({ id: 2, durationMs: 100_000 })],
    },
    startedAt: START,
    now: NOW,
  });
  const big = map.points.find((p) => p.id === 1);
  const small = map.points.find((p) => p.id === 2);
  // 4x the dwell is 2x the radius, before the 0.2 floor.
  assert.ok(Math.abs((big.r - 0.2) / (small.r - 0.2) - 2) < 0.01);
});

test("every point stays inside the canvas, padding included", () => {
  const map = buildThreadMap({
    snapshot: {
      nodes: [
        node({ id: 1, firstAt: START - 999_999, state: "dropped", returns: 40 }),
        node({ id: 2, firstAt: NOW + 999_999, state: "settled" }),
      ],
    },
    startedAt: START,
    now: NOW,
  });
  for (const p of map.points) {
    assert.ok(p.x >= 0 && p.x <= 1, `x out of range: ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= 1, `y out of range: ${p.y}`);
  }
});

test("the map is capped, keeping the heaviest but drawing them in time order", () => {
  const nodes = [];
  for (let i = 0; i < 30; i += 1) {
    nodes.push(node({ id: i, label: `t${i}`, durationMs: 10_000 + i * 1000, firstAt: START + i }));
  }
  const map = buildThreadMap({ snapshot: { nodes }, startedAt: START, now: NOW, maxNodes: 5 });
  assert.equal(map.points.length, 5);
  // The five heaviest are the last five ids.
  assert.deepEqual(
    map.points.map((p) => p.id),
    [25, 26, 27, 28, 29]
  );
  // And they are laid out in the order they were raised.
  const xs = map.points.map((p) => p.x);
  assert.deepEqual(
    [...xs].sort((a, b) => a - b),
    xs
  );
});

test("links join only nodes that survived, and a self-edge is not a move", () => {
  const map = buildThreadMap({
    snapshot: {
      nodes: [node({ id: 1 }), node({ id: 2, firstAt: START + 1000 })],
      edges: [{ from: 1, to: 2 }, { from: 1, to: 99 }, { from: 1, to: 1 }, null],
    },
    startedAt: START,
    now: NOW,
  });
  assert.equal(map.links.length, 1);
  assert.deepEqual([map.links[0].from, map.links[0].to], [1, 2]);
});

test("pressing a topic quotes the most recent thing said about it", () => {
  const point = { utteranceIds: ["a", "c"] };
  const segments = [
    { id: "a", text: "first mention" },
    { id: "b", text: "unrelated" },
    { id: "c", text: "latest mention" },
  ];
  assert.equal(quotedUtterance(point, segments).text, "latest mention");
});

test("a topic whose utterances have scrolled out of the buffer quotes nothing", () => {
  assert.equal(quotedUtterance({ utteranceIds: ["gone"] }, [{ id: "a", text: "x" }]), null);
  assert.equal(quotedUtterance({ utteranceIds: [] }, [{ id: "a", text: "x" }]), null);
  assert.equal(quotedUtterance(null, []), null);
});

test("an empty utterance is not a quote", () => {
  const segments = [
    { id: "a", text: "real" },
    { id: "b", text: "   " },
  ];
  assert.equal(quotedUtterance({ utteranceIds: ["a", "b"] }, segments).text, "real");
});

// The tracker's states are live / open / resolved / dropped. "settled" above is
// the helper's word for the low row; a resolved topic must land in it.
test("a resolved subject sits on the settled row, below an open one", () => {
  assert.ok(unsettled(node({ state: "open" })) > unsettled(node({ state: "resolved" })));
});

// What `placeLabels` promises, measured on boxes in the map's own pixels.
const MAP = { width: 600, height: 144 };
const labelBox = (point, placement) => {
  const cx = point.x * MAP.width;
  const cy = point.y * MAP.height;
  const half = dotSize(point) / 2;
  const w = point.label.length * 6.6;
  const vx1 =
    placement.align === "end"
      ? cx + half - w
      : placement.align === "start"
        ? cx - half
        : cx - w / 2;
  if (placement.side === "above")
    return { x1: vx1, x2: vx1 + w, y1: cy - half - 18, y2: cy - half - 2 };
  if (placement.side === "below")
    return { x1: vx1, x2: vx1 + w, y1: cy + half + 2, y2: cy + half + 18 };
  const x1 = placement.side === "right" ? cx + half + 6 : cx - half - 6 - w;
  return { x1, x2: x1 + w, y1: cy - 8, y2: cy + 8 };
};
const disjoint = (A, B) => !(A.x1 < B.x2 && B.x1 < A.x2 && A.y1 < B.y2 && B.y1 < A.y2);
const pt = (over) => ({
  id: 1,
  label: "pricing",
  x: 0.5,
  y: 0.5,
  r: 0.5,
  durationMs: 1000,
  ...over,
});

test("two subjects raised together on one row do not write over each other", () => {
  const points = [
    pt({ id: 1, label: "onboarding flow", x: 0.7 }),
    pt({ id: 2, label: "investor update", x: 0.78, durationMs: 500 }),
  ];
  const placed = placeLabels(points, MAP);
  const visible = points.filter((p) => !placed.get(p.id).hidden);
  for (const a of visible) {
    for (const b of visible) {
      if (a === b) continue;
      const A = labelBox(a, placed.get(a.id));
      const B = labelBox(b, placed.get(b.id));
      assert.ok(disjoint(A, B), `${a.label} and ${b.label} overlap`);
    }
  }
  assert.equal(visible.length, 2, "both fit once one of them hangs left");
});

test("a label near the right edge hangs left instead of leaving the map", () => {
  const placed = placeLabels([pt({ label: "investor update", x: 0.95 })], MAP);
  assert.deepEqual(placed.get(1), { side: "left", align: "center", hidden: false });
});

test("when only one label fits, the subject the room spent longer on keeps it", () => {
  // Six subjects on one spot: four places around a dot cannot hold six labels.
  const points = [1, 2, 3, 4, 5, 6].map((id) =>
    pt({
      id,
      label: `a long subject name ${id}`,
      x: 0.49 + id * 0.004,
      durationMs: id === 2 ? 9000 : id,
    })
  );
  const placed = placeLabels(points, MAP);
  assert.equal(placed.get(2).hidden, false);
  assert.ok(
    points.some((p) => placed.get(p.id).hidden),
    "something had to give"
  );
});

// The shape the live map actually produced: two subjects on the low row close
// together, a third beside them. Right and left are both taken, so the words
// go above or below rather than disappearing.
test("a crowded row moves a label above or below its dot before hiding it", () => {
  const points = [
    pt({ id: 1, label: "research engineer", x: 0.45, y: 0.71, durationMs: 45 }),
    pt({ id: 2, label: "onboarding flow", x: 0.8, y: 0.71, durationMs: 18 }),
    pt({ id: 3, label: "investor update", x: 0.94, y: 0.71, durationMs: 9 }),
  ];
  const placed = placeLabels(points, MAP);
  assert.ok(
    points.every((p) => !placed.get(p.id).hidden),
    "every subject keeps its words"
  );
  assert.ok(["above", "below"].includes(placed.get(3).side));
  const boxes = points.map((p) => labelBox(p, placed.get(p.id)));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) assert.ok(disjoint(boxes[i], boxes[j]));
    assert.ok(
      boxes[i].y1 >= 0 && boxes[i].y2 <= MAP.height && boxes[i].x1 >= 0 && boxes[i].x2 <= MAP.width
    );
  }
});

test("before the map is measured every label hangs right, as it always did", () => {
  const placed = placeLabels([pt({ x: 0.99 })], { width: 0, height: 0 });
  assert.deepEqual(placed.get(1), { side: "right", align: "center", hidden: false });
});
