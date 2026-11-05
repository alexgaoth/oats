// A summary written in parts, for a model on this Mac.
//
// One request over a whole transcript fails a local model in two ways. A
// conversation over about an hour does not fit its context, and a shorter one
// gets a thin, confident summary: it states about half of what was decided and
// it invents facts. So the work is cut in two.
//
// 1. Read. Each part of the transcript (about 10 minutes) goes to the model on
//    its own. The model lists decisions, actions, problems and other points,
//    each with the words that show it. The code then drops any item whose
//    quote is not in the transcript, and any item that states a number the
//    transcript does not have. This is the rule of the context check
//    (contextCheck.mjs): the verdict is the model's, the evidence is not.
// 2. Write. The items that survive go to the model again, which writes the
//    notes from them and from nothing else.
//
// docs/summaries.md has the measurements. Pure and DOM-free, so it can be
// tested and the eval runs the text that ships. The caller gives it `chat`,
// one request to a model.

/** A part of the transcript, in characters: about 10 minutes of a busy room. */
export const PART_CHARS = 10_000;

/** Parts overlap, so that a decision on the border is seen whole at least once. */
export const OVERLAP_CHARS = 400;

const KINDS = ["decisions", "actions", "problems", "points"];

/** The most items a part may give, by list: the limit on what a part can cost to write. */
const MAX_ITEMS = { decisions: 8, actions: 6, problems: 6, points: 8 };

export const EXTRACT_SYSTEM = `You take notes on a conversation. You get one part of its transcript, written by speech recognition. It can contain misheard words, and it usually has no speaker names.

List what a participant would want on record from this part:
- decisions: what the participants agreed on or settled. Not a proposal that nobody took up.
- actions: what someone took on, or was asked to do, after this conversation.
- problems: problems, risks, disagreements and open questions they raised.
- points: other important facts, options, numbers and reasons.

Each item has two fields:
- text: one short plain sentence that states the point and its specifics. Say only what the transcript says. Give a person's name only if the transcript says it.
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.

An item whose quote is not in the transcript word for word is thrown away. Leave a list empty when this part has nothing for it. Do not repeat an item.`;

/** The JSON the model is held to (a grammar on llama-server). */
export function extractSchema({ quoteFirst = false } = {}) {
  const fields = quoteFirst ? ["quote", "text"] : ["text", "quote"];
  const list = (maxItems) => ({
    type: "array",
    maxItems,
    items: {
      type: "object",
      properties: Object.fromEntries(fields.map((field) => [field, { type: "string" }])),
      required: fields,
      order: fields,
      additionalProperties: false,
    },
  });
  return {
    type: "object",
    properties: Object.fromEntries(KINDS.map((kind) => [kind, list(MAX_ITEMS[kind])])),
    required: KINDS,
    order: KINDS,
    additionalProperties: false,
  };
}

/** The same task with the evidence first: the model copies the words, then says what they mean. */
export const EXTRACT_SYSTEM_QUOTE_FIRST = EXTRACT_SYSTEM.replace(
  `Each item has two fields:
- text: one short plain sentence that states the point and its specifics. Say only what the transcript says. Give a person's name only if the transcript says it.
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.`,
  `Each item has two fields, in this order:
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.
- text: one short plain sentence that states the point and its specifics. Say only what the quote and the lines around it say. Give a person's name only if the transcript says it.`
);

export function extractUser(part, index, total) {
  return `Transcript, part ${index + 1} of ${total}:\n\n${part}\n\nAnswer with the JSON object only.`;
}

export const VERIFY_TASK = `Check these claims about the transcript above. For each one, answer true only if the transcript states it, and a decision only if the participants really agreed on it. Answer false if the claim goes beyond what was said, or gets a number, a name or the meaning wrong.`;

export function verifyUser(part, index, total, items) {
  const claims = items.map((item, n) => `${n + 1}. ${item.text}`).join("\n");
  return `Transcript, part ${index + 1} of ${total}:\n\n${part}\n\n${VERIFY_TASK}\n\nClaims:\n${claims}\n\nAnswer with the JSON object only.`;
}

