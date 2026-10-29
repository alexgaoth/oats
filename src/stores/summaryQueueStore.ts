import { useEffect, useRef } from "react";
import { create } from "zustand";
import {
  PENDING_SUMMARIES_KEY,
  needsSummary,
  nextPendingSummary,
  queueStopsAfter,
  readPendingSummaries,
  withPendingSummary,
  withoutPendingSummary,
} from "../helpers/summaryQueue.mjs";
import { summaryRouteKey } from "../helpers/remoteLinks.mjs";
import { parseDbTimestamp } from "../helpers/dbTime.mjs";
import { getSettings, selectResolvedNoteFormatting, useSettingsStore } from "./settingsStore";
import { useMeetingRecordingStore } from "./meetingRecordingStore";
import { useActionProcessingStore, type BackgroundActionOutcome } from "./actionProcessingStore";
import { currentWritingRoute } from "./conversationGroupSortStore";
import { watchModelDownloads } from "./modelDownloadStore";
import {
  localSummaryModelDownloaded,
  useSummaryReadinessState,
} from "../hooks/useSummaryReadiness";
import { summaryReadiness } from "../utils/summaryReadiness";
import type { NoteItem } from "../types/electron";
import logger from "../utils/logger";

// Summaries that start by themselves (helpers/summaryQueue.mjs has the rules).
//
// Finish writes the conversation down as owed before anything else can stop
// it, in localStorage, so it outlives a quit or a restart. When the writing
// model is ready, Finish writes the summary as it always has, and the entry is
// struck when it is saved. When the model is not ready (none chosen yet, or the
// one on this Mac still downloading) the entry waits, and this queue writes it
// once the model is ready: one conversation at a time, newest first, never
// while a conversation is recorded or finished, and never beside another
// summary, because a model on this Mac answers one request at a time.
//
// Privacy: no new destination and no new data. A summary goes to the writing
// model the person chose, by the route Finish uses (`summarizeConversation` in
// OatsWorkspace.tsx), and the queue sends a conversation to a cloud provider
// only if that provider was already the writing model when it finished
// (`queueMaySend`). One chosen since gets it when somebody opens it.

interface PendingSummary {
  id: number;
  at: number;
  route: string;
}

interface SummaryQueueState {
  /** Conversations Finish holds: stopped, and their summary not asked for yet. */
  finishing: number[];
  /** Conversations whose summary was started through `runSummary` and has not ended. */
  running: number[];
  /** Conversations whose summary was refused this session (no model, no action). */
  refused: number[];
}

const useSummaryQueueStore = create<SummaryQueueState>()(() => ({
  finishing: [],
  running: [],
  refused: [],
}));

function setMark(field: keyof SummaryQueueState, id: number, on: boolean): void {
  const list = useSummaryQueueStore.getState()[field];
  if (list.includes(id) === on) return;
  const next = on ? [...list, id] : list.filter((item) => item !== id);
  useSummaryQueueStore.setState({ [field]: next } as Partial<SummaryQueueState>);
}

/** The writing route now, as a summary records it ("local:", "providers:openai"). */
export function writingRouteKey(): string {
  const formatting = selectResolvedNoteFormatting(getSettings());
  return summaryRouteKey({
    mode: formatting.mode,
    provider: formatting.mode === "providers" ? formatting.provider : undefined,
  });
}

