import { create } from "zustand";
import { NO_HIGHLIGHT, linkedHighlight } from "./linkedHighlight";
import type { Highlight, HighlightState, Subject } from "./linkedHighlight";

// What is pointed at on the Global conversations board, shared by every
// widget on it. A widget writes here when the pointer or the keyboard focus
// reaches one of its conversations or subjects, and every widget redraws from
// it, so the same conversation lights up everywhere at once.
//
// The canvases subscribe to this store directly rather than through React, so
// pointing at something redraws the pictures and re-renders nothing.

interface HighlightStore extends HighlightState {
  pointAtConversation: (id: number) => void;
  pointAtSubject: (label: string) => void;
  /** Leaving only clears what is still the one pointed at: the next widget's
      enter can arrive before the last one's leave. */
  leaveConversation: (id: number) => void;
  leaveSubject: (label: string) => void;
  select: (id: number | null) => void;
  clear: () => void;
}

const NOTHING: HighlightState = {
  hoveredConversationId: null,
  hoveredSubject: null,
  selectedConversationId: null,
};

export const useGlobalHighlight = create<HighlightStore>()((set, get) => ({
  ...NOTHING,
  pointAtConversation: (id) => {
    if (get().hoveredConversationId === id && get().hoveredSubject === null) return;
    set({ hoveredConversationId: id, hoveredSubject: null });
  },
  pointAtSubject: (label) => {
    if (get().hoveredSubject === label && get().hoveredConversationId === null) return;
    set({ hoveredSubject: label, hoveredConversationId: null });
  },
  leaveConversation: (id) => {
    if (get().hoveredConversationId === id) set({ hoveredConversationId: null });
  },
  leaveSubject: (label) => {
    if (get().hoveredSubject === label) set({ hoveredSubject: null });
  },
  select: (id) => {
    if (get().selectedConversationId !== id) set({ selectedConversationId: id });
  },
  clear: () => set(NOTHING),
}));

/** What a widget draws from: the current highlight, and a way to hear it change. */
export interface HighlightSource {
  get(): Highlight;
  subscribe(onChange: () => void): () => void;
}

/**
 * The highlight for one tab's graph, as a source a canvas can subscribe to.
 * Computed once per change of what is pointed at, and shared by every widget
 * that asks for the same graph.
 */
export function highlightSource(
  graph: { nodes: { id: number }[]; edges: { from: number; to: number }[] },
  subjects: Subject[]
): HighlightSource {
  let last: HighlightState | null = null;
  let cached: Highlight = NO_HIGHLIGHT;
  const get = () => {
    const state = useGlobalHighlight.getState();
    if (
      !last ||
      last.hoveredConversationId !== state.hoveredConversationId ||
      last.hoveredSubject !== state.hoveredSubject ||
      last.selectedConversationId !== state.selectedConversationId
    ) {
      last = {
        hoveredConversationId: state.hoveredConversationId,
        hoveredSubject: state.hoveredSubject,
        selectedConversationId: state.selectedConversationId,
      };
      cached = linkedHighlight(graph, subjects, last);
    }
    return cached;
  };
  return {
    get,
    subscribe: (onChange) =>
      useGlobalHighlight.subscribe((state, previous) => {
        if (
          state.hoveredConversationId !== previous.hoveredConversationId ||
          state.hoveredSubject !== previous.hoveredSubject ||
          state.selectedConversationId !== previous.selectedConversationId
        ) {
          onChange();
        }
      }),
  };
}
