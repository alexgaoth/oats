// The conversation flow card: what has been talked about so far, drawn as
// lanes or as a graph (`components/conversation/ConversationFlow.tsx`).
//
// Pure and DOM-free so it can be pinned. The card owns pixels and nothing else.
//
// **Two views of one thing.** The lanes (`topicLanes.mjs`) are the default: one
// row per topic in the order raised, the minutes on each, and one line for the
// room that climbs back to an earlier row when the conversation returns to it.
// They are the old stack's rows with the graph's shape drawn over them, so the
// card no longer has to choose between a list and a picture, and Auto, which
// chose, is gone. The graph (`liveThreadMap.mjs`) stays as the alternative: x
// is when a topic was first raised, y how unsettled it still is.

/** The choices of the card's view switch. */
export const FLOW_VIEWS = ["lanes", "graph"];

/** Lanes are the default. */
export const DEFAULT_FLOW_VIEW = "lanes";

/**
 * Read a stored view. The graph is the graph; anything else is the lanes:
 * `auto` and `stack`, the views the lanes replaced, an unknown value from a
 * hand-edited localStorage, and `null` on a fresh install.
 *
 * @param {unknown} stored
 * @returns {"lanes" | "graph"}
 */
export function resolveFlowView(stored) {
  return FLOW_VIEWS.includes(stored) ? /** @type {any} */ (stored) : DEFAULT_FLOW_VIEW;
}

const round = (n) => Math.round(n * 10) / 10;

/** The point `distance` from (x, y) toward (tx, ty). */
function toward(x, y, tx, ty, distance) {
  const length = Math.hypot(tx - x, ty - y) || 1;
  return { x: x + ((tx - x) / length) * distance, y: y + ((ty - y) / length) * distance };
}

/**
 * One edge of the graph as an SVG path, in px: a quadratic curve from the rim
 * of one dot to the rim of the other.
 *
 * The curve bows to one side of its direction of travel, so A→B and B→A bow
 * apart rather than drawing over each other. x is when a topic was first
 * raised, so a forward edge runs left to right and sags below the line between
 * its dots, and a return runs right to left and arches above it — the same
 * gesture the topic graph in Intelligence uses for a return.
 *
 * `r1`/`r2` are the radii to stop short at (the dot plus a gap), so a line never
 * runs into a dot. Null when the dots are too close to have a line between them.
 *
 * @param {{ x1?: number, y1?: number, x2?: number, y2?: number, r1?: number, r2?: number,
 *   bow?: number, maxBow?: number }} [edge]
 * @returns {string | null}
 */
export function edgePath({
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 0,
  r1 = 0,
  r2 = 0,
  bow = 0.2,
  maxBow = 28,
} = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (!(length > r1 + r2)) return null;
  const offset = Math.min(maxBow, length * bow);
  const cx = (x1 + x2) / 2 - (dy / length) * offset;
  const cy = (y1 + y2) / 2 + (dx / length) * offset;
  // A curve leaves and arrives along the line to its control point, so that is
  // where it crosses each rim.
  const start = toward(x1, y1, cx, cy, r1);
  const end = toward(x2, y2, cx, cy, r2);
  return `M ${round(start.x)} ${round(start.y)} Q ${round(cx)} ${round(cy)} ${round(end.x)} ${round(end.y)}`;
}

/**
 * A time offset into the conversation, as the recording clock shows it:
 * "4:05", or "1:02:03" past the hour. Empty when there is nothing to show — no
 * time, or a moment before this sitting began (a resumed conversation's earlier
 * turns).
 *
 * @param {number | null | undefined} ms
 * @returns {string}
 */
export function offsetClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const total = Math.floor(ms / 1000);
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
