import reasoningService from "../services/ReasoningService";
import { getSettings } from "./settingsStore";
import {
  currentWritingRoute,
  writingModelReady,
  type WritingRoute,
} from "./conversationGroupSortStore";
import { useMeetingRecordingStore, type TranscriptSegment } from "./meetingRecordingStore";
import { localSummaryModelDownloaded } from "../hooks/useSummaryReadiness";
import { TopicNamer } from "../helpers/topicNamer.mjs";
import {
  applyTopicNames,
  namesOf,
  namesWhileRecording,
  topicNameConfig,
} from "../helpers/topicNaming.mjs";
import type { ConversationTopicSnapshot } from "../types/conversationEvents";
import logger from "../utils/logger";

// Topic names from the writing model, for the recording now.
//
// "Layered": topics are always found and named on this computer
// (conversationTopics.mjs). When the person has chosen a writing model, it
// names them better as they grow, and once more when the conversation ends
// (topicNamer.mjs says when, topicNaming.mjs how). The recording store puts
// the names on every snapshot it publishes and saves, so the lanes, the graph,
// the record and the export to Obsidian all show them; a topic the model has
// not named keeps its on-device name, and a failure leaves it there.
//
// Privacy: the same rule as the summary. There is no request unless a writing
// model is chosen and ready (`writingModelReady`, asked before every request),
// and the request goes by the summary's own route (`currentWritingRoute`): a
// model on this computer keeps everything here, and a cloud provider gets the
// words of each topic it names. Its requests are counted with the rest
// (docs/network-allowlist.md).

/** The namer of the recording now, or of the one that just ended, until the next starts. */
let namer: TopicNamer | null = null;
/** The names a continued conversation's saved record has, while it has no namer. */
let kept: ReturnType<typeof namesOf> | null = null;
let generation = 0;

function log(event: string, detail?: Record<string, unknown>): void {
  // Counts and times only: never a name or a word of the conversation.
  void logger.debug(`Topic names: ${event}`, detail, "topics");
}

/** One prompt to the writing model, by the summary's route. */
async function askWritingModel(prompt: { system: string; text: string }): Promise<string> {
  const route = currentWritingRoute();
  if (!route) throw new Error("No writing model");
  return reasoningService.processText(
    prompt.text,
    route.modelId,
    null,
    topicNameConfig(route, prompt.system)
  );
}

/** Whether this recording's topics are named as they grow, or only at the end. */
async function namesLive(route: WritingRoute): Promise<boolean> {
  if (route.mode !== "local") return true;
  const settings = getSettings();
  const classifier =
    settings.conversationAideEnabled && settings.conversationAideInRoomEnabled
      ? settings.conversationAideModel
      : "";
  const classifierOnDisk =
    classifier && classifier !== route.modelId
      ? await localSummaryModelDownloaded("local", classifier)
      : null;
  return namesWhileRecording({
    mode: route.mode,
    model: route.modelId,
    classifier,
    classifierOnDisk,
  });
}

/**
 * A recording starts: its topics get a namer when a writing model is chosen.
 * `onChange` publishes the topics again when a name changes. `record` is the
 * saved topics of the conversation it continues, if any: the names the model
 * gave them stay on them, by topic id, as names given in this recording do.
 */
export async function startTopicNaming(
  onChange: () => void,
  record: ConversationTopicSnapshot | null = null
): Promise<void> {
  namer?.stop();
  namer = null;
  kept = record ? namesOf(record) : null;
  const mine = ++generation;
  const route = currentWritingRoute();
  // No writing model: the topics keep their on-device names, and nothing is sent.
  if (!route) return;
  const live = await namesLive(route);
  if (mine !== generation) return;
  namer = new TopicNamer({
    ask: askWritingModel,
    ready: writingModelReady,
    onChange,
    live,
    log,
    names: kept,
  });
  log("started", { mode: route.mode, live, kept: kept?.size ?? 0 });
}

/** The tracker's latest snapshot and the segments, on every turn. */
export function observeTopics(
  snapshot: ConversationTopicSnapshot | null,
  segments: TranscriptSegment[]
): void {
  namer?.observe(snapshot, segments);
}

/** A snapshot with this recording's names on it. The same snapshot when there are none. */
export function namedTopicSnapshot<T extends ConversationTopicSnapshot | null | undefined>(
  snapshot: T
): T {
  if (namer) return namer.apply(snapshot) as T;
  return kept ? (applyTopicNames(snapshot, kept) as T) : snapshot;
}

/** A conversation's topics as the note stores them, or null. */
export function readTopicSnapshot(raw: unknown): ConversationTopicSnapshot | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.nodes) ? (parsed as ConversationTopicSnapshot) : null;
  } catch {
    return null;
  }
}

/** Put the names on the record as stored, unless the conversation is being recorded again. */
async function writeNames(noteId: number, named: ConversationTopicSnapshot): Promise<void> {
  const recording = useMeetingRecordingStore.getState();
  if (recording.isRecording && recording.recordingNoteId === noteId) return;
  const api = window.electronAPI;
  const note = await api?.getNote?.(noteId);
  if (!note || note.deleted_at) return;
  const stored = readTopicSnapshot(note.conversation_topics);
  if (!stored) return;
  // By topic id, and only where the stored topic is still the one named.
  const merged = applyTopicNames(stored, namesOf(named));
  if (merged === stored) return;
  const result = await api.updateNote(noteId, { conversation_topics: JSON.stringify(merged) });
  log("saved", { noteId, saved: Boolean(result?.success) });
}

/**
 * The recording ended and its topics were saved: the model names what is left
 * for the record (topics still unnamed, and topics that grew since their name),
 * and the names are written onto the saved topics.
 *
 * Resolves when the summary may use the writing model. On this computer the
 * model answers one request at a time, and a summary that went first would
 * hold the names behind it for as long as it writes, past the time a request
 * waits for its turn (oneAtATime.js). So there the names go first, within
 * `FINAL_BUDGET_MS`. A provider or a server of the person's own answers both at
 * once, and the summary does not wait.
 */
export async function nameFinalTopics(
  noteId: number | null,
  snapshot: ConversationTopicSnapshot | null,
  segments: TranscriptSegment[]
): Promise<void> {
  const current = namer;
  if (!current || !noteId || !snapshot) return;
  const local = currentWritingRoute()?.mode === "local";
  const work = (async () => {
    const named = (await current.finish(snapshot, segments)) as ConversationTopicSnapshot;
    const { requests, named: names, unusable, failed } = current.stats;
    log("finished", { requests, names, unusable, failed });
    if (named && named !== snapshot) await writeNames(noteId, named);
  })().catch((error: unknown) =>
    log("final-failed", { error: error instanceof Error ? error.message : String(error) })
  );
  if (local) await work;
}
