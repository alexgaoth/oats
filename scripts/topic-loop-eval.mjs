#!/usr/bin/env node
/**
 * Topics with a fast model in the loop: replay conversations through a topic
 * variant on a virtual clock, with real model requests, and measure the live
 * view, the record and the cost. `docs/fast-models.md` has the method and the
 * results.
 *
 *   node scripts/topic-loop-eval.mjs --variant <v> [--model <provider:model[@opts]>]
 *     (--ami <dir> [--set eval24|test|tune|all] [--meetings a,b]
 *      | --asr <room-replay.json> --ami <dir> | --transcript <note.json>)
 *     [--tracker <conversationTopics.mjs>] [--concurrency 4] [--label name]
 *     [--local-model <gguf> --llama-server <binary>] [--json out.json]
 *
 * Variants
 *   d0, d1   the on-device trackers alone, no model: d0 the tracker before
 *            #123 (`--tracker`, from bff2230), d1 main's. Free baselines.
 *   v0, v1   the same trackers plus the app's own topic namer
 *            (`helpers/topicNamer.mjs`, #121) asking `--model`.
 *   v2       the model places new lines every few seconds (TurnsLoop).
 *   v3       the model re-cuts the last few minutes about once a minute (WindowLoop).
 *   v4       the tracker proposes, the model decides and names (HybridLoop).
 *   v4app    v4 as the app ships it (`helpers/topicLoop.mjs`): the record is
 *            the tracker's cut at Finish, with the loop's names carried over
 *            and #121's final pass for the rest. `--options` takes
 *            `{"loop": {...}}`, the module's options (`moveHorizonMs`).
 *   vf       no live view: the model cuts and names the record at Finish.
 *   V2 to V4 get the app's final naming pass at Finish, as V0 and V1 do.
 *
 * Sources
 *   --ami        AMI meeting corpus manual annotations (CC BY 4.0); each meeting
 *                replayed from its manual transcript, cut at pauses.
 *   --asr        the far-field recognition output of `scripts/room-replay.js`
 *                (#122) for AMI meetings: what the app heard in the room.
 *   --transcript a stored note's segments. Private: only counts and timings are
 *                printed and written, never a word or a topic name, unless
 *                --show-labels. Only models on this computer may read it:
 *                any other provider is refused.
 *
 * Measured, per meeting and in total
 *   segmentation  Pk, WindowDiff, topics and runs against AMI's human
 *                 top-level topics (as `scripts/topic-eval.mjs` in #123), for
 *                 the live view at the end of the meeting and for the record.
 *   live view     changes of subject drawn within a minute of a real one, and
 *                 how long after it; lines moved to another topic once shown
 *                 (older than 30 s); topic names changed per hour; how long a
 *                 line waits for its model-decided topic.
 *   names         per human topic segment: the name the view showed 30 s
 *                 after it ended, and the record's name, for the blind judge
 *                 (`scripts/topic-names-judge.mjs`).
 *   cost          requests, failures, malformed answers, latency p50/p95, and
 *                 input, cached and output tokens and dollars per hour.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  ask as askModel,
  bootstrapMean,
  mean,
  parseSpec,
  percentile,
  startLocalServer,
  stopLocalServers,
} from "./lib/fast-models.mjs";
import {
  amiMeetingIds,
  amiRecognized,
  amiReference,
  annotationsDir,
  assignmentOf,
  humanSegments,
  segmentExcerpt,
  referenceLabels,
  segmentationScores,
  storedTranscript,
  topicNames,
} from "./lib/topic-corpus.mjs";
import { HybridLoop, TurnsLoop, WindowLoop, cutRecord } from "./lib/topic-loop-variants.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = (name) => import(pathToFileURL(path.join(ROOT, "src/helpers", name)).href);
const { TopicNamer } = await helper("topicNamer.mjs");
const { LiveTopicLoop } = await helper("topicLoop.mjs");

const { values: args } = parseArgs({
  options: {
    variant: { type: "string" },
    model: { type: "string" },
    ami: { type: "string" },
    asr: { type: "string" },
    transcript: { type: "string" },
    set: { type: "string", default: "eval24" },
    meetings: { type: "string" },
    tracker: { type: "string" },
    "device-tracker": { type: "string" },
    concurrency: { type: "string", default: "4" },
    label: { type: "string" },
    json: { type: "string" },
    "local-model": { type: "string" },
    "llama-server": { type: "string" },
    "local-port": { type: "string", default: "18451" },
    "local-context": { type: "string", default: "8192" },
    "show-labels": { type: "boolean", default: false },
    vectors: { type: "boolean", default: false },
    options: { type: "string", default: "{}" },
    quiet: { type: "boolean", default: false },
  },
});

const VARIANT = args.variant;
if (!["d0", "d1", "v0", "v1", "v2", "v3", "v4", "v4app", "vf"].includes(VARIANT)) {
  console.error("--variant d0|d1|v0|v1|v2|v3|v4|v4app|vf");
  process.exit(2);
}
const SPEC = args.model ?? null;
if (!VARIANT.startsWith("d") && !SPEC) {
  console.error("--model provider:model is needed for this variant");
  process.exit(2);
}
const OPTIONS = JSON.parse(args.options);
const LABEL = args.label ?? `${VARIANT}${SPEC ? `:${SPEC}` : ""}`;

// The on-device tracker: main's (#123 since 0cf56b9), or another by file. V0 is
// the tracker before #123: `git show bff2230:src/helpers/conversationTopics.mjs`.
const MAIN_TRACKER = path.join(ROOT, "src/helpers/conversationTopics.mjs");
if ((VARIANT === "d0" || VARIANT === "v0") && !args.tracker) {
  console.error("d0 and v0 replay the tracker before #123: pass it with --tracker <file>");
  process.exit(2);
}
const trackerFile = args.tracker ? path.resolve(args.tracker) : MAIN_TRACKER;
const { ConversationTopicTracker } = await import(pathToFileURL(trackerFile).href);
// --vectors: the on-device names chosen by meaning (#124), with the bundled
// all-MiniLM-L6-v2 run here as the app's ONNX worker runs it. Local only.
const embedder = args.vectors
  ? await (
      await import(pathToFileURL(path.join(ROOT, "scripts/topic-eval.mjs")).href)
    ).createEmbedder()
  : null;

// --- Conversations.

function evalSet(dir) {
  const ids = amiMeetingIds(dir);
  const test = ids.filter((id) => /^(ES2004|IS1009|TS3003)/.test(id));
  const tune = ids.filter((id) => !test.includes(id));
  // Twelve tuning meetings, spread over the corpus: every k-th by name.
  const step = Math.floor(tune.length / 12);
  const spread = Array.from(
    { length: 12 },
    (_, index) => tune[index * step + Math.floor(step / 2)]
  );
  return { test, tune, eval24: [...test, ...spread], all: ids };
}

function loadConversations() {
  if (args.transcript) {
    if (SPEC && parseSpec(SPEC).provider !== "local") {
      console.error("A stored transcript is read by models on this computer only (local:...).");
      process.exit(2);
    }
    const value = JSON.parse(fs.readFileSync(args.transcript, "utf8"));
    return [storedTranscript(path.basename(args.transcript, ".json"), value)];
  }
  if (!args.ami) {
    console.error("--ami <dir> (with --asr for recognition output) or --transcript <file>");
    process.exit(2);
  }
  const dir = annotationsDir(args.ami);
  const names = topicNames(dir);
  if (args.asr) {
    const replay = JSON.parse(fs.readFileSync(args.asr, "utf8"));
    const wanted = args.meetings ? new Set(args.meetings.split(",")) : null;
    return replay.recordings
      .filter((recording) => !wanted || wanted.has(recording.summary.meeting))
      .map((recording) => amiRecognized(dir, recording.summary.meeting, names, recording.segments));
  }
  const sets = evalSet(dir);
  const ids = args.meetings ? args.meetings.split(",") : sets[args.set];
  if (!ids) {
    console.error(`Unknown --set ${args.set}`);
    process.exit(2);
  }
  return ids.map((id) => amiReference(dir, id, names));
}

// --- A virtual clock: timers in conversation time, model answers landing when they would have.

class VirtualClock {
  constructor() {
    this.time = 0;
    this.seq = 0;
    this.timers = new Map();
    this.inflight = new Set();
  }

  now = () => this.time;

  setTimer = (fn, ms) => this.at(this.time + Math.max(0, Number(ms) || 0), fn);

  clearTimer = (id) => {
    this.timers.delete(id);
  };

  at(time, fn) {
    const id = ++this.seq;
    this.timers.set(id, { at: Math.max(time, this.time), fn, id });
    return id;
  }

  /** The earliest timer due by `until`, removed, or null. */
  take(until) {
    let best = null;
    for (const timer of this.timers.values()) {
      if (
        timer.at <= until &&
        (!best || timer.at < best.at || (timer.at === best.at && timer.id < best.id))
      )
        best = timer;
    }
    if (best) this.timers.delete(best.id);
    return best;
  }

  /** Lets async code run, and waits for model requests that are out. */
  async settle() {
    for (let round = 0; round < 200; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      if (this.inflight.size) {
        await Promise.all([...this.inflight]);
        continue;
      }
      await new Promise((resolve) => setImmediate(resolve));
      if (!this.inflight.size) return;
    }
  }
}

