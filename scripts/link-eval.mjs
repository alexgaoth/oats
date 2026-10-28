#!/usr/bin/env node
// The link benchmark: how well the Global conversations board links
// conversations that talk about the same thing.
//
//   node scripts/link-eval.mjs snapshots [--shard 0/4]
//   node scripts/link-eval.mjs names --model openai:gpt-5.6-luna@none
//   node scripts/link-eval.mjs gists --model openai:gpt-5.6-luna@none
//   node scripts/link-eval.mjs local [--json out.json]
//   node scripts/link-eval.mjs remote --model anthropic:claude-opus-5-5@think,low
//   node scripts/link-eval.mjs judge --model anthropic:claude-sonnet-5-5
//   node scripts/link-eval.mjs report [--json out.json]
//
// Corpus: every AMI meeting with human topic annotations (manual annotations
// 1.6.2, CC BY 4.0), `--ami` (default ~/oats-asr-cache/AMI). Nothing of Oats'
// users is read or sent. What "the same thing" means is `lib/link-truth.mjs`.
//
// Stages, each cached under `--cache` (default ~/.cache/oats/link-eval), so a
// rerun costs nothing:
//
//   snapshots  Each meeting's manual transcript, cut at pauses as the room
//              segmenter cuts it (`lib/topic-corpus.mjs`), replayed turn by turn
//              through the app's topic tracker with MiniLM vectors, as the
//              recording store feeds it. The final snapshot is what the app
//              stores on the note and what the board reads. Local only.
//   names      Each stored topic named by a writing model with the app's own
//              prompt (`topicNaming.mjs`, as #121 names it at Finish).
//   gists      Each meeting summarized by a writing model with the app's
//              summary prompt; the gist is the summary's opening, as the
//              group sort reads it (`summaryExcerpt`).
//   local      The local linkers over every pair of meetings.
//   remote     The remote linker on a fixed sample of pairs: it sees topic
//              names and gists only, never a transcript.
//   judge      A blind judge grades the link labels.
//   report     The tables.
//
// Keys come from the environment only (OPENAI_API_KEY, ANTHROPIC_API_KEY,
// AWS_BEARER_TOKEN_BEDROCK) and are never written. Every request's tokens and
// cost go to the ledger of `lib/fast-models.mjs` (FM_LEDGER, FM_BUDGET_USD).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { amiMeetingIds, amiReference, annotationsDir, topicNames } from "./lib/topic-corpus.mjs";
import { createEmbedder } from "./lib/minilm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(os.homedir(), "oats-asr-cache", "AMI") },
    cache: { type: "string", default: path.join(os.homedir(), ".cache", "oats", "link-eval") },
    meetings: { type: "string" },
    shard: { type: "string" },
    model: { type: "string" },
    json: { type: "string" },
    concurrency: { type: "string", default: "4" },
    limit: { type: "string" },
    "min-words": { type: "string", default: "100" },
    timeout: { type: "string" },
    prompt: { type: "string" },
  },
});

const command = positionals[0];
const DIR = annotationsDir(args.ami);
const CACHE = args.cache;
const NAMES = topicNames(DIR);

