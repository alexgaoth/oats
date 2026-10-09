const test = require("node:test");
const assert = require("node:assert/strict");

let flowShape,
  suitableView,
  chooseFlowView,
  stackItems,
  edgePath,
  offsetClock,
  resolveFlowMode,
  SWITCH_HOLD_MS,
  MIN_TOPIC_MS;

test.before(async () => {
  ({
    flowShape,
    suitableView,
    chooseFlowView,
    stackItems,
    edgePath,
    offsetClock,
    resolveFlowMode,
    SWITCH_HOLD_MS,
  } = await import("../../src/helpers/conversationFlow.mjs"));
  ({ MIN_TOPIC_MS } = await import("../../src/helpers/liveThreadMap.mjs"));
});

const START = 1_800_000_000_000;

const node = (over = {}) => ({
  id: 1,
  label: "pricing",
  words: [],
  durationMs: 60_000,
  utteranceIds: [],
  firstAt: START,
  lastAt: START,
  returns: 0,
  state: "open",
  ...over,
});

const nodes = (count, over = () => ({})) =>
  Array.from({ length: count }, (_, i) =>
    node({ id: i + 1, label: `topic ${i + 1}`, firstAt: START + i * 60_000, ...over(i + 1) })
  );

// A conversation that moved in a line: 1 → 2 → 3 → … → n.
const chain = (count) =>
  Array.from({ length: count - 1 }, (_, i) => ({ from: i + 1, to: i + 2, weight: 1, kind: "new" }));

// ---------------------------------------------------------------- flowShape

test("an empty or missing snapshot has no shape", () => {
  for (const snapshot of [null, undefined, {}, { nodes: [] }, { nodes: "nope", edges: 3 }]) {
    assert.deepEqual(flowShape(snapshot), { topics: 0, returns: 0, branching: 0, live: null });
  }
});

test("a topic counts from the same four seconds the graph draws from", () => {
  assert.equal(MIN_TOPIC_MS, 4000);
  const shape = flowShape({
    nodes: [
      node({ id: 1, durationMs: 3999 }),
      node({ id: 2, durationMs: 4000 }),
      node({ id: 3, durationMs: 9000, label: "" }),
      null,
    ],
  });
  assert.equal(shape.topics, 1, "under four seconds, or with no name, is not a topic");
});

test("returns count only moves back between topics that are shown", () => {
  const shape = flowShape({
    nodes: [...nodes(3), node({ id: 9, label: "aside", durationMs: 1000 })],
    edges: [
      ...chain(3),
      { from: 3, to: 1, kind: "return" },
      { from: 9, to: 2, kind: "return" }, // from a topic too short to show
      { from: 3, to: 1, kind: "return" }, // listed twice
      { from: 2, to: 2, kind: "return" }, // a self-edge is not a move
    ],
  });
  assert.equal(shape.returns, 1);
});

test("branching is a topic that leads two ways, or is reached from two places", () => {
  // 1 → 2, and later 1 → 3: topic 1 led in two directions.
  const fork = flowShape({
    nodes: nodes(3),
    edges: [
      { from: 1, to: 2, kind: "new" },
      { from: 2, to: 1, kind: "return" },
      { from: 1, to: 3, kind: "new" },
    ],
  });
  assert.equal(fork.branching, 1);

  // 1 → 2 → 3 → 2: topic 2 is reached from 1 and from 3.
  const join = flowShape({
    nodes: nodes(3),
    edges: [...chain(3), { from: 3, to: 2, kind: "return" }],
  });
  assert.equal(join.branching, 1);

  assert.equal(flowShape({ nodes: nodes(5), edges: chain(5) }).branching, 0, "a line has none");
});

test("the live topic is named only when it is shown", () => {
  assert.equal(flowShape({ nodes: nodes(3, (id) => (id === 2 ? { state: "live" } : {})) }).live, 2);
  assert.equal(
    flowShape({ nodes: [node({ id: 1 }), node({ id: 2, state: "live", durationMs: 500 })] }).live,
    null,
    "a topic one sentence old is not drawn, so it is not the live row either"
  );
});

