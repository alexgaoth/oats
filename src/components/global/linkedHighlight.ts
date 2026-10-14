// What lights up on the Global conversations board when you point at
// something, in every widget at once.
//
// Pointing at a conversation lights that conversation (honey), the edges and
// arcs that join it to others (ink) and the conversations at their far ends
// (kept at their resting tone); everything else recedes to the rule grey.
// Pointing at a subject lights the conversations that carry it and the edges
// and arcs that carry it. A selected conversation stays honey whether or not
// anything is pointed at, but on its own it makes nothing recede.
//
// Every widget asks this one function, so the force graph and the arc
// timeline can never disagree about what is lit. Pure, so it is tested.

import { edgeKey } from "./arcGeometry.ts";

export interface HighlightState {
  hoveredConversationId: number | null;
  hoveredSubject: string | null;
  selectedConversationId: number | null;
}

export interface Subject {
  label: string;
  conversationIds: number[];
}

export interface Highlight {
  /** Something is pointed at, so whatever is not lit recedes. */
  active: boolean;
  /** Honey: the conversations pointed at, and the selected one. */
  focus: ReadonlySet<number>;
  /** At their resting tone while the rest recedes: the far ends of lit edges. */
  related: ReadonlySet<number>;
  /** Ink: the edges and arcs that carry what is pointed at, by `edgeKey`. */
  edges: ReadonlySet<string>;
}

export const NO_HIGHLIGHT: Highlight = {
  active: false,
  focus: new Set(),
  related: new Set(),
  edges: new Set(),
};

interface GraphShape {
  nodes: { id: number }[];
  /** `topics`: the subjects an edge carries. Without them, an edge carries a
      subject when both its conversations do. */
  edges: { from: number; to: number; topics?: string[] }[];
}

export function linkedHighlight(
  graph: GraphShape,
  subjects: Subject[],
  state: HighlightState
): Highlight {
  const present = new Set(graph.nodes.map((node) => node.id));
  const focus = new Set<number>();
  const related = new Set<number>();
  const edges = new Set<string>();
  let active = false;

  const hovered = state.hoveredConversationId;
  if (hovered !== null && present.has(hovered)) {
    active = true;
    focus.add(hovered);
    for (const edge of graph.edges) {
      if (edge.from !== hovered && edge.to !== hovered) continue;
      edges.add(edgeKey(edge.from, edge.to));
      related.add(edge.from === hovered ? edge.to : edge.from);
    }
  } else if (state.hoveredSubject !== null) {
    // Two subjects can carry the same name; to the reader they are one.
    const members = new Set<number>();
    for (const subject of subjects) {
      if (subject.label !== state.hoveredSubject) continue;
      for (const id of subject.conversationIds) if (present.has(id)) members.add(id);
    }
    if (members.size) {
      active = true;
      for (const id of members) focus.add(id);
      const label = state.hoveredSubject;
      for (const edge of graph.edges) {
        const carries = edge.topics
          ? edge.topics.includes(label)
          : members.has(edge.from) && members.has(edge.to);
        if (carries) edges.add(edgeKey(edge.from, edge.to));
      }
    }
  }

  const selected = state.selectedConversationId;
  if (selected !== null && present.has(selected)) focus.add(selected);
  for (const id of focus) related.delete(id);

  if (!active && !focus.size) return NO_HIGHLIGHT;
  return { active, focus, related, edges };
}

/** How a conversation's mark is drawn under a highlight. */
export type MarkTone = "focus" | "rest" | "recede";

export function markTone(highlight: Highlight, id: number): MarkTone {
  if (highlight.focus.has(id)) return "focus";
  if (!highlight.active || highlight.related.has(id)) return "rest";
  return "recede";
}

/** How an edge or arc is drawn under a highlight. */
export type LineTone = "lit" | "rest" | "recede";

export function lineTone(highlight: Highlight, key: string): LineTone {
  if (!highlight.active) return "rest";
  return highlight.edges.has(key) ? "lit" : "recede";
}