function cachePath(...parts) {
  const file = path.join(CACHE, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

/** A model spec as a file name. */
const slug = (spec) => String(spec).replace(/[^a-zA-Z0-9.-]+/g, "_");

function meetingIds() {
  let ids = amiMeetingIds(DIR);
  if (args.meetings) {
    const wanted = new Set(args.meetings.split(",").map((id) => id.trim()));
    ids = ids.filter((id) => wanted.has(id));
  }
  if (args.shard) {
    const [index, count] = args.shard.split("/").map(Number);
    ids = ids.filter((_, position) => position % count === index);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Snapshots

/** As `trackConversationTopic` and `TopicVectorFeeder` feed the tracker, with no wait. */
async function replay(Tracker, conversation, embedder) {
  const tracker = new Tracker();
  for (const utterance of conversation.utterances) {
    tracker.onUtterance({ id: utterance.id, text: utterance.text, at: utterance.at });
    const phrases = tracker.phrasesToEmbed(47);
    const vectors = await embedder.embed([utterance.text, ...phrases.map((phrase) => phrase.text)]);
    tracker.addVectors({
      utterances: [[utterance.id, vectors[0]]],
      phrases: phrases.map((phrase, index) => [phrase.key, vectors[index + 1]]),
    });
  }
  const end = conversation.utterances.at(-1)?.at ?? 0;
  return tracker.snapshot(end, { final: true });
}

async function snapshots() {
  const { ConversationTopicTracker } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationTopics.mjs")).href
  );
  const embedder = await createEmbedder({ cacheDir: path.join(CACHE, "vectors"), threads: 2 });
  for (const id of meetingIds()) {
    const file = cachePath("snapshots", `${id}.json`);
    if (fs.existsSync(file)) continue;
    const started = performance.now();
    const conversation = amiReference(DIR, id, NAMES);
    const snapshot = await replay(ConversationTopicTracker, conversation, embedder);
    writeJson(file, { id, snapshot });
    console.log(
      `${id}: ${snapshot.nodes.length} topics, ${conversation.utterances.length} turns, ` +
        `${((performance.now() - started) / 1000).toFixed(0)} s, ${embedder.computed()} embedded`
    );
  }
}

/** Every meeting's stored snapshot and its turns. */
function loadMeetings() {
  const meetings = [];
  for (const id of meetingIds()) {
    const stored = readJson(path.join(CACHE, "snapshots", `${id}.json`));
    if (!stored) throw new Error(`No snapshot for ${id}: run the snapshots stage first`);
    const conversation = amiReference(DIR, id, NAMES);
    const turns = new Map(
      conversation.utterances.map((utterance) => [utterance.id, utterance.text])
    );
    meetings.push({ id, snapshot: stored.snapshot, turns, utterances: conversation.utterances });
  }
  return meetings;
}

/** Runs `work` over `items`, `limit` at a time, in order of start. */
async function pool(items, limit, work) {
  let next = 0;
  const results = new Array(items.length);
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fastModels() {
  return import(pathToFileURL(path.join(ROOT, "scripts/lib/fast-models.mjs")).href);
}

// ---------------------------------------------------------------------------
// Names: what #121 asks the writing model at Finish, once per stored topic.
//
// The app names a topic while it grows and once more at Finish; the record
// keeps the last name. Here each stored topic is named once from all of its
// turns, in the order raised, each request told the names given before it.

async function names() {
  const spec = args.model;
  if (!spec) throw new Error("--model provider:model");
  const { ask, ledgerTotal } = await fastModels();
  const naming = await import(pathToFileURL(path.join(ROOT, "src/helpers/topicNaming.mjs")).href);
  const { countWords } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/recordingCounters.mjs")).href
  );
  const meetings = loadMeetings();
  await pool(meetings, Number(args.concurrency), async (meeting) => {
    const file = cachePath("names", slug(spec), `${meeting.id}.json`);
    if (fs.existsSync(file)) return;
    const order = [...meeting.snapshot.nodes].sort((a, b) => a.firstAt - b.firstAt);
    const given = [];
    const result = {};
    for (const node of order) {
      if (!naming.isNameableTopic(node)) continue;
      const turns = node.utteranceIds.map((id) => meeting.turns.get(String(id)) ?? "");
      const words = turns.reduce((total, text) => total + countWords(text), 0);
      if (!naming.topicNeedsName({ words, final: true })) continue;
      const prompt = naming.buildTopicNamePrompt({ turns, others: given });
      const answer = await ask(spec, {
        system: prompt.system,
        user: prompt.text,
        maxTokens: 2000,
        timeoutMs: 60_000,
        purpose: "link-eval:names",
      });
      const name = answer.ok
        ? naming.parseTopicName(answer.text, { others: given, excerpt: prompt.excerpt })
        : null;
      result[node.id] = { name, raw: answer.ok ? answer.text.slice(0, 200) : null, words };
      if (name) given.push(name);
    }
    writeJson(file, result);
    console.log(
      `${meeting.id}: ${Object.values(result).filter((item) => item.name).length} named, ` +
        `$${ledgerTotal().toFixed(3)} in the ledger`
    );
  });
}

// ---------------------------------------------------------------------------
// Gists: the summary the writing model writes at Finish, with the app's prompt
// (src/stores/actionProcessingStore.ts and the built-in Generate Notes action
// in src/helpers/database.js, as on main at b4ea7b7), and its opening.

const MEETING_SYSTEM_PROMPT = `You are a professional meeting notes assistant. You will receive a dual-speaker transcript where "You:" marks the user's speech and "Them:" marks the other participant(s), along with any manual notes the user took.

Your job is to produce clean, actionable meeting notes in markdown. Follow these rules:

FORMAT RULES (strict):
- Do NOT include any preamble: no title, no "# Meeting Notes", no date/time/location, no attendee list, no topic header. Start directly with the summary.
- Do NOT use tables, horizontal rules, or block quotes.
- Do NOT list or guess participant names/roles.
- Start with a concise 1–2 sentence summary of what the meeting was about.
- Use clear section headings: ## Threads, ## Key Discussion Points, ## Decisions Made, ## Action Items, ## Follow-ups (omit any section that has no content).
- Under ## Threads, capture the 2–5 important lines of thought: the starting question or claim, how it developed, and what remains unresolved. Write each as a concise bullet; this is the conversation's intellectual map, not a chronological recap.
- Under Action Items, use checkboxes (\`- [ ]\`) and attribute each item to "You" or "Them" where clear.

CONTENT RULES:
- Preserve important quotes or specific commitments verbatim when they carry meaning.
- Remove filler, small talk, false starts, and repeated/redundant content.
- Where speakers refer to the same topic across multiple turns, consolidate into a coherent point rather than listing every utterance.
- If the user included manual notes alongside the transcript, integrate them — they represent the user's emphasis on what matters most.
- Keep the tone professional and concise. Bias toward brevity.

Instructions: `;

const GENERATE_NOTES_PROMPT =
  "Transform the provided content into clean, well-structured notes in markdown. Preserve the user's intent and all substantive information. Remove filler, small talk, false starts, and redundant content. For personal notes, improve grammar and structure for readability. For meeting transcripts, extract key discussion points, decisions, action items, and follow-ups.";

async function gists() {
  const spec = args.model;
  if (!spec) throw new Error("--model provider:model");
  const { ask, ledgerTotal } = await fastModels();
  const meetings = loadMeetings();
  await pool(meetings, Number(args.concurrency), async (meeting) => {
    const file = cachePath("gists", slug(spec), `${meeting.id}.json`);
    if (fs.existsSync(file)) return;
    // A room is one voice to the app until the speakers are named: every turn is "Them".
    const transcript = meeting.utterances.map((utterance) => `Them: ${utterance.text}`).join("\n");
    const answer = await ask(spec, {
      system: MEETING_SYSTEM_PROMPT + GENERATE_NOTES_PROMPT,
      user: transcript,
      maxTokens: 6000,
      timeoutMs: 180_000,
      purpose: "link-eval:gists",
    });
    if (!answer.ok) {
      console.log(`${meeting.id}: failed (${answer.error})`);
      return;
    }
    writeJson(file, { summary: answer.text });
    console.log(
      `${meeting.id}: ${answer.text.length} chars, $${ledgerTotal().toFixed(3)} in the ledger`
    );
  });
}

// ---------------------------------------------------------------------------
// The corpus as the board sees it: one conversation per meeting, a day apart in
// the order of their ids (a series' four meetings on four days in a row).

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);

/** The writing model whose names stand in for the app's (`names` stage). */
const NAMING_MODEL = "openai:gpt-5.6-luna@none";
const GIST_MODEL = "openai:gpt-5.6-luna@none";
/** How much of the summary the remote linker reads of each conversation, in characters. */
const GIST_CHARS = 300;

async function corpus() {
  const truthLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-truth.mjs")).href);
  const meetings = loadMeetings();
  const byMeeting = new Map(
    meetings.map((meeting) => [meeting.id, truthLib.meetingSubjects(DIR, meeting.id, NAMES)])
  );
  const pairs = truthLib.truthPairs(
    meetings.map((meeting) => meeting.id),
    byMeeting,
    { minWords: Number(args["min-words"]) }
  );
  const conversations = meetings.map((meeting, index) => {
    const named = readJson(path.join(CACHE, "names", slug(NAMING_MODEL), `${meeting.id}.json`), {});
    return {
      id: meeting.id,
      title: meeting.id,
      createdAt: T0 + index * DAY_MS,
      // As stored with no writing model: the tracker's own names.
      device: { nodes: meeting.snapshot.nodes },
      // As stored with a writing model: its names, the tracker's kept as `deviceLabel`.
      model: {
        nodes: meeting.snapshot.nodes.map((node) =>
          named[node.id]?.name
            ? { ...node, label: named[node.id].name, deviceLabel: node.label }
            : node
        ),
      },
      gist: null,
    };
  });
  return { truthLib, meetings, byMeeting, pairs, conversations };
}

/** The stored conversations of one variant, as the board reads them. */
const asBoard = (conversations, variant) =>
  conversations.map((item) => ({
    id: item.id,
    title: item.title,
    createdAt: item.createdAt,
    snapshot: item[variant],
  }));

// The fixed sample the remote linker is scored on, and every method beside it.
// Each meeting is "the new conversation" once. It is asked about every earlier
// meeting of its series (all of them, so links inside a series are a census),
// every earlier non-scenario meeting when it is one (the same), and five
// others drawn at random from the whole corpus (so links across series, and
// between the two groups, are a simple random sample).
const RANDOM_CANDIDATES = 5;

function linkerSample(ids, truthLib) {
  const random = seededRandom(20261028);
  const seen = new Set();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const calls = [];
  ids.forEach((id, index) => {
    const series = truthLib.seriesOf(id);
    const group = truthLib.groupOf(id);
    const candidates = ids
      .slice(0, index)
      .filter(
        (other) =>
          truthLib.seriesOf(other) === series ||
          (group === "non-scenario" && truthLib.groupOf(other) === "non-scenario")
      );
    for (const other of candidates) seen.add(key(id, other));
    const pool = ids.filter((other) => other !== id && !seen.has(key(id, other)));
    for (let pick = 0; pick < RANDOM_CANDIDATES && pool.length; pick += 1) {
      const [other] = pool.splice(Math.floor(random() * pool.length), 1);
      // Inside a series and between non-scenario meetings, the census above has it.
      if (truthLib.categoryOf(id, other).endsWith("within")) {
        pick -= 1;
        continue;
      }
      if (truthLib.groupOf(id) === "non-scenario" && truthLib.groupOf(other) === "non-scenario") {
        pick -= 1;
        continue;
      }
      seen.add(key(id, other));
      candidates.push(other);
    }
    calls.push({ id, candidates });
  });
  return calls;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

// ---------------------------------------------------------------------------
// Local linkers

const GRID = Array.from({ length: 36 }, (_, index) => Math.round((0.2 + index * 0.02) * 100) / 100);
const FOLDS = 5;

/** Pairs as keys `a|b` (a < b) to the link label, from a board's subjects. */
function coMembers(subjects) {
  const linked = new Map();
  for (const subject of subjects) {
    const ids = [...subject.conversationIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!linked.has(key)) linked.set(key, subject.label);
      }
    }
  }
  return linked;
}

async function localMethods(data) {
  const lifetime = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/lifetimeGraph.mjs")).href
  );
  const links = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationLinks.mjs")).href
  );
  const embedder = await createEmbedder({ cacheDir: path.join(CACHE, "vectors"), threads: 2 });
  const { conversations, truthLib } = data;
  const methods = [];

  // 1. Today: word overlap, pair by pair (buildLifetimeGraph) and as the board
  // draws it (subjectThreads). The words are the tracker's whatever names the
  // topics have, so both variants link the same pairs; the board names a
  // subject by a topic's label, so with a writing model its names differ.
  for (const variant of ["device", "model"]) {
    const board = asBoard(conversations, variant);
    const graph = lifetime.buildLifetimeGraph(board);
    const pairsLinked = new Map();
    for (const edge of graph.edges) {
      const [a, b] = [edge.from, edge.to].sort();
      pairsLinked.set(`${a}|${b}`, edge.topics[0]);
    }
    methods.push({
      id: `words-pairs-${variant}`,
      linked: () => pairsLinked,
      fixed: true,
    });
    const drawn = coMembers(lifetime.subjectThreads(board).subjects);
    methods.push({ id: `words-drawn-${variant}`, linked: () => drawn, fixed: true });
  }

  // 2 and 3. MiniLM on the tracker's names and on the writing model's, with
  // the topic's telling words or without, pair by pair and as drawn.
  const textVariants = {
    names: (node) => links.topicLinkText(node, { words: 0 }),
    phrases: (node) => links.topicLinkText(node, { words: 8 }),
  };
  for (const variant of ["device", "model"]) {
    const board = asBoard(conversations, variant);
    for (const [textId, text] of Object.entries(textVariants)) {
      const texts = new Set();
      for (const item of board) for (const node of item.snapshot.nodes) texts.add(text(node));
      const list = [...texts];
      const vectors = new Map();
      const embedded = await embedder.embed(list);
      list.forEach((value, index) => vectors.set(value, embedded[index]));
      const vectorOf = (value) => vectors.get(value) ?? null;
      const scored = links.meaningPairs(board, { vectorOf, text, threshold: 2 });
      const scores = new Map(
        scored.map((pair) => {
          const [a, b] = [pair.from, pair.to].sort();
          return [`${a}|${b}`, { score: pair.score, label: pair.label }];
        })
      );
      methods.push({
        id: `minilm-pairs-${variant}-${textId}`,
        scores,
        linked: (threshold) => {
          const out = new Map();
          for (const [key, value] of scores)
            if (value.score >= threshold) out.set(key, value.label);
          return out;
        },
      });
      const drawnAt = new Map();
      for (const threshold of GRID) {
        drawnAt.set(
          threshold,
          coMembers(links.meaningThreads(board, { vectorOf, text, threshold }).subjects)
        );
      }
      methods.push({
        id: `minilm-drawn-${variant}-${textId}`,
        linked: (threshold) => drawnAt.get(threshold),
      });
      if (textId === "names") {
        // As the board ships it: the one threshold, for every name.
        const shipped = coMembers(links.meaningThreads(board, { vectorOf, text }).subjects);
        methods.push({ id: `shipped-${variant}`, linked: () => shipped, fixed: true });
      }
    }
  }
  // 2c. MiniLM on what was said: each topic as the mean vector of its turns,
  // each turn weighted by its words (as the tracker's own names are chosen).
  // The board cannot do this from what it stores; measured to see what a
  // stored topic vector would buy.
  const content = new Map();
  for (const meeting of data.meetings) {
    const vectors = [];
    for (const node of meeting.snapshot.nodes) {
      if (!links.isLinkableTopic(node)) continue;
      const texts = node.utteranceIds.map((id) => meeting.turns.get(String(id))).filter(Boolean);
      const embedded = await embedder.embed(texts);
      const sum = new Float64Array(embedded[0]?.length ?? 0);
      texts.forEach((text, index) => {
        const weight = text.split(/\s+/).length;
        for (let k = 0; k < sum.length; k += 1) sum[k] += embedded[index][k] * weight;
      });
      let norm = 0;
      for (const value of sum) norm += value * value;
      norm = Math.sqrt(norm) || 1;
      vectors.push({ label: node.label, vector: Float32Array.from(sum, (value) => value / norm) });
    }
    content.set(meeting.id, vectors);
  }
  const contentScores = new Map();
  for (const pair of data.pairs) {
    const match = links.conversationMatch(content.get(pair.a), content.get(pair.b));
    contentScores.set(pair.key, { score: match.score, label: match.a });
  }
  methods.push({
    id: "minilm-pairs-content",
    scores: contentScores,
    linked: (threshold) => {
      const out = new Map();
      for (const [key, value] of contentScores)
        if (value.score >= threshold) out.set(key, value.label);
      return out;
    },
  });

  // Every pair linked: what precision the prevalence alone gives.
  const all = new Map(data.pairs.map((pair) => [pair.key, ""]));
  methods.push({ id: "link-all", linked: () => all, fixed: true });
  return methods;
}

