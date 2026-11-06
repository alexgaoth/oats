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
- decisions: what the participants clearly agreed on or settled: somebody proposed it and the others accepted it, or the person leading stated it as settled. A suggestion or a preference is not a decision: put it under points.
- actions: what a person took on, or was asked to do, after this conversation. A remark about what could be done is not an action.
- problems: problems, risks, disagreements and questions they raised. State the problem itself. Do not say whether it stayed open or unresolved: this is only one part of the conversation.
- points: other important facts, options, numbers and reasons.

Each item has two fields:
- text: one short plain sentence that states the point and its specifics. Say only what the transcript says. Give a person's name only if the transcript says it. Report what was said, not what you conclude from it: write "agreed" or "decided" only when the quote itself shows the agreement, and otherwise "suggested", "asked" or "said".
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.

An item whose quote is not in the transcript word for word is thrown away. Leave a list empty when this part has nothing for it. Do not repeat an item.`;

/** The JSON the model is held to (a grammar on llama-server). */
export function extractSchema({ quoteFirst = false, quotes = true } = {}) {
  const fields = !quotes ? ["text"] : quoteFirst ? ["quote", "text"] : ["text", "quote"];
  const list = (maxItems) => ({
    type: "array",
    maxItems,
    items: {
      type: "object",
      properties: Object.fromEntries(fields.map((field) => [field, { type: "string" }])),
      required: fields,
      additionalProperties: false,
    },
  });
  return {
    type: "object",
    properties: Object.fromEntries(KINDS.map((kind) => [kind, list(MAX_ITEMS[kind])])),
    required: KINDS,
    additionalProperties: false,
  };
}

/** The same task with the evidence first: the model copies the words, then says what they mean. */
export const EXTRACT_SYSTEM_QUOTE_FIRST = EXTRACT_SYSTEM.replace(
  `Each item has two fields:
- text: one short plain sentence that states the point and its specifics. Say only what the transcript says. Give a person's name only if the transcript says it. Report what was said, not what you conclude from it: write "agreed" or "decided" only when the quote itself shows the agreement, and otherwise "suggested", "asked" or "said".
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.`,
  `Each item has two fields, in this order:
- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.
- text: one short plain sentence that states the point and its specifics. Say only what the quote and the lines around it say. Give a person's name only if the transcript says it.`
);

/** The same task with no quotes: fewer tokens to write, nothing for the code to check. */
export const EXTRACT_SYSTEM_NO_QUOTES = EXTRACT_SYSTEM.replace(
  `Each item has two fields:
`,
  `Each item has one field:
`
)
  .replace(
    `- quote: the words of the transcript that show it, copied exactly, 5 to 20 words.

An item whose quote is not in the transcript word for word is thrown away. Leave a list empty`,
    `
Leave a list empty`
  )
  .replace(
    "only when the quote itself shows the agreement",
    "only when the transcript shows the agreement"
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
    additionalProperties: false,
  };
}

export const WRITE_SYSTEM = `You write the notes of a conversation in markdown. You get a list of items that were checked against its transcript: what was decided, what somebody took on, the problems raised and other points. The list is in the order of the conversation. Some items may say the same thing.

FORMAT RULES (strict):
- No preamble: no title, no date, no attendee list. Start directly with a 1-2 sentence summary of what the conversation was about.
- Then use these section headings: ## Threads, ## Key Discussion Points, ## Decisions Made, ## Action Items, ## Follow-ups. Leave out a section that has no content.
- Under ## Threads, write the 2-5 important lines of thought as short bullets: where each started and how it went.
- Under ## Action Items, use checkboxes (\`- [ ]\`).
- Under ## Follow-ups, put the problems and questions they raised.
- No tables, no horizontal rules, no block quotes.

CONTENT RULES:
- Use only the items. Add no fact, number, name, date or reason of your own.
- Keep every decision and every action, and keep the specifics: numbers, names, options.
- Merge items that say the same thing. If a later item settles an earlier question, keep only the outcome.
- Do not call something decided unless it is in the decisions list. Do not write that something is unresolved, undecided or still open unless an item says so.
- Write plainly, with no filler.`;

