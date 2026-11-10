// Topic names and descriptions from the writing model.
//
// Topics are always found on this computer (`conversationTopics.mjs`), and
// named there with the phrase said most in them ("launch date", "SSO"). That
// is a phrase somebody said, not a sentence about the topic. When the person
// has chosen a writing model (Settings › AI models), it names each topic
// better: a short name read from what was said on it, and a description of
// what was said, asked, proposed and decided there, which grows with the
// topic. One request gives both. This
// is the pure half of that: the prompt, reading the answer, when a topic needs
// a name, and putting the names on a snapshot. When requests go out lives in
// `topicNamer.mjs`; the route to the model in `stores/topicNamingRunner.ts`.
//
// The model is the one that writes the summary, reached by the same route, so
// the privacy rule is the summary's: a model on this computer keeps every
// word here, and a cloud provider gets the words of each topic it names
// (`docs/network-allowlist.md`).
//
// Pure and DOM-free, so it unit-tests under node:test.

import { countWords } from "./recordingCounters.mjs";
import { isKeptTopic } from "./liveThreadMap.mjs";

/** A topic gets its first name once this many words were said on it. */
export const FIRST_NAME_WORDS = 40;

/**
 * When the conversation ends, a smaller topic is named too: the record keeps
 * it. Below this there is too little to name from, and a model's guess would
 * read as more certain than the on-device name it replaced.
 */
export const FINAL_NAME_WORDS = 30;

/**
 * While recording, a named topic's name may change once the topic holds this
 * many times the words it had when its name was last open to change. A name
 * read from the first forty words of a topic can be too narrow for the ten
 * minutes that follow; renaming at every turn would make the label a ticker.
 * In steps of 2.5 a name is open to change at 40, 100, 250, 625 and 1,560
 * words: a few times in an hour at most, and it changes only when the model's
 * name does.
 */
export const RENAME_GROWTH = 2.5;

/**
 * While recording, a named topic is asked about again once it holds this many
 * times the words it had at its last request, so its description keeps up
 * with it: at 40, 64, 102, 164, 262, 419, 671 and 1,074 words. Between the
 * steps of `RENAME_GROWTH` the request keeps the name and takes only the new
 * description (`nameMayChange`).
 */
export const DESCRIBE_GROWTH = 1.6;

/**
 * When the conversation ends, a topic that grew by this much since its last
 * name is named again, so the record's name covers the whole topic.
 */
export const FINAL_GROWTH = 1.3;

/** What one request carries of a topic, in characters: under a thousand tokens. */
export const EXCERPT_CHARS = 3000;

/** One turn's share of the excerpt, so a long monologue cannot fill it alone. */
export const TURN_CHARS = 300;

/** Longer than this is not a short name, whatever its word count. */
export const MAX_NAME_CHARS = 48;

/** The length asked of the description of a topic just named, in words. */
export const MIN_DESCRIPTION_WORDS = 15;

/**
 * The most words a description keeps. The request asks for a length that
 * grows with the topic (`descriptionLength`) and never more than this; it
 * bounds a model that does not stop, not a description that needs the room.
 */
export const MAX_DESCRIPTION_WORDS = 80;

/**
 * The most words a name may have. The prompt asks for 2 to 5; a name one word
 * over is kept, not thrown away. Measured on 24 AMI meetings (docs/fast-models.md):
 * gpt-6-luna answered six words to 12% of #121's requests, gpt-5.6-luna, Claude
 * Haiku 5.5 and Sonnet 5.5 to 4 to 5%, and a blind judge scored those names as
 * relevant as the shorter ones and more specific. `MAX_NAME_CHARS` still bounds
 * what the lanes and the graph must fit.
 */
export const MAX_NAME_WORDS = 6;

/**
 * A name and a description of at most `MAX_DESCRIPTION_WORDS` are under two
 * hundred tokens in most languages; this bounds a model that rambles instead
 * of answering. As for the group sort, it is not set for a cloud provider,
 * whose reasoning counts against it, nor while a model on this computer may
 * think.
 */
export const NAME_MAX_TOKENS = 256;