// V4's proposer: main's tracker drawing cuts early and often (high recall);
// the model throws out the wrong ones. Chosen on the dev meetings: 72% of the
// real changes proposed, a median 1.5 min after them.
const PROPOSER = {
  scale: {
    settleSpan: 20,
    settlePersist: 0,
    settleWindowMin: 15,
    settleMinWords: 40,
    cut: 0.5,
    minDepth: 0.08,
  },
};

// --- One conversation through one variant.

function makeAsk(clock, calls) {
  return (request) => {
    const startedAt = clock.time;
    const real = askModel(SPEC, {
      parseJson: true,
      purpose: `${VARIANT}:${request.kind ?? "name"}`,
      ...request,
    });
    const gate = real.then(
      () => undefined,
      () => undefined
    );
    clock.inflight.add(gate);
    gate.then(() => clock.inflight.delete(gate));
    return real.then(
      (result) =>
        new Promise((resolve) => {
          calls.push({
            kind: request.kind ?? "name",
            at: startedAt,
            ms: result.ms,
            ok: result.ok,
            usage: result.usage,
            cost: result.cost,
            error: result.ok ? null : result.error,
          });
          // The answer lands when it would have: the request took this long.
          clock.at(startedAt + (result.ok ? result.ms : (result.ms ?? 5_000)), () =>
            resolve(result)
          );
        })
    );
  };
}

