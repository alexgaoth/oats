import { useCallback } from "react";
import type { FieldView } from "./fieldViews";

// Where each screen's content stands, for the field mode backdrop.
//
// Each screen's content column registers itself with the screen it is
// (`useFieldColumn("record")` as its ref). The backdrop reads the one in the
// pane that is showing, measures it, and composes the field around it
// (fieldViews.ts). Registering on mount, rather than the backdrop searching the
// DOM, is what lets it notice a column swap that changes nothing else on the
// page: the list giving way to a record, Home giving way to the recording. It
// costs a map entry in work mode, where nothing reads it.

const columns = new Map<HTMLElement, FieldView>();
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

/** Call `listener` whenever a column mounts, unmounts or changes screen. */
export function subscribeFieldColumns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The column in the pane that is showing, and the screen it belongs to. */
export function activeFieldColumn(): { element: HTMLElement; view: FieldView } | null {
  for (const [element, view] of columns) {
    if (!element.isConnected) continue;
    if (element.closest("main")?.getAttribute("data-active") === "true") return { element, view };
  }
  return null;
}

/** A ref for a screen's content column: the backdrop keeps the world clear of it. */
export function useFieldColumn(view: FieldView) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) return undefined;
      columns.set(element, view);
      changed();
      return () => {
        columns.delete(element);
        changed();
      };
    },
    [view]
  );
}