// The description's rules are the ones that kept the gists of
// `scripts/lib/topic-gist.mjs` (prompt v3, for recognized text) the most
// careful with facts in `docs/topics-round-2.md`.
export const TOPIC_NAME_SYSTEM_PROMPT = [
  "You name one topic of a recorded conversation and describe it. You get what was said on that topic, transcribed by speech recognition, so expect errors, filler and half sentences. You also get the names the conversation's other topics already have.",
  "",
  "Reply with exactly two lines and nothing else:",
  "Name: the name",
  "About: the description",
  "One name and one description cover the whole of what was said, even when it touches several things.",
  "",
  "The name:",
  "- says specifically what this part of the conversation is about: the thing, question, problem or decision discussed",
  "- has 2 to 5 words, in the language that was spoken",
  "- is in sentence case, with no quotation marks and no full stop",
  "- is not one of the other topics' names, and not a generic name such as Discussion, Meeting, Conversation or Update",
  "",
  "The description:",
  "- says what was said, asked, proposed or decided on this topic, and what was left open, so that a person who was not there can tell it apart from the other topics",
  "- gives the specific things said: the options, numbers, dates, names and reasons",
  "- is plain sentences in the language that was spoken, of about the length the request gives: the first sentence says what this topic is about and its main point, and the next ones what was decided, proposed or left open, and the other details that matter",
  "- uses only what the lines say. Never add a name, a number, a decision or a reason they do not state. If something was only suggested or asked, say so: do not state it as a plan, a requirement or a decision",
  "- does not name speakers or roles: who said a line is not known",
  "- leaves out a number, name or claim that looks misheard or does not fit, instead of repairing it",
].join("\n");

/**
 * How long a topic's description may be, in words, for a topic of `words`:
 * a sentence for a topic just named, and more as it grows, up to
 * `MAX_DESCRIPTION_WORDS` at about 1,400 words said.
 *
 * @param {number} words
 */
export function descriptionLength(words) {
  const count = Number.isFinite(words) ? Math.max(0, words) : 0;
  return Math.round(
    Math.min(MAX_DESCRIPTION_WORDS, Math.max(MIN_DESCRIPTION_WORDS, 12 + count / 20))
  );
}

/**
 * How many sentences a description of `length` words is asked for: one up to
 * about 26 words, four at the cap. A small model reads "at most N words" as
 * "be brief" and writes one sentence whatever N is (Gemma 4 E4B on AMI's learn
 * meetings: 18 words where up to 80 were allowed), so the request gives a
 * target and a shape.
 *
 * @param {number} length
 */
export function descriptionSentences(length) {
  return Math.min(4, Math.max(1, Math.round(length / 18)));
}

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** A turn cut to `max` characters at a word boundary, marked as cut. */
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The turns a request quotes of a topic, in the order they were said.
 *
 * Turns of one or two words ("Yeah.", "Okay, sure.") say nothing about the
 * subject and are left out. When the rest fits the budget, all of it goes.
 * When it does not, the topic is cut into equal stretches and the longest turn
 * of each is kept: a long topic is read from its beginning to its end, not
 * from its first few minutes, and from the turns that carry the most words.
 *
 * @param {string[]} turns The topic's turns, in the order said.
 * @param {{ budget?: number, turnChars?: number }} [options]
 * @returns {string[]}
 */
export function topicExcerpt(turns, { budget = EXCERPT_CHARS, turnChars = TURN_CHARS } = {}) {
  const lines = (Array.isArray(turns) ? turns : [])
    .map(oneLine)
    .filter((text) => countWords(text) >= 3)
    .map((text) => clip(text, turnChars));
  // Each line is quoted as "- text\n".
  const size = (list) => list.reduce((total, line) => total + line.length + 3, 0);
  if (size(lines) <= budget) return lines;
  for (
    let stretches = Math.min(lines.length, Math.ceil(budget / 40));
    stretches > 0;
    stretches -= 1
  ) {
    const picked = [];
    for (let index = 0; index < stretches; index += 1) {
      const from = Math.floor((index * lines.length) / stretches);
      const to = Math.floor(((index + 1) * lines.length) / stretches);
      let longest = from;
      for (let at = from + 1; at < to; at += 1) {
        if (lines[at].length > lines[longest].length) longest = at;
      }
      picked.push(lines[longest]);
    }
    if (size(picked) <= budget) return picked;
  }
  return [clip(lines[0], budget)];
}

