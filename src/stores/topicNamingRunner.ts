import reasoningService from "../services/ReasoningService";
import type { ReasoningConfig } from "../services/BaseReasoningService";
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
  nameStillFits,
  namesOf,
  namesWhileRecording,
  topicNameConfig,
} from "../helpers/topicNaming.mjs";
import { LiveTopicLoop, chooseFastModel } from "../helpers/topicLoop.mjs";
import {
  checkRequestConfig,
  nameRequestConfig,
  topicModelChoice,
  topicModelIds,
  topicProvider,
  type TopicModel,
} from "../helpers/topicModels.mjs";
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
// words of each topic it names. With OpenAI or Anthropic as the writing
// model, the names come from that provider's most accurate model for them
// (topicModels.mjs), by the same key and to the same host. Its requests are
// counted with the rest (docs/network-allowlist.md).

/** The namer of the recording now, or of the one that just ended, until the next starts. */
let namer: TopicNamer | null = null;
let generation = 0;

// The live topic check (helpers/topicLoop.mjs): with OpenAI or Anthropic as
// the writing model, that provider's most accurate model for it
// (topicModels.mjs) confirms the changes of subject the on-device tracker
// proposes, and names the topics, while the conversation goes on. The flow
// card shows its topics; the record keeps the tracker's cut at Finish, with
// these names carried over and #121's final names for the topics they do not
// cover. A topic the check named is not sent to #121 again. When the check
// ends early (three failures in a row, or the writing model is no longer that
// provider's), the flow card goes back to the tracker's topics and #121 names
// them as on any other route.
let loop: LiveTopicLoop | null = null;
/** The provider of the check that runs now, so a change of writing model ends it. */
let loopProvider: "openai" | "anthropic" | null = null;
/**
 * The topic model each provider's key can use, per job ("openai:check",
 * "anthropic:names", ...): absent until asked, null when it can use none.
 * Asked once per session (`chooseFastModel`), again only when the answer could
 * not be told.
 */
const sessionModels = new Map<string, TopicModel | null>();
/** This sitting's lines that landed while the fast model was being checked, for the loop once it starts. */
let waitingLines: TranscriptSegment[] | null = null;
/** The recording whose check was stopped: one still being set up for it does not start. */
let stoppedGeneration = 0;

function log(event: string, detail?: Record<string, unknown>): void {
  // Counts and times only: never a name or a word of the conversation.
  void logger.debug(`Topic names: ${event}`, detail, "topics");
}

/**
 * One naming prompt, by the summary's route: to the provider's naming model
 * when the writing model is OpenAI's or Anthropic's and the key can use it
 * (topicModels.mjs), else to the writing model itself.
 */
async function askNamer(prompt: { system: string; text: string }): Promise<string> {
  const route = currentWritingRoute();
  if (!route) throw new Error("No writing model");
  const provider = topicProvider(route);
  const choice = provider ? await topicModelFor(provider, "names") : null;
  if (choice) {
    return reasoningService.processText(
      prompt.text,
      choice.model,
      null,
      nameRequestConfig(choice, route, prompt.system)
    );
  }
  return reasoningService.processText(
    prompt.text,
    route.modelId,
    null,
    topicNameConfig(route, prompt.system)
  );
}

function loopLog(event: string, detail?: Record<string, unknown>): void {
  // Counts and times only: never a name or a word of the conversation.
  void logger.debug(`Live topics: ${event}`, detail, "topics");
}

/** The topic model this session's key can use for a job, asked of the provider once a session. */
async function topicModelFor(
  provider: "openai" | "anthropic",
  job: "names" | "check"
): Promise<TopicModel | null> {
  const key = `${provider}:${job}`;
  if (sessionModels.has(key)) return sessionModels.get(key) ?? null;
  const available =
    provider === "openai"
      ? (candidate: string) => reasoningService.openAiModelAvailable(candidate)
      : (candidate: string) => reasoningService.anthropicModelAvailable(candidate);
  const { model, settled } = await chooseFastModel(available, topicModelIds(provider, job));
  const choice = model ? topicModelChoice(provider, job, model) : null;
  if (settled) sessionModels.set(key, choice);
  loopLog("topic-model", { provider, job, model, settled });
  return choice;
}

/** One request of the live topic check: the model's effort, the answer as the asked JSON. */
async function askFastModel(
  provider: "openai" | "anthropic",
  choice: TopicModel,
  request: {
    system: string;
    user: string;
    schema: { name: string; schema: object };
    maxTokens: number;
  }
): Promise<string> {
  const config = checkRequestConfig(provider, choice, request);
  return reasoningService.processText(request.user, choice.model, null, {
    ...config,
    reasoningEffort: config.reasoningEffort as ReasoningConfig["reasoningEffort"],
    responseSchema: request.schema as { name: string; schema: Record<string, unknown> },
  });
}

/** Whether the live topic check may still ask: the writing model is still that provider's. */
function loopReady(): boolean {
  return loopProvider !== null && topicProvider(currentWritingRoute()) === loopProvider;
}

/**
 * The names for a snapshot of the tracker's topics: the live check's, on the
 * topics that hold the lines they were given from, and the namer's where it
 * named a topic itself and that name still fits.
 */
