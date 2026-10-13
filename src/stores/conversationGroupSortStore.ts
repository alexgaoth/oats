import { create } from "zustand";
import type { TFunction } from "i18next";
import i18n from "../i18n";
import reasoningService from "../services/ReasoningService";
import type { ReasoningConfig } from "../services/BaseReasoningService";
import {
  getSettings,
  selectIsCloudNoteFormattingMode,
  selectResolvedNoteFormatting,
} from "./settingsStore";
import { useMeetingRecordingStore } from "./meetingRecordingStore";
import { groupDisplayName, loadConversationGroups } from "./conversationGroupStore";
import { buildNoteFormattingOverrides } from "../helpers/noteFormattingOverrides";
import {
  buildGroupSortPrompt,
  parseGroupSortAnswer,
  runGroupSortBackfill,
  summaryExcerpt,
  topicLabels,
} from "../helpers/conversationGroupSort.mjs";
import { isRegenerableNoteTitle } from "../helpers/regenerableNoteTitle";
import { localSummaryModelDownloaded } from "../hooks/useSummaryReadiness";
import { summaryReadiness } from "../utils/summaryReadiness";
import logger from "../utils/logger";

// The writing model sorts conversations into groups: once after each summary,
// and in the background for conversations nobody has sorted.
//
// Privacy: there is no new destination. The model is the one that writes the
// title and the summary, reached by the same route (`buildNoteFormattingOverrides`,
// as in actionProcessingStore.ts), and it reads only the title, the topic
// labels and the opening of the summary (helpers/conversationGroupSort.mjs).
// After a summary, that is less than the provider was just sent. The
// background sort runs only on a model on this computer or the person's own
// server: conversations summarized before may never have left this computer,
// and a cloud provider chosen since does not get them unasked.

/** Which model writes, and how to reach it: what the summary uses. */
export interface WritingRoute {
  modelId: string;
  /** The writing mode: "local", "providers" or "self-hosted". */
  mode: string;
  config: ReasoningConfig;
}

/** Why a background run stopped. */
export type ConversationSortStop =
  | "stopped" // the app is quitting, or somebody stopped it
  | "no-model" // no writing model is ready
  | "model-failed" // the model failed to answer
  | "no-groups" // there is no group to sort into
  | "cloud-model"; // the writing model is a cloud provider (see above)

/** Sent as `oats-conversation-sort-progress` and held by `useConversationSortProgress`. */
export type ConversationSortProgress =
  | { state: "idle" }
  | { state: "running"; current: number; total: number }
  | { state: "done"; done: number; total: number }
  | { state: "stopped"; reason: ConversationSortStop; done: number; total: number };

export type ConversationSortResult = Exclude<
  ConversationSortProgress,
  { state: "idle" } | { state: "running" }
>;

export type GroupSortOutcome =
  | {
      kind: "sorted";
      groupId: number | null;
      answer: "group" | "none" | "unreadable";
      ms: number;
      written: boolean;
    }
  | {
      kind: "skipped";
      reason:
        "unavailable" | "gone" | "chosen" | "no-summary" | "no-groups" | "yielded" | "stopped";
    };

/** The window event that starts a background run, for code that cannot import this. */
export const SORT_CONVERSATIONS_EVENT = "oats-sort-conversations";
/** The window event each change of `ConversationSortProgress` is sent as. */
export const CONVERSATION_SORT_PROGRESS_EVENT = "oats-conversation-sort-progress";

// Where the background run is allowed: a model on this computer, or the
// person's own server.
const BACKGROUND_MODES = new Set(["local", "self-hosted"]);
// A name is a few tokens; this bounds a model that rambles instead of
// answering. Not set for a cloud provider, as for the title, nor while the
// model is allowed to think, since its thinking counts against it.
const SORT_MAX_TOKENS = 64;
// How often a waiting background run looks again.
const BUSY_POLL_MS = 1000;
// The longest a summary waits for the background run's request in flight.
const FOREGROUND_WAIT_MS = 30_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const useConversationSortStore = create<{ progress: ConversationSortProgress }>()(() => ({
  progress: { state: "idle" },
}));

