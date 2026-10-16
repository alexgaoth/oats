#!/usr/bin/env node
// Builds the demo's sample conversations by recording the scripts in
// `demo/script/` through the app's own conversation pipeline, with a virtual
// clock instead of a microphone:
//
//   - each turn reaches the renderer as a final segment when the segmenter and
//     Whisper would deliver it (`demo/lib/conversation.mjs`),
//   - the question aide (`conversationAide.mjs`) and the topic tracker
//     (`conversationTopics.mjs`) see those segments in the order and at the
//     moments the recording store hands them over, with no classifier model,
//     which is the local path a fresh install takes,
//   - Mark is pressed where the script says, the meter's level is sampled ten
//     times a second and kept as the note's loudness,
//   - at Stop the speaker pass puts voices on the turns (`speakerTurns.mjs`)
//     and the reader names each voice, as the transcript's speaker button does,
//   - the title and the summary are the script's, written in the format the
//     intelligence pipeline asks its model for.
//
// So every question outcome, topic, return, open count and loudness byte in
// the output is what the app itself computes from the words. Change a script
// and run this again; do not edit the JSON by hand.
//
//   node demo/build-fixtures.mjs            write the fixtures
//   node demo/build-fixtures.mjs --report   and print what the pipeline made of each turn
//   node demo/build-fixtures.mjs --check    exit 1 if a fixture on disk is stale
//
// `--set ideas` does the same for the second content set: the scripts in
// `demo/script-ideas/` (a house meeting at a San Francisco hacker house, and
// eight conversations around it), written to `demo/fixtures-ideas/`.
// That set's main conversation is written there too, not into the app, and
// carries `meta.main: true` so the harness can find it (`set=ideas`).
//
//   node demo/build-fixtures.mjs --set ideas --report
//   node demo/build-fixtures.mjs --set ideas --check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fromApp = (file) => import(pathToFileURL(path.join(root, "src", file)).href);

const { ConversationTopicTracker, contentWords, coverage } = await fromApp(
  "helpers/conversationTopics.mjs"
);
const { ConversationAideSession, isQuestionCandidate } = await fromApp(
  "helpers/conversationAide.mjs"
);
const { addMoment } = await fromApp("helpers/conversationMoments.mjs");
const { addLevelSample, encodeLoudness } = await fromApp("helpers/conversationLoudness.mjs");
const { assignSpeakers, speakerNumber } = await fromApp("helpers/speakerTurns.mjs");
const { openQuestionCount, questionOutcomes } = await fromApp("helpers/conversationReview.mjs");
const { topicLanes } = await fromApp("helpers/topicLanes.mjs");
const { talkTime } = await fromApp("helpers/talkTime.mjs");
const { SAMPLE_FIXTURE_KIND, SAMPLE_FIXTURE_VERSION } = await fromApp(
  "helpers/sampleConversations.mjs"
);
const { normalizeTranscriptSegment, serializeTranscriptSegments } = await fromApp(
  "utils/transcriptSpeakerState.ts"
);
const { createRoom, finalArrivals, layoutTurns, meterReadings } =
  await import("./lib/conversation.mjs");
const prettier = await import(
  pathToFileURL(path.join(root, "node_modules/prettier/index.mjs")).href
);

// The built-in "Generate Notes" action the summary runs as (database.js).
const SUMMARY_ACTION_PROMPT =
  "Transform the provided content into clean, well-structured notes in markdown. Preserve the user's intent and all substantive information. Remove filler, small talk, false starts, and redundant content. For personal notes, improve grammar and structure for readability. For meeting transcripts, extract key discussion points, decisions, action items, and follow-ups.";

/** The aide's defaults (settingsStore): 8s of silence, 0.75 confidence. */
const SILENCE_DELAY_MS = 8000;
const CONFIDENCE_THRESHOLD = 0.75;

/** Stop is pressed this long after the last word, unless the script says. */
const DEFAULT_TAIL_MS = 2600;

const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * How an utterance compares with the topics so far, for the report: its share
 * of words already in the current topic, in the turn being held, and in the
 * closest earlier topic (`conversationTopics.mjs` decides on these).
 */