/**
 * Each pair's prediction with a threshold chosen without it: the series are
 * split in five folds, and a pair whose meetings are in folds i and j is
 * predicted with the threshold that does best on the pairs with no meeting in
 * either fold. A method with no threshold is predicted as it is.
 */
function crossFitted(method, pairs, truthLib) {
  if (method.fixed) {
    const linked = method.linked();
    return {
      predict: (pair) => linked.has(pair.key),
      labelOf: (pair) => linked.get(pair.key) ?? null,
    };
  }
  const series = [
    ...new Set(pairs.flatMap((pair) => [truthLib.seriesOf(pair.a), truthLib.seriesOf(pair.b)])),
  ].sort();
  const random = seededRandom(7);
  const shuffled = [...series].sort(() => random() - 0.5);
  const fold = new Map(shuffled.map((name, index) => [name, index % FOLDS]));
  const foldOf = (id) => fold.get(truthLib.seriesOf(id));
  const at = new Map(GRID.map((threshold) => [threshold, method.linked(threshold)]));
  const chosen = new Map();
  const thresholdFor = (i, j) => {
    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
    if (!chosen.has(key)) {
      const training = pairs.filter(
        (pair) => ![i, j].includes(foldOf(pair.a)) && ![i, j].includes(foldOf(pair.b))
      );
      // Imported lazily below; see bestThreshold in lib/link-score.mjs.
      chosen.set(
        key,
        scoreLib.bestThreshold(training, (pair, threshold) => at.get(threshold).has(pair.key), GRID)
      );
    }
    return chosen.get(key);
  };
  const decided = new Map();
  for (const pair of pairs) {
    const threshold = thresholdFor(foldOf(pair.a), foldOf(pair.b));
    const linked = at.get(threshold);
    decided.set(pair.key, { yes: linked.has(pair.key), label: linked.get(pair.key) ?? null });
  }
  const all = scoreLib.bestThreshold(
    pairs,
    (pair, threshold) => at.get(threshold).has(pair.key),
    GRID
  );
  return {
    predict: (pair) => decided.get(pair.key).yes,
    labelOf: (pair) => decided.get(pair.key).label,
    thresholds: [...chosen.values()],
    shipped: all,
  };
}