/**
 * The request for one topic's name and description.
 *
 * `others` are the names the conversation's other topics already have from
 * the model, so this one comes out different. `current` is this topic's own
 * name when it is being named again: the model is asked to keep it if it
 * still fits, so a label changes only when the topic did, and to keep it
 * whatever it thinks when `keepName` (the request is for the description
 * only: `nameMayChange`). `words` is how many words the topic holds, which
 * sets the length of the description (`descriptionLength`); without it, the
 * words of `turns`.
 *
 * @param {{ turns: string[], others?: string[], current?: string | null,
 *   keepName?: boolean, words?: number, budget?: number }} input
 * @returns {{ system: string, text: string, excerpt: string[] }}
 */
export function buildTopicNamePrompt({
  turns,
  others = [],
  current = null,
  keepName = false,
  words,
  budget,
}) {
  const excerpt = topicExcerpt(turns, budget ? { budget } : undefined);
  const names = [...new Set((others ?? []).map(oneLine).filter(Boolean))];
  const lines = [`Other topics: ${names.length ? names.join("; ") : "none yet"}`];
  if (current) {
    lines.push(
      keepName
        ? `Current name: ${oneLine(current)}. Reply with it unchanged.`
        : `Current name: ${oneLine(current)}. Reply with it unchanged if it still fits most of what was said. Reply with a better name only if it does not.`
    );
  }
  const count = Number.isFinite(words)
    ? words
    : (Array.isArray(turns) ? turns : []).reduce(
        (total, turn) => total + countWords(String(turn ?? "")),
        0
      );
  const length = descriptionLength(count);
  const sentences = descriptionSentences(length);
  lines.push(
    `Length of the description: about ${length} words, in ${sentences} ${sentences === 1 ? "sentence" : "sentences"}.`
  );
  lines.push("", "What was said on this topic:", ...excerpt.map((line) => `- ${line}`));
  return { system: TOPIC_NAME_SYSTEM_PROMPT, text: lines.join("\n"), excerpt };
}

// Words that name no subject on their own, in the ten shipped languages. A
// name made only of these ("General discussion", "Team meeting update") says
// that people talked, which the lanes already show.
const GENERIC = new Set(
  [
    // English
    "discussion discussions meeting meetings conversation conversations chat chats talk talks",
    "topic topics subject subjects general misc miscellaneous other others various update updates",
    "notes summary overview untitled unknown unclear team group session call sync catch-up catchup",
    "project issue issues thing things stuff item items point points",
    "the a an of and about on for with in to re",
    // German
    "diskussion besprechung gespräch thema themen allgemein allgemeines sonstiges",
    "der die das und über zum zur von mit für",
    // French
    "réunion sujet sujets général divers échange échanges le la les de des du et sur",
    // Spanish
    "discusión reunión conversación tema temas varios charla el los las del y sobre",
    // Portuguese
    "discussão reunião conversa geral diversos assunto assuntos o os as do da e",
    // Italian
    "discussione riunione conversazione temi generale varie argomento argomenti il lo gli di della su",
    // Russian
    "обсуждение встреча разговор тема темы общее разное беседа и о об по",
  ]
    .join(" ")
    .split(" ")
);

// The same for languages written without spaces: a name that is nothing but
// these once they are taken away names no subject.
const GENERIC_UNSPACED = [
  "ミーティング",
  "話し合い",
  "トピック",
  "その他",
  "会議",
  "議論",
  "雑談",
  "話題",
  "全般",
  "討論",
  "會議",
  "對話",
  "讨论",
  "会议",
  "对话",
  "主题",
  "主題",
  "其他",
  "杂项",
  "聊天",
  "の",
  "的",
  "と",
  "和",
  "及",
];

const UNSPACED = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/u;

// What a model says when it will not name the topic. "Unclear" and "unknown"
// are not here: "Unclear ownership" is a fine name, and "Unclear topic" is
// caught as generic.
const REFUSAL =
  /^(?:sorry\b|i\s+(?:cannot|can't|can not|am unable|could not|couldn't)\b|unable to\b|not enough\b|insufficient\b|no clear\b|n\/a$)|\bnot enough (?:information|context)\b/i;

// The prompt's own lines. A provider that gets an empty answer can hand back
// the text it was sent (the dictation cleanup's fallback), whose first line
// would otherwise read as a four-word name.
const ECHO =
  /^(?:other topics|current name|length of the description|what was said on this topic)\b/i;