/** The app's naming ask (`{ system, text }` to a string), on the experiment's ask. */
function namerAsk(ask, answers = null) {
  return async ({ system, text }) => {
    const result = await ask({ kind: "name", system, user: text, maxTokens: 400 });
    if (!result.ok) throw new Error(result.error);
    // The raw answers of #121's naming requests, to study the names it refuses.
    answers?.push({ prompt: text, answer: result.text });
    return result.text;
  };
}

/** Runs a promise to its end, firing timers in time order while it waits. */
async function drive(clock, promise) {
  let done = false;
  let value;
  let failure = null;
  promise.then(
    (result) => {
      done = true;
      value = result;
    },
    (error) => {
      done = true;
      failure = error;
    }
  );
  for (let guard = 0; guard < 100_000; guard += 1) {
    await clock.settle();
    if (done) break;
    const timer = clock.take(Infinity);
    if (!timer) {
      await clock.settle();
      if (done) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
      continue;
    }
    clock.time = Math.max(clock.time, timer.at);
    timer.fn();
  }
  if (failure) throw failure;
  return value;
}

function labelsOf(nodes) {
  return new Map(nodes.map((node) => [String(node.id), node.label]));
}

/**
 * Whether a shown name is the model's: V0 and V1 put the on-device name in
 * `deviceLabel` once the model named a topic; V4 marks the topics it has not
 * named yet; every other variant's names are the model's.
 */
function modelNamed(node) {
  if (VARIANT.startsWith("d")) return false;
  if (VARIANT === "v0" || VARIANT === "v1" || VARIANT === "v4app")
    return typeof node.deviceLabel === "string";
  return !node.deviceNamed;
}

