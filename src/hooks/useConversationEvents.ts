import { useCallback, useEffect, useState } from "react";
import type { ConversationEvent } from "../types/conversationEvents";

// Loads a note's persisted conversation-aide events. Exposed as a hook so the
// editor can both decide whether to offer the Graph view and hand the loaded
// events straight to the graph without a second round-trip.
export function useConversationEvents(noteId: number | null) {
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (noteId == null || !window.electronAPI?.listConversationEvents) {
      setEvents([]);
      setLoaded(true);
      return;
    }
    try {
      const result = await window.electronAPI.listConversationEvents(noteId);
      setEvents(Array.isArray(result) ? result : []);
    } catch {
      setEvents([]);
    } finally {
      setLoaded(true);
    }
  }, [noteId]);

  useEffect(() => {
    setLoaded(false);
    reload();
  }, [reload]);

  return { events, loaded, reload };
}
