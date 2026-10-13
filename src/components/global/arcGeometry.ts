// The arc timeline's geometry: conversations along a line in date order, and
// an arc joining every two that share a subject.
//
// Pure and DOM-free, so where things land can be tested without a canvas.
// `ArcTimeline.tsx` owns the pixels.

/**
 * The least room one conversation gets along the line, in CSS pixels. Below
 * it a date no longer fits under its dot, so the card scrolls sideways inside
 * itself instead of squeezing.
 */
export const MIN_STEP = 56;

/** Kept clear at either end of the line. */
export const MARGIN = 8;

/** The widest a title under a dot may be, however much room there is. */
export const MAX_TITLE_WIDTH = 140;

/** Under the line: a date, then up to two lines of title. */
export const DATE_OFFSET = 12;
export const TITLE_OFFSET = 30;
export const TITLE_LINE = 16;
export const LABEL_BAND = TITLE_OFFSET + TITLE_LINE * 2 + 10;

/** Above the tallest arc. */
export const TOP = 12;

/**
 * An arc's height is in proportion to its reach: `ry = k * rx`. `k` is chosen
 * so the longest arc just fits the card, so every arc keeps its proportion. On
 * a long timeline that would flatten the arcs between neighbours into the
 * line, so `k` is never less than what lifts the shortest arc `MIN_ARC_HEIGHT`
 * px; the longest arcs then stop at the card's height. Nor more than
 * `MAX_ARC_RATIO`, so a timeline of few conversations does not draw needles.
 */
export const MIN_ARC_HEIGHT = 8;
export const MAX_ARC_RATIO = 0.9;

export interface TimelineConversation {
  id: number;
  createdAt: number;
}

export interface TimelineEdge {
  from: number;
  to: number;
}

export interface TimelineArc {
  key: string;
  from: number;
  to: number;
  /** The left and right feet, and the half-width between them. */
  left: number;
  right: number;
  cx: number;
  rx: number;
  /** How high it rises above the line. */
  ry: number;
}

export interface ArcTimelineLayout {
  /** Conversation ids in date order, oldest first. */
  order: number[];
  /** Each conversation's centre along the line. */
  x: Map<number, number>;
  /** Room per conversation. */
  step: number;
  /** The width the timeline needs; wider than the card means it scrolls. */
  contentWidth: number;
  scrolls: boolean;
  /** The line's height in the card. */
  baseline: number;
  /** How wide a title may run under its dot. */
  titleWidth: number;
  /** Tallest first, so the shorter arcs are drawn over the longer ones. */
  arcs: TimelineArc[];
}

/** One key per pair, whichever way round the pair is given. */
export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function layoutArcTimeline({
  conversations,
  edges,
  width,
  height,
}: {
  conversations: TimelineConversation[];
  edges: TimelineEdge[];
  width: number;
  height: number;
}): ArcTimelineLayout {
  const order = [...conversations]
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    .map((conversation) => conversation.id);
  const count = order.length;
  const room = Math.max(0, width - MARGIN * 2);
  // Every conversation gets one column of the same width: "evenly spaced". A
  // timeline too long for the card gets as many whole columns as fit its width
  // exactly, so a scroll that stops on a column (`ArcTimeline` snaps to them)
  // shows every date and title whole, never cut at the card's edge.
  const visible = Math.max(1, Math.floor(room / MIN_STEP));
  const step = !count ? MIN_STEP : count <= visible ? room / count : room / visible;
  const contentWidth = Math.max(width, MARGIN * 2 + step * count);
  const x = new Map(order.map((id, index) => [id, MARGIN + step * (index + 0.5)]));
  const baseline = Math.max(TOP + 24, height - LABEL_BAND);
  const titleWidth = Math.max(0, Math.min(MAX_TITLE_WIDTH, step - 12));

  const tallest = Math.max(1, baseline - TOP - 6);
  const placed: TimelineArc[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const a = x.get(edge.from);
    const b = x.get(edge.to);
    if (a === undefined || b === undefined || edge.from === edge.to) continue;
    const key = edgeKey(edge.from, edge.to);
    if (seen.has(key)) continue;
    seen.add(key);
    const left = Math.min(a, b);
    const right = Math.max(a, b);
    const rx = (right - left) / 2;
    placed.push({ key, from: edge.from, to: edge.to, left, right, cx: left + rx, rx, ry: 0 });
  }
  const widest = placed.reduce((most, arc) => Math.max(most, arc.rx), 0);
  const floor = MIN_ARC_HEIGHT / (step / 2);
  const ratio = widest ? Math.min(MAX_ARC_RATIO, Math.max(floor, tallest / widest)) : MAX_ARC_RATIO;
  for (const arc of placed) arc.ry = Math.min(tallest, arc.rx * ratio);
  placed.sort((a, b) => b.rx - a.rx || a.key.localeCompare(b.key));

  return {
    order,
    x,
    step,
    contentWidth,
    scrolls: contentWidth > width + 0.5,
    baseline,
    titleWidth,
    arcs: placed,
  };
}

/** The arcs any part of which lies between `left` and `right`. */
export function arcsBetween(arcs: TimelineArc[], left: number, right: number): TimelineArc[] {
  return arcs.filter((arc) => arc.right >= left && arc.left <= right);
}

/**
 * The conversation under a point, if any: its dot, its date and its title
 * share one column, from just above the line to the bottom of the card.
 */
export function conversationAt(layout: ArcTimelineLayout, px: number, py: number): number | null {
  if (!layout.order.length || py < layout.baseline - 14) return null;
  const index = Math.floor((px - MARGIN) / layout.step);
  if (index < 0 || index >= layout.order.length) return null;
  return layout.order[index];
}