function publish(progress: ConversationSortProgress): void {
  useConversationSortStore.setState({ progress });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONVERSATION_SORT_PROGRESS_EVENT, { detail: progress }));
}

/** How the background run is going ("Sorting 4 of 37" while it runs). */
export function useConversationSortProgress(): ConversationSortProgress {
  return useConversationSortStore((state) => state.progress);
}

/** The writing model the summary uses now, or null when there is none to use. */
export function currentWritingRoute(): WritingRoute | null {
  const settings = getSettings();
  const noteFormatting = selectResolvedNoteFormatting(settings);
  const isCloudMode = selectIsCloudNoteFormattingMode(settings);
  // The two refusals runBackgroundAction makes before a summary.
  if (!noteFormatting.model && !isCloudMode) return null;
  if (!isCloudMode && noteFormatting.mode === "self-hosted" && !noteFormatting.remoteUrl) {
    return null;
  }
  return {
    modelId: noteFormatting.model,
    mode: noteFormatting.mode,
    config: {
      ...buildNoteFormattingOverrides(noteFormatting, isCloudMode, noteFormatting.customApiKey),
      disableThinking: noteFormatting.disableThinking,
    },
  };
}

// --- Sharing the model with the summary.
//
// On this computer the writing model answers one request at a time
// (localReasoningBridge.js refuses a second), so the background run steps
// aside: it starts nothing while a summary or a recording needs the model,
// and a summary waits for the request it has in flight.

let foreground = 0;
let inFlight: Promise<unknown> | null = null;

/**
 * A summary is about to use the writing model. Resolves once the background
 * run's request in flight has ended; call the release function when done.
 */
export async function claimWritingModel(): Promise<() => void> {
  foreground += 1;
  const pending = inFlight;
  if (pending) {
    await Promise.race([pending.then(noop, noop), delay(FOREGROUND_WAIT_MS)]);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    foreground = Math.max(0, foreground - 1);
  };
}

function noop(): void {}

/** Whether something else needs the writing model now. */
function modelBusy(): boolean {
  const { isRecording, isTranscribing } = useMeetingRecordingStore.getState();
  return foreground > 0 || isRecording || isTranscribing;
}

// --- Sorting one conversation.

/**
 * Ask the writing model which group a conversation belongs in, and write its
 * answer, unless a person has chosen. Reads the conversation and the groups
 * fresh. Throws when the model fails or says nothing.
 *
 * @param options.background The background run: only a conversation nobody
 *   has sorted, and it gives way (`yielded`) if a summary claimed the model.
 * @param options.shouldWrite Asked between the answer and the write: false
 *   once the run was stopped, so nothing is written after a stop.
 */
export async function sortConversationIntoGroup(
  noteId: number,
  route: WritingRoute,
  {
    background = false,
    shouldWrite = () => true,
  }: { background?: boolean; shouldWrite?: () => boolean } = {}
): Promise<GroupSortOutcome> {
  const api = window.electronAPI;
  if (!api?.setConversationGroupFromModel || !api.getNote) {
    return { kind: "skipped", reason: "unavailable" };
  }
  const note = await api.getNote(noteId);
  if (!note || note.deleted_at) return { kind: "skipped", reason: "gone" };
  if (note.group_source === "user" || (background && note.group_source)) {
    return { kind: "skipped", reason: "chosen" };
  }
  const summary = summaryExcerpt(note.enhanced_content);
  if (!summary) return { kind: "skipped", reason: "no-summary" };
  const groups = await loadConversationGroups();
  if (!groups.length) return { kind: "skipped", reason: "no-groups" };
  if (background && foreground > 0) return { kind: "skipped", reason: "yielded" };

  const t = i18n.t.bind(i18n) as TFunction;
  const names = groups.map((group) => groupDisplayName(group, t));
  const placeholder = isRegenerableNoteTitle(note.title, [t("oats.untitled")]);
  const prompt = buildGroupSortPrompt({
    title: placeholder ? null : note.title,
    summary,
    topics: topicLabels(note.conversation_topics),
    groups: names,
  });
  const capped = route.mode !== "providers" && route.config.disableThinking !== false;
  const started = performance.now();
  const answer = await reasoningService.processText(prompt.text, route.modelId, null, {
    ...route.config,
    systemPrompt: prompt.systemPrompt,
    temperature: 0,
    ...(capped ? { maxTokens: SORT_MAX_TOKENS } : {}),
  });
  const ms = Math.round(performance.now() - started);
  const read = parseGroupSortAnswer(answer, names);
  if (read.kind === "empty") throw new Error("The writing model gave no answer");
  if (!shouldWrite()) return { kind: "skipped", reason: "stopped" };

  const groupId = read.kind === "group" ? groups[read.index].id : null;
  const written = await api.setConversationGroupFromModel(noteId, groupId);
  void logger.debug(
    "Conversation sorted",
    { noteId, answer: read.kind, groupId, ms, written: Boolean(written?.success) },
    "conversation-groups"
  );
  return { kind: "sorted", groupId, answer: read.kind, ms, written: Boolean(written?.success) };
}