export function verifySchema(count) {
  return {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: { type: "boolean" },
      },
    },
    required: ["verdicts"],
    order: ["verdicts"],
    additionalProperties: false,
  };
}

export const WRITE_SYSTEM = `You write the notes of a conversation in markdown. You get a list of items that were checked against its transcript: what was decided, what somebody took on, the problems raised and other points. The list is in the order of the conversation. Some items may say the same thing.

FORMAT RULES (strict):
- No preamble: no title, no date, no attendee list. Start directly with a 1-2 sentence summary of what the conversation was about.
- Then use these section headings: ## Threads, ## Key Discussion Points, ## Decisions Made, ## Action Items, ## Follow-ups. Leave out a section that has no content.
- Under ## Threads, write the 2-5 important lines of thought as short bullets: where each started, how it went, what stays open.
- Under ## Action Items, use checkboxes (\`- [ ]\`).
- Under ## Follow-ups, put the open questions and problems nobody resolved.
- No tables, no horizontal rules, no block quotes.

CONTENT RULES:
- Use only the items. Add no fact, number, name, date or reason of your own.
- Keep every decision and every action, and keep the specifics: numbers, names, options.
- Merge items that say the same thing. Do not call something decided unless it is in the decisions list.
- Write plainly, with no filler.`;

export const OVERVIEW_SYSTEM = `You write the top of the notes of a conversation in markdown. You get a list of items that were checked against its transcript: what was decided, what somebody took on, the problems raised and other points. The list is in the order of the conversation.

Write exactly this and nothing else:
- First a 1-2 sentence summary of what the conversation was about. No title, no heading.
- Then the heading ## Threads, with the 2-5 important lines of thought as short bullets: where each started, how it went, what stays open.

Use only the items. Add no fact, number, name, date or reason of your own. Do not call something decided unless it is in the decisions list. Write plainly, with no filler.`;

export function writeUser(items, { quotes = false } = {}) {
  const lines = [];
  const titles = {
    decisions: "Decisions",
    actions: "Actions",
    problems: "Problems",
    points: "Other points",
  };
  for (const kind of KINDS) {
    const list = items.filter((item) => item.kind === kind);
    if (!list.length) continue;
    lines.push(`${titles[kind]}:`);
    for (const item of list) {
      lines.push(quotes ? `- ${item.text} (said: "${item.quote}")` : `- ${item.text}`);
    }
    lines.push("");
  }
  return `The checked items:\n\n${lines.join("\n")}\nWrite the notes.`;
}

// --- Parts.

/**
 * The transcript cut into parts at its blank lines (the segments), each at most
 * `partChars` long, the next one starting `overlapChars` before the last one's
 * end. A transcript that fits is one part.
 *
 * @param {string} text
 * @param {{ partChars?: number, overlapChars?: number }} [options]
 * @returns {string[]}
 */
export function splitTranscript(text, { partChars = PART_CHARS, overlapChars = OVERLAP_CHARS } = {}) {
  const value = String(text ?? "").trim();
  if (!value) return [];
  if (value.length <= partChars) return [value];
  const segments = [];
  for (const segment of value.split(/\n\s*\n/)) {
    const clean = segment.trim();
    if (!clean) continue;
    // A segment longer than a part (no pauses in it) is cut at spaces.
    if (clean.length <= partChars) {
      segments.push(clean);
      continue;
    }
    let rest = clean;
    while (rest.length > partChars) {
      const cut = rest.lastIndexOf(" ", partChars);
      const at = cut > 0 ? cut : partChars;
      segments.push(rest.slice(0, at));
      rest = rest.slice(at).trim();
    }
    if (rest) segments.push(rest);
  }
  const parts = [];
  let start = 0;
  while (start < segments.length) {
    let end = start;
    let chars = 0;
    while (end < segments.length && (end === start || chars + segments[end].length + 2 <= partChars)) {
      chars += segments[end].length + 2;
      end += 1;
    }
    parts.push(segments.slice(start, end).join("\n\n"));
    if (end >= segments.length) break;
    // Step back over the overlap, never to or before the part's own start.
    let back = end;
    let overlap = 0;
    while (back - 1 > start && overlap < overlapChars) {
      back -= 1;
      overlap += segments[back].length + 2;
    }
    start = back;
  }
  return parts;
}