export const OVERVIEW_SYSTEM = `You write the top of the notes of a conversation in markdown. You get a list of items that were checked against its transcript: what was decided, what somebody took on, the problems raised and other points. The list is in the order of the conversation.

Write exactly this and nothing else:
- First a 1-2 sentence summary of what the conversation was about. No title, no heading.
- Then the heading ## Threads, with the 2-5 important lines of thought as short bullets: where each started and how it went.

Use only the items. Add no fact, number, name, date or reason of your own. Do not call something decided unless it is in the decisions list. Do not write that something is unresolved, undecided or still open unless an item says so. Write plainly, with no filler.`;

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

export const PART_NOTES_SYSTEM = `You take notes on a conversation. You get one part of its transcript, written by speech recognition. It can contain misheard words, and it usually has no speaker names.

Write short markdown bullets under these four headings, and leave out a heading with nothing under it:
## Decisions: what the participants clearly agreed on or settled. A suggestion or a preference is not a decision.
## Actions: what a person took on, or was asked to do, after this conversation.
## Problems: problems, risks, disagreements and questions they raised. Do not say whether they stayed open: this is only one part of the conversation.
## Points: other important facts, options, numbers and reasons.

Say only what the transcript says, with its specifics: numbers, names, options. Never guess a number, a name or a date. Do not repeat a point. No preamble.`;