/** Lower case with letters, digits and single spaces only: for comparing names. */
function nameKey(name) {
  return oneLine(
    String(name ?? "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
  );
}

/** Whether two names say the same thing. */
export function sameName(a, b) {
  const left = nameKey(a);
  return Boolean(left) && left === nameKey(b);
}

function isGeneric(name) {
  if (!/\s/.test(name) && UNSPACED.test(name)) {
    let rest = name;
    for (const word of GENERIC_UNSPACED) rest = rest.split(word).join("");
    return !/[\p{L}\p{N}]/u.test(rest);
  }
  const words = nameKey(name).split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => GENERIC.has(word));
}

// Whether the excerpt reads as English: the only language where a model's
// Title Case is turned into sentence case. German capitalises every noun, and
// lowering "Fernbedienung Design" would misspell it.
const ENGLISH = new Set(
  "the and to of a is that it you we i in this for so but be have it's don't was what".split(" ")
);

function looksEnglish(lines) {
  const words = (Array.isArray(lines) ? lines : [])
    .join(" ")
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter(Boolean);
  if (words.length < 8) return false;
  const common = words.filter((word) => ENGLISH.has(word)).length;
  return common / words.length >= 0.15;
}

/** Words the excerpt writes with a capital in mid-sentence: names, kept as said. */
function properNouns(lines) {
  const kept = new Set();
  for (const line of Array.isArray(lines) ? lines : []) {
    const words = String(line).split(/\s+/);
    for (let index = 1; index < words.length; index += 1) {
      if (/[.!?]$/.test(words[index - 1])) continue;
      const word = words[index].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (/^\p{Lu}/u.test(word)) kept.add(word);
    }
  }
  return kept;
}

/**
 * Sentence case: the first letter a capital, and an English Title Case name
 * ("Remote Control Hardware Design") lowered after its first word, keeping
 * acronyms (SSO, Q3), mixed-case names (iPhone) and the names the excerpt
 * itself capitalised.
 */
function sentenceCase(name, excerpt) {
  const words = name.split(" ");
  const title =
    looksEnglish(excerpt) &&
    words.length > 1 &&
    words.slice(1).every((word) => !/\p{L}/u.test(word) || /^\p{Lu}/u.test(word));
  if (title) {
    const keep = properNouns(excerpt);
    for (let index = 1; index < words.length; index += 1) {
      const word = words[index];
      const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const acronym = /^\p{Lu}[\p{Lu}\p{N}]+s?$/u.test(bare) || /\p{N}/u.test(bare);
      const mixed = /\p{Ll}\p{Lu}/u.test(bare);
      if (!acronym && !mixed && !keep.has(bare)) words[index] = word.toLocaleLowerCase();
    }
  }
  // The first letter a capital, unless the word has its own capitals (iPhone).
  const first = words[0];
  if (!/\p{Ll}\p{Lu}/u.test(first)) words[0] = first.charAt(0).toLocaleUpperCase() + first.slice(1);
  return words.join(" ");
}

/** How many words a name has: spaced words, or for Japanese and Chinese, its words by `Intl.Segmenter`. */
function nameWords(name) {
  return /\s/.test(name) || !UNSPACED.test(name) ? name.split(" ").length : countWords(name);
}

/**
 * The name in a model's answer, or null when the answer has no usable name.
 *
 * Models wrap a name in quotes, bullets, bold, a "Topic:" prefix, a trailing
 * full stop or Title Case, and small ones sometimes explain themselves after
 * it. All of that is taken off. What is left must be 2 to `maxWords` words
 * (`MAX_NAME_WORDS`; for Japanese and Chinese, 1 to 8 words and at least two
 * characters), at most `MAX_NAME_CHARS`, not generic, not a refusal, and not
 * the name another topic already has.
 *
 * @param {unknown} answer
 * @param {{ others?: string[], excerpt?: string[], maxWords?: number }} [context]
 * @returns {string | null}
 */