let scoreLib;

function summarize(method, fitted, pairs, truthLib, { pairWeight } = {}) {
  const out = { id: method.id, categories: {} };
  for (const category of truthLib.CATEGORIES) {
    const subset = pairs.filter((pair) => pair.category === category);
    if (!subset.length) continue;
    out.categories[category] = scoreLib.scoreWithIntervals(subset, fitted.predict, {
      seriesOf: truthLib.seriesOf,
      groupOf: truthLib.groupOf,
      pairWeight,
    });
    if (method.scores) {
      out.categories[category].auc = scoreLib.auc(
        subset,
        (pair) => method.scores.get(pair.key)?.score ?? -1
      );
    }
  }
  const scenario = pairs.filter((pair) => pair.category.startsWith("scenario"));
  out.categories.scenario = scoreLib.scoreWithIntervals(scenario, fitted.predict, {
    seriesOf: truthLib.seriesOf,
    groupOf: truthLib.groupOf,
    pairWeight,
  });
  if (fitted.thresholds) {
    out.thresholds = { folds: [...new Set(fitted.thresholds)].sort(), all: fitted.shipped };
  }
  return out;
}

async function local() {
  scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const data = await corpus();
  const { pairs, truthLib } = data;
  const methods = await localMethods(data);
  const results = [];
  const decisions = {};
  for (const method of methods) {
    const fitted = crossFitted(method, pairs, truthLib);
    results.push(summarize(method, fitted, pairs, truthLib));
    decisions[method.id] = Object.fromEntries(
      pairs.map((pair) => [pair.key, fitted.predict(pair) ? (fitted.labelOf(pair) ?? "") : null])
    );
    if (method.scores) {
      decisions[`${method.id}:scores`] = Object.fromEntries(
        pairs.map((pair) => [
          pair.key,
          Math.round((method.scores.get(pair.key)?.score ?? -1) * 1000) / 1000,
        ])
      );
    }
    const line = results.at(-1);
    const show = (category) => {
      const c = line.categories[category];
      if (!c) return "";
      const f = (value) => (value == null ? "  -  " : value.toFixed(3));
      return `${category}: P ${f(c.precision)} R ${f(c.recall)} F1 ${f(c.f1)} FL ${f(c.falseLinks)}${c.auc != null ? ` AUC ${f(c.auc)}` : ""}`;
    };
    console.log(
      `${method.id.padEnd(30)} ${show("scenario")} | ${show("mixed")} | ${show("non-scenario-within")} | ${show("non-scenario-across")}` +
        (line.thresholds
          ? ` | t ${line.thresholds.folds.join(",")} all ${line.thresholds.all}`
          : "")
    );
  }
  writeJson(cachePath("results", "local.json"), { minWords: Number(args["min-words"]), results });
  writeJson(cachePath("results", "local-decisions.json"), decisions);
  if (args.json) writeJson(args.json, results);
}

// ---------------------------------------------------------------------------
// The remote linker, on the fixed sample. It sees what the app would send: the
// opening of each summary and the writing model's topic names, the new
// conversation and the earlier ones in a shuffled order under letters.

/** Calls in a subset: a seeded shuffle of the meetings, the non-scenario ones always in. */
function subsetOf(calls, count, truthLib) {
  if (!count || count >= calls.length) return calls;
  const random = seededRandom(424242);
  const keep = calls.filter((call) => truthLib.groupOf(call.id) === "non-scenario");
  const rest = calls.filter((call) => truthLib.groupOf(call.id) !== "non-scenario");
  while (keep.length < count && rest.length) {
    keep.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  }
  const order = new Map(calls.map((call, index) => [call.id, index]));
  return keep.sort((a, b) => order.get(a.id) - order.get(b.id));
}

async function remoteContext() {
  const data = await corpus();
  const remote = await import(pathToFileURL(path.join(ROOT, "src/helpers/remoteLinks.mjs")).href);
  const links = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationLinks.mjs")).href
  );
  const { summaryExcerpt } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationGroupSort.mjs")).href
  );
  const described = new Map(
    data.conversations.map((item) => {
      const summary =
        readJson(path.join(CACHE, "gists", slug(GIST_MODEL), `${item.id}.json`))?.summary ?? "";
      return [
        item.id,
        {
          gist: summaryExcerpt(summary, remote.GIST_CHARS),
          topics: remote.linkTopicNames(item.model, { minTopicMs: links.MIN_LINK_TOPIC_MS }),
        },
      ];
    })
  );
  const calls = linkerSample(
    data.conversations.map((item) => item.id),
    data.truthLib
  );
  return { ...data, remote, described, calls };
}

