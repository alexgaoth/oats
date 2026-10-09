// The conversation flow card: what has been talked about so far, drawn as a
// stack or as a graph (`components/conversation/ConversationFlow.tsx`).
//
// Pure and DOM-free so the rule that chooses the view can be pinned. The card
// owns pixels and nothing else.
//
// **Two views of one thing.** A conversation that moves in a line reads best as
// a list: the topic now, then the ones before it, newest first. A list hides
// one thing, the shape. When the room comes back to earlier topics, or one
// topic leads in several directions, the order of a list says nothing about it
// and a graph does. So Auto shows the graph only when the flow is non-linear
// enough that the list would hide it, and says why in a caption.
//
// **Auto never flip-flops.** The snapshot is republished on every finalized
// utterance, and the tracker folds one-sentence stubs into their neighbours, so
// a count can step down and back up between two utterances. A view that
// followed every step would be motion on the default recording screen — the
// thing that competes with the person in the room. Auto therefore changes view
// only when two snapshots in a row ask for the same change, and never twice
// within `SWITCH_HOLD_MS`.

import { isKeptTopic } from "./liveThreadMap.mjs";

/** The choices of the card's segmented control. */
export const FLOW_MODES = ["auto", "stack", "graph"];

/** Auto is the default: the person should not have to decide. */
export const DEFAULT_FLOW_MODE = "auto";

/** Under this many topics there is no shape yet; a list says everything. */
export const GRAPH_MIN_TOPICS = 4;

/** This many returns to earlier topics and the order of a list misleads. */
export const GRAPH_MIN_RETURNS = 2;

/** The shortest time between two changes of view in Auto. */
export const SWITCH_HOLD_MS = 20_000;

/**
 * Read a stored mode. Anything unknown — an older build's value, a hand-edited
 * localStorage, `null` on a fresh install — is Auto.
 *
 * @param {unknown} stored
 * @returns {"auto" | "stack" | "graph"}
 */
export function resolveFlowMode(stored) {
  return FLOW_MODES.includes(stored) ? /** @type {any} */ (stored) : DEFAULT_FLOW_MODE;
}

/**
 * The shape of the flow, counted over the topics the card shows (the ones
 * `isKeptTopic` keeps). An edge counts only when both of its ends are shown:
 * a line to a topic that is not drawn is not part of the shape anyone can see.
 *
 *   topics    — how many topics are shown
 *   returns   — `return` edges between them: moves back to an earlier topic
 *   branching — topics that lead to two or more others, or are reached from
 *               two or more others
 *   live      — the id of the topic being talked about, when it is shown
 *
 * @param {{ nodes?: any[], edges?: any[] } | null | undefined} snapshot
 * @returns {{ topics: number, returns: number, branching: number, live: number | null }}
 */
export function flowShape(snapshot) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes.filter(isKeptTopic) : [];
  const kept = new Set(nodes.map((node) => node.id));
  const outgoing = new Map();
  const incoming = new Map();
  const returns = new Set();
  for (const edge of Array.isArray(snapshot?.edges) ? snapshot.edges : []) {
    if (!edge || edge.from === edge.to || !kept.has(edge.from) || !kept.has(edge.to)) continue;
    // Keyed by the pair, so a malformed snapshot that lists one move twice
    // does not count it twice.
    if (edge.kind === "return") returns.add(`${edge.from}>${edge.to}`);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, new Set());
    outgoing.get(edge.from).add(edge.to);
    if (!incoming.has(edge.to)) incoming.set(edge.to, new Set());
    incoming.get(edge.to).add(edge.from);
  }
  let branching = 0;
  for (const id of kept) {
    if ((outgoing.get(id)?.size ?? 0) >= 2 || (incoming.get(id)?.size ?? 0) >= 2) branching += 1;
  }
  const live = nodes.find((node) => node.state === "live");
  return { topics: nodes.length, returns: returns.size, branching, live: live ? live.id : null };
}

/**
 * The view that suits a shape, and the reason, which the card shows as its
 * caption in Auto:
 *
 *   few       — under `GRAPH_MIN_TOPICS` topics: the stack
 *   returns   — `GRAPH_MIN_RETURNS` or more returns: the graph
 *   branching — a topic branches or is reached from two places: the graph
 *   linear    — enough topics, but one after another: the stack
 *
 * @param {{ topics?: number, returns?: number, branching?: number } | null | undefined} shape
 * @returns {{ view: "stack" | "graph", reason: "few" | "linear" | "returns" | "branching" }}
 */
