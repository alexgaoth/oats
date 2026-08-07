const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/components/notes/graphPhysics.ts");

const WIDTH = 900;
const HEIGHT = 600;

/** A small star: one hub with four spokes, the shape both graphs actually make. */
function star() {
  const nodes = [
    { id: 0, label: "hub", durationMs: 60000, state: "resolved" },
    { id: 1, label: "one", durationMs: 30000, state: "open" },
    { id: 2, label: "two", durationMs: 30000, state: "open" },
    { id: 3, label: "three", durationMs: 30000, state: "resolved" },
    { id: 4, label: "four", durationMs: 30000, state: "dropped" },
  ];
  const edges = [1, 2, 3, 4].map((to) => ({ from: 0, to, weight: 1, kind: "next" }));
  return { nodes, edges };
}

async function solved() {
  const { layout, radiusFor } = await load();
  const { nodes, edges } = star();
  const maxDuration = Math.max(...nodes.map((node) => node.durationMs));
  const sim = nodes.map((node, index) => ({
    ...node,
    radius: radiusFor(node, maxDuration),
    x: WIDTH / 2 + Math.cos(index) * 120,
    y: HEIGHT / 2 + Math.sin(index) * 120,
    vx: 0,
    vy: 0,
  }));
  layout(sim, edges, WIDTH, HEIGHT);
  return { sim, edges };
}

test("the solve comes to rest rather than running forever", async () => {
  const { simulationStep, ALPHA_DECAY, ALPHA_MIN, MAX_TICKS } = await load();
  const { sim, edges } = await solved();
  const byId = new Map(sim.map((node) => [node.id, node]));

  // From a settled start, another full solve should barely move anything.
  const before = sim.map((node) => ({ x: node.x, y: node.y }));
  let alpha = 1;
  for (let tick = 0; tick < MAX_TICKS && alpha > ALPHA_MIN; tick += 1) {
    simulationStep(sim, byId, edges, WIDTH, HEIGHT, alpha, null);
    alpha *= ALPHA_DECAY;
  }
  const drift = Math.max(
    ...sim.map((node, index) => Math.hypot(node.x - before[index].x, node.y - before[index].y))
  );
  assert.ok(drift < 40, `a settled graph should stay settled; drifted ${drift.toFixed(1)}px`);
});

test("a pinned node does not move at all, however hard it is pushed", async () => {
  const { settleToRest } = await load();
  const { sim, edges } = await solved();

  // Drop the hub right on top of a spoke — the most repulsion the graph can
  // produce — and confirm the hub is nonetheless exactly where it was put.
  const hub = sim.find((node) => node.id === 0);
  const spoke = sim.find((node) => node.id === 1);
  hub.x = spoke.x;
  hub.y = spoke.y;
  const dropped = { x: hub.x, y: hub.y };

  settleToRest(sim, edges, WIDTH, HEIGHT, hub.id);

  assert.equal(hub.x, dropped.x, "a pinned node must not move horizontally");
  assert.equal(hub.y, dropped.y, "a pinned node must not move vertically");
});

test("the neighbours of a pinned node do give way", async () => {
  const { settleToRest } = await load();
  const { sim, edges } = await solved();

  const hub = sim.find((node) => node.id === 0);
  const spoke = sim.find((node) => node.id === 1);
  hub.x = spoke.x;
  hub.y = spoke.y;
  const before = sim.map((node) => ({ id: node.id, x: node.x, y: node.y }));

  settleToRest(sim, edges, WIDTH, HEIGHT, hub.id);

  const moved = sim.filter((node) => {
    const start = before.find((entry) => entry.id === node.id);
    return Math.hypot(node.x - start.x, node.y - start.y) > 1;
  });
  assert.ok(
    moved.length >= 1 && !moved.some((node) => node.id === hub.id),
    "neighbours should move out of the way and the pinned node should not"
  );

  // And they should have separated: the point of giving way.
  const separation = Math.hypot(hub.x - spoke.x, hub.y - spoke.y);
  assert.ok(
    separation > hub.radius,
    `the spoke should end clear of the hub; separation was ${separation.toFixed(1)}px`
  );
});

