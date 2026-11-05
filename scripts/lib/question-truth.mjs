// What counts as a question in a room: the ground truth for the question
// benchmark (`scripts/question-eval.mjs`), from the AMI meeting corpus' human
// dialogue acts and adjacency pairs (manual annotations 1.6.2, CC BY 4.0).
//
// A dialogue act is a span of one speaker's words with one type. Four types
// ask for something: el.inf (asks for information), el.sug (asks for an offer
// or a suggestion), el.ass (asks for an opinion) and el.und (asks whether
// somebody understood). `QUESTION_SETS` says which of them this benchmark
// counts.
//
// An adjacency pair links a first part to a second part ("source" to "target")
// with one of five types: POS, NEG, UNC, PART, ELA. A question with a pair has
// a reply the annotators found.
//
// Words and punctuation are the transcribers'. The app never has them: it has
// recognition output. So every word here keeps its time, and the views in
// `scripts/question-eval.mjs` decide what text a detector gets to read.

import fs from "node:fs";
import path from "node:path";

import { speakerElements } from "./topic-corpus.mjs";

/** The corpus' standard test meetings: the 12 that `AMI_TEST` names. Never tuned on. */
export const TEST_MEETINGS = [
  "ES2004a",
  "ES2004b",
  "ES2004c",
  "ES2004d",
  "IS1009a",
  "IS1009b",
  "IS1009c",
  "IS1009d",
  "TS3003a",
  "TS3003b",
  "TS3003c",
  "TS3003d",
];

/** The 8 test meetings with a far-field recording here: the real-recognition test. */
export const AUDIO_MEETINGS = TEST_MEETINGS.slice(0, 6).concat(["TS3003a", "TS3003b"]);

/**
 * The tuning half of the 24 meetings the topic evals use (`evalSet` in
 * `scripts/topic-loop-eval.mjs`). Their twelfth, IB4010, has no dialogue acts.
 */
export const TUNE_MEETINGS = [
  "ES2003b",
  "ES2007a",
  "ES2009c",
  "ES2012a",
  "ES2014c",
  "IS1002b",
  "IS1004d",
  "IS1007c",
  "TS3005a",
  "TS3007c",
  "TS3010a",
];

/** Which part of the corpus a meeting is in: `test`, `tune` or `train`. */
export function splitOf(meeting) {
  if (TEST_MEETINGS.includes(meeting)) return "test";
  if (TUNE_MEETINGS.includes(meeting)) return "tune";
  return "train";
}

/**
 * Which dialogue acts mean "a question a person would want a card for".
 * Decided on 2026-11-05 from the type glosses and a sample of each type in
 * training meetings, before any detector was scored.
 *
 * `strict` asks for something an answer can hold: information, a suggestion or
 * an opinion, in at least three words that are not fillers. One or two words
 * ("Right?", "One,", "Alright?") say nothing on a card. el.und is out: it is
 * almost all "okay?", "right?" and "you know".
 *
 * `broad` is every elicit act of any length: all that a person asked for
 * anything at all.
 */
export const QUESTION_SETS = {
  strict: { types: new Set(["el.inf", "el.sug", "el.ass"]), minWords: 3 },
  broad: { types: new Set(["el.inf", "el.sug", "el.ass", "el.und"]), minWords: 1 },
};

const FILLER = /^(?:um+|uh+|mm+|hmm+|er+|erm|ah+|oh+|mm-hmm|uh-huh|eh|mm-mm)$/i;

/** `meeting.<X>.dialog-act.xml` type ids, from `ontologies/da-types.xml`. */
export function dialogueActTypes(dir) {
  const xml = fs.readFileSync(path.join(dir, "ontologies", "da-types.xml"), "latin1");
  const names = new Map();
  for (const match of xml.matchAll(/<da-type\b[^>]*?nite:id="([^"]+)"[^>]*?\bname="([^"]+)"/g)) {
    names.set(match[1], match[2]);
  }
  return names;
}