// ------------------------------------------------------------- suitableView

test("under four topics the stack is always enough, whatever the shape", () => {
  for (const shape of [
    { topics: 0, returns: 0, branching: 0 },
    { topics: 3, returns: 5, branching: 2 },
    null,
  ]) {
    assert.deepEqual(suitableView(shape), { view: "stack", reason: "few" });
  }
});

test("four topics in a line, or with one return, stay a stack", () => {
  assert.deepEqual(suitableView({ topics: 4, returns: 0, branching: 0 }), {
    view: "stack",
    reason: "linear",
  });
  assert.deepEqual(suitableView({ topics: 9, returns: 1, branching: 0 }), {
    view: "stack",
    reason: "linear",
  });
});

test("two returns, or any branching, make it a graph — returns named first", () => {
  assert.deepEqual(suitableView({ topics: 4, returns: 2, branching: 0 }), {
    view: "graph",
    reason: "returns",
  });
  assert.deepEqual(suitableView({ topics: 4, returns: 0, branching: 1 }), {
    view: "graph",
    reason: "branching",
  });
  assert.deepEqual(suitableView({ topics: 6, returns: 3, branching: 2 }), {
    view: "graph",
    reason: "returns",
  });
});

test("the rule reads a real snapshot end to end", () => {
  const snapshot = {
    nodes: nodes(4),
    edges: [...chain(4), { from: 4, to: 2, kind: "return" }],
  };
  // One return to topic 2, which is now reached from 1 and from 4.
  assert.deepEqual(suitableView(flowShape(snapshot)), { view: "graph", reason: "branching" });
});

// ----------------------------------------------------------- chooseFlowView

const FEW = { topics: 2, returns: 0, branching: 0 };
const LINE = { topics: 5, returns: 0, branching: 0 };
const LOOPS = { topics: 5, returns: 2, branching: 1 };

/** Feed a sequence of shapes, one per snapshot, `stepMs` apart. */
function run(shapes, { mode = "auto", stepMs = SWITCH_HOLD_MS, previous = null, at = START } = {}) {
  const views = [];
  let state = previous;
  let now = at;
  for (const shape of shapes) {
    const result = chooseFlowView({ mode, previous: state, shape, now });
    views.push(result.view);
    state = result.state;
    now += stepMs;
  }
  return { views, state, now };
}

test("Auto shows the suitable view at once when nothing is shown yet", () => {
  assert.deepEqual(chooseFlowView({ mode: "auto", previous: null, shape: LOOPS, now: START }), {
    view: "graph",
    reason: "returns",
    state: { view: "graph", pending: null, lastSwitchAt: START },
  });
});

test("alternating suggestions never switch, however long it runs", () => {
  const shapes = Array.from({ length: 12 }, (_, i) => (i % 2 ? LOOPS : LINE));
  const { views } = run(shapes, { stepMs: 60_000 });
  assert.deepEqual(new Set(views), new Set(["stack"]));
});

test("two snapshots in a row asking for the graph switch to it", () => {
  const { views, state } = run([LINE, LOOPS, LOOPS]);
  assert.deepEqual(views, ["stack", "stack", "graph"]);
  assert.equal(state.pending, null);
});

test("a switch is held until twenty seconds have passed since the last one", () => {
  // Shown at START; asked twice, but only 5 and 10 seconds later.
  const early = run([LINE, LOOPS, LOOPS], { stepMs: 5_000 });
  assert.deepEqual(early.views, ["stack", "stack", "stack"]);
  assert.equal(early.state.pending, "graph", "the change is still waiting");

  // Still asked for at twenty seconds: now it happens.
  const later = chooseFlowView({
    mode: "auto",
    previous: early.state,
    shape: LOOPS,
    now: START + SWITCH_HOLD_MS,
  });
  assert.equal(later.view, "graph");
  assert.equal(later.state.lastSwitchAt, START + SWITCH_HOLD_MS);

  // And the next change back waits another twenty seconds.
  const back = run([LINE, LINE], {
    previous: later.state,
    at: START + SWITCH_HOLD_MS + 1_000,
    stepMs: 1_000,
  });
  assert.deepEqual(back.views, ["graph", "graph"]);
});

