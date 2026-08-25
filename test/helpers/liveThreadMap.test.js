const test = require("node:test");
const assert = require("node:assert/strict");

let buildThreadMap, quotedUtterance, unsettled;

test.before(async () => {
  ({ buildThreadMap, quotedUtterance, unsettled } = await import(
    "../../src/helpers/liveThreadMap.mjs"
  ));
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
  assert.deepEqual([...xs].sort((a, b) => a - b), xs);
});

test("links join only nodes that survived, and a self-edge is not a move", () => {
  const map = buildThreadMap({
    snapshot: {
      nodes: [node({ id: 1 }), node({ id: 2, firstAt: START + 1000 })],
      edges: [
        { from: 1, to: 2 },
        { from: 1, to: 99 },
        { from: 1, to: 1 },
        null,
      ],
    },
    startedAt: START,
    now: NOW,
  });
  assert.equal(map.links.length, 1);
  assert.deepEqual(
    [map.links[0].from, map.links[0].to],
    [1, 2]
  );
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
