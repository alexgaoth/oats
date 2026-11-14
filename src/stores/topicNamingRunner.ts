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
import { LiveTopicLoop, chooseFastModel, readJson } from "../helpers/topicLoop.mjs";
import { WindowTopicLoop } from "../helpers/topicWindowLoop.mjs";
import { cutRecord, RECORD_MINUTES_PER_TOPIC } from "../helpers/topicRecordCut.mjs";
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
// card shows its topics; the record takes the cut the model gives at Finish
// (`recordTopicStarts`), else the tracker's, with these names carried over
// and #121's final names for the topics they do not cover. A topic the check named is not sent to #121 again. When the check
// ends early (three failures in a row, or the writing model is no longer that
// provider's), the flow card goes back to the tracker's topics and #121 names
// them as on any other route.
//
// With the writing model on this computer, the window loop
// (helpers/topicWindowLoop.mjs) takes the check's place while the recording
// can name live (`namesLive`): every 2 minutes the model re-cuts the last 6
// minutes and names the topics, on the writing server when the recording
// holds one. The rest is as above.
let loop: LiveTopicLoop | WindowTopicLoop | null = null;
/** The provider of the check that runs now, so a change of writing model ends it. */
let loopProvider: "openai" | "anthropic" | null = null;
/** The local writing model of the window loop that runs now, so a change of model ends it. */
let loopLocalModel: string | null = null;
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
/**
 * Whether this recording's names go to a server of the writing model's own,
 * beside the question classifier's (helpers/writingServer.js). Main starts it
 * on the first name, keeps it through the recording and the names at Finish,
 * and stops it before the summary.
 */
let writingServer = false;

/** Tells main what the writing server is for now. False when it has none. */
async function setWritingServer(mode: "hold" | "idle" | "stop"): Promise<boolean> {
  try {
    const answer = await window.electronAPI?.llamaWritingServer?.(mode);
    return answer?.dedicated === true;
  } catch {
    return false;
  }
}

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
  const config = topicNameConfig(route, prompt.system);
  return reasoningService.processText(
    prompt.text,
    route.modelId,
    null,
    writingServer && route.mode === "local" ? { ...config, serverRole: "writing" } : config
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

/** Whether the window loop may still ask: the same model on this computer, and ready. */
async function windowLoopReady(): Promise<boolean> {
  const route = currentWritingRoute();
  if (!loopLocalModel || route?.mode !== "local" || route.modelId !== loopLocalModel) return false;
  return writingModelReady();
}

/** One request of the window loop, to the writing model on this computer. */
async function askLocalModel(request: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const route = currentWritingRoute();
  if (!route || route.mode !== "local") throw new Error("No local writing model");
  return reasoningService.processText(request.user, route.modelId, null, {
    ...topicNameConfig(route, request.system),
    maxTokens: request.maxTokens,
    ...(writingServer ? { serverRole: "writing" as const } : {}),
  });
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
  const input = { mode: route.mode, model: route.modelId, classifier, classifierOnDisk };
  if (namesWhileRecording(input)) return true;
  // The classifier would take turns with the writing model in one server: on
  // a Mac that has the memory, the writing model gets a server of its own.
  writingServer = await setWritingServer("hold");
  log("writing-server", { dedicated: writingServer });
  return namesWhileRecording({ ...input, dedicatedWritingServer: writingServer });
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
  loopLocalModel = null;
  waitingLines = null;
  writingServer = false;
  const mine = ++generation;
  const route = currentWritingRoute();
  // No writing model: the topics keep their on-device names, and nothing is sent.
  if (!route) return;
  // OpenAI or Anthropic with a key: the live topic check names the topics
  // while recording, so the namer only names the record at Finish. The writing
  // model on this computer, when it may name while recording: the window loop,
  // the same way. Every other route: #121.
  const provider = topicProvider(route);
  if (provider || route.mode === "local") waitingLines = [];
  const fast = provider ? await topicModelFor(provider, "check") : null;
  if (mine !== generation) return;
  if (fast && stoppedGeneration === mine) {
    waitingLines = null;
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
    const waited = waitingLines ?? [];
    waitingLines = null;
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
  const waited = waitingLines ?? [];
  waitingLines = null;
  if (live && route.mode === "local" && stoppedGeneration !== mine) {
    loopLocalModel = route.modelId;
    loop = new WindowTopicLoop({
      ask: askLocalModel,
      ready: windowLoopReady,
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
    log("started", { mode: route.mode, live: false, loop: "window" });
    if (waited.length) onChange();
    return;
  }
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
  // The names at Finish still use the writing server; if Finish never asks
  // (nothing was heard), it stops after the usual idle time.
  if (writingServer) void setWritingServer("idle");
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

/** A request of the record's cut (topicRecordCut.mjs `ask`). */
type RecordCutRequest = {
  kind: string;
  system: string;
  user: string;
  schema: { name: string; schema: object };
  maxTokens: number;
  timeoutMs: number;
};

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Where the record's topics start, by turn id, as the writing model reads the
 * whole conversation when it ends (helpers/topicRecordCut.mjs). Null when no
 * writing model is ready or none gave a usable answer: the record then keeps
 * the tracker's cuts.
 *
 * The same privacy rule and route as the names. With OpenAI or Anthropic as
 * the writing model, the request goes to that provider's check model
 * (topicModels.mjs), the most accurate one measured at telling a change of
 * subject, with the asked JSON. Every other route asks the writing model
 * itself, on the writing server while the recording holds one, and reads the
 * JSON from its answer.
 */
export async function recordTopicStarts(
  utterances: Array<{ id: string; text: string; at: number }>,
  mine: number = generation
): Promise<string[] | null> {
  const route = currentWritingRoute();
  if (!route || !utterances.length || mine !== generation) return null;
  if (!(await writingModelReady())) return null;
  const provider = topicProvider(route);
  const choice = provider ? await topicModelFor(provider, "check") : null;
  const ask = async (request: RecordCutRequest) => {
    // A new recording started: the writing model is its own now.
    if (mine !== generation) return { ok: false };
    const work =
      provider && choice
        ? askFastModel(provider, choice, request)
        : reasoningService.processText(request.user, route.modelId, null, {
            ...topicNameConfig(route, request.system),
            maxTokens: request.maxTokens,
            timeoutMs: request.timeoutMs,
            ...(writingServer && route.mode === "local" ? { serverRole: "writing" as const } : {}),
          });
    const json = readJson(await withTimeout(work, request.timeoutMs));
    return json ? { ok: true, json } : { ok: false };
  };
  const started = Date.now();
  const result = await cutRecord({
    ask,
    utterances,
    minutesPerTopic: RECORD_MINUTES_PER_TOPIC,
  }).catch(() => null);
  // Counts and times only.
  log("record-cut", {
    ms: Date.now() - started,
    requests: result?.calls.length ?? 0,
    topics: result ? result.starts.length + 1 : 0,
  });
  return result ? result.starts : null;
}

/**
 * Which recording the topics are named for now. Finish reads it before it
 * awaits anything: a recording that starts meanwhile has a namer of its own,
 * which Finish must not stop.
 */
export function topicNamingGeneration(): number {
  return generation;
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
  segments: TranscriptSegment[],
  mine: number = generation
): Promise<void> {
  if (mine !== generation) return;
  try {
    await nameFinal(noteId, snapshot, segments);
  } finally {
    // Stopped before the summary loads the writing model in the default
    // server, so the model is never in memory twice.
    if (writingServer && mine === generation) {
      writingServer = false;
      await setWritingServer("stop");
    }
  }
}

async function nameFinal(
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
