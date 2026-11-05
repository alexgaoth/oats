#!/usr/bin/env node
// The question benchmark: how well the app spots a question in a room, reads its
// quote and reads what came back. Numbers and method: docs/question-eval.md.
//
//   node scripts/question-eval.mjs baseline --ami <dir> [--split tune|test|train]
//     [--meetings a,b] [--json out.json]
//   node scripts/question-eval.mjs errors --ami <dir> --split tune [--view plain]
//     [--set strict] [--detector app] [--out file.tsv]
//
// `baseline` replays every meeting through `isQuestionCandidate` and
// `extractQuestionSentence` turn by turn in each view, and through the real
// `ConversationAideSession` on a virtual clock for the outcomes. `errors` prints
// false cards and missed questions, for reading by hand. Run it on tuning
// meetings only: the test meetings stay unread.
//
// --aide <file> reads another copy of conversationAide.mjs, to compare with main.

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
  roomTurns,
  scoreCards,
  splitOf,
  summarize,
  turnTokens,
} from "./lib/question-truth.mjs";
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
    json: { type: "string" },
    out: { type: "string" },
    limit: { type: "string", default: "60" },
  },
});
const command = positionals[0] ?? "baseline";

const aideFile = args.aide
  ? path.resolve(args.aide)
  : path.join(ROOT, "src/helpers/conversationAide.mjs");
const aide = await import(pathToFileURL(aideFile).href);
const { ConversationAideSession, extractQuestionSentence, isQuestionCandidate } = aide;

const VIEWS = ["manual", "plain"];
const SETS = ["strict", "broad"];

const DETECTORS = {
  app: (text) => (isQuestionCandidate(text) ? extractQuestionSentence(text) : null),
  qmark: (text) => (/[?？]/.test(text) ? extractQuestionSentence(text) : null),
  always: (text) => text,
};

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

/** One meeting's cards from a detector that reads a turn's text and returns its quote. */
function cardsOf(detect, turns, view) {
  const cards = [];
  for (const turn of turns) {
    const tokens = turnTokens(turn, view);
    const quote = detect(textOf(tokens));
    if (!quote) continue;
    const [from, to] = quoteSpan(tokens, quote) ?? [0, tokens.length];
    cards.push({
      id: turn.id,
      at: turn.at,
      words: tokens.slice(from, to).map((token) => token.word),
      turnWords: tokens.map((token) => token.word),
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
async function replaySession(turns, view) {
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
    session.onFinalized({ id: turn.id, text: textOf(turnTokens(turn, view)) });
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
  const ids = meetingsOf(dir);
  const results = {};
  const outcomes = {};
  for (const set of SETS) {
    outcomes[set] = {};
    for (const view of VIEWS) outcomes[set][view] = { confusion: {}, searches: 0, falseSearches: 0 };
  }
  const perMeeting = {};
  let seconds = 0;
  for (const id of ids) {
    const meeting = load(id);
    seconds += meeting.seconds;
    const turns = roomTurns(meeting);
    const gold = Object.fromEntries(SETS.map((set) => [set, goldQuestions(meeting, set)]));
    for (const view of VIEWS) {
      for (const [name, detect] of Object.entries(DETECTORS)) {
        const cards = cardsOf(detect, turns, view);
        for (const set of SETS) {
          const score = scoreCards(cards, gold[set]);
          const turnScore = scoreCards(
            cards.map((card) => ({ ...card, words: card.turnWords })),
            gold[set]
          );
          const key = `${view}/${set}/${name}`;
          (perMeeting[key] ??= []).push({ ...score, seconds: meeting.seconds, id });
          (perMeeting[`${key}/turn`] ??= []).push({ ...turnScore, seconds: meeting.seconds, id });
        }
      }
      const { cards: states, searches } = await replaySession(turns, view);
      const detected = cardsOf(DETECTORS.app, turns, view);
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
  console.log(`${args.split}: ${ids.length} meetings, ${(seconds / 3600).toFixed(1)} h\n`);
  for (const view of VIEWS) {
    for (const set of SETS) {
      console.log(`--- view ${view}, gold ${set}`);
      for (const name of Object.keys(DETECTORS)) {
        const key = `${view}/${set}/${name}`;
        results[key] = row(perMeeting[key]);
        printRow(name, results[key]);
        results[`${key}/turn`] = row(perMeeting[`${key}/turn`]);
        printRow(`${name} (card on whole turn)`, results[`${key}/turn`]);
      }
    }
    console.log("");
  }
  const drop = difference(
    perMeeting["plain/strict/app"],
    perMeeting["manual/strict/app"],
    "f1"
  );
  console.log(
    `app F1, plain minus manual, strict: ${drop.value.toFixed(3)} ${ci(drop.ci)}`
  );
  console.log(JSON.stringify(outcomes, null, 1));
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ results, outcomes, ids }, null, 1));
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
    const turns = roomTurns(meeting);
    const gold = goldQuestions(meeting, args.set);
    const broad = new Map(goldQuestions(meeting, "broad").map((item) => [item.id, item]));
    const cards = cardsOf(detect, turns, view);
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

if (command === "baseline") await baseline();
else if (command === "errors") await errors();
else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