// --- The check on an item: the words that prove it are in the transcript.

// Sounds a model leaves out of a quote, and a recognizer sometimes writes.
const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "hm", "hmm", "mm", "mmm"]);

/** The words of a text, for comparing: lower case, no punctuation, no filler sounds. */
export function wordsOf(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLERS.has(word));
}

function exactAt(needle, words) {
  const first = needle[0];
  for (let i = words.indexOf(first); i >= 0 && i <= words.length - needle.length; ) {
    let j = 1;
    while (j < needle.length && words[i + j] === needle[j]) j += 1;
    if (j === needle.length) return i;
    i = words.indexOf(first, i + 1);
  }
  return -1;
}

function lcsLength(a, b) {
  let previous = new Uint16Array(b.length + 1);
  let row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], row[j - 1]);
    }
    [previous, row] = [row, previous];
  }
  return previous[b.length];
}

/**
 * Where a quote is in a transcript's words, or null. A word-for-word match
 * always counts. With `tolerance` above 0, a quote also counts when that share
 * of it at most differs from a stretch of the transcript, in order: a model
 * that quotes well still mends a broken sentence or drops a repeated word.
 *
 * @param {string} quote
 * @param {string[]} words `wordsOf(transcript)`
 * @param {{ tolerance?: number, minWords?: number }} [options]
 * @returns {{ at: number, exact: boolean } | null}
 */
export function findQuote(quote, words, { tolerance = 0.2, minWords = 3 } = {}) {
  const needle = wordsOf(quote);
  if (needle.length < minWords) return null;
  const exact = exactAt(needle, words);
  if (exact >= 0) return { at: exact, exact: true };
  if (tolerance <= 0) return null;
  const wanted = Math.ceil(needle.length * (1 - tolerance));
  const inQuote = new Set(needle);
  const span = needle.length + Math.ceil(needle.length * tolerance) + 1;
  let best = -1;
  let bestAt = -1;
  for (let i = 0; i < words.length; i += 1) {
    if (!inQuote.has(words[i])) continue;
    const length = lcsLength(needle, words.slice(i, i + span));
    if (length > best) {
      best = length;
      bestAt = i;
      if (best === needle.length) break;
    }
  }
  return best >= wanted ? { at: bestAt, exact: false } : null;
}

const NUMBER_WORDS = new Map(
  Object.entries({
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  })
);
const SCALES = new Map([
  ["hundred", 100],
  ["thousand", 1000],
  ["million", 1000000],
]);