// A second wording, tried once against the app's (`--prompt permissive`): the
// same rules, but two conversations about one project link on any part of it
// both discuss, even at different stages.
const PERMISSIVE_RULE =
  "Link the new conversation to an earlier one when a topic of each is about the same subject: the same thing, question, problem, decision or plan. Two conversations about one project or product are linked when they discuss the same part or aspect of it, even at different stages (for example its design, its price, its features, a deadline); being about the same product with nothing more in common is not enough. A broad area in common is not enough (both about work, about software). Meeting routine never links: greetings, introductions, the agenda, scheduling, the wrap-up.";

function linkSystemPrompt(remote) {
  if (!args.prompt || args.prompt === "app") return remote.LINK_SYSTEM_PROMPT;
  if (args.prompt !== "permissive") throw new Error(`Unknown --prompt ${args.prompt}`);
  const lines = remote.LINK_SYSTEM_PROMPT.split("\n");
  const at = lines.findIndex((line) => line.startsWith("Link the new conversation"));
  lines[at] = PERMISSIVE_RULE;
  return lines.join("\n");
}

/** Where a linker run is cached: the model, and the wording when it is not the app's. */
const runName = (spec) =>
  `${slug(spec)}${args.prompt && args.prompt !== "app" ? `~${args.prompt}` : ""}`;

async function remoteLinks() {
  const spec = args.model;
  if (!spec) throw new Error("--model provider:model");
  const { ask, ledgerTotal } = await fastModels();
  const context = await remoteContext();
  const { remote, described, truthLib } = context;
  const system = linkSystemPrompt(remote);
  const calls = subsetOf(context.calls, Number(args.limit || 0), truthLib);
  let failed = 0;
  await pool(calls, Number(args.concurrency), async (call) => {
    const file = cachePath("linker", runName(spec), `${call.id}.json`);
    if (fs.existsSync(file)) return;
    // The order the earlier conversations are listed in says nothing.
    const random = seededRandom(
      [...call.id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7)
    );
    const earlier = [...call.candidates]
      .map((id) => ({ id, ...described.get(id), order: random() }))
      .sort((a, b) => a.order - b.order);
    const prompt = remote.buildLinkPrompt({ current: described.get(call.id), earlier });
    const answer = await ask(spec, {
      system,
      user: prompt.text,
      schema: remote.LINK_SCHEMA,
      maxTokens: 16000,
      timeoutMs: Number(args.timeout || 240_000),
      purpose: "link-eval:linker",
    });
    const parsed = answer.ok ? remote.parseLinkAnswer(answer.text, prompt.keys) : null;
    if (!parsed) failed += 1;
    writeJson(file, {
      id: call.id,
      candidates: call.candidates,
      ok: Boolean(parsed),
      links: parsed ?? [],
      text: answer.ok ? answer.text : null,
      error: answer.ok ? null : answer.error,
      usage: answer.usage,
      cost: answer.cost,
      ms: answer.ms,
    });
    console.log(
      `${call.id}: ${parsed ? parsed.length : "unreadable"} of ${call.candidates.length} linked, ` +
        `$${(answer.cost ?? 0).toFixed(4)}, ${answer.usage?.output ?? 0} out, $${ledgerTotal().toFixed(3)} in the ledger`
    );
  });
  console.log(`${calls.length} calls, ${failed} unreadable`);
}

// ---------------------------------------------------------------------------
// Scores on the sample: every method on the same pairs.

/** The local methods the tables show, and what they are called there. */
const LOCAL_SHOWN = {
  "words-pairs-device": "1. Words, pair by pair (today's rule)",
  "words-drawn-device": "1. Words, as the board draws them (today)",
  "words-drawn-model": "1. Words, as the board draws them, with writing-model names (today)",
  "minilm-pairs-device-names": "2. MiniLM, tracker names, pairs",
  "minilm-drawn-device-names": "2. MiniLM, tracker names, drawn",
  "minilm-pairs-device-phrases": "2. MiniLM, tracker names and phrases, pairs",
  "minilm-drawn-device-phrases": "2. MiniLM, tracker names and phrases, drawn",
  "minilm-pairs-model-names": "3. MiniLM, writing-model names, pairs",
  "minilm-pairs-model-phrases": "3. MiniLM, writing-model names and phrases, pairs",
  "minilm-drawn-model-names": "3. MiniLM, writing-model names, drawn",
  "minilm-drawn-model-phrases": "3. MiniLM, writing-model names and phrases, drawn",
  "minilm-pairs-content": "2c. MiniLM on what was said (topic vectors), pairs",
  "shipped-device": "Shipped: MiniLM names, drawn, 0.6, tracker names",
  "shipped-model": "Shipped: MiniLM names, drawn, 0.6, writing-model names",
  "link-all": "Baseline: every pair linked",
};

function linkerRuns() {
  const dir = path.join(CACHE, "linker");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    const calls = new Map();
    for (const file of fs.readdirSync(path.join(dir, name))) {
      const value = readJson(path.join(dir, name, file));
      if (value) calls.set(value.id, value);
    }
    return { name, calls };
  });
}

/** Each method's decision and label on each sampled pair it was asked about. */
async function sampleDecisions(context, { only = null } = {}) {
  const { calls, pairs } = context;
  const local = readJson(path.join(CACHE, "results", "local-decisions.json"), {});
  const byKey = new Map(pairs.map((pair) => [pair.key, pair]));
  const asked = [];
  for (const call of calls) {
    for (const other of call.candidates) {
      asked.push({ call: call.id, other, pair: byKey.get([call.id, other].sort().join("|")) });
    }
  }
  const methods = [];
  for (const [id, name] of Object.entries(LOCAL_SHOWN)) {
    if (!local[id]) continue;
    methods.push({
      id,
      name,
      decide: ({ pair }) =>
        local[id][pair.key] == null ? { yes: false } : { yes: true, label: local[id][pair.key] },
      covers: () => true,
    });
  }
  for (const run of linkerRuns()) {
    if (only && !only.includes(run.name)) continue;
    methods.push({
      id: `remote-${run.name}`,
      name: `4. Remote linker, ${run.name.replace(/_/g, " ")}`,
      decide: ({ call, other }) => {
        const answer = run.calls.get(call);
        const link = answer?.links?.find((item) => item.id === other);
        return link ? { yes: true, label: link.subject } : { yes: false };
      },
      covers: ({ call }) => Boolean(run.calls.get(call)?.ok),
    });
  }
  return { asked, methods };
}

