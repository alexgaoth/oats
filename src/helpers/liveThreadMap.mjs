// Geometry for the live thread map (DESIGN.md §9.5, drawn while recording).
//
// Pure and DOM-free so it can be pinned. Given the live topic snapshot, produce
// the points and links to draw; the component owns pixels and nothing else.
//
// **Both axes are measurements**, which is the rule the contour holds itself to
// and the reason this is a map rather than decoration:
//
//   x — when the subject was first raised, across the conversation so far
//   y — how settled it is: a thread returned to, or left open, rides high;
//       one that was said once and closed sinks
//
// So the eye reads left-to-right as "the shape of what we have covered", and
// height as "what is still owed". A subject raised early and never resolved
// sits top-left and stays there, which is exactly the thing people forget.
//
// There is no simulation. A force-directed layout is an animation loop, and an
// animation loop during a recording is the defect this repository spent a day
// removing (CLAUDE.md, the conversation contour). Positions are a function of
// the data, recomputed only when the data changes.

/** Below this a topic got a sentence, not a subject — drawing it is noise.
 *  Four seconds, not eight: at eight the map stayed empty through the opening
 *  minutes of a conversation, which is exactly when somebody looks for it. */
const MIN_TOPIC_MS = 4000;

/** More than this and the map is a hairball; the rest stay in the thread list. */
const MAX_NODES = 14;

/** Room for the largest dot plus its label, in the 0..1 space. */
const PAD = 0.08;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * How unsettled a topic is, 0..1 — the y axis.
 *
 * `open` and `dropped` are what the reader can still act on, so they ride
 * highest; `returns` lifts a subject the room keeps circling back to, because
 * that is the signature of something unresolved.
 */
export function unsettled(node) {
  const base = node.state === "dropped" ? 0.9 : node.state === "open" ? 0.7 : 0.25;
  const revisits = Math.min(0.25, (node.returns ?? 0) * 0.08);
  return clamp01(base + revisits);
}

/**
 * Build the map.
 *
 * `startedAt`/`now` bound the x axis so the layout is stable as the
 * conversation grows: a topic does not slide left because a later one arrived.
 */
export function buildThreadMap({
  // Every parameter carries a default so TypeScript infers the shape from the
  // pattern: with a bare `= {}` it sees only the members that have one, and the
  // .tsx call site fails to typecheck against a helper that is plain ESM.
  snapshot = null,
  startedAt = 0,
  now = 0,
  maxNodes = MAX_NODES,
} = {}) {
  const all = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const span = Math.max(1, now - startedAt);

  const kept = all
    .filter((n) => n && n.label && (n.durationMs ?? 0) >= MIN_TOPIC_MS)
    // Keep the heaviest, then restore time order so x never reshuffles.
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, maxNodes)
    .sort((a, b) => (a.firstAt ?? 0) - (b.firstAt ?? 0));

  if (!kept.length) return { points: [], links: [], empty: true };

  const heaviest = Math.max(...kept.map((n) => n.durationMs ?? 0), 1);

  const points = kept.map((node) => {
    const elapsed = (node.firstAt ?? startedAt) - startedAt;
    return {
      id: node.id,
      label: node.label,
      state: node.state,
      returns: node.returns ?? 0,
      durationMs: node.durationMs ?? 0,
      utteranceIds: Array.isArray(node.utteranceIds) ? node.utteranceIds : [],
      x: PAD + clamp01(elapsed / span) * (1 - PAD * 2),
      // Screen coordinates: unsettled is *up*, so it subtracts.
      y: PAD + (1 - unsettled(node)) * (1 - PAD * 2),
      // Area, not radius, tracks dwell — a radius proportional to time makes a
      // subject twice as long look four times as big.
      r: 0.2 + Math.sqrt((node.durationMs ?? 0) / heaviest) * 0.8,
    };
  });

  const byId = new Map(points.map((p) => [p.id, p]));
  const links = [];
  for (const edge of Array.isArray(snapshot?.edges) ? snapshot.edges : []) {
    const from = byId.get(edge?.from);
    const to = byId.get(edge?.to);
    // Both ends must have survived the filter, and a self-edge is not a move.
    if (!from || !to || from === to) continue;
    links.push({ from: from.id, to: to.id, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  }

  return { points, links, empty: false };
}

/** The utterance to quote when a topic is pressed: the most recent one. */
export function quotedUtterance(point, segments) {
  if (!point?.utteranceIds?.length || !Array.isArray(segments)) return null;
  const wanted = new Set(point.utteranceIds);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (segment && wanted.has(segment.id) && String(segment.text || "").trim()) {
      return segment;
    }
  }
  return null;
}