/**
 * Every number a text states, in digits or in words, as strings: "25", "12.5",
 * and for spoken numbers the value and the digits as said ("twenty five" is 25;
 * "two five" is 2, 5 and 25; "twelve point five" is 12.5).
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function numbersIn(text) {
  const found = new Set();
  const plain = String(text ?? "")
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1");
  for (const match of plain.matchAll(/\d+(?:\.\d+)?/g)) {
    found.add(String(Number(match[0])));
  }
  const words = plain.replace(/[^a-z0-9.\s-]/g, " ").split(/[\s-]+/);
  let i = 0;
  while (i < words.length) {
    if (!NUMBER_WORDS.has(words[i]) && !SCALES.has(words[i])) {
      i += 1;
      continue;
    }
    let total = 0;
    let current = 0;
    let digits = "";
    let run = 0;
    while (i < words.length) {
      const word = words[i];
      if (word === "and" && run > 0 && (NUMBER_WORDS.has(words[i + 1]) || SCALES.has(words[i + 1]))) {
        i += 1;
        continue;
      }
      if (NUMBER_WORDS.has(word)) {
        const value = NUMBER_WORDS.get(word);
        current += value;
        digits += String(value);
        found.add(String(value));
      } else if (SCALES.has(word)) {
        const scale = SCALES.get(word);
        if (scale === 100) current = (current || 1) * 100;
        else {
          total += (current || 1) * scale;
          current = 0;
        }
      } else break;
      run += 1;
      i += 1;
    }
    found.add(String(total + current));
    if (run > 1) found.add(digits);
    if (words[i] === "point" && NUMBER_WORDS.has(words[i + 1])) {
      found.add(`${total + current}.${NUMBER_WORDS.get(words[i + 1])}`);
    }
  }
  return found;
}

/** The numbers an item's text states that its part of the transcript does not. */
export function unsupportedNumbers(text, sourceNumbers) {
  return [...numbersIn(text)].filter((value) => !sourceNumbers.has(value));
}

/** JSON cut at the output limit, closed at its last whole value, or null. */
function closeCutJson(text) {
  const open = [];
  let inString = false;
  let escaped = false;
  // The last place the text could stop: just after a value, and what was open there.
  let cut = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      open.pop();
      cut = { at: i + 1, open: [...open] };
    }
  }
  if (!cut) return null;
  return text.slice(0, cut.at) + cut.open.reverse().join("");
}

function firstJsonObject(raw) {
  const text = String(raw ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  for (const candidate of [
    end > start ? text.slice(start, end + 1) : null,
    closeCutJson(text.slice(start)),
  ]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // The next way of reading it, or nothing.
    }
  }
  return null;
}

/**
 * The items of a part's answer that hold up.
 *
 * @param {string} raw The model's answer.
 * @param {string} part The transcript part it read.
 * @param {{ quote?: "exact" | "fuzzy" | "off", numbers?: boolean, tolerance?: number }} [options]
 * @returns {{ items: { kind: string, text: string, quote: string, at: number }[],
 *   dropped: { kind: string, text: string, quote: string, why: string }[], parsed: boolean }}
 */
export function checkedItems(raw, part, { quote = "fuzzy", numbers = true, tolerance = 0.2 } = {}) {
  const parsed = firstJsonObject(raw);
  const items = [];
  const dropped = [];
  if (!parsed) return { items, dropped, parsed: false };
  const words = wordsOf(part);
  const sourceNumbers = numbersIn(part);
  for (const kind of KINDS) {
    const list = Array.isArray(parsed[kind]) ? parsed[kind] : [];
    for (const entry of list) {
      const text = String(entry?.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const said = String(entry?.quote ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const found =
        quote === "off"
          ? { at: 0, exact: false }
          : findQuote(said, words, { tolerance: quote === "exact" ? 0 : tolerance });
      if (!found) {
        dropped.push({ kind, text, quote: said, why: "quote" });
        continue;
      }
      if (numbers && unsupportedNumbers(text, sourceNumbers).length) {
        dropped.push({ kind, text, quote: said, why: "number" });
        continue;
      }
      items.push({ kind, text, quote: said, at: found.at, exact: found.exact });
    }
  }
  return { items, dropped, parsed: true };
}

// --- Merging the parts' items.

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have in is it its of on or that the their them they this to was were will with we you i he she our".split(
    " "
  )
);

const contentWords = (text) => new Set(wordsOf(text).filter((word) => !STOPWORDS.has(word)));

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * The items of all parts in the order of the conversation, each said once. An
 * item seen again (the overlap, or a point the room came back to) is dropped,
 * and a decision outranks the same words as a plain point.
 *
 * @param {{ kind: string, text: string, quote: string, position: number }[]} items
 * @param {{ similar?: number }} [options]
 */