async function runConversation(conversation) {
  const clock = new VirtualClock();
  const calls = [];
  const ask = SPEC ? makeAsk(clock, calls) : null;
  const utterances = conversation.utterances;
  const segments = [];
  const nameAnswers = [];
  let display;
  let finishLive;
  let variantStats = null;

  // Each variant shows a snapshot; `display()` reads what the flow card shows now.
  if (VARIANT === "d0" || VARIANT === "d1" || VARIANT === "v0" || VARIANT === "v1") {
    const tracker = new ConversationTopicTracker({
      now: clock.now,
      ...(OPTIONS.trackerOptions ?? {}),
    });
    const namer =
      VARIANT === "v0" || VARIANT === "v1"
        ? new TopicNamer({
            ask: namerAsk(ask, nameAnswers),
            now: clock.now,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
          })
        : null;
    display = {
      async onUtterance(utterance) {
        tracker.onUtterance({ id: utterance.id, text: utterance.text, at: utterance.at });
        if (embedder && typeof tracker.addVectors === "function") {
          // As the feeder does (topicVectors.mjs), with no wait: the turn and the phrases asked.
          const phrases = tracker.phrasesToEmbed(47);
          const vectors = await embedder.embed([
            utterance.text,
            ...phrases.map((phrase) => phrase.text),
          ]);
          tracker.addVectors({
            utterances: [[utterance.id, vectors[0]]],
            phrases: phrases.map((phrase, index) => [phrase.key, vectors[index + 1]]),
          });
        }
        segments.push({ id: utterance.id, text: utterance.text, timestamp: utterance.at });
        namer?.observe(tracker.snapshot(clock.time), [...segments]);
      },
      snapshot() {
        const raw = tracker.snapshot(clock.time);
        return namer ? namer.apply(raw) : raw;
      },
    };
    finishLive = async () => {
      const final = tracker.snapshot(clock.time, { final: true });
      const named = namer ? await drive(clock, namer.finish(final, [...segments])) : final;
      variantStats = namer
        ? {
            calls: namer.stats.requests,
            ok: namer.stats.named,
            failed: namer.stats.failed,
            malformed: namer.stats.unusable,
          }
        : null;
      return named;
    };
  } else if (VARIANT === "v4app") {
    // V4 as the app ships it (helpers/topicLoop.mjs, stores/topicNamingRunner.ts):
    // the flow card shows the loop; the record is the on-device tracker's cut at
    // Finish, with the loop's names carried over and #121's final pass on top.
    const device = new ConversationTopicTracker({
      now: clock.now,
      ...(OPTIONS.trackerOptions ?? {}),
    });
    const loop = new LiveTopicLoop({
      ask: async (request) => {
        const result = await ask({ ...request, maxTokens: request.maxTokens });
        if (!result.ok) throw new Error(result.error);
        return result.text;
      },
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      ...(OPTIONS.loop ?? {}),
    });
    const namer = new TopicNamer({
      ask: namerAsk(ask, nameAnswers),
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      live: false,
    });
    display = {
      async onUtterance(utterance) {
        device.onUtterance({ id: utterance.id, text: utterance.text, at: utterance.at });
        if (embedder && typeof device.addVectors === "function") {
          const phrases = device.phrasesToEmbed(47);
          const vectors = await embedder.embed([
            utterance.text,
            ...phrases.map((phrase) => phrase.text),
          ]);
          device.addVectors({
            utterances: [[utterance.id, vectors[0]]],
            phrases: phrases.map((phrase, index) => [phrase.key, vectors[index + 1]]),
          });
        }
        segments.push({ id: utterance.id, text: utterance.text, timestamp: utterance.at });
        loop.onUtterance({ id: utterance.id, text: utterance.text, at: utterance.at });
      },
      snapshot() {
        const onDevice = device.snapshot(clock.time);
        return loop.disabled ? onDevice : loop.snapshot(clock.time, { device: onDevice });
      },
    };
    finishLive = async () => {
      loop.stop();
      const final = device.snapshot(clock.time, { final: true });
      for (const [id, record] of loop.namesFor(final)) namer.names.set(id, record);
      const named = await drive(clock, namer.finish(final, [...segments]));
      variantStats = {
        ...loop.stats,
        ms: undefined,
        calls: loop.stats.requests,
        sentLines: loop.sentIds.size,
        lines: loop.lines.length,
        finalNaming: { requests: namer.stats.requests, named: namer.stats.named },
      };
      return named;
    };
  } else if (VARIANT === "vf") {
    display = { onUtterance() {}, snapshot: () => ({ nodes: [], edges: [] }) };
    finishLive = async () => {
      const result = await drive(clock, cutRecord({ ask, utterances, ...OPTIONS }));
      variantStats = result.stats;
      return result.snapshot;
    };
  } else {
    const common = {
      ask,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      ...OPTIONS,
    };
    const loop =
      VARIANT === "v2"
        ? new TurnsLoop(common)
        : VARIANT === "v3"
          ? new WindowLoop(common)
          : new HybridLoop({
              ...common,
              tracker: new ConversationTopicTracker({
                now: clock.now,
                ...(OPTIONS.trackerOptions ?? PROPOSER),
              }),
            });
    display = {
      onUtterance(utterance) {
        segments.push({ id: utterance.id, text: utterance.text, timestamp: utterance.at });
        loop.onUtterance(utterance);
      },
      snapshot: () => loop.snapshot(clock.time),
    };
    finishLive = async () => {
      const final = await drive(clock, loop.finish());
      variantStats = loop.stats;
      // The app's final naming pass (#121), over the model's own names.
      const namer = new TopicNamer({
        ask: namerAsk(ask, nameAnswers),
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        live: false,
      });
      for (const node of final.nodes) {
        const topic = loop.book.topics.get(node.id);
        if (!topic || topic.unnamed) continue;
        namer.names.set(node.id, {
          name: topic.name,
          words: topic.namedWords || loop.book.words(node.id),
          namings: 1,
          utteranceIds: [...node.utteranceIds],
        });
      }
      const named = await drive(clock, namer.finish(final, [...segments]));
      variantStats.finalNaming = { requests: namer.stats.requests, named: namer.stats.named };
      return named;
    };
  }

  // --- The live view, watched.
  const human = conversation.topics ? humanSegments(conversation) : [];
  const queries = human
    .map((segment) => ({ segment, at: segment.end * 1000 + 30_000 }))
    .sort((a, b) => a.at - b.at);
  const liveNames = new Map();
  const answerQueries = (before, snapshot) => {
    while (queries.length && queries[0].at < before) {
      const { segment } = queries.shift();
      liveNames.set(segment.key, nameFor(segment, snapshot.nodes));
    }
  };

  const shownAt = new Map(); // utterance id -> first time it was in a topic
  const settledAt = new Map(); // utterance id -> last time its topic changed
  const lastTopic = new Map(); // utterance id -> topic shown now
  const lastLabel = new Map(); // topic id -> label shown now
  const lastNamed = new Map(); // topic id -> whether the model named it
  const labelChanges = [];
  let moved = 0;
  let movedOld = 0;
  let removedTopics = 0;
  const atOf = new Map(utterances.map((utterance) => [String(utterance.id), utterance.at]));
  const startOf = new Map(
    utterances.map((utterance) => [String(utterance.id), utterance.start * 1000])
  );
  // Changes of subject: the reference's, and when the view first drew one within a minute of each.
  const reference = conversation.topics ? referenceLabels(conversation) : null;
  const realChanges = [];
  if (reference) {
    reference.forEach((label, index) => {
      if (index && label !== reference[index - 1]) realChanges.push(utterances[index].start * 1000);
    });
  }
  const found = new Array(realChanges.length).fill(null);
  let takenBack = 0;
  let lastBoundaries = new Map();
  let lastSnapshot = { nodes: [], edges: [] };

  const observe = () => {
    const snapshot = display.snapshot();
    lastSnapshot = snapshot;
    const now = clock.time;
    const topicOf = new Map();
    for (const node of snapshot.nodes)
      for (const id of node.utteranceIds ?? []) topicOf.set(String(id), String(node.id));
    for (const [id, topic] of topicOf) {
      if (!shownAt.has(id)) {
        shownAt.set(id, now);
        settledAt.set(id, now);
      }
      const before = lastTopic.get(id);
      if (before !== undefined && before !== topic) {
        moved += 1;
        settledAt.set(id, now);
        if (now - (atOf.get(id) ?? now) > 30_000) movedOld += 1;
      }
      lastTopic.set(id, topic);
    }
    const labels = labelsOf(snapshot.nodes);
    const named = new Map(snapshot.nodes.map((node) => [String(node.id), modelNamed(node)]));
    for (const [id, label] of labels) {
      const before = lastLabel.get(id);
      if (before !== undefined && before !== label) {
        const from = lastNamed.get(id) ?? false;
        const to = named.get(id) ?? false;
        // first: the on-device name gives way to the model's; rename: one
        // model name to another; device: the on-device name itself changed.
        const kind = from && to ? "rename" : !from && to ? "first" : from ? "back" : "device";
        labelChanges.push({ at: now, id, from: before, to: label, kind });
      }
    }
    lastNamed.clear();
    for (const [id, value] of named) lastNamed.set(id, value);
    for (const id of lastLabel.keys()) if (!labels.has(id)) removedTopics += 1;
    lastLabel.clear();
    for (const [id, label] of labels) lastLabel.set(id, label);
    // Boundaries drawn now: the lines where the shown topic changes.
    const boundaries = new Map();
    let previous = null;
    for (const utterance of utterances) {
      const topic = topicOf.get(String(utterance.id));
      if (topic === undefined) continue;
      if (previous !== null && topic !== previous)
        boundaries.set(String(utterance.id), utterance.start * 1000);
      previous = topic;
    }
    for (const [id, at] of lastBoundaries) {
      if (!boundaries.has(id) && now - at > 180_000) takenBack += 1;
    }
    lastBoundaries = boundaries;
    if (realChanges.length) {
      const drawn = [...boundaries.values()];
      realChanges.forEach((at, index) => {
        if (found[index] !== null || at > now) return;
        if (drawn.some((time) => Math.abs(time - at) <= 60_000)) found[index] = now - at;
      });
    }
  };

  const runTimers = async (until) => {
    for (;;) {
      const timer = clock.take(until);
      if (!timer) return;
      answerQueries(timer.at, lastSnapshot);
      clock.time = Math.max(clock.time, timer.at);
      timer.fn();
      await clock.settle();
      observe();
    }
  };

  const started = performance.now();
  for (const utterance of utterances) {
    await runTimers(utterance.at);
    answerQueries(utterance.at, lastSnapshot);
    clock.time = Math.max(clock.time, utterance.at);
    await display.onUtterance(utterance);
    await clock.settle();
    observe();
  }
  const endAt = clock.time;
  await runTimers(endAt + 90_000);
  answerQueries(Infinity, lastSnapshot);
  const liveEnd = lastSnapshot;
  const liveCalls = calls.length;
  const record = await finishLive();
  const wallMs = performance.now() - started;

  // --- Scores.
  const minutes = Math.max(1, (utterances.at(-1)?.end ?? 0) - (utterances[0]?.start ?? 0)) / 60;
  const hours = minutes / 60;
  const result = {
    id: conversation.id,
    source: conversation.source,
    minutes,
    utterances: utterances.length,
    wallMs,
  };
  const nodesOf = (snapshot) => (snapshot?.nodes ?? []).filter((node) => node.utteranceIds?.length);
  // What each utterance was in, live at the end and in the record: enough to score again offline.
  result.liveAssignment = assignmentOf(conversation, nodesOf(liveEnd)).map(String);
  result.recordAssignment = assignmentOf(conversation, nodesOf(record)).map(String);
  if (reference) {
    if (VARIANT !== "vf")
      result.live = segmentationScores(conversation, assignmentOf(conversation, nodesOf(liveEnd)));
    result.record = segmentationScores(conversation, assignmentOf(conversation, nodesOf(record)));
    const lags = found.filter((lag) => lag !== null);
    result.liveDraw = {
      real: realChanges.length,
      found: lags.length,
      lagMedianMs: percentile(lags, 50),
      lags,
    };
  } else {
    result.live = { topics: nodesOf(liveEnd).length };
    result.record = { topics: nodesOf(record).length };
  }
  const delays = utterances
    .map((utterance) =>
      shownAt.has(String(utterance.id)) ? shownAt.get(String(utterance.id)) - utterance.at : null
    )
    .filter((delay) => delay !== null);
  // A line is shown at once (the instant answer) and may move later, when a
  // cut is drawn behind it or the model places it: settled is when its topic
  // last changed in the live view.
  const settled = utterances
    .map((utterance) =>
      settledAt.has(String(utterance.id))
        ? settledAt.get(String(utterance.id)) - utterance.at
        : null
    )
    .filter((delay) => delay !== null);
  result.behaviour = {
    settledDelayP50: percentile(settled, 50),
    settledDelayP90: percentile(settled, 90),
    settledDelays: settled.map((delay) => Math.round(delay)),
    labelChangesPerHour: labelChanges.length / hours,
    renamesPerHour: labelChanges.filter((change) => change.kind === "rename").length / hours,
    firstNamesPerHour: labelChanges.filter((change) => change.kind === "first").length / hours,
    deviceChangesPerHour: labelChanges.filter((change) => change.kind === "device").length / hours,
    linesMovedPerHour: moved / hours,
    linesMovedOldPerHour: movedOld / hours,
    topicsRemovedPerHour: removedTopics / hours,
    takenBackPerHour: takenBack / hours,
    shownDelayP50: percentile(delays, 50),
    shownDelayP95: percentile(delays, 95),
    unshown: utterances.length - delays.length,
  };
  const okCalls = calls.filter((call) => call.ok);
  const sum = (key) => okCalls.reduce((total, call) => total + (call.usage?.[key] ?? 0), 0);
  result.cost = {
    calls: calls.length,
    liveCalls,
    callsPerHour: calls.length / hours,
    liveCallsPerHour: liveCalls / hours,
    failed: calls.filter((call) => !call.ok).length,
    malformed: variantStats?.malformed ?? 0,
    unusableNames: variantStats?.unusableNames ?? 0,
    latencyP50: percentile(
      okCalls.map((call) => call.ms),
      50
    ),
    latencyP95: percentile(
      okCalls.map((call) => call.ms),
      95
    ),
    latencies: okCalls.map((call) => Math.round(call.ms)),
    inputPerHour: sum("input") / hours,
    cachedPerHour: sum("cached") / hours,
    outputPerHour: sum("output") / hours,
    reasoningPerHour: sum("reasoning") / hours,
    dollars: okCalls.reduce((total, call) => total + (call.cost ?? 0), 0),
    dollarsPerHour: okCalls.reduce((total, call) => total + (call.cost ?? 0), 0) / hours,
    kinds: Object.fromEntries(
      [...new Set(calls.map((call) => call.kind))].map((kind) => [
        kind,
        calls.filter((call) => call.kind === kind).length,
      ])
    ),
  };
  result.variantStats = variantStats;
  if (!conversation.private) result.nameAnswers = nameAnswers;
  // Names for the judge: per human segment, the live name and the record's.
  const recordNodes = nodesOf(record);
  result.names = human.map((segment) => ({
    key: segment.key,
    words: segment.words,
    label: segment.label,
    subtopics: segment.subtopics,
    excerpt: segmentExcerpt(conversation, segment),
    from: segment.from,
    to: segment.to,
    live: liveNames.get(segment.key) ?? null,
    record: nameFor(segment, recordNodes),
    recordDevice: deviceNameFor(segment, recordNodes),
  }));
  result.recordTopics = recordNodes.map((node) => ({
    id: node.id,
    label: node.label,
    deviceLabel: node.deviceLabel ?? null,
    utterances: node.utteranceIds.length,
    first: node.utteranceIds[0],
  }));
  if (conversation.private) {
    result.privateLabels = recordNodes.map((node) => node.label);
  }
  return result;
}