export function suitableView(shape) {
  if ((shape?.topics ?? 0) < GRAPH_MIN_TOPICS) return { view: "stack", reason: "few" };
  if ((shape.returns ?? 0) >= GRAPH_MIN_RETURNS) return { view: "graph", reason: "returns" };
  if ((shape.branching ?? 0) >= 1) return { view: "graph", reason: "branching" };
  return { view: "stack", reason: "linear" };
}

/**
 * @typedef {{ view: "stack" | "graph" | null, pending: "stack" | "graph" | null,
 *   lastSwitchAt: number }} FlowState
 */

/** Auto's state after it shows `suggestion` at `now`. */
function adopt(suggestion, now) {
  return {
    view: suggestion.view,
    reason: suggestion.reason,
    state: { view: suggestion.view, pending: null, lastSwitchAt: now },
  };
}

/**
 * The view to draw for one snapshot. Call it once per snapshot, and pass the
 * returned `state` back as `previous` on the next call.
 *
 * A manual mode returns its own view at once. It also clears Auto's state, so
 * choosing Auto again shows Auto's view at once instead of holding a view for
 * a reason the person never saw.
 *
 * In Auto, with nothing shown yet, the suitable view is adopted at once. After
 * that the view changes only when the suitable view differs from the one shown
 * **and** was also the suggestion on the previous call **and** at least
 * `SWITCH_HOLD_MS` have passed since the last change. While a change is held,
 * the reason is `"held"`: no reason for the shown view is true any more (the
 * stack's "only three topics" with four on screen, say), so the caption names
 * the view and claims nothing about why.
 *
 * `reason` is null in a manual mode: nothing was chosen automatically.
 *
 * @param {{ mode?: string, previous?: FlowState | null,
 *   shape?: { topics?: number, returns?: number, branching?: number } | null, now?: number }} [input]
 * @returns {{ view: "stack" | "graph", reason: string | null, state: FlowState }}
 */
export function chooseFlowView({
  mode = DEFAULT_FLOW_MODE,
  previous = null,
  shape = null,
  now = 0,
} = {}) {
  const resolved = resolveFlowMode(mode);
  if (resolved !== "auto") {
    return { view: resolved, reason: null, state: { view: null, pending: null, lastSwitchAt: 0 } };
  }
  const suggestion = suitableView(shape);
  const shown =
    previous && (previous.view === "stack" || previous.view === "graph") ? previous : null;
  if (!shown) return adopt(suggestion, now);
  if (suggestion.view === shown.view) {
    // Same view; the reason can still move on, from "few" to "linear".
    return {
      view: shown.view,
      reason: suggestion.reason,
      state: { view: shown.view, pending: null, lastSwitchAt: shown.lastSwitchAt ?? 0 },
    };
  }
  const confirmed = shown.pending === suggestion.view;
  const rested = now - (shown.lastSwitchAt ?? 0) >= SWITCH_HOLD_MS;
  if (confirmed && rested) return adopt(suggestion, now);
  return {
    view: shown.view,
    reason: "held",
    state: { view: shown.view, pending: suggestion.view, lastSwitchAt: shown.lastSwitchAt ?? 0 },
  };
}

/**
 * The stack: the shown topics, the one being talked about first, then the most
 * recently touched. No clock is needed: each state was decided by the tracker
 * at the moment the snapshot was taken.
 *
 * @param {{ nodes?: any[] } | null | undefined} snapshot
 * @returns {Array<{ id: number, label: string, state: "live" | "open" | "resolved" | "dropped",
 *   durationMs: number, returns: number, lastAt: number }>}
 */
export function stackItems(snapshot) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes.filter(isKeptTopic) : [];
  return nodes
    .map((node) => ({
      id: node.id,
      label: node.label,
      state: node.state,
      durationMs: node.durationMs ?? 0,
      returns: node.returns ?? 0,
      lastAt: node.lastAt ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.state === "live") - Number(a.state === "live") ||
        b.lastAt - a.lastAt ||
        b.id - a.id
    );
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
