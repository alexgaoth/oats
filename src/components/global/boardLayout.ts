// Where the cards sit on the Global conversations board.
//
// The board is a canvas of 24 px cells. Every card is a whole number of cells
// wide and tall and starts on a cell corner, so it snaps to the dot grid. Two
// cards never overlap and always keep one cell of board between them, so the
// dots show around every card and no two borders touch.
//
// Pure and DOM-free, like `graphPhysics.ts`: the claims worth checking (a drop
// lands on the grid, a card pushed aside does not land on another, a narrow
// window does not cut a card off) are claims about numbers.

/** One cell of the board, in CSS pixels: the dot grid's spacing. */
export const GRID = 24;

/** The board kept clear between two cards, in cells. */
export const GAP = 1;

export type WidgetType = "force" | "arcs" | "subjects" | "questions" | "activity";

/** Every widget a board can hold, in the order the Add menu lists them. */
export const WIDGET_TYPES: readonly WidgetType[] = [
  "force",
  "arcs",
  "subjects",
  "questions",
  "activity",
];

export interface BoardWidget {
  /** Stable within a tab. One widget of each type, so the type is the id. */
  id: string;
  type: WidgetType;
  /** Cells from the board's left edge and top. */
  x: number;
  y: number;
  /** Cells wide and tall. */
  w: number;
  h: number;
}

/**
 * The smallest a card of each type can be, in cells. Below this its content
 * stops being readable: the force graph needs room for a label either side of
 * a disc, and the arc timeline for a date and two lines of title under a dot.
 */
export const WIDGET_MIN: Record<WidgetType, { w: number; h: number }> = {
  force: { w: 12, h: 10 },
  arcs: { w: 14, h: 9 },
  subjects: { w: 8, h: 5 },
  questions: { w: 10, h: 7 },
  activity: { w: 12, h: 7 },
};

/** The size a card is added at, in cells: room for what it shows at a glance. */
export const WIDGET_SIZE: Record<WidgetType, { w: number; h: number }> = {
  force: { w: 24, h: 14 },
  arcs: { w: 32, h: 11 },
  subjects: { w: 16, h: 6 },
  questions: { w: 16, h: 11 },
  activity: { w: 14, h: 9 },
};

export function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === "string" && (WIDGET_TYPES as readonly string[]).includes(value);
}

/** CSS pixels to whole cells, to the nearest corner. */
export function snap(px: number): number {
  return Math.round(px / GRID);
}

/** Whether two cards come closer than the gap the board keeps between them. */
export function collides(a: BoardWidget, b: BoardWidget, gap = GAP): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

/**
 * Keep a card on a board `cols` cells wide: never past the right edge, never
 * smaller than its type allows unless the board itself is narrower than that,
 * and never above or left of the origin.
 */
export function clampToBoard(widget: BoardWidget, cols: number): BoardWidget {
  const min = WIDGET_MIN[widget.type];
  const room = Math.max(1, Math.floor(cols));
  const w = Math.max(Math.min(min.w, room), Math.min(Math.round(widget.w), room));
  const h = Math.max(min.h, Math.round(widget.h));
  const x = Math.max(0, Math.min(Math.round(widget.x), room - w));
  const y = Math.max(0, Math.round(widget.y));
  return { ...widget, x, y, w, h };
}

/**
 * Settle `widgets` so that no two collide, moving only downwards.
 *
 * The card named by `anchorId` (the one being dragged or resized) stays exactly
 * where it is. Every other card keeps its place unless it would collide with a
 * card already settled, in which case it moves straight down until it is clear.
 * Cards are settled top to bottom, so a card pushed down can push the one below
 * it in turn, and nothing ever jumps sideways or upwards.
 */