export const MERGE_SYSTEM = `You write the notes of a whole conversation in markdown. You get the notes of its parts, in order. Each part's notes saw only that part, so a later part can settle what an earlier part left as a question.

FORMAT RULES (strict):
- No preamble: no title, no date, no attendee list. Start directly with a 1-2 sentence summary of what the conversation was about.
- Then use these section headings: ## Threads, ## Key Discussion Points, ## Decisions Made, ## Action Items, ## Follow-ups. Leave out a section that has no content.
- Under ## Threads, write the 2-5 important lines of thought as short bullets: where each started and how it went.
- Under ## Action Items, use checkboxes (\`- [ ]\`).
- Under ## Follow-ups, put the problems and questions they raised.
- No tables, no horizontal rules, no block quotes.

CONTENT RULES:
- Use only the notes. Add no fact, number, name, date or reason of your own.
- Keep every decision and every action, and keep the specifics: numbers, names, options.
- Merge what is said twice. If a later part settles an earlier question, keep only the outcome.
- Do not write that something is unresolved, undecided or still open unless the notes say so.
- Write plainly, with no filler.`;

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
export function splitTranscript(
  text,
  { partChars = PART_CHARS, overlapChars = OVERLAP_CHARS } = {}
) {
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
    while (
      end < segments.length &&
      (end === start || chars + segments[end].length + 2 <= partChars)
    ) {
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
  for (let i = words.indexOf(first); i >= 0 && i <= words.length - needle.length;) {
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
 * and for spoken numbers each value and the whole ("twenty five" is 20, 5 and
 * 25; "two five" is 2, 5 and 25; "twelve point five" is 12.5).
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
    const said = [];
    let run = 0;
    while (i < words.length) {
      const word = words[i];
      if (
        word === "and" &&
        run > 0 &&
        (NUMBER_WORDS.has(words[i + 1]) || SCALES.has(words[i + 1]))
      ) {
        i += 1;
        continue;
      }
      if (NUMBER_WORDS.has(word)) {
        const value = NUMBER_WORDS.get(word);
        current += value;
        said.push(value);
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
    // Digits said one by one ("two five"), and a pair of numbers: "twelve fifty"
    // is 12.50 as a price, and "nineteen ninety" a year, never 1250.
    if (said.length > 1 && said.every((value) => value < 10)) found.add(said.join(""));
    if (said.length === 2 && said.every((value) => value >= 10)) {
      found.add(String(Number(`${said[0]}.${said[1]}`)));
      if (said[0] === 19 || said[0] === 20) found.add(`${said[0]}${said[1]}`);
    }
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
    const score =
      part.reduce((sum, word) => sum + (wanted.has(word) ? 1 : 0), 0) / (part.length || 1);
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
  return { text: withoutLines(String(text).split("\n"), removed), dropped };
}

// --- The same check with only the passages each bullet needs.

export const CLAIM_SYSTEM = `You check one claim from the notes of a conversation against passages of its transcript. The transcript was written by speech recognition, so it can contain misheard words.

Answer true if the passages say the claim or clearly imply it, even in other words.
Answer false if the passages contradict it, or if the claim adds something they do not hold: a number, a name, a decision nobody made, an action nobody took on.`;

export function claimSchema() {
  return {
    type: "object",
    properties: { supported: { type: "boolean" } },
    required: ["supported"],
    additionalProperties: false,
  };
}

/**
 * The passages of a transcript that share the most with a claim: stretches of
 * `span` words, the rarer the shared word the more it counts.
 *
 * @param {string} claim
 * @param {string[]} words `wordsOf(transcript)`
 * @param {{ span?: number, count?: number }} [options]
 * @returns {string[]}
 */
export function passagesFor(claim, words, { span = 70, count = 3 } = {}) {
  const frequency = new Map();
  for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const wanted = new Map();
  for (const word of contentWords(claim)) {
    wanted.set(word, 1 / (1 + (frequency.get(word) ?? 0)) ** 0.5);
  }
  const step = Math.ceil(span / 2);
  const scored = [];
  for (let start = 0; start < words.length; start += step) {
    const seen = new Set();
    let score = 0;
    for (const word of words.slice(start, start + span)) {
      if (wanted.has(word) && !seen.has(word)) {
        seen.add(word);
        score += wanted.get(word);
      }
    }
    scored.push({ start, score });
  }
  scored.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const candidate of scored) {
    if (picked.length >= count) break;
    if (picked.some((other) => Math.abs(other.start - candidate.start) < span)) continue;
    picked.push(candidate);
  }
  return picked
    .sort((a, b) => a.start - b.start)
    .map(({ start }) => words.slice(start, start + span).join(" "));
}

/** Written notes with the bullets the passages do not support taken out, one request a bullet. */
export async function checkClaims({ text, transcript, chat, sections = null }) {
  const words = wordsOf(transcript);
  const lines = String(text).split("\n");
  let heading = "";
  const headingAt = lines.map((line) => {
    if (/^##\s/.test(line)) heading = line.replace(/^##\s*/, "").trim();
    return heading;
  });
  const removed = new Set();
  const dropped = [];
  let index = 0;
  for (const bullet of noteBullets(text)) {
    index += 1;
    if (sections && !sections.some((name) => headingAt[bullet.index].startsWith(name))) continue;
    const passages = passagesFor(bullet.text, words)
      .map((passage, n) => `[${n + 1}] ${passage}`)
      .join("\n");
    const answer = await chat({
      step: `claim-${index}`,
      system: CLAIM_SYSTEM,
      user: `Passages:\n${passages}\n\nClaim: ${bullet.text}\n\nAnswer with the JSON object only.`,
      schema: claimSchema(),
      maxTokens: 12,
      temperature: 0,
    });
    if (firstJsonObject(answer.text)?.supported === false) {
      removed.add(bullet.index);
      dropped.push({ kind: "bullet", text: bullet.text, quote: "", why: "claim" });
    }
  }
  return { text: withoutLines(lines, removed), dropped };
}

/** The lines left, and a heading whose bullets all went goes too. */
function withoutLines(lines, removed) {
  return lines
    .filter((_, index) => !removed.has(index))
    .join("\n")
    .replace(/^##[^\n]*\n(\s*\n)*(?=##|\s*$)/gm, "")
    .trim();
}

// --- A decision needs agreement: the words after its quote have to show it.

export const AGREED_SYSTEM = `You check one item from the notes of a conversation against the passage of the transcript it came from. The transcript was written by speech recognition, so it can contain misheard words, and it has no speaker names.

Answer true only if the passage shows that the participants agreed on it or settled it: somebody proposed it and the others accepted it, or the person leading stated it as settled. Answer false if it was only suggested, asked, discussed or left open.`;

/** The transcript's words around a position: where an item's quote stands, and what follows it. */
export function passageAround(words, at, { before = 60, after = 120 } = {}) {
  return words.slice(Math.max(0, at - before), at + after).join(" ");
}

/**
 * Decisions the passage around their quote does not show as agreed, moved to
 * the points. Moved, not dropped: what they say was said, and only "decided"
 * was too much.
 */
async function demoteDecisions({ items, words, chat }) {
  const out = [];
  let index = 0;
  for (const item of items) {
    if (item.kind !== "decisions") {
      out.push(item);
      continue;
    }
    index += 1;
    const answer = await chat({
      step: `agreed-${index}`,
      system: AGREED_SYSTEM,
      user: `Passage:\n${passageAround(words, item.position)}\n\nItem: ${item.text}\n\nAnswer with the JSON object only.`,
      schema: claimSchema(),
      maxTokens: 12,
      temperature: 0,
    });
    if (firstJsonObject(answer.text)?.supported === false) {
      out.push({ ...item, kind: "points", demoted: true });
    } else out.push(item);
  }
  return out;
}

// --- Notes of large parts, joined by the code.

export const LEAD_SYSTEM = `You get the opening lines of the notes of each part of one long conversation, in order. Write a 1-2 sentence summary of what the whole conversation was about. Use only what they say. No heading, no preamble.`;

/** What notes say before their first heading. */
export function noteLead(note) {
  return String(note ?? "")
    .split(/^##\s/m)[0]
    .trim();
}

/** The sections of several notes joined under one heading each, in the app's order. */
export function mergeSections(notes) {
  const order = [
    "Threads",
    "Key Discussion Points",
    "Decisions Made",
    "Action Items",
    "Follow-ups",
  ];
  const bodies = new Map();
  for (const note of notes) {
    for (const block of String(note ?? "")
      .split(/^##\s+/m)
      .slice(1)) {
      const [title, ...rest] = block.split("\n");
      const name = title.trim();
      const body = rest.join("\n").trim();
      if (!body) continue;
      if (!bodies.has(name)) bodies.set(name, []);
      bodies.get(name).push(body);
    }
  }
  const names = [
    ...order.filter((name) => bodies.has(name)),
    ...[...bodies.keys()].filter((name) => !order.includes(name)),
  ];
  return names.map((name) => `## ${name}\n${bodies.get(name).join("\n")}`).join("\n\n");
}

// --- A second look at one's own draft, with the transcript still in front of the model.

export const REVISE_TASK = `Above is the transcript, and below it a draft of the notes. Check the draft against the transcript, claim by claim. Remove a claim the transcript does not support, or correct it: a decision nobody made, an action nobody took on, a wrong number or name, a suggestion written as agreed. Change nothing else, and keep everything that is true. Write the corrected notes in full, in the same format, with no comment about the changes.`;

export function reviseUser(user, draft) {
  return `${user}\n\n---\nDraft of the notes:\n${draft}\n---\n\n${REVISE_TASK}`;
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
    mode = "items",
    checkSections = null,
    quotes = true,
    agreed = false,
    revise = false,
    app = null,
    merge = "model",
  } = options;
  const runCheck = (text) =>
    check === "claims"
      ? checkClaims({ text, transcript, chat, sections: checkSections })
      : verifyNotes({ text, transcript, chat, partChars, overlapChars });
  // One request and then the check: the app's own summary with a second pass.
  if (single) {
    const answer = await chat({
      step: "single",
      ...single,
      maxTokens: writeTokens,
      temperature: 0.3,
    });
    if (answer.stop === "length") {
      throw new Error("The local model stopped at its output limit before it finished");
    }
    if (revise) {
      const again = await chat({
        step: "revise",
        system: single.system,
        user: reviseUser(single.user, answer.text),
        maxTokens: writeTokens,
        temperature: 0.2,
      });
      return {
        text: String(again.text ?? "").trim(),
        dropped: [],
        items: [],
        parts: 1,
        failedParts: 0,
      };
    }
    const checked = await runCheck(answer.text);
    return { ...checked, items: [], parts: 1, failedParts: 0 };
  }
  const parts = splitTranscript(transcript, { partChars, overlapChars });
  // Prose notes per part and a merge: the same cut, no quotes and no grammar.
  if (mode === "notes") {
    const notes = [];
    for (let index = 0; index < parts.length; index += 1) {
      const answer = await chat({
        step: `notes-${index + 1}`,
        system: PART_NOTES_SYSTEM,
        user: `Transcript, part ${index + 1} of ${parts.length}:\n\n${parts[index]}`,
        maxTokens: extractTokens,
        temperature,
      });
      notes.push(`# Part ${index + 1}\n${String(answer.text ?? "").trim()}`);
    }
    const merged = await chat({
      step: "merge",
      system: MERGE_SYSTEM,
      user: `The notes of each part:\n\n${notes.join("\n\n")}\n\nWrite the notes of the whole conversation.`,
      maxTokens: writeTokens,
      temperature: writeTemperature,
    });
    if (merged.stop === "length") {
      throw new Error("The local model stopped at its output limit before it finished");
    }
    let text = String(merged.text ?? "").trim();
    const removed = [];
    if (check) {
      const checked = await runCheck(text);
      text = checked.text;
      removed.push(...checked.dropped);
    }
    return { text, items: [], dropped: removed, parts: parts.length, failedParts: 0 };
  }
  // The app's own request for each large part, then a merge by the model or by the code.
  if (mode === "app") {
    const notes = [];
    for (let index = 0; index < parts.length; index += 1) {
      const answer = await chat({
        step: `part-${index + 1}`,
        system: app.system,
        user: `${app.userPrefix}${parts[index]}`,
        maxTokens: writeTokens,
        temperature: 0.3,
      });
      if (answer.stop === "length") {
        throw new Error("The local model stopped at its output limit before it finished");
      }
      notes.push(String(answer.text ?? "").trim());
    }
    if (notes.length === 1) {
      return { text: notes[0], items: [], dropped: [], parts: 1, failedParts: 0 };
    }
    if (merge === "code") {
      const lead = await chat({
        step: "lead",
        system: LEAD_SYSTEM,
        user: notes.map((note) => noteLead(note)).join("\n\n"),
        maxTokens: 200,
        temperature: writeTemperature,
      });
      return {
        text: `${String(lead.text ?? "").trim()}\n\n${mergeSections(notes)}`.trim(),
        items: [],
        dropped: [],
        parts: parts.length,
        failedParts: 0,
      };
    }
    const merged = await chat({
      step: "merge",
      system: MERGE_SYSTEM,
      user: `The notes of each part:\n\n${notes.map((note, n) => `# Part ${n + 1}\n${note}`).join("\n\n")}\n\nWrite the notes of the whole conversation.`,
      maxTokens: writeTokens * 2,
      temperature: writeTemperature,
    });
    if (merged.stop === "length") {
      throw new Error("The local model stopped at its output limit before it finished");
    }
    return {
      text: String(merged.text ?? "").trim(),
      items: [],
      dropped: [],
      parts: parts.length,
      failedParts: 0,
    };
  }
  const gathered = [];
  const dropped = [];
  let failedParts = 0;
  let offset = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const answer = await chat({
      step: `extract-${index + 1}`,
      system: !quotes
        ? EXTRACT_SYSTEM_NO_QUOTES
        : quoteFirst
          ? EXTRACT_SYSTEM_QUOTE_FIRST
          : extractSystem,
      user: extractUser(part, index, parts.length),
      schema: grammar ? extractSchema({ quoteFirst, quotes }) : undefined,
      maxTokens: extractTokens,
      temperature,
    });
    const checked = checkedItems(answer.text, part, {
      quote: quotes ? quote : "off",
      numbers,
      tolerance,
    });
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
  let items = mergeItems(gathered);
  if (!items.length) return { text: "", items, dropped, parts: parts.length, failedParts };
  if (agreed) {
    items = await demoteDecisions({ items, words: wordsOf(parts.join(" ")), chat });
  }
  let text;
  if (writer === "code") {
    text = renderItems(items);
  } else if (writer === "overview") {
    // The model writes the top; the lists are the checked items as they are.
    const answer = await chat({
      step: "overview",
      system: OVERVIEW_SYSTEM,
      user: writeUser(items, { quotes: false }).replace(
        "Write the notes.",
        "Write the top of the notes."
      ),
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
    const checked = await runCheck(text);
    text = checked.text;
    dropped.push(...checked.dropped);
  }
  return { text, items, dropped, parts: parts.length, failedParts };
}