/** The name a snapshot gives a human segment: that of the topic holding most of its lines. */
function nameFor(segment, nodes) {
  const ids = new Set(segment.utteranceIds.map(String));
  let best = null;
  let bestCount = 0;
  for (const node of nodes) {
    let count = 0;
    for (const id of node.utteranceIds ?? []) if (ids.has(String(id))) count += 1;
    if (count > bestCount) {
      best = node;
      bestCount = count;
    }
  }
  return best ? { topic: String(best.id), name: best.label, share: bestCount / ids.size } : null;
}

function deviceNameFor(segment, nodes) {
  const named = nameFor(segment, nodes);
  if (!named) return null;
  const node = nodes.find((candidate) => String(candidate.id) === named.topic);
  return node?.deviceLabel ?? null;
}

// --- Main.

async function pool(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const ami = results.filter((result) => result.record?.pk != null);
  const total = (key, part) => results.reduce((sum, result) => sum + (result[part]?.[key] ?? 0), 0);
  const hours = results.reduce((sum, result) => sum + result.minutes, 0) / 60;
  const scores = (part) =>
    ami.length && ami.every((result) => result[part])
      ? {
          pk: bootstrapMean(ami.map((result) => result[part].pk)),
          windowDiff: bootstrapMean(ami.map((result) => result[part].windowDiff)),
          topics: mean(ami.map((result) => result[part].topics)),
          runs: mean(ami.map((result) => result[part].runs)),
          refRuns: mean(ami.map((result) => result[part].refRuns)),
          oneTopicPk: mean(ami.map((result) => result[part].oneTopic.pk)),
          finePk: bootstrapMean(ami.map((result) => result[part].fine.pk)),
          fineWindowDiff: bootstrapMean(ami.map((result) => result[part].fine.windowDiff)),
          fineRefRuns: mean(ami.map((result) => result[part].fine.refRuns)),
          fineOneTopicPk: mean(ami.map((result) => result[part].fine.oneTopic.pk)),
          boundaryPrecision:
            ami.reduce((sum, result) => sum + result[part].boundaryHits, 0) /
            Math.max(
              1,
              ami.reduce((sum, result) => sum + result[part].boundaryDrawn, 0)
            ),
          boundaryRecall:
            ami.reduce((sum, result) => sum + result[part].boundaryHits, 0) /
            Math.max(
              1,
              ami.reduce((sum, result) => sum + result[part].boundaryReal, 0)
            ),
        }
      : null;
  const lags = ami.flatMap((result) => result.liveDraw?.lags ?? []);
  const latencies = results.flatMap((result) => result.cost.latencies);
  return {
    label: LABEL,
    variant: VARIANT,
    model: SPEC,
    conversations: results.length,
    hours,
    live: scores("live"),
    record: scores("record"),
    liveDraw: {
      found:
        lags.length /
        Math.max(
          1,
          ami.reduce((sum, result) => sum + (result.liveDraw?.real ?? 0), 0)
        ),
      lagMedianMinutes: percentile(lags, 50) == null ? null : percentile(lags, 50) / 60_000,
    },
    behaviour: {
      labelChangesPerHour:
        results.reduce(
          (sum, result) => sum + result.behaviour.labelChangesPerHour * result.minutes,
          0
        ) /
        60 /
        hours,
      renamesPerHour:
        results.reduce((sum, result) => sum + result.behaviour.renamesPerHour * result.minutes, 0) /
        60 /
        hours,
      firstNamesPerHour:
        results.reduce(
          (sum, result) => sum + (result.behaviour.firstNamesPerHour ?? 0) * result.minutes,
          0
        ) /
        60 /
        hours,
      deviceChangesPerHour:
        results.reduce(
          (sum, result) => sum + (result.behaviour.deviceChangesPerHour ?? 0) * result.minutes,
          0
        ) /
        60 /
        hours,
      linesMovedOldPerHour:
        results.reduce(
          (sum, result) => sum + result.behaviour.linesMovedOldPerHour * result.minutes,
          0
        ) /
        60 /
        hours,
      takenBackPerHour:
        results.reduce(
          (sum, result) => sum + result.behaviour.takenBackPerHour * result.minutes,
          0
        ) /
        60 /
        hours,
      topicsRemovedPerHour:
        results.reduce(
          (sum, result) => sum + result.behaviour.topicsRemovedPerHour * result.minutes,
          0
        ) /
        60 /
        hours,
      shownDelayP50: percentile(
        results.map((result) => result.behaviour.shownDelayP50),
        50
      ),
      settledDelayP50: percentile(
        results.flatMap((result) => result.behaviour.settledDelays),
        50
      ),
      settledDelayP90: percentile(
        results.flatMap((result) => result.behaviour.settledDelays),
        90
      ),
    },
    cost: {
      calls: total("calls", "cost"),
      callsPerHour: total("calls", "cost") / hours,
      liveCallsPerHour: total("liveCalls", "cost") / hours,
      failedRate: total("failed", "cost") / Math.max(1, total("calls", "cost")),
      malformedRate: total("malformed", "cost") / Math.max(1, total("calls", "cost")),
      unusableNames: total("unusableNames", "cost"),
      latencyP50: percentile(latencies, 50),
      latencyP95: percentile(latencies, 95),
      inputPerHour:
        results.reduce((sum, result) => sum + result.cost.inputPerHour * result.minutes, 0) /
        60 /
        hours,
      cachedPerHour:
        results.reduce((sum, result) => sum + result.cost.cachedPerHour * result.minutes, 0) /
        60 /
        hours,
      outputPerHour:
        results.reduce((sum, result) => sum + result.cost.outputPerHour * result.minutes, 0) /
        60 /
        hours,
      dollars: total("dollars", "cost"),
      dollarsPerHour: total("dollars", "cost") / hours,
    },
  };
}