export function parseTopicName(
  answer,
  { others = [], excerpt = [], maxWords = MAX_NAME_WORDS } = {}
) {
  const text = String(answer ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line || ECHO.test(line)) return null;
  let name = line
    .replace(/^(?:[-*•]|\d+[.)])\s+/u, "")
    .replace(/^(?:topic name|topic|name|title)\s*[:：]\s*/iu, "")
    .replace(/^\*\*(.+)\*\*$/u, "$1")
    .replace(/^`(.+)`$/u, "$1");
  // Quotes and brackets around the whole name, however many layers.
  for (let pass = 0; pass < 3; pass += 1) {
    const unquoted = name
      .trim()
      .replace(/^["'“”‘’«»「『](.*)["'“”‘’«»」』]$/u, "$1")
      .trim();
    if (unquoted === name) break;
    name = unquoted;
  }
  name = oneLine(name.replace(/[\s.,;:!?。、，；：！？…]+$/u, ""));
  if (!name || name.length < 2 || name.length > MAX_NAME_CHARS) return null;
  if (REFUSAL.test(name)) return null;
  const unspaced = !/\s/.test(name) && UNSPACED.test(name);
  const words = nameWords(name);
  if (unspaced ? words > 8 : words < 2 || words > maxWords) return null;
  if (isGeneric(name)) return null;
  name = sentenceCase(name, excerpt);
  if ((others ?? []).some((other) => sameName(other, name))) return null;
  return name;
}

// A line's label in a two-line answer ("Name: …", "**About:** …"), and which
// of the two it starts.
const LINE_LABEL =
  /^[*_]{0,2}\s*(topic name|name|topic|title|about|description|summary|gist)\s*[*_]{0,2}\s*[:：]\s*[*_]{0,2}\s*/iu;
const ABOUT_LABEL = /^(?:about|description|summary|gist)$/i;

const withoutThinking = (value) =>
  String(value ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");

/** Sentences of a paragraph, each with the space after it. */
const SENTENCE = /[^.!?。！？]+(?:[.!?。！？]+["'”’)\]]*|$)\s*/gu;

/** A description cut to `max` words: whole sentences when one fits, else cut at a word and marked. */
function capDescription(text, max) {
  const count = countWords(text);
  if (count <= max) return text;
  let kept = "";
  for (const sentence of text.match(SENTENCE) ?? []) {
    if (countWords(kept + sentence) > max) break;
    kept += sentence;
  }
  if (kept.trim()) return kept.trim();
  if (/\s/.test(text))
    return `${text
      .split(" ")
      .slice(0, max)
      .join(" ")
      .replace(/[\s,;:]+$/u, "")}…`;
  return `${text.slice(0, Math.max(1, Math.floor((text.length * max) / count)))}…`;
}

/**
 * The description in a model's answer, or null when it has none worth showing.
 *
 * One paragraph, with a label, quotes and Markdown emphasis taken off, at
 * most `MAX_DESCRIPTION_WORDS` (whole sentences when they fit). It must have
 * at least three words, and not be a refusal, a line of the prompt handed
 * back, or the name again.
 *
 * @param {unknown} answer
 * @param {{ name?: string | null }} [context]
 * @returns {string | null}
 */
export function parseTopicDescription(answer, { name = null } = {}) {
  let text = oneLine(withoutThinking(answer)).replace(LINE_LABEL, "");
  text = text.replace(/\*\*(.+?)\*\*/gu, "$1");
  for (let pass = 0; pass < 2; pass += 1) {
    const unquoted = text.replace(/^["“«「『](.*)["”»」』]$/u, "$1").trim();
    if (unquoted === text) break;
    text = unquoted;
  }
  if (!text || ECHO.test(text) || REFUSAL.test(text)) return null;
  if (/what was said on this topic/i.test(text)) return null;
  if (countWords(text) < 3) return null;
  if (name && sameName(text, name)) return null;
  return capDescription(text, MAX_DESCRIPTION_WORDS);
}

/** A short line with no sentence end: a name, where a description was expected. */
function looksLikeName(line) {
  return countWords(line) <= 6 && !/[.!?…。！？]["'”’»」』)]*$/u.test(line.trim());
}

/**
 * The name and the description in a model's answer to `buildTopicNamePrompt`.
 *
 * The answer is asked as two labelled lines ("Name: …" and "About: …"). A
 * model that leaves the labels off is read in order: the first line is the
 * name and the rest the description. Either can be null: the name as
 * `parseTopicName` reads it, the description as `parseTopicDescription`. A
 * model that answers with the name only gives no description.
 *
 * @param {unknown} answer
 * @param {{ others?: string[], excerpt?: string[], maxWords?: number }} [context]
 * @returns {{ name: string | null, description: string | null }}
 */
export function parseTopicLabel(answer, context = {}) {
  const lines = withoutThinking(answer)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let nameLine = null;
  const about = [];
  for (const line of lines) {
    const label = LINE_LABEL.exec(line);
    const value = label ? line.slice(label[0].length) : line;
    if (label && ABOUT_LABEL.test(label[1])) about.push(value);
    else if (nameLine === null && (label || !about.length)) nameLine = value;
    // A small model can split a topic into several name and description
    // pairs; only the first pair is this topic's.
    else if (nameLine !== null && about.length && (label || looksLikeName(value))) break;
    else about.push(value);
  }
  const name = nameLine === null ? null : parseTopicName(nameLine, context);
  const description = about.length ? parseTopicDescription(about.join(" "), { name }) : null;
  return { name, description };
}

/**
 * Whether a topic needs a name from the model now: "first" when it has none,
 * "rename" when it has changed size enough since its last request
 * (`DESCRIBE_GROWTH` while recording, so its description keeps up), or null.
 *
 * `words` is how many words the topic holds now (for the topic the room is
 * on, before a change the tracker proposes in it: topicNamer.mjs
 * `namedTurnIds`). `record` is what the topic was last named:
 * `{ name, words }`, `words` at its last request, or null. `final` is the pass at the end
 * of the conversation, which names smaller topics and renames on less change,
 * because the record keeps what it decides.
 *
 * A topic usually only grows. It can also shrink, when the tracker cuts the
 * conversation again (the record is cut with hindsight): a topic that kept
 * half of its turns keeps its name (`nameStillFits`), and is asked again when
 * it lost as much as it would have had to gain.
 *
 * @param {{ words: number, record?: { name: string, words: number } | null,
 *   final?: boolean }} input
 * @returns {"first" | "rename" | null}
 */
export function topicNeedsName({ words, record = null, final = false }) {
  const count = Number.isFinite(words) ? words : 0;
  const floor = final ? FINAL_NAME_WORDS : FIRST_NAME_WORDS;
  if (!record?.name) return count >= floor ? "first" : null;
  // Cut too small to name from: the name it has stays.
  if (count < floor) return null;
  const before = Math.max(1, record.words ?? 0);
  const factor = final ? FINAL_GROWTH : DESCRIBE_GROWTH;
  // At the end, a change of a few words is not worth a request.
  const enough = final ? Math.abs(count - before) >= FINAL_NAME_WORDS : true;
  return enough && (count >= before * factor || count <= before / factor) ? "rename" : null;
}

/**
 * Whether a request for a named topic may change its name, or only its
 * description: the name may change once the topic holds `RENAME_GROWTH` (at
 * the end, `FINAL_GROWTH`) times the words it had when its name was last open
 * to change (`nameWords`, else `words`), or as much fewer. A name the live
 * topic check gave (`held`) is never changed here.
 *
 * @param {{ words: number, record?: { name: string, words?: number,
 *   nameWords?: number, held?: boolean } | null, final?: boolean }} input
 */
export function nameMayChange({ words, record = null, final = false }) {
  if (!record?.name) return true;
  if (record.held) return false;
  const count = Number.isFinite(words) ? words : 0;
  const before = Math.max(1, record.nameWords ?? record.words ?? 0);
  const factor = final ? FINAL_GROWTH : RENAME_GROWTH;
  return count >= before * factor || count <= before / factor;
}

/** Whether a topic can be named at all: one the lanes and the graph show. */
export function isNameableTopic(node) {
  return isKeptTopic(node) && Array.isArray(node?.utteranceIds) && node.utteranceIds.length > 0;
}

/**
 * Whether a name given to a topic still belongs to it: the topic still holds
 * at least half of the turns it held when it was named.
 *
 * Topic ids are the tracker's, and a tracker that regroups turns could hand an
 * id to different words. A name read from other words is wrong, and showing
 * the on-device name is better than showing a wrong one.
 *
 * @param {{ utteranceIds?: unknown[] } | null | undefined} node
 * @param {{ utteranceIds?: unknown[] } | null | undefined} record
 */
export function nameStillFits(node, record) {
  const named = Array.isArray(record?.utteranceIds) ? record.utteranceIds : [];
  if (!named.length) return false;
  const now = new Set((Array.isArray(node?.utteranceIds) ? node.utteranceIds : []).map(String));
  let kept = 0;
  for (const id of named) if (now.has(String(id))) kept += 1;
  return kept * 2 >= named.length;
}

/**
 * A snapshot with the model's names on its topics.
 *
 * A named topic's `label` is the model's name, and its on-device name moves to
 * `deviceLabel`; a topic without a name that still fits keeps its own label.
 * A record's `description` goes on the topic as `description`; a record with
 * none leaves the topic's own (a stored one) in place.
 * Everything that reads a snapshot (the lanes, the graph, the reading view,
 * the export to Obsidian, the conversation groups) reads `label`, so they all
 * show the better name with no change of their own. Returns the same snapshot
 * when nothing changes, so a memo keyed on it holds.
 *
 * @template {{ nodes?: any[] } | null | undefined} S
 * @param {S} snapshot
 * @param {Map<number, { name: string, description?: string | null, utteranceIds: unknown[] }> | null | undefined} names
 * @returns {S}
 */
export function applyTopicNames(snapshot, names) {
  if (!snapshot || !Array.isArray(snapshot.nodes) || !names?.size) return snapshot;
  let changed = false;
  const nodes = snapshot.nodes.map((node) => {
    const record = node ? names.get(node.id) : null;
    if (!record?.name || !nameStillFits(node, record)) return node;
    const deviceLabel = node.deviceLabel ?? node.label;
    const description = record.description || node.description || undefined;
    if (
      node.label === record.name &&
      node.deviceLabel === deviceLabel &&
      node.description === description
    ) {
      return node;
    }
    changed = true;
    return { ...node, label: record.name, deviceLabel, ...(description ? { description } : {}) };
  });
  return changed ? { ...snapshot, nodes } : snapshot;
}

/**
 * The settings of one naming request, on the writing model's own route (what
 * the summary uses): its prompt as the system prompt, no randomness, and the
 * output capped where that is safe (`NAME_MAX_TOKENS`).
 *
 * @template {{ disableThinking?: boolean }} C
 * @param {{ mode: string, config?: C }} route
 * @param {string} system
 * @returns {C & { systemPrompt: string, temperature: number, maxTokens?: number }}
 */
export function topicNameConfig(route, system) {
  const config = route?.config ?? {};
  const capped = route?.mode !== "providers" && config.disableThinking !== false;
  return {
    ...config,
    systemPrompt: system,
    temperature: 0,
    ...(capped ? { maxTokens: NAME_MAX_TOKENS } : {}),
  };
}

/**
 * Whether topics are named while the conversation is recorded, or only when
 * it ends.
 *
 * A model on this computer runs in one llama-server, which holds one model at
 * a time. When the question cards use a classifier model of their own and it
 * is on disk, every name asked for during a recording would make the server
 * unload the classifier and load the writing model, and the next question
 * would load the classifier back: seconds of loading each way, on the path
 * that settles a question card. Then the names wait for the end, when the
 * classifier is done. A provider, a server of the person's own, or a local
 * writing model that is the classifier too, names as the topics grow. So does
 * a local writing model with a server of its own beside the classifier's
 * (`dedicatedWritingServer`, helpers/writingServer.js): nothing is unloaded.
 *
 * @param {{ mode: string, model: string, classifier?: string | null,
 *   classifierOnDisk?: boolean | null, dedicatedWritingServer?: boolean }} input
 *   `classifierOnDisk` is null when it could not be told, which counts as on
 *   disk: a load avoided is worth more than a name a few minutes early.
 */
export function namesWhileRecording({
  mode,
  model,
  classifier = null,
  classifierOnDisk = null,
  dedicatedWritingServer = false,
}) {
  if (mode !== "local") return true;
  if (!classifier || classifier === model) return true;
  return classifierOnDisk === false || dedicatedWritingServer === true;
}

/**
 * The names (and descriptions) a snapshot carries from the model, by topic
 * id, for putting on another copy of the same topics (the record as stored).
 *
 * @param {{ nodes?: any[] } | null | undefined} snapshot
 * @returns {Map<number, { name: string, description?: string, utteranceIds: unknown[] }>}
 */
export function namesOf(snapshot) {
  const names = new Map();
  for (const node of Array.isArray(snapshot?.nodes) ? snapshot.nodes : []) {
    if (node && typeof node.deviceLabel === "string" && node.label) {
      names.set(node.id, {
        name: node.label,
        ...(typeof node.description === "string" && node.description
          ? { description: node.description }
          : {}),
        utteranceIds: node.utteranceIds ?? [],
      });
    }
  }
  return names;
}