export function mergeItems(items, { similar = 0.6 } = {}) {
  const rank = (item) => KINDS.indexOf(item.kind);
  const ordered = [...items].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
  const kept = [];
  for (const item of ordered) {
    const words = contentWords(item.text);
    const said = contentWords(item.quote);
    const again = kept.some(
      (other) => overlap(words, other.words) >= similar || overlap(said, other.said) >= 0.8
    );
    if (!again) kept.push({ ...item, words, said });
  }
  return kept
    .map(({ words, said, ...item }) => item)
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

// --- The notes without a second request: the items as they are.

export function renderItems(items) {
  const lines = [];
  const section = (title, kind, mark = "- ") => {
    const list = items.filter((item) => item.kind === kind);
    if (!list.length) return;
    lines.push(`## ${title}`, ...list.map((item) => `${mark}${item.text}`), "");
  };
  section("Key Discussion Points", "points");
  section("Decisions Made", "decisions");
  section("Action Items", "actions", "- [ ] ");
  section("Follow-ups", "problems");
  return lines.join("\n").trim();
}

// --- A second pass over written notes: each bullet is checked where it came from.

/** The bullet lines of written notes, with their index in the text's lines. */
export function noteBullets(text) {
  const bullets = [];
  String(text ?? "")
    .split("\n")
    .forEach((line, index) => {
      const match = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
      if (match) bullets.push({ index, text: match[1].replace(/\*\*/g, "").trim() });
    });
  return bullets;
}

/** The part a claim most likely came from: the one that shares the most of its words. */
export function bestPart(claim, parts) {
  const wanted = contentWords(claim);
  let best = 0;
  let bestScore = -1;
  parts.forEach((part, index) => {
    const score = part.reduce((sum, word) => sum + (wanted.has(word) ? 1 : 0), 0) / (part.length || 1);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * Written notes with every bullet the transcript does not support taken out.
 * Bullets are grouped by the part they most likely came from, and each part is
 * read once.
 */
export async function verifyNotes({ text, transcript, chat, partChars, overlapChars }) {
  const parts = splitTranscript(transcript, { partChars, overlapChars });
  const partWords = parts.map((part) => wordsOf(part));
  const bullets = noteBullets(text);
  const byPart = new Map();
  for (const bullet of bullets) {
    const at = bestPart(bullet.text, partWords);
    if (!byPart.has(at)) byPart.set(at, []);
    byPart.get(at).push(bullet);
  }
  const removed = new Set();
  const dropped = [];
  for (const [index, list] of [...byPart.entries()].sort((a, b) => a[0] - b[0])) {
    const answer = await chat({
      step: `check-${index + 1}`,
      system: EXTRACT_SYSTEM,
      user: verifyUser(parts[index], index, parts.length, list),
      schema: verifySchema(list.length),
      maxTokens: 16 + list.length * 6,
      temperature: 0,
    });
    const verdicts = firstJsonObject(answer.text)?.verdicts;
    if (!Array.isArray(verdicts) || verdicts.length !== list.length) continue;
    list.forEach((bullet, n) => {
      if (verdicts[n] === true) return;
      removed.add(bullet.index);
      dropped.push({ kind: "bullet", text: bullet.text, quote: "", why: "check" });
    });
  }
  const lines = String(text).split("\n");
  const kept = lines
    .filter((_, index) => !removed.has(index))
    .join("\n")
    // A heading whose bullets were all taken out goes too.
    .replace(/^##[^\n]*\n(\s*\n)*(?=##|\s*$)/gm, "")
    .trim();
  return { text: kept, dropped };
}

// --- The whole run.

/**
 * Writes a summary in parts.
 *
 * @param {object} input
 * @param {string} input.transcript The transcript, a blank line between segments.
 * @param {(request: { step: string, system: string, user: string, schema?: object,
 *   maxTokens: number, temperature: number }) => Promise<{ text: string, stop?: string | null }>} input.chat
 *   One request to the model. It throws when the request fails.
 * @param {object} [input.options]
 * @returns {Promise<{ text: string, items: object[], dropped: object[], parts: number,
 *   failedParts: number }>}
 */
export async function summarizeInParts({ transcript, chat, options = {} }) {
  const {
    partChars = PART_CHARS,
    overlapChars = OVERLAP_CHARS,
    quote = "fuzzy",
    numbers = true,
    tolerance = 0.2,
    writer = "model",
    quotesToWriter = false,
    temperature = 0.2,
    writeTemperature = 0.2,
    extractTokens = 1024,
    writeTokens = 2048,
    extractSystem = EXTRACT_SYSTEM,
    writeSystem = WRITE_SYSTEM,
    grammar = true,
    verify = false,
    check = false,
    single = null,
    quoteFirst = false,
  } = options;
  // One request and then the check: the app's own summary with a second pass.
  if (single) {
    const answer = await chat({ step: "single", ...single, maxTokens: writeTokens, temperature: 0.3 });
    if (answer.stop === "length") {
      throw new Error("The local model stopped at its output limit before it finished");
    }
    const checked = await verifyNotes({ text: answer.text, transcript, chat, partChars, overlapChars });
    return { ...checked, items: [], parts: 1, failedParts: 0 };
  }
  const parts = splitTranscript(transcript, { partChars, overlapChars });
  const gathered = [];
  const dropped = [];
  let failedParts = 0;
  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const answer = await chat({
      step: `extract-${index + 1}`,
      system: quoteFirst ? EXTRACT_SYSTEM_QUOTE_FIRST : extractSystem,
      user: extractUser(part, index, parts.length),
      schema: grammar ? extractSchema({ quoteFirst }) : undefined,
      maxTokens: extractTokens,
      temperature,
    });
    const checked = checkedItems(answer.text, part, { quote, numbers, tolerance });
    if (!checked.parsed) failedParts += 1;
    let kept = checked.items;
    if (verify && kept.length) {
      const verdict = await chat({
        step: `verify-${index + 1}`,
        system: extractSystem,
        user: verifyUser(part, index, parts.length, kept),
        schema: verifySchema(kept.length),
        maxTokens: 16 + kept.length * 6,
        temperature: 0,
      });
      const verdicts = firstJsonObject(verdict.text)?.verdicts;
      if (Array.isArray(verdicts) && verdicts.length === kept.length) {
        dropped.push(
          ...kept
            .filter((_, n) => verdicts[n] !== true)
            .map(({ kind, text, quote: said }) => ({ kind, text, quote: said, why: "verify" }))
        );
        kept = kept.filter((_, n) => verdicts[n] === true);
      }
    }
    for (const item of kept) gathered.push({ ...item, position: offset + item.at });
    dropped.push(...checked.dropped);
    offset += wordsOf(part).length;
  }
  const items = mergeItems(gathered);
  if (!items.length) return { text: "", items, dropped, parts: parts.length, failedParts };
  let text;
  if (writer === "code") {
    text = renderItems(items);
  } else if (writer === "overview") {
    // The model writes the top; the lists are the checked items as they are.
    const answer = await chat({
      step: "overview",
      system: OVERVIEW_SYSTEM,
      user: writeUser(items, { quotes: false }).replace("Write the notes.", "Write the top of the notes."),
      maxTokens: 700,
      temperature: writeTemperature,
    });
    text = `${String(answer.text ?? "").trim()}\n\n${renderItems(items)}`.trim();
  } else {
    const answer = await chat({
      step: "write",
      system: writeSystem,
      user: writeUser(items, { quotes: quotesToWriter }),
      maxTokens: writeTokens,
      temperature: writeTemperature,
    });
    if (answer.stop === "length") {
      throw new Error("The local model stopped at its output limit before it finished");
    }
    text = String(answer.text ?? "").trim();
  }
  if (check) {
    const checked = await verifyNotes({ text, transcript, chat, partChars, overlapChars });
    text = checked.text;
    dropped.push(...checked.dropped);
  }
  return { text, items, dropped, parts: parts.length, failedParts };
}