const fmt = (value, digits = 3) =>
  value == null || Number.isNaN(value) ? "n/a" : Number(value).toFixed(digits);
const ci = (stat) => (stat ? `${fmt(stat.mean)} [${fmt(stat.low)}, ${fmt(stat.high)}]` : "n/a");

function printSummary(summary) {
  const lines = [
    `## ${summary.label}: ${summary.conversations} conversations, ${fmt(summary.hours, 1)} h`,
  ];
  for (const part of ["live", "record"]) {
    const s = summary[part];
    if (!s) continue;
    lines.push(
      `${part.padEnd(6)} Pk ${ci(s.pk)}  WD ${ci(s.windowDiff)}  topics ${fmt(s.topics, 1)} runs ${fmt(s.runs, 1)} (ref ${fmt(s.refRuns, 1)})  boundaries P ${fmt(s.boundaryPrecision * 100, 0)}% R ${fmt(s.boundaryRecall * 100, 0)}%  (one topic Pk ${fmt(s.oneTopicPk)})`
    );
    lines.push(
      `${"".padEnd(6)} fine: Pk ${ci(s.finePk)}  WD ${ci(s.fineWindowDiff)}  (ref runs ${fmt(s.fineRefRuns, 1)}, one topic Pk ${fmt(s.fineOneTopicPk)})`
    );
  }
  const b = summary.behaviour;
  lines.push(
    `live   changes drawn ${fmt(summary.liveDraw.found * 100, 0)}% after a median ${fmt(summary.liveDraw.lagMedianMinutes, 1)} min; label changes ${fmt(b.labelChangesPerHour, 1)}/h (model renames ${fmt(b.renamesPerHour, 1)}, first model names ${fmt(b.firstNamesPerHour, 1)}, on-device ${fmt(b.deviceChangesPerHour, 1)}); old lines moved ${fmt(b.linesMovedOldPerHour, 1)}/h; changes taken back ${fmt(b.takenBackPerHour, 1)}/h; topics removed ${fmt(b.topicsRemovedPerHour, 1)}/h; a line's topic settles after ${fmt(b.settledDelayP50 / 1000, 1)} s (p50), ${fmt(b.settledDelayP90 / 1000, 1)} s (p90)`
  );
  const c = summary.cost;
  lines.push(
    `cost   ${c.calls} requests (${fmt(c.callsPerHour, 0)}/h, live ${fmt(c.liveCallsPerHour, 0)}/h), failed ${fmt(c.failedRate * 100, 1)}%, malformed ${fmt(c.malformedRate * 100, 1)}%, latency p50 ${fmt(c.latencyP50, 0)} ms p95 ${fmt(c.latencyP95, 0)} ms; per hour ${fmt(c.inputPerHour, 0)} in (${fmt(c.cachedPerHour, 0)} cached), ${fmt(c.outputPerHour, 0)} out, $${fmt(c.dollarsPerHour, 4)}; total $${fmt(c.dollars, 4)}`
  );
  console.log(lines.join("\n"));
}