/** `meeting.adjacency-pairs.xml` type ids, from `ontologies/ap-types.xml`. */
export function adjacencyTypes(dir) {
  const xml = fs.readFileSync(path.join(dir, "ontologies", "ap-types.xml"), "latin1");
  const names = new Map();
  for (const match of xml.matchAll(/<ap-type\b[^>]*?nite:id="([^"]+)"[^>]*?\bname="([^"]+)"/g)) {
    names.set(match[1], match[2]);
  }
  return names;
}

/** Every meeting with dialogue acts, by name. */
export function dialogueActMeetings(dir) {
  return fs
    .readdirSync(path.join(dir, "dialogueActs"))
    .filter((file) => file.endsWith(".adjacency-pairs.xml"))
    .map((file) => file.split(".")[0])
    .sort();
}

const idOf = (href) => /#id\(([^)]+)\)/.exec(href)?.[1] ?? null;

function parseActs(dir, meeting, speaker, types, elements, positions) {
  const file = path.join(dir, "dialogueActs", `${meeting}.${speaker}.dialog-act.xml`);
  const acts = [];
  if (!fs.existsSync(file)) return acts;
  const xml = fs.readFileSync(file, "latin1");
  for (const match of xml.matchAll(/<dact\b([^>]*)>([\s\S]*?)<\/dact>/g)) {
    const id = /nite:id="([^"]+)"/.exec(match[1])?.[1];
    if (!id) continue;
    const pointer = /role="da-aspect"\s+href="[^"]*#id\(([^)]+)\)"/.exec(match[2])?.[1];
    const type = pointer ? (types.get(pointer) ?? "unlabelled") : "unlabelled";
    const members = [];
    for (const child of match[2].matchAll(
      /<nite:child\s+href="[^"#]*#id\(([^)]+)\)(?:\.\.id\(([^)]+)\))?"/g
    )) {
      const from = positions.get(child[1]);
      const to = positions.get(child[2] ?? child[1]);
      if (from === undefined || to === undefined) continue;
      for (let index = from; index <= to; index += 1) members.push(elements[index]);
    }
    acts.push({ id, speaker, type, members });
  }
  return acts;
}

function parsePairs(dir, meeting, types) {
  const file = path.join(dir, "dialogueActs", `${meeting}.adjacency-pairs.xml`);
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, "latin1");
  const pairs = [];
  for (const match of xml.matchAll(/<adjacency-pair\b([^>]*)>([\s\S]*?)<\/adjacency-pair>/g)) {
    const pointer = (role) =>
      new RegExp(`role="${role}"\\s+href="([^"]*)"`).exec(match[2])?.[1] ?? null;
    const type = idOf(pointer("type") ?? "");
    pairs.push({
      id: /nite:id="([^"]+)"/.exec(match[1])?.[1] ?? "",
      type: types.get(type) ?? "unlabelled",
      source: idOf(pointer("source") ?? ""),
      target: idOf(pointer("target") ?? ""),
    });
  }
  return pairs;
}

/**
 * One meeting's words, dialogue acts and adjacency pairs.
 *
 * `words` are the spoken words in time order, each `{ speaker, start, end, text,
 * punct, act }`: `text` without punctuation, `punct` the transcribers'
 * punctuation that followed it, `act` the id of its dialogue act or null.
 * Truncated words are left out, as `loadAmiWords` leaves them out.
 *
 * `acts` maps an act id to `{ id, speaker, type, start, end, words, text,
 * asked }`: `words` its spoken words, `text` with the transcribers'
 * punctuation, and `asked` true when that punctuation has a question mark.
 */
