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
//
// `baseline` replays every meeting through `isQuestionCandidate` and
// `extractQuestionSentence` turn by turn in each view, and through the real
// `ConversationAideSession` on a virtual clock for the outcomes. `errors` prints
// false cards and missed questions, for reading by hand. Run it on tuning
// meetings only: the test meetings stay unread. `train` fits the classifier in
// `lib/question-classifier.mjs` on the words of every dialogue act in the
// training meetings: never tuning or test meetings.
//
// --aide <file> reads another copy of conversationAide.mjs, to compare with main.
// --detectors <file> adds the detectors its default export maps by name: each
// reads a turn's text and returns the card's quote, or null for no card.

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
import { features, train as fitClassifier } from "./lib/question-classifier.mjs";
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
    only: { type: "string" },
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
    insertEvent: async () => {
      eventId += 1;
      return eventId;
    },
    updateEvent: async () => null,
    onCard: (card) => cards.set(card.id, { ...cards.get(card.id), ...card }),
    onCardRemoved: (id) => cards.delete(id),
    openSearch: async ({ query }) => {
      searches.push({ query, at: now });
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
  const views = replays.length ? replays : ["manual", "plain"];
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
  console.log(JSON.stringify(outcomes, null, 1));
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ results, outcomes, ids: [...seen] }, null, 1));
  }
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

if (command === "baseline") await baseline();
else if (command === "train") trainClassifier();
else if (command === "errors") await errors();
else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
