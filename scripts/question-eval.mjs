#!/usr/bin/env node
// The question benchmark: how well the app spots a question in a room, reads its
// quote and reads what came back. Numbers and method: docs/question-eval.md.
//
//   node scripts/question-eval.mjs baseline --ami <dir> [--split tune|test|train]
//     [--meetings a,b] [--replay name,name] [--json out.json]
//   node scripts/question-eval.mjs errors --ami <dir> --split tune [--view plain]
//     [--set strict] [--detector app] [--out file.tsv]
//
// A view is `manual` (the transcribers' words and punctuation), `plain` (none of
// their punctuation) or `rec:<name>`, recognition output from
// `<replays>/<name>/<meeting>.json`. `--replay` names the recognition views; with
// one, `baseline` scores the meetings that have that replay.
//
//   node scripts/question-eval.mjs train --out model.json [--alpha 0.2] [--l1 1]
//     [--l2 10] [--epochs 6] [--dropout 0]
//   node scripts/question-eval.mjs bars --a a.json --b b.json --key view/set/name
//     [--key-b view/set/name]: method a against method b, per meeting, as the bars
//     in docs/question-eval.md read it. Each file comes from `baseline --json`.
//   node scripts/question-eval.mjs refine --spec local:qwen3.5-4b|fm:system|openai:...
//     --replay name --detectors file --detector name [--gguf file] [--concurrency 8]
//
// `baseline` replays every meeting through `isQuestionCandidate` and
// `extractQuestionSentence` turn by turn in each view, and through the real
// `ConversationAideSession` on a virtual clock for the outcomes. `errors` prints
// false cards and missed questions, for reading by hand. Run it on tuning
// meetings only: the test meetings stay unread. `train` fits the classifier in
// `lib/question-classifier.mjs` on the words of every dialogue act in the
// training meetings: never tuning or test meetings. `refine` asks a model whether
// each card of a detector is a real question, the way a refine step would after
// the card is up: it reads the card's line, the line before and the line after. A
// failed or malformed answer keeps the card (CLAUDE.md, question rule 4). Answers
// are cached in ~/oats-asr-cache/question-eval/refine, and cloud requests go to the
// fast-models ledger (FM_LEDGER, FM_BUDGET_USD). Cloud keys are for AMI only.
//
// --aide <file> reads another copy of conversationAide.mjs, to compare with main.
// --detectors <file> adds the detectors its default export maps by name: each
// reads a turn's text and returns the card's quote, or null for no card.
// --model <file> --threshold T --mark M adds `classifier`, a model from `train`:
// a card when a turn's best candidate scores T or more, with M added for a "?".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  AUDIO_MEETINGS,
  TEST_MEETINGS,
  TUNE_MEETINGS,
  adjacencyTypes,
  dialogueActMeetings,
  dialogueActTypes,
  difference,
  goldQuestions,
  loadMeeting,
  median,
  pairedDelays,
  quantile,
  quoteSpan,
  reachedRecognition,
  recognizedTurns,
  roomTurns,
  scoreCards,
  splitOf,
  spoken,
  summarize,
  turnTokens,
} from "./lib/question-truth.mjs";
import {
  bestCandidate,
  features,
  modelFrom,
  train as fitClassifier,
} from "./lib/question-classifier.mjs";
import { annotationsDir } from "./lib/topic-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(process.env.HOME, "oats-asr-cache/AMI") },
    split: { type: "string", default: "tune" },
    meetings: { type: "string" },
    view: { type: "string" },
    set: { type: "string", default: "strict" },
    detector: { type: "string", default: "app" },
    aide: { type: "string" },
    detectors: { type: "string" },
    model: { type: "string" },
    threshold: { type: "string", default: "-1" },
    mark: { type: "string", default: "3" },
    only: { type: "string" },
    a: { type: "string" },
    b: { type: "string" },
    key: { type: "string" },
    "key-b": { type: "string" },
    replay: { type: "string" },
    replays: {
      type: "string",
      default: path.join(process.env.HOME, "oats-asr-cache/replays"),
    },
    json: { type: "string" },
    out: { type: "string" },
    alpha: { type: "string", default: "0.2" },
    l1: { type: "string", default: "1" },
    l2: { type: "string", default: "10" },
    epochs: { type: "string", default: "6" },
    dropout: { type: "string", default: "0" },
    spec: { type: "string" },
    gguf: { type: "string" },
    prompt: { type: "string", default: "v1" },
    concurrency: { type: "string", default: "8" },
    port: { type: "string", default: "8471" },
  },
});
const command = positionals[0] ?? "baseline";