async function score() {
  scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const context = await remoteContext();
  const { truthLib, pairs } = context;
  const only = args.model
    ? args.model.split("+").map((spec) => spec.split("~").map(slug).join("~"))
    : null;
  const { asked, methods } = await sampleDecisions(context, { only });
  // Paired: only the pairs every shown method was asked about.
  const common = asked.filter((item) => methods.every((method) => method.covers(item)));
  const total = new Map(
    truthLib.CATEGORIES.map((category) => [
      category,
      pairs.filter((pair) => pair.category === category).length,
    ])
  );
  const sampled = new Map(
    truthLib.CATEGORIES.map((category) => [
      category,
      common.filter((item) => item.pair.category === category).length,
    ])
  );
  const weightOf = (pair) => total.get(pair.category) / Math.max(1, sampled.get(pair.category));
  const out = { pairs: common.length, sampled: Object.fromEntries(sampled), methods: [] };
  const fmt = (value) => (value == null ? "-" : value.toFixed(2));
  const interval = (values) => (values ? `[${fmt(values[0])}, ${fmt(values[1])}]` : "");
  console.log(`${common.length} pairs: ${[...sampled].map(([c, n]) => `${c} ${n}`).join(", ")}`);
  for (const method of methods) {
    const decided = new Map(common.map((item) => [item.pair.key, method.decide(item)]));
    const predicted = (pair) => decided.get(pair.key)?.yes ?? false;
    const row = { id: method.id, name: method.name, categories: {} };
    const groups = {
      scenario: common
        .filter((item) => item.pair.category.startsWith("scenario"))
        .map((item) => item.pair),
      ...Object.fromEntries(
        truthLib.CATEGORIES.map((category) => [
          category,
          common.filter((item) => item.pair.category === category).map((item) => item.pair),
        ])
      ),
    };
    for (const [group, list] of Object.entries(groups)) {
      if (!list.length) continue;
      row.categories[group] = scoreLib.scoreWithIntervals(list, predicted, {
        seriesOf: truthLib.seriesOf,
        groupOf: truthLib.groupOf,
        pairWeight: group === "scenario" ? weightOf : () => 1,
      });
    }
    out.methods.push(row);
    const c = row.categories;
    const cell = (group) =>
      c[group]
        ? `P ${fmt(c[group].precision)} ${interval(c[group].intervals.precision)} R ${fmt(c[group].recall)} ${interval(c[group].intervals.recall)} F1 ${fmt(c[group].f1)} ${interval(c[group].intervals.f1)} FL ${fmt(c[group].falseLinks)} ${interval(c[group].intervals.falseLinks)}`
        : "";
    console.log(
      `\n${method.name}\n  scenario ${cell("scenario")}\n  within   ${cell("scenario-within")}\n  across   ${cell("scenario-across")}\n  mixed    ${cell("mixed")}\n  ns-within ${cell("non-scenario-within")}\n  ns-across ${cell("non-scenario-across")}`
    );
  }
  // Paired: each method's balanced accuracy on the scenario pairs against
  // today's board, and against the first remote linker shown.
  const scenarioPairs = common
    .filter((item) => item.pair.category.startsWith("scenario"))
    .map((item) => item.pair);
  const decide = new Map(
    methods.map((method) => [
      method.id,
      new Map(common.map((item) => [item.pair.key, method.decide(item).yes])),
    ])
  );
  const remoteReference =
    methods.find((method) => method.id === "remote-anthropic_claude-opus-5-5_think_medium") ??
    methods.find((method) => method.id.startsWith("remote-"));
  const references = ["words-drawn-device", remoteReference?.id].filter(Boolean);
  out.paired = {};
  for (const reference of references) {
    out.paired[reference] = {};
    for (const method of methods) {
      if (method.id === reference) continue;
      out.paired[reference][method.id] = scoreLib.pairedBalance(
        scenarioPairs,
        (pair) => decide.get(method.id).get(pair.key),
        (pair) => decide.get(reference).get(pair.key),
        { seriesOf: truthLib.seriesOf, groupOf: truthLib.groupOf, pairWeight: weightOf }
      );
    }
    console.log(`\nBalanced accuracy on scenario pairs, minus ${reference}'s:`);
    for (const [id, value] of Object.entries(out.paired[reference])) {
      console.log(
        `  ${id.padEnd(52)} ${value.delta >= 0 ? "+" : ""}${value.delta.toFixed(2)} [${value.interval[0].toFixed(2)}, ${value.interval[1].toFixed(2)}]`
      );
    }
  }
  writeJson(cachePath("results", `sample${only ? `-${only.join("+")}` : ""}.json`), out);
  if (args.json) writeJson(args.json, out);
}

// ---------------------------------------------------------------------------
// The judge: how well each method names a link, graded blind.
//
// Items are sampled pairs the annotators link (all non-scenario ones, and 60
// inside a series and 60 across, drawn at random) that at least one judged
// method links. The judge sees each meeting's subjects as the annotators
// labelled them, the subjects the two share, and every judged method's name
// for the link, deduplicated and shuffled, with nothing saying which method
// gave which. It grades each name: match 0 to 2 (2: names a subject the two
// share; 1: related, but broader, narrower or vaguer; 0: something they do not
// share), and specificity 1 to 5.

const JUDGED_LOCAL = [
  "words-pairs-device",
  "words-drawn-device",
  "words-drawn-model",
  "shipped-device",
  "shipped-model",
  "minilm-pairs-model-names",
];
const JUDGE_ITEMS = { within: 60, across: 60 };

const JUDGE_SYSTEM = [
  "You grade names for a link between two meetings. The meetings were linked because they talk about the same thing; each name is meant to say what that thing is.",
  "",
  "You get the subjects each meeting covered, as human annotators labelled them, and the subjects both meetings covered. Then a numbered list of proposed names.",
  "",
  "Grade every name:",
  "- match: 2 if it names a subject both meetings covered; 1 if it is related to a shared subject but broader, narrower or vaguer (for example it names only the whole project); 0 if it names something they do not share, or nothing in particular",
  "- specific: 1 to 5, how specifically it says what the two meetings have in common (5: a precise subject; 1: could describe almost any meeting)",
  "",
  'Reply with JSON only: {"ratings":[{"id":1,"match":2,"specific":4}]}, one rating per name.',
].join("\n");

const JUDGE_SCHEMA = {
  name: "link_name_ratings",
  schema: {
    type: "object",
    properties: {
      ratings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            match: { type: "integer" },
            specific: { type: "integer" },
          },
          required: ["id", "match", "specific"],
          additionalProperties: false,
        },
      },
    },
    required: ["ratings"],
    additionalProperties: false,
  },
};