// Measured in the app: the fourth topic arrived, Auto held the stack for one
// snapshot, and the caption kept "few" with the new count: "only 4 topics so
// far", under a rule whose threshold is four.
test("while a change is held, the caption claims no reason for the view shown", () => {
  const few = run([{ topics: 3, returns: 0, branching: 0 }]);
  const held = chooseFlowView({
    mode: "auto",
    previous: few.state,
    shape: { topics: 4, returns: 0, branching: 1 },
    now: START + 1_000,
  });
  assert.equal(held.view, "stack");
  assert.equal(held.reason, "held");

  const shown = chooseFlowView({ mode: "auto", previous: null, shape: LOOPS, now: START });
  const back = chooseFlowView({ mode: "auto", previous: shown.state, shape: LINE, now: START + 1 });
  assert.equal(back.view, "graph");
  assert.equal(back.reason, "held", "never 'moved in a line' under a graph");
});

test("the reason moves on with the shape when the view does not change", () => {
  const { state } = run([FEW]);
  const next = chooseFlowView({ mode: "auto", previous: state, shape: LINE, now: START + 1 });
  assert.equal(next.view, "stack");
  assert.equal(next.reason, "linear");
});

test("a manual choice shows its view at once, and Auto then shows its own at once", () => {
  const auto = run([LINE, LINE]);
  const manual = chooseFlowView({
    mode: "graph",
    previous: auto.state,
    shape: LINE,
    now: auto.now,
  });
  assert.equal(manual.view, "graph");
  assert.equal(manual.reason, null);

  const stack = chooseFlowView({ mode: "stack", previous: null, shape: LOOPS, now: START });
  assert.equal(stack.view, "stack", "Stack holds even when the shape asks for a graph");

  // Back to Auto one second later: no hold, no waiting for a second snapshot.
  const again = chooseFlowView({
    mode: "auto",
    previous: stack.state,
    shape: LOOPS,
    now: START + 1_000,
  });
  assert.equal(again.view, "graph");
});

test("an unknown mode is Auto, and a stored value resolves the same way", () => {
  assert.equal(chooseFlowView({ mode: "sideways", shape: LOOPS, now: START }).view, "graph");
  assert.equal(resolveFlowMode("graph"), "graph");
  assert.equal(resolveFlowMode("stack"), "stack");
  for (const stored of [null, undefined, "", "Graph", 3])
    assert.equal(resolveFlowMode(stored), "auto");
});

test("the state stays a plain object, so it can be held anywhere", () => {
  const { state } = run([LINE, LOOPS]);
  assert.deepEqual(Object.keys(state).sort(), ["lastSwitchAt", "pending", "view"]);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

// -------------------------------------------------------------- stackItems

test("the stack is empty for an empty or missing snapshot", () => {
  for (const snapshot of [null, undefined, {}, { nodes: [] }]) {
    assert.deepEqual(stackItems(snapshot), []);
  }
});

test("the live topic leads, then the most recently touched", () => {
  const items = stackItems({
    nodes: [
      node({ id: 1, label: "pricing", lastAt: START + 50_000 }),
      node({ id: 2, label: "hiring", lastAt: START + 90_000, state: "resolved" }),
      node({ id: 3, label: "demo", lastAt: START + 30_000, state: "live" }),
      node({ id: 4, label: "aside", lastAt: START + 99_000, durationMs: 2000 }),
    ],
  });
  assert.deepEqual(
    items.map((item) => item.label),
    ["demo", "hiring", "pricing"]
  );
});

test("a stack row carries what the row draws, and nothing it does not", () => {
  const [row] = stackItems({
    nodes: [node({ id: 7, label: "pricing", state: "open", durationMs: 125_000, returns: 2 })],
  });
  assert.deepEqual(row, {
    id: 7,
    label: "pricing",
    state: "open",
    durationMs: 125_000,
    returns: 2,
    lastAt: START,
  });
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