test("a drop point survives the settle — no rubber-banding", async () => {
  const { settleToRest } = await load();
  const { sim, edges } = await solved();

  const dragged = sim.find((node) => node.id === 3);
  const start = { x: dragged.x, y: dragged.y };
  // A deliberate 200px move, the kind a user makes when arranging a map.
  const target = {
    x: Math.min(WIDTH - 100, start.x + 200),
    y: Math.min(HEIGHT - 80, start.y + 120),
  };
  dragged.x = target.x;
  dragged.y = target.y;

  settleToRest(sim, edges, WIDTH, HEIGHT, dragged.id);

  const displacement = Math.hypot(target.x - start.x, target.y - start.y);
  const undone = Math.hypot(dragged.x - target.x, dragged.y - target.y);
  // This is the regression under test. Releasing the pin at let-go pulled the
  // node back toward where it came from, which read as rubber-banding rather than
  // as settling and contradicted §9.4's "the map a user has arranged stays
  // arranged". Held through the settle, the drop point is exact. The test below
  // measures how much unpinning actually costs, so this one is not just asserting
  // that a `continue` branch continues.
  assert.equal(
    undone,
    0,
    `the settle undid ${((undone / displacement) * 100).toFixed(0)}% of a ` +
      `${displacement.toFixed(0)}px drag; it must undo none of it`
  );
});

test("unpinning at let-go is what caused the rubber-banding", async () => {
  // The contrast case for the test above. Without it, "a pinned node stays put"
  // is true by construction of the `if (node.id === pinned) continue` branch and
  // would still pass if `endDrag` went back to unpinning the moment the button
  // came up. This is the behaviour that regression would restore.
  const { settleToRest } = await load();
  const { sim, edges } = await solved();

  const dragged = sim.find((node) => node.id === 3);
  const start = { x: dragged.x, y: dragged.y };
  const target = {
    x: Math.min(WIDTH - 100, start.x + 200),
    y: Math.min(HEIGHT - 80, start.y + 120),
  };
  dragged.x = target.x;
  dragged.y = target.y;

  // `pinned: null` is exactly what releasing the pin at let-go amounted to.
  settleToRest(sim, edges, WIDTH, HEIGHT, null);

  const undone = Math.hypot(dragged.x - target.x, dragged.y - target.y);
  // On this fixture the unpinned settle pulls the node about 40px back — ~17% of
  // a 233px drag. `UI_OVERHAUL.md` recorded ~74%, measured on real conversation
  // data with a denser graph; that figure is not reproduced here and the bound
  // below deliberately does not claim it. What matters for the test is that the
  // number is comfortably non-zero while the pinned case is exactly zero, so the
  // pair says something about the fix rather than about the `continue` branch.
  assert.ok(
    undone > 20,
    `the unpinned settle should visibly drag the node back; it moved ${undone.toFixed(1)}px, ` +
      "so pinning is not what is holding the drop point and the pinned test above proves nothing"
  );
});

test("the pin is held from pointer-down until the graph rests, not until let-go", async () => {
  // This is the O2 decision itself, rather than the `if (node.id === pinned)`
  // branch it feeds. Releasing the pin at let-go is what produced the
  // rubber-banding, so the interesting assertion is that `releaseDrag` — what
  // happens on pointer-up — keeps it.
  const { NOT_DRAGGING, beginDrag, releaseDrag, restDrag } = await load();

  assert.equal(NOT_DRAGGING.pinned, null);

  const grabbed = beginDrag(7, -12, 4);
  assert.deepEqual(grabbed.grab, { id: 7, dx: -12, dy: 4 });
  assert.equal(grabbed.pinned, 7, "grabbing a node pins it");

  const released = releaseDrag(grabbed);
  assert.equal(released.grab, null, "the pointer is no longer holding it");
  assert.equal(
    released.pinned,
    7,
    "the pin must outlive the pointer — dropping it here is the rubber-banding bug"
  );

  assert.equal(restDrag().pinned, null, "and is only given up once the graph has rested");
});