function topicScores(tracker, text) {
  const words = contentWords(text);
  if (words.length < tracker.minWords) return null;
  const bag = new Set(words);
  const current = tracker.topics.find((topic) => topic.id === tracker.currentId);
  let best = null;
  for (const topic of tracker.topics) {
    if (topic.id === tracker.currentId) continue;
    const score = coverage(bag, topic.bag);
    if (!best || score > best.score) best = { id: topic.id, score };
  }
  return {
    current: current ? coverage(bag, current.bag) : 0,
    pending: tracker.pending ? coverage(bag, tracker.pending.bag) : null,
    best,
  };
}

/**
 * Record one script through the pipeline. Returns the fixture and a report.
 * `main` marks the main conversation of a set whose main is not the app's
 * own sample (`meta.main`), so the harness can tell it from the others.
 */
async function record(script, { main = false } = {}) {
  const startedAt = script.startedAt;
  const timeline = layoutTurns(script);
  const arrivals = finalArrivals(timeline);
  const voices = Object.fromEntries(
    Object.entries(script.speakers).map(([key, voice]) => [key, { gain: voice.gain ?? 1 }])
  );
  const room = createRoom(timeline, voices, script.id);
  const lastArrival = arrivals[arrivals.length - 1];
  const stopAt = Math.max(
    lastArrival + 400,
    timeline[timeline.length - 1].endMs + (script.tailMs ?? DEFAULT_TAIL_MS)
  );

  // The virtual clock, and the aide's timers on it.
  let clock = startedAt;
  let timerSeq = 0;
  const timers = [];
  const setTimer = (fn, ms) => {
    const id = ++timerSeq;
    timers.push({ id, due: clock + ms, fn });
    return id;
  };
  const clearTimer = (id) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index >= 0) timers.splice(index, 1);
  };
  const runTimersUntil = async (time) => {
    for (;;) {
      timers.sort((a, b) => a.due - b.due || a.id - b.id);
      const next = timers[0];
      if (!next || next.due > time) return;
      timers.shift();
      clock = next.due;
      next.fn();
      await flush();
    }
  };

  // The main process's half of the events: ids in insert order, stamped with
  // the moment the write lands.
  const events = [];
  const insertEvent = async (input) => {
    const event = {
      id: events.length + 1,
      kind: input.kind,
      parentEventId: input.parentEventId ?? null,
      segmentIds: (input.segmentIds ?? []).map(String),
      text: String(input.text ?? ""),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      createdAt: clock,
    };
    events.push(event);
    return event;
  };
  const updateEvent = async (id, patch) => {
    const event = events.find((item) => item.id === id);
    if (event) event.metadata = { ...event.metadata, ...patch };
    return event ?? null;
  };

  const tracker = new ConversationTopicTracker({ now: () => clock });
  // The flow card's lanes, drawn from each published snapshot as
  // `ConversationFlow` draws them: logged each time the room's path changes.
  const lanesLog = [];
  const publish = () => {
    const snapshot = tracker.snapshot(clock);
    const lanes = topicLanes({
      snapshot,
      segments: live,
      start: startedAt,
      end: clock,
      live: true,
    });
    const path = lanes.runs.map((run) => run.topic).join(">");
    if (lanesLog.at(-1)?.path !== path) {
      lanesLog.push({ at: clock - startedAt, path, returns: lanes.returns.length });
    }
  };
  const cards = new Map();
  const aide = new ConversationAideSession({
    noteId: 1,
    classify: null,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    silenceDelayMs: SILENCE_DELAY_MS,
    autoSearch: false,
    now: () => clock,
    setTimer,
    clearTimer,
    insertEvent,
    updateEvent,
    onCard: (card) => {
      cards.set(card.id, { ...card });
      if (card.state === "answered") {
        tracker.resolveTopicForUtterance(card.id);
        publish();
      }
    },
    onCardRemoved: (id) => cards.delete(id),
    openSearch: async () => false,
  });

  // The store mints segment ids from the moment the app was opened.
  const idPrefix = `seg-${(startedAt - 97_000).toString(36)}`;
  const live = [];
  const placed = [];
  for (const [index, segment] of timeline.entries()) {
    const arrival = startedAt + arrivals[index];
    await runTimersUntil(arrival);
    clock = arrival;
    const stored = normalizeTranscriptSegment({
      id: `${idPrefix}-${index + 1}`,
      text: segment.text,
      source: "mic",
      timestamp: startedAt + segment.startMs,
      startMs: segment.startMs,
      endMs: segment.endMs,
      speaker: "room",
      speakerName: "Conversation",
      speakerIsPlaceholder: true,
      speakerStatus: "confirmed",
    });
    live.push(stored);
    const before = tracker.currentId;
    const scores = topicScores(tracker, stored.text);
    // The store's order: the aide first, then the topic tracker.
    aide.onFinalized(stored);
    const topic = tracker.onUtterance({ id: stored.id, text: stored.text, at: stored.timestamp });
    publish();
    placed.push({
      before,
      after: tracker.currentId,
      landed: topic?.id ?? null,
      held: tracker.pending?.utterance?.id === stored.id,
      scores,
    });
    await flush();
  }
  await runTimersUntil(startedAt + stopAt);
  clock = startedAt + stopAt;
  await aide.shutdown();
  await flush();

  // A question's outcome must come from its reply, not from the replay's
  // speed: the reply has to land well inside the aide's silence window, or a
  // slower machine (or a demo played at half speed) would read it as silence.
  const replyLimit = SILENCE_DELAY_MS - 1500;
  for (const event of events.filter((item) => item.kind === "question")) {
    const index = live.findIndex((segment) => segment.id === event.segmentIds[0]);
    const next = arrivals[index + 1];
    if (next != null && next - arrivals[index] > replyLimit) {
      throw new Error(
        `${script.id}: the reply to "${event.text}" lands ${((next - arrivals[index]) / 1000).toFixed(1)}s after it; keep the first reply short`
      );
    }
  }

  // Marks, pressed during the turns the script says.
  let moments = [];
  for (const segment of timeline) {
    if (!segment.mark) continue;
    const after = segment.mark.after ?? Math.min(1.6, (segment.endMs - segment.startMs) / 2000);
    const at = startedAt + segment.startMs + Math.round(after * 1000);
    moments = addMoment(moments, at).moments;
    if (segment.mark.note) {
      moments = moments.map((moment) =>
        moment.at === at ? { ...moment, note: segment.mark.note } : moment
      );
    }
  }

  // The meter, ten times a second, kept a second at a time as Finish keeps it.
  const levels = [];
  for (const reading of meterReadings(room, 100, stopAt)) {
    addLevelSample(levels, startedAt + reading.at, reading.level);
  }
  const loudness = encodeLoudness(null, levels);

  // Finish: what the recording surface saves, and the topics as kept.
  const finishTranscript = serializeTranscriptSegments(live);
  const topics = tracker.snapshot(clock, { final: true });

  // The speaker pass, then the reader naming each voice.
  const turns = timeline.map((segment) => ({
    start: segment.startMs / 1000,
    end: segment.endMs / 1000,
    speaker: `voice-${segment.speaker}`,
  }));
  const { assignments, speakers } = assignSpeakers(live, turns);
  if (speakers.length !== Object.keys(script.speakers).length) {
    throw new Error(
      `${script.id}: the speaker pass found ${speakers.length} voices, the script has ${
        Object.keys(script.speakers).length
      }`
    );
  }
  let segments = live.map((segment) => {
    const found = assignments.get(String(segment.id));
    if (!found) return segment;
    return {
      ...segment,
      speaker: `speaker_${speakerNumber(found) ?? 0}`,
      speakerName: undefined,
      speakerIsPlaceholder: true,
      speakerStatus: "provisional",
    };
  });
  const nameOf = new Map();
  for (const [index, segment] of segments.entries()) {
    if (!nameOf.has(segment.speaker)) nameOf.set(segment.speaker, timeline[index].name);
  }
  for (const [speaker, name] of nameOf) {
    segments = segments.map((segment) =>
      segment.speaker === speaker
        ? { ...segment, speakerName: name, speakerIsPlaceholder: false, speakerStatus: "locked" }
        : segment
    );
  }
  const transcript = JSON.parse(serializeTranscriptSegments(segments));

  const loudTurns = Object.fromEntries(
    timeline
      .filter((segment) => segment.loud !== 1)
      .map((segment) => [live[segment.index].id, segment.loud])
  );
  const summarizedAt = startedAt + stopAt + (script.summaryAfterMs ?? 41_000);

  const fixture = {
    kind: SAMPLE_FIXTURE_KIND,
    version: SAMPLE_FIXTURE_VERSION,
    meta: {
      id: script.id,
      sample: true,
      description: script.description,
      company: script.company,
      participants: Object.values(script.speakers).map((voice) => ({
        name: voice.name,
        role: voice.role,
      })),
      startedAt,
      endedAt: startedAt + stopAt,
      summarizedAt,
      placement: script.placement,
      // The conversation group it is filed in, by seed key ("work",
      // "personal"), standing in for the writing model's choice as the title
      // and the summary stand in for its writing. Left out when the script
      // names none; such a sample is sorted like any conversation.
      ...(script.group ? { group: script.group } : {}),
      ...(main ? { main: true } : {}),
      generatedBy: "demo/build-fixtures.mjs",
    },
    note: {
      title: script.title,
      content: "",
      note_type: "meeting",
      transcript,
      enhanced_content: script.summary.trim(),
      enhancement_prompt: SUMMARY_ACTION_PROMPT,
      enhanced_at_content_hash: `${finishTranscript.length}-${finishTranscript.slice(0, 50)}`,
      conversation_topics: topics,
      conversation_marks: moments,
      conversation_loudness: loudness ? JSON.parse(loudness) : null,
      open_questions: openQuestionCount(events),
    },
    events,
    // Only the demo harness reads this: what a replay needs that the note
    // does not keep. How loud each voice is, and the turns said louder.
    replay: {
      voices: Object.fromEntries(
        Object.values(script.speakers).map((voice) => [voice.name, { gain: voice.gain ?? 1 }])
      ),
      loud: loudTurns,
      stopAtMs: stopAt,
    },
  };

  const report = {
    script,
    timeline,
    arrivals,
    live,
    placed,
    events,
    topics,
    lanesLog,
    stopAt,
    cards: [...cards.values()],
    talk: talkTime(segments),
  };
  return { fixture, report };
}