const conversations = loadConversations();
const isLocal = SPEC && parseSpec(SPEC).provider === "local";
if (isLocal) {
  if (!args["local-model"] || !args["llama-server"]) {
    console.error("--local-model <gguf> and --llama-server <binary> are needed for a local model");
    process.exit(2);
  }
  await startLocalServer(parseSpec(SPEC).model, {
    binary: args["llama-server"],
    model: args["local-model"],
    port: Number(args["local-port"]),
    contextSize: Number(args["local-context"]),
  });
}
// A model on this computer answers one request at a time: one conversation at a
// time keeps its latencies honest.
const concurrency = isLocal ? 1 : Number(args.concurrency);
let results;
try {
  results = await pool(conversations, concurrency, async (conversation) => {
    const result = await runConversation(conversation);
    if (!args.quiet && !conversation.private) {
      const live = result.live?.pk != null ? ` live Pk ${fmt(result.live.pk)}` : "";
      const record = result.record?.pk != null ? ` record Pk ${fmt(result.record.pk)}` : "";
      console.error(
        `${conversation.id}: ${fmt(result.minutes, 1)} min${live}${record}, ${result.cost.calls} requests, $${fmt(result.cost.dollars, 4)}, ${fmt(result.wallMs / 1000, 0)} s`
      );
    }
    return result;
  });
} finally {
  if (isLocal) stopLocalServers();
}

const summary = summarize(results);
printSummary(summary);
if (conversations.some((conversation) => conversation.private) && args["show-labels"]) {
  for (const result of results)
    console.log(`${result.id}: ${(result.privateLabels ?? []).join(" | ")}`);
}
if (args.json) {
  const safe = results.map((result) =>
    conversations.find((conversation) => conversation.id === result.id)?.private &&
    !args["show-labels"]
      ? {
          ...result,
          names: [],
          recordTopics: result.recordTopics.map(({ label: _l, deviceLabel: _d, ...rest }) => rest),
          privateLabels: undefined,
          // Raw answers kept to diagnose malformed ones can quote the conversation.
          variantStats: result.variantStats ? { ...result.variantStats, samples: undefined } : null,
        }
      : result
  );
  fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      { summary, options: OPTIONS, tracker: path.relative(ROOT, trackerFile), results: safe },
      null,
      1
    )
  );
}