test("the component wires the lifecycle up the way it is specified", () => {
  // A source-level backstop, and honestly a weak one — but the alternative is
  // nothing. The test above pins `releaseDrag`'s *contract*; this pins that
  // `ForceGraph` still routes through it, since the component's event handlers
  // cannot be exercised without a DOM. What it cannot catch is a rewrite that
  // keeps the names and changes the meaning.
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/components/notes/ForceGraph.tsx"),
    "utf8"
  );

  const start = source.indexOf("const endDrag =");
  assert.ok(start > -1, "endDrag not found");
  const body = source.slice(start, start + 1200);

  assert.match(body, /releaseDrag\(dragRef\.current\)/, "pointer-up must go through releaseDrag");
  const released = body.indexOf("releaseDrag");
  const settled = body.indexOf("settle(");
  const rested = body.indexOf("restDrag()");
  assert.ok(released < settled, "the pointer is released before the settle starts");
  assert.ok(
    settled < rested && rested > -1,
    "the pin must be given up inside the settle's onRest callback, not before it"
  );
});

test("successive settles do not walk hand-placed nodes toward the centre", async () => {
  // `SETTLE_GRAVITY_SCALE`, which nothing else pins. Centre gravity at full
  // strength re-solves the layout on every drag; what has to stay put is the
  // nodes *nobody is holding*, since the held one is trivially unmoved.
  const { settleToRest } = await load();
  const { sim, edges } = await solved();

  const dragged = sim.find((node) => node.id === 4);
  const watched = sim.filter((node) => node.id !== dragged.id);
  const start = watched.map((node) => ({ x: node.x, y: node.y }));

  for (let round = 0; round < 5; round += 1) {
    const held = { x: dragged.x, y: dragged.y };
    settleToRest(sim, edges, WIDTH, HEIGHT, dragged.id);
    assert.equal(dragged.x, held.x, `round ${round}: the pinned node drifted horizontally`);
    assert.equal(dragged.y, held.y, `round ${round}: the pinned node drifted vertically`);
  }

  const drift = Math.max(
    ...watched.map((node, index) => Math.hypot(node.x - start[index].x, node.y - start[index].y))
  );
  // Measured: ~92px at the shipped 0.08, ~214px with gravity left at full
  // strength. The bound sits between the two so the constant is load-bearing.
  assert.ok(
    drift < 150,
    `five settles moved an untouched node ${drift.toFixed(0)}px; centre gravity is ` +
      "re-solving the layout rather than merely keeping it on the canvas"
  );
});

test("nodes stay far enough from the edge for their label to fit", async () => {
  const { settleToRest, LABEL_CLEARANCE_X, LABEL_CLEARANCE_Y } = await load();
  const { sim, edges } = await solved();

  // Shove everything into the corner and let it resolve.
  for (const node of sim) {
    node.x = 0;
    node.y = 0;
  }
  settleToRest(sim, edges, WIDTH, HEIGHT, null);

  for (const node of sim) {
    const sideRoom = Math.max(node.radius + 8, LABEL_CLEARANCE_X);
    assert.ok(node.x >= sideRoom - 0.001, `${node.label} is too close to the left edge`);
    assert.ok(node.x <= WIDTH - sideRoom + 0.001, `${node.label} is too close to the right edge`);
    assert.ok(
      node.y <= HEIGHT - node.radius - LABEL_CLEARANCE_Y + 0.001,
      `${node.label} has no room for its label below it`
    );
  }
});

test("dragging clamps a node exactly the way the solver does", async () => {
  const { clampToCanvas, LABEL_CLEARANCE_X } = await load();
  const node = {
    id: 1,
    label: "x",
    durationMs: 0,
    state: "open",
    radius: 14,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  };

  // Dropped far off the right edge, it must land where the solver would put it —
  // any disagreement is the ~54px sideways jump the two clamps used to produce.
  const dropped = clampToCanvas(node, WIDTH + 500, -500, WIDTH, HEIGHT);
  assert.equal(dropped.x, WIDTH - Math.max(node.radius + 8, LABEL_CLEARANCE_X));
  assert.equal(dropped.y, node.radius + 8);
});