function clockText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function printReport({
  script,
  timeline,
  arrivals,
  live,
  placed,
  events,
  topics,
  lanesLog,
  stopAt,
  talk,
}) {
  const topicOf = new Map();
  for (const node of topics.nodes) {
    for (const id of node.utteranceIds) topicOf.set(id, node.id);
  }
  const questions = new Map(
    events.filter((event) => event.kind === "question").map((event) => [event.segmentIds[0], event])
  );
  const responses = new Map(
    events.filter((event) => event.kind === "response").map((event) => [event.parentEventId, event])
  );
  console.log(`\n=== ${script.id}: ${clockText(stopAt)}, ${timeline.length} turns`);
  const seen = new Set();
  for (const [index, segment] of timeline.entries()) {
    const stored = live[index];
    const move = placed[index];
    const topic = topicOf.get(stored.id);
    // "->" a new topic starts, ">>" the room returns to an earlier one.
    const shift =
      move.before !== move.after && move.after != null
        ? seen.has(move.after)
          ? ` >> ${move.after}`
          : ` -> ${move.after}`
        : "";
    if (move.before != null) seen.add(move.before);
    if (move.after != null) seen.add(move.after);
    const question = questions.get(stored.id);
    const response = question ? responses.get(question.id) : null;
    const flag = question
      ? `  [Q ${response?.metadata?.outcome ?? "open"}]`
      : isQuestionCandidate(stored.text)
        ? "  [Q?]"
        : "";
    const scores = move.scores
      ? `c${move.scores.current.toFixed(2)}${
          move.scores.pending != null ? ` p${move.scores.pending.toFixed(2)}` : ""
        }${move.scores.best ? ` b${move.scores.best.id}:${move.scores.best.score.toFixed(2)}` : ""}${
          move.held ? " HELD" : ""
        }`
      : "";
    console.log(
      `${clockText(segment.startMs).padStart(5)} ${String(topic ?? "-").padStart(2)}${shift.padEnd(6)} ${scores.padEnd(24)} ${segment.speaker.padEnd(7)} ${segment.text}${flag}${
        arrivals[index + 1] && question
          ? `  (reply in ${((arrivals[index + 1] - arrivals[index]) / 1000).toFixed(1)}s)`
          : ""
      }`
    );
  }
  console.log("\nTopics:");
  for (const node of topics.nodes) {
    console.log(
      `  ${node.id} "${node.label}" ${clockText(node.durationMs)} ${node.state} returns=${node.returns} words=${node.words.slice(0, 5).join(",")}`
    );
  }
  console.log(
    "Edges:",
    topics.edges
      .map((edge) => `${edge.from}${edge.kind === "return" ? "=>" : "->"}${edge.to}`)
      .join(" ")
  );
  console.log(
    "Lanes:",
    lanesLog
      .map((entry) => `${clockText(entry.at)} ${entry.path || "-"} (${entry.returns} back)`)
      .join(", ")
  );
  const outcomes = questionOutcomes(events);
  console.log(
    "Questions:",
    outcomes.total,
    outcomes.outcomes.map((item) => `${item.outcome}=${item.count}`).join(" "),
    "open count:",
    openQuestionCount(events)
  );
  console.log(
    "Talk time:",
    talk.speakers
      .map((speaker) => `${speaker.segment.speakerName ?? speaker.key} ${speaker.percent}%`)
      .join(", ")
  );
}

