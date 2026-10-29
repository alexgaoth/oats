import { useEffect, useMemo, useSyncExternalStore } from "react";
import { linkTexts } from "../../helpers/conversationLinks.mjs";
import { useSettingsStore } from "../../stores/settingsStore";
import type { BoardConversation } from "./boardData";

// The vectors the board links topics by (`conversationLinks.mjs`): each topic
// name, embedded once by the bundled all-MiniLM-L6-v2 in the main process
// (`embed-texts`), kept for the session. Nothing leaves the computer.
//
// The model reads English, so the board links by meaning only when Oats
// listens for English (`preferredLanguage`); otherwise, and when the model is
// not on disk, it links by words as before (`subjectThreads`). Until the
// first vectors arrive it shows the word links too, so the board is never
// empty while the model loads.

/** Texts per request: what `embed-texts` takes at once. */
const BATCH = 64;

const vectors = new Map<string, Float32Array>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
let queue: string[] = [];
let running = false;
let unavailable = false;
let version = 0;
/** The board has been drawn by meaning this session. */
let drawnByMeaning = false;

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One request at a time, so a long board never queues work without bound. */
async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length && !unavailable) {
      const batch = queue.splice(0, BATCH);
      const embed = window.electronAPI?.embedTexts;
      let result: Awaited<ReturnType<NonNullable<typeof embed>>> | null = null;
      try {
        result = embed ? await embed(batch) : null;
      } catch {
        result = null;
      }
      const list = result?.success ? result.vectors : null;
      if (!Array.isArray(list) || list.length !== batch.length) {
        // No model on disk, or it failed: words for the rest of the session.
        unavailable = true;
        break;
      }
      batch.forEach((text, index) => vectors.set(text, Float32Array.from(list[index] ?? [])));
      changed();
    }
  } finally {
    running = false;
    changed();
  }
}

/** A reader of the vectors as they are at `at` (a version; only its identity matters). */
function readerAt(at: number) {
  const reader = (text: string): Float32Array | null => vectors.get(text) ?? null;
  reader.version = at;
  return reader;
}

export interface TopicVectors {
  /** Link by meaning: on, and every topic the board shows had a vector once. */
  ready: boolean;
  /** A new function whenever new vectors arrive, so what reads it is redrawn. */
  vectorOf: (text: string) => Float32Array | null;
}

/** The meaning of every topic on the board, as it becomes known. */
export function useTopicVectors(conversations: BoardConversation[]): TopicVectors {
  const english = useSettingsStore((state) => state.preferredLanguage === "en");
  const texts = useMemo(() => (english ? linkTexts(conversations) : []), [conversations, english]);
  const current = useSyncExternalStore(subscribe, () => version);
  // The vectors live outside React; a new reader per version is what tells
  // the board's memo that there are more of them.
  const vectorOf = useMemo(() => readerAt(current), [current]);

  useEffect(() => {
    if (!english || unavailable) return;
    const missing = texts.filter((text) => !asked.has(text));
    if (!missing.length) return;
    for (const text of missing) asked.add(text);
    queue = queue.concat(missing);
    void pump();
  }, [english, texts]);

  // Once the board has been drawn by meaning, a new conversation's topics
  // join it as their vectors arrive, rather than the board falling back to
  // words for that second.
  const everyOne = texts.every((text) => vectors.has(text));
  const ready = english && !unavailable && (everyOne || drawnByMeaning);
  if (ready) drawnByMeaning = true;
  return { ready, vectorOf };
}
