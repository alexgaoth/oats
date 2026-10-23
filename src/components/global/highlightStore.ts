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
  hoveredDay: string | null;
  pointAtConversation: (id: number) => void;
  pointAtSubject: (label: string) => void;
  pointAtDay: (key: string) => void;
  /** Leaving only clears what is still the one pointed at: the next widget's
      enter can arrive before the last one's leave. */
  leaveConversation: (id: number) => void;
  leaveSubject: (label: string) => void;
  leaveDay: (key: string) => void;
  select: (id: number | null) => void;
  clear: () => void;
}

const NOTHING = {
  hoveredConversationId: null,
  hoveredSubject: null,
  selectedConversationId: null,
  hoveredDay: null,
};

export const useGlobalHighlight = create<HighlightStore>()((set, get) => ({
  ...NOTHING,
  pointAtConversation: (id) => {
    const state = get();
    if (state.hoveredConversationId === id && !state.hoveredSubject && !state.hoveredDay) return;
    set({ hoveredConversationId: id, hoveredSubject: null, hoveredDay: null });
  },
  pointAtSubject: (label) => {
    const state = get();
    if (
      state.hoveredSubject === label &&
      state.hoveredConversationId === null &&
      !state.hoveredDay
    ) {
      return;
    }
    set({ hoveredSubject: label, hoveredConversationId: null, hoveredDay: null });
  },
  pointAtDay: (key) => {
    const state = get();
    if (state.hoveredDay === key && state.hoveredConversationId === null && !state.hoveredSubject) {
      return;
    }
    set({ hoveredDay: key, hoveredConversationId: null, hoveredSubject: null });
  },
  leaveConversation: (id) => {
    if (get().hoveredConversationId === id) set({ hoveredConversationId: null });
  },
  leaveSubject: (label) => {
    if (get().hoveredSubject === label) set({ hoveredSubject: null });
  },
  leaveDay: (key) => {
    if (get().hoveredDay === key) set({ hoveredDay: null });
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
  graph: { nodes: { id: number }[]; edges: { from: number; to: number; topics?: string[] }[] },
  subjects: Subject[],
  days?: ReadonlyMap<string, number[]>
): HighlightSource {
  let last: HighlightState | null = null;
  let cached: Highlight = NO_HIGHLIGHT;
  const changed = (a: HighlightState, b: HighlightState) =>
    a.hoveredConversationId !== b.hoveredConversationId ||
    a.hoveredSubject !== b.hoveredSubject ||
    a.selectedConversationId !== b.selectedConversationId ||
    (a.hoveredDay ?? null) !== (b.hoveredDay ?? null);
  const get = () => {
    const state = useGlobalHighlight.getState();
    if (!last || changed(last, state)) {
      last = {
        hoveredConversationId: state.hoveredConversationId,
        hoveredSubject: state.hoveredSubject,
        selectedConversationId: state.selectedConversationId,
        hoveredDay: state.hoveredDay,
      };
      cached = linkedHighlight(graph, subjects, last, days);
    }
    return cached;
  };
  return {
    get,
    subscribe: (onChange) =>
      useGlobalHighlight.subscribe((state, previous) => {
        if (changed(state, previous)) onChange();
      }),
  };
}