async function formatJson(value, file) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(JSON.stringify(value), { ...options, parser: "json", filepath: file });
}

/**
 * The content sets: where each one's scripts are, and where its fixtures go.
 * The default set's main conversation is the app's own sample; the ideas set
 * is demo-only, so its main conversation goes with the others and is marked.
 */
const SETS = {
  default: {
    main: "./script/launch-readiness-review.mjs",
    supporting: "./script/supporting.mjs",
    personal: "./script/personal.mjs",
    mainDir: "src/helpers/sampleConversations",
    dir: "demo/fixtures",
    markMain: false,
  },
  ideas: {
    main: "./script-ideas/main.mjs",
    supporting: "./script-ideas/supporting.mjs",
    personal: "./script-ideas/personal.mjs",
    mainDir: "demo/fixtures-ideas",
    dir: "demo/fixtures-ideas",
    markMain: true,
  },
};

/** `--set <name>` or `--set=<name>`; the default set when it is not given. */
function setName(argv) {
  let name = "default";
  for (const [index, arg] of argv.entries()) {
    if (arg === "--set") name = argv[index + 1] ?? "";
    else if (arg.startsWith("--set=")) name = arg.slice("--set=".length);
  }
  if (!Object.hasOwn(SETS, name)) {
    throw new Error(`Unknown set "${name}". Sets: ${Object.keys(SETS).join(", ")}`);
  }
  return name;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const name = setName(process.argv.slice(2));
  const set = SETS[name];
  const { default: main } = await import(set.main);
  const { default: supporting } = await import(set.supporting);
  const { default: personal } = await import(set.personal);
  const outputs = [
    {
      script: main,
      main: set.markMain,
      file: path.join(root, set.mainDir, `${main.id}.json`),
    },
    ...[...supporting, ...personal].map((script) => ({
      script,
      main: false,
      file: path.join(root, set.dir, `${script.id}.json`),
    })),
  ];
  let stale = 0;
  for (const { script, main: isMain, file } of outputs) {
    const { fixture, report } = await record(script, { main: isMain });
    if (args.has("--report")) printReport(report);
    const text = await formatJson(fixture, file);
    const relative = path.relative(root, file);
    if (args.has("--check")) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (current !== text) {
        stale += 1;
        console.log(`stale: ${relative}`);
      }
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    const outcomes = questionOutcomes(fixture.events);
    console.log(
      `${relative}: ${clockText(fixture.meta.endedAt - fixture.meta.startedAt)}, ${
        fixture.note.transcript.length
      } turns, ${fixture.note.conversation_topics.nodes.length} topics, ${outcomes.total} questions (${outcomes.outcomes
        .map((item) => `${item.count} ${item.outcome}`)
        .join(", ")})`
    );
  }
  if (stale) {
    const again = name === "default" ? "" : ` --set ${name}`;
    console.log(`${stale} fixture(s) are stale. Run: node demo/build-fixtures.mjs${again}`);
    process.exitCode = 1;
  }
}

await main();