export function loadMeeting(dir, meeting, { daTypes, apTypes } = {}) {
  const types = daTypes ?? dialogueActTypes(dir);
  const pairTypes = apTypes ?? adjacencyTypes(dir);
  const speakers = fs
    .readdirSync(path.join(dir, "words"))
    .filter((file) => file.startsWith(`${meeting}.`) && file.endsWith(".words.xml"))
    .map((file) => file.split(".")[1])
    .sort();
  const acts = new Map();
  const words = [];
  for (const speaker of speakers) {
    const elements = speakerElements(dir, meeting, speaker);
    const positions = new Map(elements.map((element, index) => [element.id, index]));
    const actOf = new Map();
    for (const act of parseActs(dir, meeting, speaker, types, elements, positions)) {
      acts.set(act.id, act);
      for (const element of act.members) actOf.set(element.id, act.id);
    }
    let previous = null;
    for (const element of elements) {
      if (element.kind !== "w") continue;
      if (element.punc) {
        if (previous) previous.punct += element.text;
        continue;
      }
      if (element.trunc || !element.text) {
        previous = null;
        continue;
      }
      previous = {
        speaker,
        start: element.start,
        end: Math.max(element.end, element.start),
        text: element.text,
        punct: "",
        act: actOf.get(element.id) ?? null,
      };
      words.push(previous);
    }
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  words.forEach((word, index) => {
    word.index = index;
  });

  const wordsOf = new Map();
  for (const word of words) {
    if (!word.act) continue;
    if (!wordsOf.has(word.act)) wordsOf.set(word.act, []);
    wordsOf.get(word.act).push(word);
  }
  const summary = new Map();
  for (const act of acts.values()) {
    const members = wordsOf.get(act.id) ?? [];
    const lastPunct = act.members.filter((element) => element.kind === "w" && element.punc);
    summary.set(act.id, {
      id: act.id,
      speaker: act.speaker,
      type: act.type,
      words: members,
      start: members[0]?.start ?? null,
      end: members.length ? Math.max(...members.map((word) => word.end)) : null,
      text: members.map((word) => word.text + word.punct).join(" "),
      asked: lastPunct.some((element) => element.text.includes("?")),
    });
  }
  return {
    id: meeting,
    speakers,
    words,
    acts: summary,
    pairs: parsePairs(dir, meeting, pairTypes),
    seconds: words.length ? Math.max(...words.map((word) => word.end)) : 0,
  };
}

/** The adjacency pairs that leave each act, by act id. */
export function repliesTo(meeting) {
  const out = new Map();
  for (const pair of meeting.pairs) {
    if (!pair.source) continue;
    if (!out.has(pair.source)) out.set(pair.source, []);
    out.get(pair.source).push(pair);
  }
  return out;
}

/**
 * The gold questions of a meeting in one of `QUESTION_SETS`, in time order,
 * each with the reply the annotators found:
 *
 *   `answered`  a pair of type POS, NEG, PART or ELA: somebody took it up
 *   `unknown`   only UNC pairs: the annotators marked the reply as uncertain
 *   `open`      no pair at all
 *
 * `replyTypes` lists the pair types, `replyActs` the replies' dialogue act types.
 */
export function goldQuestions(meeting, setName = "strict") {
  const set = QUESTION_SETS[setName];
  const replies = repliesTo(meeting);
  const out = [];
  for (const act of meeting.acts.values()) {
    if (!set.types.has(act.type) || !act.words.length) continue;
    const spoken = act.words.filter((word) => !FILLER.test(word.text)).length;
    if (spoken < set.minWords) continue;
    const pairs = replies.get(act.id) ?? [];
    const types = pairs.map((pair) => pair.type);
    const reply = !pairs.length
      ? "open"
      : types.some((type) => type !== "UNC")
        ? "answered"
        : "unknown";
    out.push({
      id: act.id,
      speaker: act.speaker,
      type: act.type,
      start: act.start,
      end: act.end,
      text: act.text,
      asked: act.asked,
      words: act.words.map((word) => word.index),
      reply,
      replyTypes: types,
      replyActs: pairs.map((pair) => meeting.acts.get(pair.target)?.type ?? null),
      replyText: pairs.map((pair) => meeting.acts.get(pair.target)?.text ?? ""),
      replyStart: pairs.map((pair) => meeting.acts.get(pair.target)?.start ?? null),
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// --- What the app would read.

/**
 * A meeting's manual words cut into turns the way `amiReference` cuts a room:
 * every voice in time order, a new turn at a pause of 400 ms or at 20 s. `at` is
 * when the app would have the finalized text, in milliseconds.
 */
export function roomTurns(meeting, { pauseS = 0.4, maxS = 20, finalDelayMs = 500 } = {}) {
  const turns = [];
  let current = null;
  let lastEnd = -Infinity;
  for (const word of meeting.words) {
    const pause = word.start - lastEnd;
    if (!current || pause >= pauseS || word.end - current.start > maxS) {
      current = { start: word.start, words: [] };
      turns.push(current);
    }
    current.words.push(word);
    lastEnd = Math.max(lastEnd, word.end);
  }
  return turns.map((turn, index) => {
    const end = Math.max(...turn.words.map((word) => word.end));
    return {
      id: `${meeting.id}-${index + 1}`,
      start: turn.start,
      end,
      at: Math.round(end * 1000) + finalDelayMs,
      words: turn.words,
    };
  });
}

/** AMI spells letters out ("L_C_D_", "T_V_s"); recognition writes "LCD" and "TVs". */
export function spoken(text) {
  return text.includes("_") ? text.replace(/_/g, "") : text;
}

const KEEP_CASE = /^(?:I|I'[a-z]+|[A-Z]{2,}s?)$/;

/** A word as recognition with no punctuation would give it: lower case but for "I" and acronyms. */
function plainWord(text) {
  const clean = spoken(text).replace(/[?!.,;:]+$/, "");
  return KEEP_CASE.test(clean) ? clean : clean.toLowerCase();
}

/**
 * The tokens a detector reads for a turn, in one view, each `{ text, word }`
 * with `word` the meeting index of the spoken word it stands for.
 *
 *   `manual`  the transcribers' words and punctuation (view a)
 *   `plain`   the same words with all punctuation gone, in lower case but for
 *             "I", acronyms and the turn's first letter (view b)
 */
export function turnTokens(turn, view) {
  const tokens = turn.words.map((word) => ({
    text: view === "manual" ? spoken(word.text) + word.punct : plainWord(word.text),
    word: word.index,
  }));
  if (view !== "manual" && tokens.length) {
    tokens[0].text = tokens[0].text.charAt(0).toUpperCase() + tokens[0].text.slice(1);
  }
  return tokens;
}

/** Where a quote lies in a turn's tokens: `[from, to)`, or null. The last match wins. */
export function quoteSpan(tokens, quote) {
  const parts = String(quote || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length || parts.length > tokens.length) return null;
  for (let from = tokens.length - parts.length; from >= 0; from -= 1) {
    if (parts.every((part, offset) => tokens[from + offset].text === part)) {
      return [from, from + parts.length];
    }
  }
  return null;
}

// --- Scores.

/** Overlap coefficient: shared words over the shorter of the two. */
export function overlap(a, b) {
  const set = new Set(b);
  let shared = 0;
  for (const item of a) if (set.has(item)) shared += 1;
  const shorter = Math.min(a.length, b.length);
  return { shared, value: shorter ? shared / shorter : 0 };
}

/** A card holds a question when they share at least half of the shorter one. */
export const HIT_OVERLAP = 0.5;
/** A quote reads whole: most of the question, and little that is not the question. */
export const WHOLE_RECALL = 0.8;
export const WHOLE_PRECISION = 0.6;

/**
 * Cards against gold questions in one meeting.
 *
 * A card is `{ at, words }`: when it appeared (ms) and the meeting word indices
 * its quote stands for. A gold question is `{ words, end, ... }`. A card is
 * right when it holds a question (`HIT_OVERLAP`), a question is caught when a
 * card holds it, and `delays` are, per caught question, from the end of the
 * question to its first card (ms). `quote` is per right card, against the
 * question it holds best: the word F1 of quote and question, and whether the
 * quote reads whole.
 */
export function scoreCards(cards, gold) {
  const questionsOf = new Map();
  gold.forEach((question, index) => {
    for (const word of question.words) {
      if (!questionsOf.has(word)) questionsOf.set(word, []);
      questionsOf.get(word).push(index);
    }
  });
  const first = new Array(gold.length).fill(Infinity);
  const quote = [];
  const verdicts = [];
  let right = 0;
  for (const card of cards) {
    const touched = new Set(card.words.flatMap((word) => questionsOf.get(word) ?? []));
    let best = null;
    for (const index of touched) {
      const { shared, value } = overlap(card.words, gold[index].words);
      if (value < HIT_OVERLAP) continue;
      first[index] = Math.min(first[index], card.at);
      const f1 = (2 * shared) / (card.words.length + gold[index].words.length);
      if (!best || f1 > best.f1) best = { index, shared, f1 };
    }
    verdicts.push(best ? gold[best.index].id : null);
    if (!best) continue;
    right += 1;
    const question = gold[best.index];
    quote.push({
      f1: best.f1,
      whole:
        best.shared / question.words.length >= WHOLE_RECALL &&
        best.shared / card.words.length >= WHOLE_PRECISION,
    });
  }
  const delays = [];
  first.forEach((at, index) => {
    if (Number.isFinite(at)) delays.push(at - gold[index].end * 1000);
  });
  return {
    cards: cards.length,
    right,
    gold: gold.length,
    caught: delays.length,
    delays,
    quote,
    verdicts,
    caughtIds: gold.filter((_, index) => Number.isFinite(first[index])).map((item) => item.id),
  };
}

/** Precision, recall and F1 from pooled counts. */
export function prf({ cards, right, gold, caught }) {
  const precision = cards ? right / cards : 0;
  const recall = gold ? caught / gold : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

function pool(rows) {
  const total = { cards: 0, right: 0, gold: 0, caught: 0 };
  for (const row of rows) {
    total.cards += row.cards;
    total.right += row.right;
    total.gold += row.gold;
    total.caught += row.caught;
  }
  return total;
}

/** Sequence of draws from one seed, so a report repeats exactly. */
function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, share) {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/**
 * A 95% bootstrap interval over meetings. `rows` holds one entry per meeting
 * (several arrays side by side for a paired statistic), `statistic` reads the
 * resampled entries. Pooled, so a long meeting counts for more than a short one.
 */
export function bootstrap(rowSets, statistic, { samples = 2000, seed = 1 } = {}) {
  const random = mulberry(seed);
  const size = rowSets[0].length;
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const picks = Array.from({ length: size }, () => Math.floor(random() * size));
    values.push(statistic(...rowSets.map((rows) => picks.map((pick) => rows[pick]))));
  }
  values.sort((a, b) => a - b);
  return [percentile(values, 0.025), percentile(values, 0.975)];
}

/** P, R and F1 of per-meeting rows, each with its interval. */
export function summarize(rows, options) {
  const point = prf(pool(rows));
  const interval = (key) => bootstrap([rows], (pick) => prf(pool(pick))[key], options);
  return {
    ...point,
    ...pool(rows),
    precisionCI: interval("precision"),
    recallCI: interval("recall"),
    f1CI: interval("f1"),
  };
}

/** The paired difference `a - b` of one of P, R, F1 and its interval. */
export function difference(rowsA, rowsB, key = "f1", options) {
  const stat = (a, b) => prf(pool(a))[key] - prf(pool(b))[key];
  return { value: stat(rowsA, rowsB), ci: bootstrap([rowsA, rowsB], stat, options) };
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function quantile(values, share) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, share);
}
