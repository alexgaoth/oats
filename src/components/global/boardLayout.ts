// Where the cards sit on the Global conversations board.
//
// The board is a canvas of 24 px cells with a dot in the middle of each. Every
// card is a whole number of cells wide and tall and starts on a cell corner,
// so it snaps to the grid and covers its cells' dots. Two cards never overlap
// and always keep one cell of board between them, and the layout keeps two
// cells clear around it, so a row of dots shows between every two cards and
// two rows around them all, and no two borders touch.
//
// Pure and DOM-free, like `graphPhysics.ts`: the claims worth checking (a drop
// lands on the grid, a card pushed aside does not land on another, a narrow
// window does not cut a card off) are claims about numbers.

/** One cell of the board, in CSS pixels: the dot grid's spacing. */
export const GRID = 24;

/** The board kept clear between two cards, in cells. */
export const GAP = 1;

export type WidgetType = "force" | "arcs";

export const WIDGET_TYPES: readonly WidgetType[] = ["force", "arcs"];

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
 * The bare board kept around the cards, in cells: two rows of dots on every
 * side, so the cards sit on a dotted board instead of covering it.
 */
export const MARGIN = 2;

/** The room a board gives its cards. */
export interface BoardRoom {
  /** Whole cells across and down for the cards. */
  cols: number;
  rows: number;
  /** From the board's left edge to the cards' first column, in CSS pixels. */
  inset: number;
}

/**
 * The cells a board `width` × `height` CSS pixels holds for its cards: whole
 * cells only, `MARGIN` cells of board kept clear on every side, and the cards
 * centred across, so the margin is the same at both ends.
 */
export function boardRoom(width: number, height: number): BoardRoom {
  const margin = MARGIN * GRID;
  const cols = Math.max(1, Math.floor((width - margin * 2) / GRID));
  const rows = Math.max(1, Math.floor((height - margin * 2) / GRID));
  return { cols, rows, inset: Math.max(margin, Math.floor((width - cols * GRID) / 2)) };
}

/**
 * Where the dots are drawn across the board, in CSS pixels: the cards' columns
 * and the `MARGIN` cells either side, whole cells only. A dot sits in the
 * middle of its cell, so no edge cuts one, and a card, which covers whole
 * cells, never touches one: the dots run down the middle of the gaps.
 */
export function dotField(room: BoardRoom): { left: number; width: number } {
  return { left: room.inset - MARGIN * GRID, width: (room.cols + MARGIN * 2) * GRID };
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