function loadQueue(): PendingSummary[] {
  try {
    return readPendingSummaries(localStorage.getItem(PENDING_SUMMARIES_KEY));
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingSummary[]): void {
  try {
    if (queue.length) localStorage.setItem(PENDING_SUMMARIES_KEY, JSON.stringify(queue));
    else localStorage.removeItem(PENDING_SUMMARIES_KEY);
  } catch {
    // Storage refused: the conversation is still summarized when opened.
  }
}

function log(event: string, detail?: Record<string, unknown>): void {
  // Ids, counts and outcomes only: never a title or a word of a conversation.
  void logger.debug(`Summary queue: ${event}`, detail, "summaries");
}

/**
 * Finish has stopped this conversation: from now on it is owed a summary, and
 * Finish holds it (nothing else starts its summary) until the returned
 * function is called, once Finish has asked for the summary or decided to
 * leave it to the queue.
 */
export function holdForFinish(noteId: number): () => void {
  saveQueue(
    withPendingSummary(loadQueue(), { id: noteId, at: Date.now(), route: writingRouteKey() })
  );
  setMark("finishing", noteId, true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setMark("finishing", noteId, false);
    kickSummaryQueue();
  };
}

/**
 * A conversation without a summary was opened while no writing model is
 * ready: it is owed one too, so the record's "as soon as one is" holds. Kept
 * where it was if it is owed already, and placed by when it was recorded.
 */
export function oweSummary(note: Pick<NoteItem, "id" | "created_at">): void {
  const queue = loadQueue();
  if (queue.some((item) => item.id === note.id)) return;
  const at = parseDbTimestamp(note.created_at);
  saveQueue(
    withPendingSummary(queue, {
      id: note.id,
      at: Number.isFinite(at) ? at : Date.now(),
      route: writingRouteKey(),
    })
  );
}

/** Its summary was saved, or failed twice, or there is nothing to summarize: struck. */
export function settleSummary(noteId: number): void {
  const queue = loadQueue();
  const next = withoutPendingSummary(queue, noteId);
  if (next !== queue) saveQueue(next);
}

/**
 * Run one conversation's summary with the queue's bookkeeping: never two at
 * once for one conversation, struck from the list once saved or failed (too
 * long for the model on this Mac included: the queue does not ask again), and
 * a refusal remembered so the record does not ask again and again.
 */
export async function runSummary(
  noteId: number,
  run: () => Promise<BackgroundActionOutcome>
): Promise<BackgroundActionOutcome> {
  if (useSummaryQueueStore.getState().running.includes(noteId)) return "busy";
  setMark("running", noteId, true);
  let outcome: BackgroundActionOutcome = "refused";
  try {
    outcome = await run();
  } catch {
    outcome = "refused";
  } finally {
    if (outcome === "saved" || outcome === "failed" || outcome === "too-long") {
      settleSummary(noteId);
    }
    setMark("refused", noteId, outcome === "refused");
    setMark("running", noteId, false);
    kickSummaryQueue();
  }
  return outcome;
}

// --- The queue itself.

// How often a waiting queue looks again: while a conversation is recorded or
// finished, or another summary is being written.
const BUSY_POLL_MS = 1000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let summarizer: ((note: NoteItem) => Promise<BackgroundActionOutcome>) | null = null;
let draining = false;
let stopped = false;

/** Whether something else has the writing model, or a conversation, now. */
function busy(): boolean {
  const { isRecording, isTranscribing } = useMeetingRecordingStore.getState();
  if (isRecording || isTranscribing) return true;
  const { finishing, running } = useSummaryQueueStore.getState();
  if (finishing.length || running.length) return true;
  return Object.values(useActionProcessingStore.getState().noteStates).some(
    (state) => state.status === "processing"
  );
}

/** Whether the writing model can answer now: chosen, and on disk if it runs here. */
async function readyNow(): Promise<boolean> {
  if (!currentWritingRoute()) return false;
  const formatting = selectResolvedNoteFormatting(getSettings());
  const verdict = summaryReadiness({
    mode: formatting.mode,
    model: formatting.model,
    remoteUrl: formatting.remoteUrl,
    localModelDownloaded: await localSummaryModelDownloaded(formatting.mode, formatting.model),
  });
  return verdict === "ready";
}

async function drain(): Promise<void> {
  let failedInARow = 0;
  for (;;) {
    if (stopped || !summarizer) return;
    if (busy()) {
      await delay(BUSY_POLL_MS);
      continue;
    }
    if (!(await readyNow())) return;
    const { refused } = useSummaryQueueStore.getState();
    const id = nextPendingSummary(loadQueue(), {
      route: writingRouteKey(),
      skip: (candidate: number) => refused.includes(candidate),
    });
    if (id === null) return;
    let note: NoteItem | null;
    try {
      note = (await window.electronAPI?.getNote?.(id)) ?? null;
    } catch {
      // The database did not answer: the next kick tries again.
      return;
    }
    if (!note || note.deleted_at || note.note_type !== "meeting" || !needsSummary(note)) {
      // Deleted, summarized some other way, or nothing to summarize.
      settleSummary(id);
      continue;
    }
    // Something may have started while the note was read.
    if (busy() || stopped) continue;
    log("start", { noteId: id });
    const outcome = await summarizer(note);
    log("end", { noteId: id, outcome });
    // The model went away, or the summary was stopped: the next kick
    // (readiness, a change of model) starts again.
    if (outcome === "refused" || outcome === "cancelled") return;
    // One conversation that fails twice is that conversation; its record says
    // so. Several in a row is the model, and the rest wait for the next kick
    // rather than each failing in turn (helpers/summaryQueue.mjs). Too long
    // for the model is the conversation's length, never the model's fault.
    failedInARow = outcome === "failed" ? failedInARow + 1 : 0;
    if (queueStopsAfter(failedInARow)) return;
  }
}

/** Look at the list now, unless it is being worked through already. */
export function kickSummaryQueue(): void {
  if (draining || stopped || !summarizer) return;
  draining = true;
  void drain()
    .catch((error) => log("stopped", { error: error instanceof Error ? error.message : "" }))
    .finally(() => {
      draining = false;
    });
}

/**
 * The queue, mounted once in the workspace. `summarize` writes one
 * conversation's summary the way the record does, by `runSummary`; the queue
 * runs whenever the writing model is ready, from the first launch after a quit
 * and again whenever the model or its route changes.
 */
export function useSummaryQueue(summarize: (note: NoteItem) => Promise<BackgroundActionOutcome>) {
  const latest = useRef(summarize);
  latest.current = summarize;
  useEffect(() => {
    summarizer = (note) => latest.current(note);
    stopped = false;
    watchModelDownloads();
    // Quitting stops the queue before its next conversation; the one cut off
    // stays owed and is written at the next launch.
    const stop = () => {
      stopped = true;
    };
    window.addEventListener("beforeunload", stop);
    return () => {
      summarizer = null;
      window.removeEventListener("beforeunload", stop);
    };
  }, []);

  const { readiness } = useSummaryReadinessState();
  const route = useWritingRouteKey();
  useEffect(() => {
    if (readiness !== "ready") return;
    // A model that is ready again may write what it refused before.
    if (useSummaryQueueStore.getState().refused.length) {
      useSummaryQueueStore.setState({ refused: [] });
    }
    kickSummaryQueue();
  }, [readiness, route]);
}

/** The writing route now, as a summary records it, kept current. */
export function useWritingRouteKey(): string {
  return useSettingsStore((state) => {
    const formatting = selectResolvedNoteFormatting(state);
    return summaryRouteKey({
      mode: formatting.mode,
      provider: formatting.mode === "providers" ? formatting.provider : undefined,
    });
  });
}

/** What the queue knows of one conversation, for its record. */
export function useSummaryQueueMarks(noteId: number | null): {
  finishing: boolean;
  running: boolean;
  refused: boolean;
  /** Finish holds some conversation now: this one or another. */
  anyFinishing: boolean;
} {
  const finishing = useSummaryQueueStore((state) =>
    noteId === null ? false : state.finishing.includes(noteId)
  );
  const running = useSummaryQueueStore((state) =>
    noteId === null ? false : state.running.includes(noteId)
  );
  const refused = useSummaryQueueStore((state) =>
    noteId === null ? false : state.refused.includes(noteId)
  );
  const anyFinishing = useSummaryQueueStore((state) => state.finishing.length > 0);
  return { finishing, running, refused, anyFinishing };
}