const aideFile = args.aide
  ? path.resolve(args.aide)
  : path.join(ROOT, "src/helpers/conversationAide.mjs");
const aide = await import(pathToFileURL(aideFile).href);
const { ConversationAideSession, extractQuestionSentence, isQuestionCandidate } = aide;

const SETS = ["strict", "broad"];

const BASE_DETECTOR = (text) => (isQuestionCandidate(text) ? extractQuestionSentence(text) : null);

const DETECTORS = {
  app: BASE_DETECTOR,
  qmark: (text) => (/[?？]/.test(text) ? extractQuestionSentence(text) : null),
  always: (text) => text,
};

if (args.model) {
  const model = modelFrom(JSON.parse(fs.readFileSync(args.model, "utf8")));
  const threshold = Number(args.threshold);
  const mark = Number(args.mark);
  DETECTORS.classifier = (text) => {
    const top = bestCandidate(model, text, { mark });
    return top && top.score >= threshold ? top.quote : null;
  };
}
if (args.detectors) {
  const extra = await import(pathToFileURL(path.resolve(args.detectors)).href);
  Object.assign(DETECTORS, await (typeof extra.default === "function" ? extra.default(aide) : extra.default));
}
if (args.only) {
  for (const name of Object.keys(DETECTORS)) {
    if (!args.only.split(",").includes(name)) delete DETECTORS[name];
  }
}

function meetingsOf(dir) {
  if (args.meetings) return args.meetings.split(",");
  if (args.split === "test") return TEST_MEETINGS;
  if (args.split === "audio") return AUDIO_MEETINGS;
  if (args.split === "tune") return TUNE_MEETINGS;
  return dialogueActMeetings(dir).filter((id) => splitOf(id) === args.split);
}

function textOf(tokens) {
  return tokens.map((token) => token.text).join(" ");
}