async function judgeItems(context) {
  const { asked, methods } = await sampleDecisions(context);
  const judged = methods.filter(
    (method) => method.id.startsWith("remote-") || JUDGED_LOCAL.includes(method.id)
  );
  const random = seededRandom(99);
  const linked = asked.filter(
    (item) =>
      item.pair.linked && judged.some((method) => method.covers(item) && method.decide(item).yes)
  );
  const pick = (list, count) => {
    const pool = [...list];
    const out = [];
    while (out.length < count && pool.length)
      out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return out;
  };
  const items = [
    ...linked.filter((item) => item.pair.category === "non-scenario-within"),
    ...pick(
      linked.filter((item) => item.pair.category === "scenario-within"),
      JUDGE_ITEMS.within
    ),
    ...pick(
      linked.filter((item) => item.pair.category === "scenario-across"),
      JUDGE_ITEMS.across
    ),
  ];
  return { items, judged };
}

async function judge() {
  const spec = args.model;
  if (!spec) throw new Error("--model provider:model");
  const { ask, ledgerTotal } = await fastModels();
  const context = await remoteContext();
  const { byMeeting } = context;
  const minWords = Number(args["min-words"]);
  const { items, judged } = await judgeItems(context);
  const subjectsOf = (id) =>
    [...byMeeting.get(id).subjects]
      .filter(([, words]) => words >= minWords)
      .sort((a, b) => b[1] - a[1])
      .map(([subject]) => subject);
  const results = await pool(items, Number(args.concurrency), async (item) => {
    const names = new Map();
    for (const method of judged) {
      if (!method.covers(item)) continue;
      const decision = method.decide(item);
      if (!decision.yes || !decision.label) continue;
      const key = decision.label.trim().toLowerCase();
      if (!names.has(key)) names.set(key, { name: decision.label.trim(), methods: [] });
      names.get(key).methods.push(method.id);
    }
    const random = seededRandom(
      [...item.pair.key].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 3)
    );
    const list = [...names.values()]
      .map((entry) => ({ ...entry, order: random() }))
      .sort((a, b) => a.order - b.order);
    const file = cachePath("judge", slug(spec), `${item.pair.key.replace("|", "_")}.json`);
    const cached = readJson(file);
    const known = cached && cached.names?.join("\n") === list.map((entry) => entry.name).join("\n");
    let ratings = known ? cached.ratings : null;
    if (!ratings && list.length) {
      const [a, b] = [item.pair.a, item.pair.b];
      const user = [
        `Meeting 1 covered: ${subjectsOf(a).join("; ") || "nothing specific"}`,
        `Meeting 2 covered: ${subjectsOf(b).join("; ") || "nothing specific"}`,
        `Both covered: ${item.pair.shared.join("; ")}`,
        "",
        "Proposed names:",
        ...list.map((entry, index) => `${index + 1}. ${entry.name}`),
      ].join("\n");
      const answer = await ask(spec, {
        system: JUDGE_SYSTEM,
        user,
        schema: JUDGE_SCHEMA,
        maxTokens: 4000,
        timeoutMs: 120_000,
        parseJson: true,
        purpose: "link-eval:judge",
      });
      ratings = Array.isArray(answer.json?.ratings) ? answer.json.ratings : null;
      writeJson(file, {
        names: list.map((entry) => entry.name),
        ratings,
        error: answer.ok ? null : answer.error,
      });
    }
    return { item, list, ratings };
  });
  // Per method: its names' grades, over the items it named.
  const { bootstrapMean } = await fastModels();
  const out = { judge: spec, items: results.length, methods: [] };
  const fmt = (value) => (value == null ? "-" : value.toFixed(2));
  console.log(`${spec}: ${results.length} items, $${ledgerTotal().toFixed(3)} in the ledger`);
  for (const method of judged) {
    const match = [];
    const specific = [];
    const exact = [];
    for (const { list, ratings } of results) {
      if (!ratings) continue;
      const index = list.findIndex((entry) => entry.methods.includes(method.id));
      if (index < 0) continue;
      const rating = ratings.find((value) => Number(value.id) === index + 1);
      if (!rating) continue;
      match.push(Number(rating.match));
      specific.push(Number(rating.specific));
      exact.push(Number(rating.match) === 2 ? 1 : 0);
    }
    const m = bootstrapMean(match);
    const s = bootstrapMean(specific);
    const e = bootstrapMean(exact);
    out.methods.push({ id: method.id, n: match.length, match: m, specific: s, exact: e });
    console.log(
      `${method.id.padEnd(48)} n ${String(match.length).padStart(3)}  match ${fmt(m.mean)} [${fmt(m.low)}, ${fmt(m.high)}]  ` +
        `names a shared subject ${fmt(e.mean)} [${fmt(e.low)}, ${fmt(e.high)}]  specific ${fmt(s.mean)} [${fmt(s.low)}, ${fmt(s.high)}]`
    );
  }
  writeJson(cachePath("results", `judge-${slug(spec)}.json`), out);
}

// ---------------------------------------------------------------------------
// The tables of docs/link-eval.md, from the cached results.

const SHOWN_REMOTE = {
  "remote-anthropic_claude-opus-5-5_think_medium": "4. Remote: Claude Opus 5.5",
  "remote-anthropic_claude-fable-5-1_think_medium": "4. Remote: Claude Fable 5.1",
  "remote-openai_gpt-6.1-sol_medium": "4. Remote: gpt-6.1-sol, reasoning medium",
  "remote-openai_gpt-6.1-sol_low": "4. Remote: gpt-6.1-sol, reasoning low",
  "remote-openai_gpt-6-astra_medium": "4. Remote: gpt-6-astra, reasoning medium",
  "remote-openai_gpt-6-astra_low": "4. Remote: gpt-6-astra, reasoning low",
  "remote-openai_gpt-5.5-pro": "4. Remote: gpt-5.5-pro",
  "remote-anthropic_claude-opus-5-5_think_medium~permissive":
    "4. Remote: Claude Opus 5.5, permissive wording",
  "remote-openai_gpt-6.1-sol_medium~permissive":
    "4. Remote: gpt-6.1-sol (medium), permissive wording",
};