function mergedNames(current: TopicNamer, snapshot: ConversationTopicSnapshot) {
  const names = new Map(loop ? loop.namesFor(snapshot) : []);
  const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
  for (const [id, record] of current.names) {
    if (!names.has(id) || nameStillFits(byId.get(id), record)) names.set(id, record);
  }
  return names;
}

/**
 * The live check ended before the recording did: the namer takes over, as on
 * any other route, and does not ask again for the topics the check named.
 */
function namerTakesOver(mine: number): void {
  const current = namer;
  if (!current || current.live || !loop || mine !== generation) return;
  if (current.snapshot) {
    for (const [id, record] of mergedNames(current, current.snapshot))
      current.names.set(id, record);
  }
  const route = currentWritingRoute();
  if (!route) return;
  void namesLive(route).then((live) => {
    if (!live || mine !== generation || namer !== current) return;
    current.live = true;
    log("live-after-check", { mode: route.mode });
  });
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
 * `onChange` publishes the topics again when a name changes.
 */
export async function startTopicNaming(onChange: () => void): Promise<void> {
  namer?.stop();
  namer = null;
  loop?.stop();
  loop = null;
  loopProvider = null;
  waitingLines = null;
  const mine = ++generation;
  const route = currentWritingRoute();
  // No writing model: the topics keep their on-device names, and nothing is sent.
  if (!route) return;
  // OpenAI or Anthropic with a key: the live topic check names the topics
  // while recording, so the namer only names the record at Finish. Every other
  // route: #121.
  const provider = topicProvider(route);
  if (provider) waitingLines = [];
  const fast = provider ? await topicModelFor(provider, "check") : null;
  if (mine !== generation) return;
  const waited = waitingLines ?? [];
  waitingLines = null;
  if (fast && stoppedGeneration === mine) {
    // The recording ended while the fast model was being asked for: no check
    // starts after it, and nothing more is sent while it is not recording.
    namer = new TopicNamer({
      ask: askNamer,
      ready: writingModelReady,
      onChange,
      live: false,
      log,
    });
    return;
  }
  if (fast && provider) {
    loopProvider = provider;
    loop = new LiveTopicLoop({
      ask: (request: {
        system: string;
        user: string;
        schema: { name: string; schema: object };
        maxTokens: number;
      }) => askFastModel(provider, fast, request),
      ready: loopReady,
      onChange: () => {
        if (loop?.disabled) namerTakesOver(mine);
        onChange();
      },
      log: loopLog,
    });
    namer = new TopicNamer({
      ask: askNamer,
      ready: writingModelReady,
      onChange,
      live: false,
      log,
    });
    for (const segment of waited) observeUtterance(segment);
    log("started", { mode: route.mode, live: false, loop: fast.model });
    if (waited.length) onChange();
    return;
  }
  const live = await namesLive(route);
  if (mine !== generation) return;
  namer = new TopicNamer({
    ask: askNamer,
    ready: writingModelReady,
    onChange,
    live,
    log,
  });
  log("started", { mode: route.mode, live });
}

/** The tracker's latest snapshot and the segments, on every turn. */
export function observeTopics(
  snapshot: ConversationTopicSnapshot | null,
  segments: TranscriptSegment[]
): void {
  namer?.observe(snapshot, segments);
}

/** Each finalized line, for the live topic check when it runs. */
export function observeUtterance(segment: TranscriptSegment): void {
  if (loop) {
    loop.onUtterance({ id: segment.id, text: segment.text, at: segment.timestamp ?? Date.now() });
  } else if (waitingLines) {
    waitingLines.push(segment);
  }
}

/** A question asked on a line was answered: the live topic it is in reached a conclusion. */
export function resolveLiveTopic(utteranceId: string): void {
  loop?.resolveTopicForUtterance(utteranceId);
}

/** No more requests from the live topic check: the recording stopped. */
export function stopLiveTopics(): void {
  loop?.stop();
  stoppedGeneration = generation;
  waitingLines = null;
}

/**
 * What the flow card draws now: the live topic check's topics while it runs
 * (topics it has not named show the tracker's names), else the tracker's
 * topics with their names. After three failed requests in a row the check
 * stops, and the tracker's view comes back.
 */
export function liveTopicSnapshot<T extends ConversationTopicSnapshot | null | undefined>(
  tracked: T
): T {
  if (loop && !loop.disabled && tracked) {
    return loop.snapshot(Date.now(), { device: tracked }) as unknown as T;
  }
  return namedTopicSnapshot(tracked);
}

/**
 * A snapshot of the tracker's topics with this recording's names on it. The
 * same snapshot when there are none. With the live topic check, its names go
 * on the tracker's topics that hold the lines they were given from, and a
 * name the namer gave itself comes first where it still fits.
 */
export function namedTopicSnapshot<T extends ConversationTopicSnapshot | null | undefined>(
  snapshot: T
): T {
  if (!namer || !snapshot) return snapshot;
  if (loop) return applyTopicNames(snapshot, mergedNames(namer, snapshot)) as T;
  return namer.apply(snapshot) as T;
}

function readSnapshot(raw: unknown): ConversationTopicSnapshot | null {
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
  const stored = readSnapshot(note.conversation_topics);
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
  // The live topic check's names, on the record's topics that hold the lines
  // they were given from: the namer asks only for what they do not cover.
  if (loop) {
    loop.stop();
    for (const [id, record] of mergedNames(current, snapshot)) current.names.set(id, record);
  }
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