export function resolveCollisions(
  widgets: BoardWidget[],
  anchorId: string | null = null
): BoardWidget[] {
  const anchor = anchorId ? widgets.find((widget) => widget.id === anchorId) : undefined;
  const settled: BoardWidget[] = anchor ? [{ ...anchor }] : [];
  const rest = widgets
    .filter((widget) => widget !== anchor)
    .map((widget) => ({ ...widget }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const widget of rest) {
    // Each pass moves the card below the lowest card it touches; the loop ends
    // because every move is strictly downwards past a finite set of cards.
    for (;;) {
      const blockers = settled.filter((other) => collides(widget, other));
      if (!blockers.length) break;
      widget.y = Math.max(...blockers.map((other) => other.y + other.h + GAP));
    }
    settled.push(widget);
  }
  // Back in the order the caller gave, so a render keyed by id does not reorder.
  const byId = new Map(settled.map((widget) => [widget.id, widget]));
  return widgets.map((widget) => byId.get(widget.id) ?? widget);
}

/**
 * Put one card at a new place or size and settle the rest around it. Used on
 * every step of a drag, always from the layout as it was when the drag began,
 * so a card pushed aside comes back when the dragged one moves on.
 */
export function placeWidget(
  widgets: BoardWidget[],
  moved: BoardWidget,
  cols: number
): BoardWidget[] {
  const clamped = clampToBoard(moved, cols);
  return resolveCollisions(
    widgets.map((widget) => (widget.id === moved.id ? clamped : widget)),
    moved.id
  );
}

/**
 * Fit a saved layout to the board as it is now. A window narrower than the one
 * the layout was made in moves cards left and shrinks them to fit, then settles
 * any that now collide. The saved layout itself is not changed: a wider window
 * gets the arrangement back as it was made.
 */
export function fitToBoard(widgets: BoardWidget[], cols: number): BoardWidget[] {
  return resolveCollisions(widgets.map((widget) => clampToBoard(widget, cols)));
}

/** How many rows the cards reach down to. */
export function layoutBottom(widgets: BoardWidget[]): number {
  return widgets.reduce((bottom, widget) => Math.max(bottom, widget.y + widget.h), 0);
}

/**
 * The layout a tab starts with: the force graph, large, and the arc timeline,
 * wide, under it. Sized from the board that is showing, so it fills the view
 * without scrolling whenever the view is at least the two cards' minimum.
 *
 * The arc timeline goes under the graph rather than beside it because its
 * content is wide and short: conversations along a line in time, each needing
 * room for its title. Beside a large graph it would be either too narrow for
 * the titles or mostly empty above its arcs.
 */
export function defaultLayout(cols: number, rows: number): BoardWidget[] {
  const width = Math.max(1, Math.floor(cols));
  const arcsHeight = Math.max(WIDGET_MIN.arcs.h, Math.min(12, Math.round(rows * 0.4)));
  const forceHeight = Math.max(WIDGET_MIN.force.h, Math.floor(rows) - arcsHeight - GAP);
  return [
    { id: "force", type: "force", x: 0, y: 0, w: width, h: forceHeight },
    { id: "arcs", type: "arcs", x: 0, y: forceHeight + GAP, w: width, h: arcsHeight },
  ];
}

/**
 * Where a new card of `type` goes: the first place it fits, scanning the board
 * row by row from the top left the way you look for room on a desk, at its
 * added size, or at as much of the board's width as there is. Under every
 * other card when nothing above has room.
 */
export function findSpot(widgets: BoardWidget[], type: WidgetType, cols: number): BoardWidget {
  const probe = clampToBoard({ id: type, type, x: 0, y: 0, ...WIDGET_SIZE[type] }, cols);
  const bottom = layoutBottom(widgets);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + probe.w <= Math.max(probe.w, cols); x += 1) {
      const candidate = { ...probe, x, y };
      if (!widgets.some((other) => collides(candidate, other))) return candidate;
    }
  }
  return { ...probe, x: 0, y: bottom + (widgets.length ? GAP : 0) };
}

/** Add a card of `type` where it fits; a type already on the board is not added twice. */
export function addWidget(widgets: BoardWidget[], type: WidgetType, cols: number): BoardWidget[] {
  if (widgets.some((widget) => widget.type === type)) return widgets;
  return [...widgets, findSpot(widgets, type, cols)];
}

/** Move a card by whole cells: the arrow keys on a focused card. */
export function nudge(
  widgets: BoardWidget[],
  id: string,
  dx: number,
  dy: number,
  cols: number
): BoardWidget[] {
  const widget = widgets.find((item) => item.id === id);
  if (!widget) return widgets;
  return placeWidget(widgets, { ...widget, x: widget.x + dx, y: widget.y + dy }, cols);
}

/** Resize a card by whole cells: shift and the arrow keys on a focused card. */
export function grow(
  widgets: BoardWidget[],
  id: string,
  dw: number,
  dh: number,
  cols: number
): BoardWidget[] {
  const widget = widgets.find((item) => item.id === id);
  if (!widget) return widgets;
  return placeWidget(widgets, { ...widget, w: widget.w + dw, h: widget.h + dh }, cols);
}