function report() {
  const f2 = (value) => (value == null ? "–" : value.toFixed(2));
  const ci = (value, interval) =>
    value == null
      ? "–"
      : interval
        ? `${f2(value)} [${f2(interval[0])}, ${f2(interval[1])}]`
        : f2(value);
  const cell = (c, key) => (c ? ci(c[key], c.intervals?.[key]) : "–");
  const counts = (c) =>
    c ? `${Math.round(c.counts.tp)}/${Math.round(c.counts.tp + c.counts.fn)}` : "–";
  const falseCount = (c) =>
    c ? `${Math.round(c.counts.fp)}/${Math.round(c.counts.fp + c.counts.tn)}` : "–";
  const nameOf = (id) => LOCAL_SHOWN[id] ?? SHOWN_REMOTE[id] ?? id;
  const lines = [];
  const local = readJson(path.join(CACHE, "results", "local.json"));
  if (local) {
    lines.push(
      `### Every pair, local methods (${local.results[0] ? "9,591 pairs" : ""}; thresholds cross-fitted)`,
      "",
      "| Method | Scenario P | Scenario R | Scenario F1 | Scenario false links | Within series R | Across series R | Mixed false links | Non-scenario within | Non-scenario across false links |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const row of local.results) {
      if (!LOCAL_SHOWN[row.id]) continue;
      const c = row.categories;
      lines.push(
        `| ${nameOf(row.id)} | ${cell(c.scenario, "precision")} | ${cell(c.scenario, "recall")} | ${cell(c.scenario, "f1")} | ${cell(c.scenario, "falseLinks")} | ${cell(c["scenario-within"], "recall")} | ${cell(c["scenario-across"], "recall")} | ${falseCount(c.mixed)} | ${counts(c["non-scenario-within"])} | ${falseCount(c["non-scenario-across"])} |`
      );
    }
    lines.push("");
  }
  const samples = fs
    .readdirSync(path.join(CACHE, "results"))
    .filter((name) => name.startsWith("sample-"))
    .map((name) => ({ name, value: readJson(path.join(CACHE, "results", name)) }));
  for (const { value } of samples.sort(
    (a, b) => b.value.pairs - a.value.pairs || b.value.methods.length - a.value.methods.length
  )) {
    const remotes = value.methods
      .filter((row) => row.id.startsWith("remote-"))
      .map((row) => nameOf(row.id).replace("4. Remote: ", ""));
    lines.push(
      `### The sample, with ${remotes.join(", ")} (${value.pairs} pairs: ${Object.entries(
        value.sampled
      )
        .map(([category, n]) => `${category} ${n}`)
        .join(", ")})`,
      "",
      "| Method | Scenario P | Scenario R | Scenario F1 | Scenario false links | Within series P | Within series R | Across series P | Across series R | Mixed false links | Non-scenario within | Non-scenario across false links |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const row of value.methods) {
      const c = row.categories;
      lines.push(
        `| ${nameOf(row.id)} | ${cell(c.scenario, "precision")} | ${cell(c.scenario, "recall")} | ${cell(c.scenario, "f1")} | ${cell(c.scenario, "falseLinks")} | ${cell(c["scenario-within"], "precision")} | ${cell(c["scenario-within"], "recall")} | ${cell(c["scenario-across"], "precision")} | ${cell(c["scenario-across"], "recall")} | ${falseCount(c.mixed)} | ${counts(c["non-scenario-within"])} | ${falseCount(c["non-scenario-across"])} |`
      );
    }
    if (value.paired) {
      for (const [reference, rows] of Object.entries(value.paired)) {
        lines.push(
          "",
          `Balanced accuracy (true-link rate minus false-link rate) on the scenario pairs, minus ${nameOf(reference)}'s:`,
          ""
        );
        lines.push("| Method | Difference |", "| --- | --- |");
        for (const [id, entry] of Object.entries(rows))
          lines.push(`| ${nameOf(id)} | ${ci(entry.delta, entry.interval)} |`);
      }
    }
    lines.push("");
  }
  const judges = fs
    .readdirSync(path.join(CACHE, "results"))
    .filter((name) => name.startsWith("judge-"))
    .map((name) => readJson(path.join(CACHE, "results", name)));
  if (judges.length) {
    lines.push(
      "### Link names, graded blind",
      "",
      `| Method | ${judges.map((judge) => `${judge.judge}: match (0–2) | names a shared subject | specific (1–5)`).join(" | ")} |`,
      `| --- | ${judges.map(() => "--- | --- | ---").join(" | ")} |`
    );
    for (const method of judges[0].methods) {
      const cells = judges.map((judge) => {
        const entry = judge.methods.find((item) => item.id === method.id);
        if (!entry) return "– | – | –";
        const m = entry.match;
        const e = entry.exact;
        const s = entry.specific;
        return `${ci(m.mean, [m.low, m.high])} | ${ci(e.mean, [e.low, e.high])} | ${ci(s.mean, [s.low, s.high])}`;
      });
      lines.push(`| ${nameOf(method.id)} (n ${method.n}) | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  const runs = linkerRuns();
  if (runs.length) {
    lines.push(
      "### Cost and time of one check",
      "",
      "| Model | Checks | Cost per check | Output tokens per check | Time, median | Time, 90th percentile |",
      "| --- | --- | --- | --- | --- | --- |"
    );
    for (const run of runs) {
      const calls = [...run.calls.values()];
      const cost = calls.reduce((total, call) => total + (call.cost ?? 0), 0) / calls.length;
      const output =
        calls.reduce((total, call) => total + (call.usage?.output ?? 0), 0) / calls.length;
      const times = calls
        .map((call) => call.ms)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const at = (p) =>
        times.length ? (times[Math.floor(p * (times.length - 1))] / 1000).toFixed(1) : "–";
      lines.push(
        `| ${nameOf(`remote-${run.name}`)} | ${calls.length} | $${cost.toFixed(4)} | ${Math.round(output)} | ${at(0.5)} s | ${at(0.9)} s |`
      );
    }
    lines.push("");
  }
  const text = lines.join("\n");
  if (args.json) fs.writeFileSync(args.json, text);
  console.log(text);
}

/** The sample's make-up, and one request as the model reads it. */
async function sample() {
  const context = await remoteContext();
  const { calls, pairs, remote, described, truthLib } = context;
  const byKey = new Map(pairs.map((pair) => [pair.key, pair]));
  const counts = {};
  for (const call of calls) {
    for (const other of call.candidates) {
      const pair = byKey.get([call.id, other].sort().join("|"));
      const entry = (counts[pair.category] ??= { pairs: 0, linked: 0 });
      entry.pairs += 1;
      if (pair.linked) entry.linked += 1;
    }
  }
  console.log(`${calls.length} calls`);
  for (const [category, entry] of Object.entries(counts)) {
    const total = pairs.filter((pair) => pair.category === category).length;
    console.log(`  ${category}: ${entry.pairs} of ${total} pairs, ${entry.linked} linked`);
  }
  const call = calls.find((item) => item.id === (args.meetings ?? "ES2008d")) ?? calls.at(-1);
  const prompt = remote.buildLinkPrompt({
    current: described.get(call.id),
    earlier: call.candidates.map((id) => ({ id, ...described.get(id) })),
  });
  console.log(
    `\n${prompt.system}\n---\n${prompt.text}\n---\n${[...prompt.keys].map(([k, v]) => `${k}=${v}`).join(" ")}`
  );
  void truthLib;
}

// ---------------------------------------------------------------------------

const COMMANDS = {
  snapshots,
  names,
  gists,
  local,
  remote: remoteLinks,
  sample,
  score,
  judge,
  report,
};

if (!COMMANDS[command]) {
  console.error(`Usage: node scripts/link-eval.mjs <${Object.keys(COMMANDS).join("|")}> [options]`);
  process.exit(1);
}
await COMMANDS[command]();
