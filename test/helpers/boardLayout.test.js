const test = require("node:test");
const assert = require("node:assert/strict");

let layout;

test.before(async () => {
  layout = await import("../../src/components/global/boardLayout.ts");
});

const card = (id, x, y, w, h, type = id) => ({ id, type, x, y, w, h });

function assertNoCollisions(widgets) {
  for (let i = 0; i < widgets.length; i += 1) {
    for (let j = i + 1; j < widgets.length; j += 1) {
      assert.ok(
        !layout.collides(widgets[i], widgets[j]),
        `${widgets[i].id} and ${widgets[j].id} touch: ${JSON.stringify([widgets[i], widgets[j]])}`
      );
    }
  }
}

test("a drop lands on the nearest grid corner", () => {
  const { snap, GRID } = layout;
  assert.equal(GRID, 24);
  assert.equal(snap(0), 0);
  assert.equal(snap(11), 0);
  assert.equal(snap(13), 1);
  assert.equal(snap(24 * 7 + 5), 7);
  assert.equal(snap(-30), -1);
});

test("two cards collide when they come within the board's gap, not only when they overlap", () => {
  const { collides } = layout;
  const a = card("force", 0, 0, 10, 10);
  // One cell of board between them: clear.
  assert.equal(collides(a, card("arcs", 11, 0, 5, 5)), false);
  assert.equal(collides(a, card("arcs", 0, 11, 5, 5)), false);
  // Edge to edge, with no dots between them: too close.
  assert.equal(collides(a, card("arcs", 10, 0, 5, 5)), true);
  assert.equal(collides(a, card("arcs", 3, 3, 2, 2)), true);
});

test("a card pushed by a drop moves straight down, clear of it", () => {
  const { placeWidget } = layout;
  const before = [card("force", 0, 0, 20, 10), card("arcs", 0, 11, 20, 9)];
  // Drag the arc timeline over the top half of the force graph.
  const after = placeWidget(before, { ...before[1], x: 2, y: 3 }, 40);
  const arcs = after.find((widget) => widget.id === "arcs");
  const force = after.find((widget) => widget.id === "force");
  assert.deepEqual(
    { x: arcs.x, y: arcs.y },
    { x: 2, y: 3 },
    "the dragged card stays where it was put"
  );
  assert.equal(force.x, 0, "the pushed card does not move sideways");
  assert.equal(force.y, arcs.y + arcs.h + 1, "and stops one cell below the dragged card");
  assertNoCollisions(after);
});

test("pushing cascades: a card pushed down pushes the one below it", () => {
  const { placeWidget } = layout;
  const before = [
    card("force", 0, 0, 20, 8),
    card("arcs", 0, 9, 20, 9),
    card("third", 0, 19, 14, 9, "arcs"),
  ];
  const after = placeWidget(before, { ...before[0], h: 14 }, 40);
  assertNoCollisions(after);
  const [force, arcs, third] = after;
  assert.equal(force.h, 14);
  assert.equal(arcs.y, 15);
  assert.equal(third.y, arcs.y + arcs.h + 1);
});

test("a card that does not touch the dropped one keeps its place", () => {
  const { placeWidget } = layout;
  const before = [
    card("force", 0, 0, 20, 10),
    card("arcs", 22, 0, 16, 9),
    card("third", 0, 11, 14, 9, "arcs"),
  ];
  const after = placeWidget(before, { ...before[2], y: 30 }, 40);
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(after[1], before[1]);
});

test("each step of a drag starts from the layout as it was, so a pushed card comes back", () => {
  const { placeWidget } = layout;
  const start = [card("force", 0, 0, 20, 10), card("arcs", 0, 11, 20, 9)];
  const midway = placeWidget(start, { ...start[1], y: 2 }, 40);
  assert.ok(midway[0].y > 0, "the graph moved out of the way");
  const back = placeWidget(start, { ...start[1], y: 11 }, 40);
  assert.deepEqual(back, start, "moving the card back where it was restores the layout");
});

test("a card is never smaller than its type allows, nor past the board's right edge", () => {
  const { clampToBoard, WIDGET_MIN } = layout;
  const shrunk = clampToBoard(card("force", 0, 0, 2, 2), 40);
  assert.equal(shrunk.w, WIDGET_MIN.force.w);
  assert.equal(shrunk.h, WIDGET_MIN.force.h);
  const overhanging = clampToBoard(card("arcs", 35, 0, 20, 9), 40);
  assert.equal(overhanging.x + overhanging.w, 40);
  assert.equal(overhanging.w, 20);
  const wide = clampToBoard(card("arcs", 0, 0, 60, 9), 40);
  assert.equal(wide.w, 40, "a card wider than the board is cut to the board, not left overhanging");
  const negative = clampToBoard(card("arcs", -5, -3, 20, 9), 40);
  assert.deepEqual({ x: negative.x, y: negative.y }, { x: 0, y: 0 });
});

test("a narrower window fits the layout without cutting a card or overlapping two", () => {
  const { fitToBoard } = layout;
  const wide = [card("force", 0, 0, 30, 20), card("arcs", 32, 0, 20, 12)];
  const narrow = fitToBoard(wide, 34);
  for (const widget of narrow)
    assert.ok(widget.x + widget.w <= 34, `${widget.id} runs off the board`);
  assertNoCollisions(narrow);
  // And the saved layout is not changed by being fitted.
  assert.deepEqual(wide[1], card("arcs", 32, 0, 20, 12));
});

test("the default layout fills a 1440x900 window without scrolling, graph above timeline", () => {
  const { defaultLayout, fitToBoard, layoutBottom, WIDGET_MIN } = layout;
  // 1440 - 232 sidebar - 2 x 32 gutters = 1144 px: 47 cells. 900 - 52 header -
  // the page's head (~150 px) leaves about 28 rows.
  const cols = 47;
  const rows = 28;
  const widgets = fitToBoard(defaultLayout(cols, rows), cols);
  const force = widgets.find((widget) => widget.type === "force");
  const arcs = widgets.find((widget) => widget.type === "arcs");
  assert.ok(force && arcs, "both default cards are there");
  assert.equal(layoutBottom(widgets), rows, "the two cards reach the bottom of the view exactly");
  assert.equal(force.w, cols);
  assert.equal(arcs.w, cols);
  assert.ok(force.y < arcs.y, "the timeline sits under the graph");
  assert.ok(force.h > arcs.h, "the graph is the large one");
  assert.ok(arcs.h >= WIDGET_MIN.arcs.h && force.h >= WIDGET_MIN.force.h);
  assertNoCollisions(widgets);
});

test("the default layout stays within its minimums in a small window", () => {
  const { defaultLayout, fitToBoard, WIDGET_MIN } = layout;
  // 1024x700: about 30 cells by 18 rows.
  const widgets = fitToBoard(defaultLayout(30, 18), 30);
  for (const widget of widgets) {
    assert.ok(widget.w >= WIDGET_MIN[widget.type].w);
    assert.ok(widget.h >= WIDGET_MIN[widget.type].h);
    assert.ok(widget.x + widget.w <= 30);
  }
  assertNoCollisions(widgets);
});