test("fitToCanvas centres without disturbing the arrangement", async () => {
  const { fitToCanvas } = await load();
  const nodes = [
    { id: 0, label: "a", durationMs: 0, state: "open", radius: 20, x: 40, y: 40, vx: 0, vy: 0 },
    { id: 1, label: "b", durationMs: 0, state: "open", radius: 20, x: 140, y: 40, vx: 0, vy: 0 },
    { id: 2, label: "c", durationMs: 0, state: "open", radius: 20, x: 40, y: 140, vx: 0, vy: 0 },
  ];
  const angleBefore = Math.atan2(nodes[1].y - nodes[0].y, nodes[1].x - nodes[0].x);
  const ratioBefore =
    Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y) /
    Math.hypot(nodes[2].x - nodes[0].x, nodes[2].y - nodes[0].y);

  fitToCanvas(nodes, WIDTH, HEIGHT);

  const angleAfter = Math.atan2(nodes[1].y - nodes[0].y, nodes[1].x - nodes[0].x);
  const ratioAfter =
    Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y) /
    Math.hypot(nodes[2].x - nodes[0].x, nodes[2].y - nodes[0].y);

  assert.ok(Math.abs(angleAfter - angleBefore) < 1e-9, "fitting must not rotate the arrangement");
  assert.ok(Math.abs(ratioAfter - ratioBefore) < 1e-9, "fitting must not distort the arrangement");

  const centreX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  assert.ok(Math.abs(centreX - WIDTH / 2) < 60, "the constellation should end up near the centre");
});

// A busy conversation is where the picture used to fall apart: repulsion is a
// force, so it settles wherever it balances centre gravity, and in the reading
// column that balance point was inside the neighbouring disc.
test("no two discs overlap once the graph has settled, however busy it is", async () => {
  const { layout, radiusFor, NODE_GAP } = await load();
  const labels = Array.from({ length: 12 }, (_, index) => `topic ${index}`);
  const nodes = labels.map((label, index) => ({
    id: index,
    label,
    durationMs: 8000 + index * 12000,
    state: "open",
  }));
  // A ring, which is what a conversation that keeps circling back produces.
  const edges = labels.map((_, index) => ({
    from: index,
    to: (index + 3) % labels.length,
    weight: 1,
    kind: "next",
  }));
  const maxDuration = Math.max(...nodes.map((node) => node.durationMs));
  // The narrow reading column, not a wall — the crowded case, on purpose.
  const width = 514;
  const height = 416;
  const sim = nodes.map((node, index) => ({
    ...node,
    radius: radiusFor(node, maxDuration),
    x: width / 2 + Math.cos(index) * 60,
    y: height / 2 + Math.sin(index) * 60,
    vx: 0,
    vy: 0,
  }));

  layout(sim, edges, width, height);

  for (let i = 0; i < sim.length; i += 1) {
    for (let j = i + 1; j < sim.length; j += 1) {
      const distance = Math.hypot(sim[i].x - sim[j].x, sim[i].y - sim[j].y);
      const minimum = sim[i].radius + sim[j].radius;
      assert.ok(
        distance >= minimum,
        `${sim[i].label} and ${sim[j].label} overlap: ${distance.toFixed(1)}px apart, ` +
          `need ${(minimum + NODE_GAP).toFixed(1)}px`
      );
    }
  }
});

test("separation gives way to the hand, not the other way round", async () => {
  const { separate } = await load();
  const held = {
    id: 0,
    label: "held",
    durationMs: 0,
    state: "open",
    radius: 30,
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
  };
  const other = {
    id: 1,
    label: "other",
    durationMs: 0,
    state: "open",
    radius: 30,
    x: 405,
    y: 300,
    vx: 0,
    vy: 0,
  };

  separate([held, other], WIDTH, HEIGHT, held.id);

  assert.equal(held.x, 400, "the pinned node must not be pushed by the constraint");
  assert.equal(held.y, 300);
  assert.ok(other.x > 450, `the neighbour takes the whole correction; it ended at ${other.x}`);
});