// --- The background run.

let activeRun: Promise<ConversationSortResult> | null = null;
let stopRequested = false;

/** Whether the background run may use the model now, or why not. */
async function backgroundReadiness(): Promise<true | ConversationSortStop> {
  const route = currentWritingRoute();
  if (!route) return "no-model";
  if (!BACKGROUND_MODES.has(route.mode)) return "cloud-model";
  const noteFormatting = selectResolvedNoteFormatting(getSettings());
  const verdict = summaryReadiness({
    mode: noteFormatting.mode,
    model: noteFormatting.model,
    remoteUrl: noteFormatting.remoteUrl,
    localModelDownloaded: await localSummaryModelDownloaded(
      noteFormatting.mode,
      noteFormatting.model
    ),
  });
  return verdict === "ready" ? true : "no-model";
}

async function runInBackground(): Promise<ConversationSortResult> {
  const stop = (reason: ConversationSortStop, total = 0): ConversationSortResult => {
    const result: ConversationSortResult = { state: "stopped", reason, done: 0, total };
    publish(result);
    return result;
  };
  const verdict = await backgroundReadiness();
  if (verdict !== true) return stop(verdict);
  let ids: number[] = [];
  try {
    ids = (await window.electronAPI?.listUnsortedConversations?.()) ?? [];
  } catch {
    ids = [];
  }
  if (!ids.length) {
    const result: ConversationSortResult = { state: "done", done: 0, total: 0 };
    publish(result);
    return result;
  }
  if (!(await loadConversationGroups()).length) return stop("no-groups", ids.length);

  const result = await runGroupSortBackfill({
    ids,
    ready: backgroundReadiness,
    busy: modelBusy,
    stopped: () => stopRequested,
    waitForModel: () => delay(BUSY_POLL_MS),
    progress: publish,
    sortOne: async (id: number) => {
      const route = currentWritingRoute();
      if (!route) throw new Error("No writing model");
      const call = sortConversationIntoGroup(id, route, {
        background: true,
        shouldWrite: () => !stopRequested,
      });
      inFlight = call;
      try {
        return await call;
      } finally {
        if (inFlight === call) inFlight = null;
      }
    },
  });
  return result as ConversationSortResult;
}

/**
 * Sort, in the background and one at a time, every finished conversation
 * nobody has put in a group. Runs only while a writing model on this computer
 * or the person's own server is ready, steps aside for recordings and
 * summaries, and stops when the app quits or the model goes away. Progress
 * goes to `useConversationSortProgress` and the
 * `oats-conversation-sort-progress` window event.
 *
 * Calling it while a run is going returns that run.
 */
export function sortUnsortedConversations(): Promise<ConversationSortResult> {
  if (activeRun) return activeRun;
  stopRequested = false;
  activeRun = runInBackground().finally(() => {
    activeRun = null;
  });
  return activeRun;
}

/** Stop the background run before its next conversation; nothing more is written. */
export function stopSortingConversations(): void {
  stopRequested = true;
}

if (typeof window !== "undefined") {
  // For a surface that starts a run without importing this module.
  window.addEventListener(SORT_CONVERSATIONS_EVENT, () => void sortUnsortedConversations());
  window.addEventListener("beforeunload", stopSortingConversations);
}