function replayOf(name, id) {
  const file = path.join(args.replays, name, `${id}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** A meeting's turns in one view, each with the `tokens` a detector reads. */
function viewTurns(meeting, view) {
  if (view.startsWith("rec:")) {
    const replay = replayOf(view.slice(4), meeting.id);
    return replay ? recognizedTurns(meeting, replay.segments) : null;
  }
  return roomTurns(meeting).map((turn) => ({ ...turn, tokens: turnTokens(turn, view) }));
}

/** One meeting's cards from a detector that reads a turn's text and returns its quote. */
function cardsOf(detect, turns) {
  const cards = [];
  for (const turn of turns) {
    const { tokens } = turn;
    const quote = detect(textOf(tokens));
    if (!quote) continue;
    const [from, to] = quoteSpan(tokens, quote) ?? [0, tokens.length];
    const known = (token) => token.word !== null;
    cards.push({
      id: turn.id,
      at: turn.at,
      words: tokens.slice(from, to).filter(known).map((token) => token.word),
      turnWords: tokens.filter(known).map((token) => token.word),
      quote,
      turn: textOf(tokens),
    });
  }
  return cards;
}

/**
 * The real session on a virtual clock, with no classifier: what a card ends up
 * as, what it quotes, and which searches open by themselves.
 */
async function replaySession(turns) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const cards = new Map();
  const searches = [];
  const replies = new Map();
  let eventId = 0;
  const session = new ConversationAideSession({
    noteId: 1,
    classify: null,
    now: () => now,
    setTimer: (callback, ms) => {
      timerId += 1;
      timers.set(timerId, { at: now + ms, callback });
      return timerId;
    },
    clearTimer: (id) => timers.delete(id),
    insertEvent: async (event) => {
      eventId += 1;
      if (event.kind === "response" && event.metadata?.outcome === "denied") {
        replies.set(event.parentEventId, event.text);
      }
      return eventId;
    },
    updateEvent: async () => null,
    // Words are arriving: a turn has started and is not final yet.
    isSpeaking: () => turns.some((turn) => turn.start * 1000 <= now && now < turn.at),
    onCard: (card) => cards.set(card.id, { ...cards.get(card.id), ...card }),
    onCardRemoved: (id) => cards.delete(id),
    openSearch: async ({ query }) => {
      searches.push({ query, at: now, reply: [...replies.values()].at(-1) ?? "" });
      return true;
    },
  });
  const fireUntil = async (time) => {
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= time)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) return;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
      await session.evaluation;
    }
  };
  for (const turn of turns) {
    await fireUntil(turn.at);
    now = turn.at;
    session.onFinalized({ id: turn.id, text: textOf(turn.tokens) });
    await session.evaluation;
  }
  await fireUntil(Infinity);
  await session.shutdown();
  return { cards, searches };
}

/** A reply that says so in words, not one that only has a "no" in it. */
const SAYS_UNKNOWN =
  /\b(?:don['’]?t know|do not know|dunno|no idea|no clue|not sure|can['’]?t remember|don['’]?t remember|never heard|nobody knows)\b/i;

function loader(dir) {
  const daTypes = dialogueActTypes(dir);
  const apTypes = adjacencyTypes(dir);
  return (id) => loadMeeting(dir, id, { daTypes, apTypes });
}

const pct = (value) => (value === null ? "-" : value.toFixed(3));
const ci = (pair) => `[${pair[0].toFixed(3)}, ${pair[1].toFixed(3)}]`;

function row(rows) {
  const s = summarize(rows);
  const delays = rows.flatMap((item) => item.delays);
  const quotes = rows.flatMap((item) => item.quote);
  const hours = rows.reduce((sum, item) => sum + item.seconds, 0) / 3600;
  return {
    precision: s.precision,
    precisionCI: s.precisionCI,
    recall: s.recall,
    recallCI: s.recallCI,
    f1: s.f1,
    f1CI: s.f1CI,
    cards: s.cards,
    right: s.right,
    gold: s.gold,
    caught: s.caught,
    falsePerHour: (s.cards - s.right) / hours,
    cardsPerHour: s.cards / hours,
    delayMedianMs: median(delays),
    delayP90Ms: quantile(delays, 0.9),
    quoteF1: quotes.length ? quotes.reduce((sum, q) => sum + q.f1, 0) / quotes.length : null,
    quoteWhole: quotes.length ? quotes.filter((q) => q.whole).length / quotes.length : null,
  };
}

function printRow(name, r) {
  console.log(
    `${name.padEnd(30)} P ${pct(r.precision)} ${ci(r.precisionCI)}  R ${pct(r.recall)} ${ci(r.recallCI)}  F1 ${pct(r.f1)} ${ci(r.f1CI)}  cards/h ${r.cardsPerHour.toFixed(0)} false/h ${r.falsePerHour.toFixed(0)}  delay ${(r.delayMedianMs / 1000).toFixed(1)}s p90 ${(r.delayP90Ms / 1000).toFixed(1)}s  quote f1 ${pct(r.quoteF1)} whole ${pct(r.quoteWhole)}`
  );
}

async function baseline() {
  const dir = annotationsDir(args.ami);
  const load = loader(dir);
  const replays = args.replay ? args.replay.split(",").map((name) => `rec:${name}`) : [];
  const views = replays.length ? replays : ["manual", "plain", "unasked"];
  const ids = meetingsOf(dir);
  const results = {};
  const outcomes = {};
  const reach = {};
  for (const set of SETS) {
    outcomes[set] = {};
    for (const view of views) outcomes[set][view] = { confusion: {}, searches: 0, falseSearches: 0 };
  }
  const perMeeting = {};
  let seconds = 0;
  const seen = new Set();
  for (const id of ids) {
    const meeting = load(id);
    const gold = Object.fromEntries(SETS.map((set) => [set, goldQuestions(meeting, set)]));
    for (const view of views) {
      const turns = viewTurns(meeting, view);
      if (!turns) continue;
      if (!seen.has(id)) seconds += meeting.seconds;
      seen.add(id);
      const heard = new Set(turns.flatMap((turn) => turn.tokens.map((token) => token.word)));
      for (const [name, detect] of Object.entries(DETECTORS)) {
        const cards = cardsOf(detect, turns);
        for (const set of SETS) {
          const score = scoreCards(cards, gold[set]);
          const turnScore = scoreCards(
            cards.map((card) => ({ ...card, words: card.turnWords })),
            gold[set]
          );
          const key = `${view}/${set}/${name}`;
          (perMeeting[key] ??= []).push({ ...score, seconds: meeting.seconds, id });
          (perMeeting[`${key}/turn`] ??= []).push({ ...turnScore, seconds: meeting.seconds, id });
          if (view.startsWith("rec:")) {
            const reached = gold[set].filter((q) => reachedRecognition(q, meeting, heard));
            const caught = new Set(score.caughtIds);
            const tally = (reach[`${key}`] ??= { gold: 0, reached: 0, caughtReached: 0 });
            tally.gold += gold[set].length;
            tally.reached += reached.length;
            tally.caughtReached += reached.filter((q) => caught.has(q.id)).length;
          }
        }
      }
      const { cards: states, searches } = await replaySession(turns);
      const detected = cardsOf(DETECTORS.app ?? BASE_DETECTOR, turns);
      for (const set of SETS) {
        const score = scoreCards(detected, gold[set]);
        const byId = new Map(gold[set].map((question) => [question.id, question]));
        const tally = outcomes[set][view];
        tally.searches += searches.length;
        tally.searchesSaid = (tally.searchesSaid ?? 0) + searches.filter((item) => SAYS_UNKNOWN.test(item.reply)).length;
        tally.seconds = (tally.seconds ?? 0) + meeting.seconds;
        (tally.searchList ??= []).push(...searches.map((item) => `${item.query.slice(0, 90)} => ${item.reply.slice(0, 90)}`));
        const queries = new Set(searches.map((search) => search.query));
        detected.forEach((card, index) => {
          const state = states.get(card.id)?.state ?? "gone";
          const question = byId.get(score.verdicts[index]);
          const goldReply = question ? question.reply : "not a question";
          tally.confusion[goldReply] ??= {};
          tally.confusion[goldReply][state] = (tally.confusion[goldReply][state] ?? 0) + 1;
          if (state === "denied" && !question && queries.has(card.quote)) tally.falseSearches += 1;
        });
      }
    }
  }
  console.log(`${args.split}: ${seen.size} meetings, ${(seconds / 3600).toFixed(1)} h\n`);
  for (const view of views) {
    for (const set of SETS) {
      console.log(`--- view ${view}, gold ${set}`);
      for (const name of Object.keys(DETECTORS)) {
        const key = `${view}/${set}/${name}`;
        if (!perMeeting[key]) continue;
        results[key] = row(perMeeting[key]);
        printRow(name, results[key]);
        results[`${key}/turn`] = row(perMeeting[`${key}/turn`]);
        printRow(`${name} (card on whole turn)`, results[`${key}/turn`]);
        if (reach[key]) {
          const r = reach[key];
          results[key].reach = r;
          console.log(
            `  recognition kept ${r.reached} of ${r.gold} questions (${pct(r.reached / r.gold)}); recall on those ${pct(r.caughtReached / r.reached)}`
          );
        }
      }
    }
    console.log("");
  }
  if (views.includes("plain")) {
    const drop = difference(perMeeting["plain/strict/app"], perMeeting["manual/strict/app"], "f1");
    console.log(`app F1, plain minus manual, strict: ${drop.value.toFixed(3)} ${ci(drop.ci)}`);
  }
  for (const view of views) {
    const tally = outcomes.strict[view];
    const hours = tally.seconds / 3600;
    console.log(
      `${view}: ${tally.searches} searches opened by themselves (${(tally.searches / hours).toFixed(1)} an hour), ${tally.searchesSaid} on a reply that says it does not know`
    );
    console.log(JSON.stringify(tally.confusion));
    const answered = tally.confusion.answered ?? {};
    const total = Object.values(answered).reduce((sum, count) => sum + count, 0);
    console.log(
      `of ${total} right cards with a gold answer: ${pct((answered.answered ?? 0) / (total || 1))} answered, ${pct((answered.uncertain ?? 0) / (total || 1))} uncertain, ${pct((answered.silence ?? 0) / (total || 1))} silence, ${pct((answered.denied ?? 0) / (total || 1))} denied`
    );
  }
  // Only tuning meetings print what was searched: the test meetings stay unread.
  if (args.split !== "test" && args.split !== "audio") {
    for (const view of views) console.log(outcomes.strict[view].searchList.join("\n"));
  }
  if (args.json) {
    const rows = Object.fromEntries(
      Object.entries(perMeeting)
        .filter(([key]) => !key.endsWith("/turn"))
        .map(([key, list]) => [
          key,
          list.map(({ id, seconds: length, cards, right, gold, caught, delayOf, delays, quote }) => ({
            id,
            seconds: length,
            cards,
            right,
            gold,
            caught,
            delayOf,
            delays,
            quote,
          })),
        ])
    );
    fs.writeFileSync(
      args.json,
      JSON.stringify({ results, outcomes, ids: [...seen], rows })
    );
  }
}

/** Method a against method b on the same meetings, as the bars read it. */
function bars() {
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf8")).rows;
  const keyA = args.key;
  const keyB = args["key-b"] ?? keyA;
  const a = read(args.a)[keyA];
  const b = read(args.b)[keyB];
  const line = (name, r) => {
    const s = summarize(r);
    const hours = r.reduce((sum, item) => sum + item.seconds, 0) / 3600;
    console.log(
      `${name}: P ${pct(s.precision)} R ${pct(s.recall)} F1 ${pct(s.f1)}, ${(s.cards / hours).toFixed(0)} cards an hour, ${((s.cards - s.right) / hours).toFixed(0)} false`
    );
  };
  line(`a ${keyA}`, a);
  line(`b ${keyB}`, b);
  for (const key of ["f1", "precision", "recall"]) {
    const gap = difference(a, b, key);
    console.log(
      `${key} a - b: ${gap.value >= 0 ? "+" : ""}${gap.value.toFixed(3)} ${ci(gap.ci)}${gap.ci[0] <= 0 && gap.ci[1] >= 0 ? " (holds 0)" : ""}`
    );
  }
  const paired = pairedDelays(a, b);
  console.log(
    `first-card delay on ${paired.length} questions both caught, a - b: median ${median(paired)} ms, 90th percentile ${quantile(paired, 0.9)} ms, largest ${paired.length ? Math.max(...paired) : 0} ms`
  );
}

async function errors() {
  if (args.split === "test" || args.split === "audio") {
    console.error("errors reads tuning or training meetings only: the test meetings stay unread.");
    process.exit(2);
  }
  const dir = annotationsDir(args.ami);
  const load = loader(dir);
  const view = args.view ?? "plain";
  const detect = DETECTORS[args.detector];
  const lines = [];
  for (const id of meetingsOf(dir)) {
    const meeting = load(id);
    const turns = viewTurns(meeting, view);
    if (!turns) continue;
    const gold = goldQuestions(meeting, args.set);
    const broad = new Map(goldQuestions(meeting, "broad").map((item) => [item.id, item]));
    const cards = cardsOf(detect, turns);
    const score = scoreCards(cards, gold);
    const scoreBroad = scoreCards(cards, [...broad.values()]);
    cards.forEach((card, index) => {
      if (score.verdicts[index]) return;
      const act = meeting.acts.get(meeting.words[card.words[0]]?.act);
      const near = scoreBroad.verdicts[index] ? broad.get(scoreBroad.verdicts[index]).type : "";
      lines.push(
        ["FP", id, card.id, act?.type ?? "", near, card.quote.slice(0, 220)].join("\t")
      );
    });
    const caught = new Set(score.caughtIds);
    for (const question of gold) {
      if (caught.has(question.id)) continue;
      lines.push(
        ["FN", id, question.id.split(".").pop(), question.type, question.asked ? "?" : "", question.text.slice(0, 220)].join("\t")
      );
    }
  }
  const text = `${lines.join("\n")}\n`;
  if (args.out) fs.writeFileSync(args.out, text);
  else process.stdout.write(text);
  console.error(`${lines.length} lines`);
}

/**
 * The words of every dialogue act in the training meetings: strict questions
 * against everything that elicits nothing. The acts in between (a short "right?",
 * an el.und) teach it nothing it should repeat, so they are left out.
 */
function trainClassifier() {
  const dir = annotationsDir(args.ami);
  const load = loader(dir);
  const dropout = Number(args.dropout);
  let state = 12345;
  const draw = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const examples = [];
  for (const id of dialogueActMeetings(dir).filter((item) => splitOf(item) === "train")) {
    const meeting = load(id);
    const strict = new Set(goldQuestions(meeting, "strict").map((question) => question.id));
    const broad = new Set(goldQuestions(meeting, "broad").map((question) => question.id));
    for (const act of meeting.acts.values()) {
      if (!act.words.length || (broad.has(act.id) && !strict.has(act.id))) continue;
      const kept = act.words.filter(() => !dropout || draw() >= dropout);
      const text = (kept.length ? kept : act.words).map((word) => spoken(word.text)).join(" ");
      examples.push({ features: features(text, { punctuation: false }), y: strict.has(act.id) ? 1 : 0 });
    }
  }
  const started = Date.now();
  const model = fitClassifier(examples, {
    alpha: Number(args.alpha),
    l1: Number(args.l1),
    l2: Number(args.l2),
    epochs: Number(args.epochs),
  });
  console.log(
    `${examples.length} acts, ${examples.filter((example) => example.y).length} questions, ${model.entries.length} weights, ${((Date.now() - started) / 1000).toFixed(1)} s`
  );
  fs.writeFileSync(args.out, JSON.stringify({ bias: model.bias, entries: model.entries }));
}

// --- A model reads the cards.

const REFINE_SYSTEM = {
  v1: `You read a live transcript of a meeting, written by speech recognition, so words can be wrong and question marks can be missing.
Decide whether the line marked LINE asks a real question: the speaker wants information, an opinion, a decision or a suggestion from the others.
These are not questions: statements, even with words like what or how in them; bare checks such as "right?" or "okay?"; asides such as "what's it called"; a fragment with no clear ask.
Answer with one JSON object and nothing else: {"question": true} or {"question": false}.`,
};

const APP_SYSTEM = "You are a local conversation question classifier. Follow the JSON contract exactly.";

const REFINE_SCHEMA = {
  name: "question_verdict",
  schema: {
    type: "object",
    properties: { question: { type: "boolean" } },
    required: ["question"],
    additionalProperties: false,
  },
};

function refinePrompt(before, line, after) {
  const parts = [];
  if (before) parts.push(`BEFORE: ${before}`);
  parts.push(`LINE: ${line}`);
  if (after) parts.push(`AFTER: ${after}`);
  return parts.join("\n");
}

/** Foundation Models through the bridge: one JSON line out, one JSON line back. */
async function foundationModels() {
  const { spawn } = await import("node:child_process");
  const { createInterface } = await import("node:readline");
  const binary = path.join(process.env.HOME, "oats-asr-cache/fidelity-2/fm-bridge/bin/fm-bridge");
  const child = spawn(binary, ["serve"], { stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const reply = JSON.parse(line);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  });
  const schema = {
    type: "object",
    properties: { question: { type: "boolean" } },
    required: ["question"],
  };
  let serial = 0;
  return {
    ask: (system, user) =>
      new Promise((resolve) => {
        serial += 1;
        const id = String(serial);
        waiting.set(id, resolve);
        child.stdin.write(
          `${JSON.stringify({ id, system, prompt: user, temperature: 0, maxTokens: 30, seed: 1, schema })}\n`
        );
      }),
    stop: () => child.stdin.end(),
  };
}

async function refine() {
  const crypto = await import("node:crypto");
  const dir = annotationsDir(args.ami);
  const load = loader(dir);
  const views = args.view
    ? [args.view]
    : (args.replay ?? "")
        .split(",")
        .filter(Boolean)
        .map((name) => `rec:${name}`);
  const detect = DETECTORS[args.detector];
  const spec = args.spec;
  const system = args.prompt === "app" ? APP_SYSTEM : REFINE_SYSTEM[args.prompt];
  const appPrompt = args.prompt === "app";
  const cacheFile = path.join(
    process.env.HOME,
    "oats-asr-cache/question-eval/refine",
    `${spec.replace(/[^\w.@-]+/g, "_")}.jsonl`
  );
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const cache = new Map();
  if (fs.existsSync(cacheFile)) {
    for (const line of fs.readFileSync(cacheFile, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line);
      cache.set(row.key, row);
    }
  }
  const items = [];
  const rows = [];
  for (const id of meetingsOf(dir)) {
    const meeting = load(id);
    const gold = goldQuestions(meeting, args.set);
    for (const view of views) {
      const turns = viewTurns(meeting, view);
      if (!turns) continue;
      const index = new Map(turns.map((turn, at) => [turn.id, at]));
      const cards = cardsOf(detect, turns).map((card) => {
        const at = index.get(card.id);
        const line = card.quote;
        const next = at + 1 < turns.length ? textOf(turns[at + 1].tokens) : "";
        const user = appPrompt
          ? aide.buildClassifierPrompt({ id: card.id }, [
              { id: card.id, text: textOf(turns[at].tokens) },
              ...(next ? [{ id: "next", text: next }] : []),
            ])
          : refinePrompt(at > 0 ? textOf(turns[at - 1].tokens) : "", line, next);
        const key = crypto
          .createHash("sha1")
          .update(`${args.prompt}\n${user}`)
          .digest("hex");
        const item = { key, user, card };
        items.push(item);
        return item;
      });
      rows.push({ id, view, meeting, gold, cards });
    }
  }
  const pending = [...new Map(items.filter((item) => !cache.has(item.key)).map((item) => [item.key, item])).values()];
  console.log(`${items.length} cards, ${pending.length} to ask ${spec}`);
  const keep = (key, row) => {
    cache.set(key, row);
    fs.appendFileSync(cacheFile, `${JSON.stringify({ key, ...row })}\n`);
  };
  // `--prompt app` is the app's own classifier: its prompt, its strict JSON, and
  // its rule that a confident "not factual" withdraws the card.
  const parse = (text) => {
    if (args.prompt === "app") {
      const verdict = aide.parseQuestionAssessment(String(text ?? "").trim());
      if (!verdict) return null;
      return !(!verdict.isFactualQuestion && verdict.confidence >= 0.75);
    }
    const match = /"question"\s*:\s*(true|false)/.exec(String(text ?? ""));
    return match ? match[1] === "true" : null;
  };
  if (pending.length && spec.startsWith("fm:")) {
    const fm = await foundationModels();
    let done = 0;
    for (const item of pending) {
      const reply = await fm.ask(system, item.user);
      keep(item.key, {
        verdict: reply.ok ? parse(reply.text) : null,
        ms: reply.ms ?? null,
        error: reply.ok ? null : reply.error,
      });
      done += 1;
      if (done % 100 === 0) console.log(`${done}/${pending.length}`);
    }
    fm.stop();
  } else if (pending.length) {
    const fast = await import("./lib/fast-models.mjs");
    const local = spec.startsWith("local:");
    if (local) {
      const binary = path.join(ROOT, "resources/bin/llama-server-darwin-arm64");
      await fast.startLocalServer(spec.slice(6).split("@")[0], {
        binary: fs.existsSync(binary)
          ? binary
          : path.join(process.env.HOME, "oats-wt/speech-2/resources/bin/llama-server-darwin-arm64"),
        model: args.gguf,
        port: Number(args.port),
        contextSize: 2048,
      });
    }
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < pending.length) {
        const item = pending[next];
        next += 1;
        const answer = await fast.ask(spec, {
          system,
          user: item.user,
          maxTokens: appPrompt ? 220 : 30,
          schema: appPrompt ? undefined : REFINE_SCHEMA,
          timeoutMs: 60000,
          purpose: "question-refine",
          attempts: 2,
          parseJson: false,
        });
        keep(item.key, {
          verdict: answer.ok ? parse(answer.text) : null,
          ms: answer.ms ?? null,
          error: answer.ok ? null : String(answer.error).slice(0, 120),
        });
        done += 1;
        if (done % 100 === 0) {
          console.log(`${done}/${pending.length}, $${fast.ledgerTotal().toFixed(3)} in the ledger`);
        }
      }
    };
    await Promise.all(Array.from({ length: local ? 1 : Number(args.concurrency) }, worker));
    fast.stopLocalServers();
  }
  const perView = {};
  for (const { id, view, meeting, gold, cards } of rows) {
    const before = scoreCards(cards.map((item) => item.card), gold);
    const kept = cards.filter((item) => cache.get(item.key)?.verdict !== false);
    const after = scoreCards(kept.map((item) => item.card), gold);
    const verdicts = new Map(after.verdicts.map((v, at) => [kept[at].key, v]));
    const removed = cards.filter((item) => cache.get(item.key)?.verdict === false);
    const wrongly = removed.filter((item) => before.verdicts[cards.indexOf(item)]).length;
    (perView[view] ??= { before: [], after: [], removed: 0, wrongly: 0, failed: 0 });
    const tally = perView[view];
    tally.before.push({ ...before, seconds: meeting.seconds, id });
    tally.after.push({ ...after, seconds: meeting.seconds, id });
    tally.removed += removed.length;
    tally.wrongly += wrongly;
    tally.failed += cards.filter((item) => (cache.get(item.key)?.verdict ?? null) === null).length;
    verdicts.clear();
  }
  const out = {};
  for (const [view, tally] of Object.entries(perView)) {
    console.log(`--- ${view}, ${spec}`);
    printRow("before", row(tally.before));
    printRow("after", row(tally.after));
    const gain = difference(tally.after, tally.before, "f1");
    console.log(
      `F1 gain ${gain.value.toFixed(3)} ${ci(gain.ci)}; withdrew ${tally.removed} cards, ${tally.wrongly} of them right; ${tally.failed} answers failed`
    );
    out[view] = { before: row(tally.before), after: row(tally.after), gain, removed: tally.removed, wrongly: tally.wrongly, failed: tally.failed };
  }
  const times = [...cache.values()].map((item) => item.ms).filter(Number.isFinite);
  console.log(`median ${median(times)} ms, p90 ${quantile(times, 0.9)} ms over ${times.length} answers`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
}

if (command === "baseline") await baseline();
else if (command === "train") trainClassifier();
else if (command === "bars") bars();
else if (command === "refine") await refine();
else if (command === "errors") await errors();
else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
