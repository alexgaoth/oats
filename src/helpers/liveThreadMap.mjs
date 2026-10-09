// Geometry for the live thread map: the graph view of the conversation flow
// card (`components/conversation/ConversationFlow.tsx`, drawn while recording).
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
 *  minutes of a conversation, which is exactly when somebody looks for it.
 *  Shared with `conversationFlow.mjs`, so the stack, the graph and the rule
 *  that chooses between them all count the same topics. */
export const MIN_TOPIC_MS = 4000;

/** A topic worth showing: it has a name and was talked about long enough. */
export function isKeptTopic(node) {
  return Boolean(node && node.label && (node.durationMs ?? 0) >= MIN_TOPIC_MS);
}

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
    .filter(isKeptTopic)
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
    links.push({
      from: from.id,
      to: to.id,
      // A move back to an earlier topic, which the graph draws differently.
      kind: edge.kind === "return" ? "return" : "new",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
  }

  return { points, links, empty: false };
}

/** A point's dot in px. Area follows dwell through `r`; shared with the
 *  renderer so the placement below and the drawing agree on where a dot ends. */
export function dotSize(point) {
  return 5 + (point?.r ?? 0) * 5;
}

/** Mono at 11px advances 0.6em per character in every shipped mono face. The
 *  default advance; a caller setting labels in another face passes its own. */
const LABEL_CHAR_PX = 6.6;
const LABEL_H_PX = 16;
/** Dot-to-label gap beside the dot (`gap-1.5`), and above or below it (`gap-0.5`). */
const LABEL_GAP_PX = 6;
const LABEL_GAP_Y_PX = 2;

const overlaps = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/**
 * Which side of its dot each label goes on — or whether it fits at all.
 *
 * The dot is the measurement and does not move; only its words do. Subjects
 * raised close together sit at nearly the same x, and because y is quantised by
 * state they often share a row too, so labels that all hang to the right ran
 * into each other ("onboarding flo● investor update"). Each label tries the
 * right of its dot, then the left, then centred above it and below it; a label
 * with nowhere to go is hidden rather
 * than drawn over another (§9.4: never a wall of overlapping text) and stays in
 * the button's accessible name and title. Heavier subjects are placed first, so
 * when two compete the one the room spent longer on keeps its words.
 *
 * `width`/`height` are the map's box in px. With no box yet (first render,
 * before it is measured) every label goes right, which is the old behaviour.
 * `charPx` is the face's average advance per character at the label's size:
 * a label's width is estimated as its length times this, so an estimate that
 * runs short lets two labels touch.
 */
export function placeLabels(points, { width = 0, height = 0, charPx = LABEL_CHAR_PX } = {}) {
  const list = Array.isArray(points) ? points : [];
  if (!(width > 0 && height > 0)) {
    return new Map(list.map((p) => [p.id, { side: "right", align: "center", hidden: false }]));
  }
  const dots = list.map((p) => {
    const half = dotSize(p) / 2;
    const cx = p.x * width;
    const cy = p.y * height;
    return { id: p.id, x1: cx - half, x2: cx + half, y1: cy - half, y2: cy + half, cx, cy, half };
  });
  const placed = [];
  const result = new Map();
  const byWeight = [...list].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
  for (const point of byWeight) {
    const dot = dots.find((d) => d.id === point.id);
    const w = String(point.label ?? "").length * charPx;
    const y1 = dot.cy - LABEL_H_PX / 2;
    const y2 = dot.cy + LABEL_H_PX / 2;
    const above = dot.cy - dot.half - LABEL_GAP_Y_PX;
    const below = dot.cy + dot.half + LABEL_GAP_Y_PX;
    // Above and below, the words are centred on the dot, or flush with its
    // right or left edge when centring would run them off the map.
    const spans = [
      { align: "center", x1: dot.cx - w / 2 },
      { align: "end", x1: dot.cx + dot.half - w },
      { align: "start", x1: dot.cx - dot.half },
    ];
    const candidates = [
      { side: "right", align: "center", x1: dot.cx + dot.half + LABEL_GAP_PX, y1, y2 },
      { side: "left", align: "center", x1: dot.cx - dot.half - LABEL_GAP_PX - w, y1, y2 },
      ...spans.map((span) => ({ side: "above", ...span, y1: above - LABEL_H_PX, y2: above })),
      ...spans.map((span) => ({ side: "below", ...span, y1: below, y2: below + LABEL_H_PX })),
    ].map((box) => ({ ...box, x2: box.x1 + w }));
    const fits = candidates.find(
      (box) =>
        box.x1 >= 0 &&
        box.x2 <= width &&
        box.y1 >= 0 &&
        box.y2 <= height &&
        !placed.some((other) => overlaps(box, other)) &&
        !dots.some((other) => other.id !== point.id && overlaps(box, other))
    );
    if (fits) {
      placed.push(fits);
      result.set(point.id, { side: fits.side, align: fits.align, hidden: false });
    } else {
      result.set(point.id, { side: "right", align: "center", hidden: true });
    }
  }
  return result;
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
