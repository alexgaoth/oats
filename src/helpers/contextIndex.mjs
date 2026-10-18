// The team's context, cut into passages and ranked against a question.
//
// The context check (contextCheck.mjs) needs the few passages that could
// settle a question, and it needs them in milliseconds, while the room is
// still on the subject. So this is lexical: BM25 over words, no model and no
// network, like the topic matching in conversationSuggestions.mjs. Questions
// about a team are full of names, numbers and dates ("When does Pellwood go
// live?"), which is what word matching is good at.
//
// It is also the gate. A question the context has no strong match for is not
// about the team, or not about anything the team wrote down, and gets no check
// at all. That keeps the card from appearing beside "how was the weekend?".
//
// Pure, so it is tested.

/** A passage aims for about this many characters: a paragraph or two. */
export const PASSAGE_CHARS = 600;

// Words that carry no subject. A question's subject is in its other words.
const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does doing done for from had has have " +
    "having he her here hers him his how i if in into is it its just me my no nor not of off on once " +
    "only or our ours out over own same she should so some such than that the their theirs them then " +
    "there these they this those through to too under until up very was we were what when where which " +
    "while who whom why will with would you your yours yeah yes okay ok um uh like know think going " +
    "get got gonna wanna let lets let's really actually something anything thing things about again " +
    "any all also am because before after both each few more most other s t don didn doesn isn wasn " +
    "aren weren won wouldn shouldn couldn ve ll re d m"
  ).split(" ")
);

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;

/** Longer words are cut to this many letters (see `stem`). */
const STEM_LETTERS = 6;

/**
 * A word's stem, crudely: the plural dropped, then the first six letters. It
 * is not linguistics, it is agreement. The same rule runs over the question
 * and over the documents, so "accounts" meets "account", and "migrated",
 * "migrating" and "migration" all meet as "migrat". A collision ("product",
 * "production") costs a passage the judge then reads and dismisses; a miss
 * costs the check. Irregular forms ("took" for "take") are out of reach of
 * any rule like this.
 */
export function stem(word) {
  if (/\d/.test(word)) return word;
  let base = word;
  if (base.length > 4) {
    if (base.endsWith("ies")) base = `${base.slice(0, -3)}y`;
    else if (/(?:ss|x|ch|sh)es$/.test(base)) base = base.slice(0, -2);
    else if (base.endsWith("s") && !/(?:ss|us|is)$/.test(base)) base = base.slice(0, -1);
  }
  const letters = [...base];
  return letters.length > STEM_LETTERS ? letters.slice(0, STEM_LETTERS).join("") : base;
}

/**
 * The stems of `text` that can carry a subject: lower case, letters and
 * numbers, no stopwords, a hyphenated word as its parts. A run of Chinese or
 * Japanese characters becomes its overlapping pairs, since those scripts do
 * not put spaces between words.
 */
export function tokenize(text) {
  const words = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu);
  if (!words) return [];
  const tokens = [];
  for (const raw of words) {
    const word = raw.replace(/['’]s$/, "").replace(/['’]+$/g, "");
    if (CJK.test(word)) {
      const chars = [...word];
      if (chars.length === 1) tokens.push(word);
      for (let i = 0; i + 1 < chars.length; i += 1) tokens.push(chars[i] + chars[i + 1]);
      continue;
    }
    if (STOPWORDS.has(word)) continue;
    if (word.length < 2 && !/\d/.test(word)) continue;
    tokens.push(stem(word));
  }
  return tokens;
}

/**
 * Cuts a document into passages. Markdown headings start a new passage and
 * name it, so a passage can say where it came from ("launch-plan.md, Dates").
 * Short paragraphs are joined up to about PASSAGE_CHARS; a long one is cut at
 * sentence ends.
 *
 * @param {string} text
 * @param {{ docId: string, title: string }} doc
 * @returns {{ id: string, docId: string, title: string, heading: string, text: string }[]}
 */
export function chunkDocument(text, { docId, title }) {
  const passages = [];
  let heading = "";
  let buffer = [];
  let size = 0;
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body)
      passages.push({ id: `${docId}#${passages.length}`, docId, title, heading, text: body });
    buffer = [];
    size = 0;
  };
  const blocks = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const rest = [];
    for (const line of lines) {
      const match = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (match) {
        if (rest.length) {
          buffer.push(rest.join("\n"));
          size += rest.join("\n").length;
          rest.length = 0;
        }
        flush();
        heading = match[1].trim();
      } else {
        rest.push(line);
      }
    }
    const paragraph = rest.join("\n").trim();
    if (!paragraph) continue;
    if (paragraph.length > PASSAGE_CHARS) {
      flush();
      // A long paragraph is cut at sentence ends, not mid-word.
      let piece = "";
      for (const sentence of paragraph.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) || [paragraph]) {
        if (piece && piece.length + sentence.length > PASSAGE_CHARS) {
          buffer.push(piece.trim());
          flush();
          piece = "";
        }
        piece += sentence;
      }
      if (piece.trim()) {
        buffer.push(piece.trim());
        flush();
      }
      continue;
    }
    if (size && size + paragraph.length > PASSAGE_CHARS) flush();
    buffer.push(paragraph);
    size += paragraph.length;
  }
  flush();
  return passages;
}

/**
 * A BM25 index of passages that can be changed one document at a time, so a
 * watched folder re-indexes only the file that changed.
 */
export function createContextIndex({ k1 = 1.2, b = 0.75 } = {}) {
  /** @type {Map<string, { passage: object, terms: Map<string, number>, length: number }>} */
  const entries = new Map();
  /** @type {Map<string, Set<string>>} */
  const byDoc = new Map();
  /** @type {Map<string, number>} */
  const documentFrequency = new Map();
  let totalLength = 0;

  const removeDoc = (docId) => {
    for (const id of byDoc.get(docId) ?? []) {
      const entry = entries.get(id);
      if (!entry) continue;
      for (const term of entry.terms.keys()) {
        const df = (documentFrequency.get(term) ?? 1) - 1;
        if (df > 0) documentFrequency.set(term, df);
        else documentFrequency.delete(term);
      }
      totalLength -= entry.length;
      entries.delete(id);
    }
    byDoc.delete(docId);
  };

  const setDoc = (docId, passages) => {
    removeDoc(docId);
    const ids = new Set();
    for (const passage of passages) {
      // The heading and title are searched with the body: "Dates" under
      // "Pellwood launch" is about Pellwood even when the line only says
      // "October 30".
      const tokens = tokenize(`${passage.title} ${passage.heading} ${passage.text}`);
      if (!tokens.length) continue;
      const terms = new Map();
      for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
      for (const term of terms.keys())
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      entries.set(passage.id, { passage, terms, length: tokens.length });
      totalLength += tokens.length;
      ids.add(passage.id);
    }
    byDoc.set(docId, ids);
  };

  /**
   * The passages that best match `query`, best first. Each result says how
   * much of the question it covers, which is what decides whether a question
   * is about the context at all (see `isStrongMatch`).
   */
  const search = (query, limit = 4) => {
    const queryTerms = [...new Set(tokenize(query))];
    if (!queryTerms.length || !entries.size) return [];
    const count = entries.size;
    const average = totalLength / count;
    const idf = (term) => {
      const df = documentFrequency.get(term) ?? 0;
      return Math.log(1 + (count - df + 0.5) / (df + 0.5));
    };
    // Coverage is weighed by how rare each word is, among the words the
    // context uses at all. A word nobody wrote down ("long", "take") can be
    // neither evidence nor its absence; a common one barely counts.
    const known = queryTerms.filter((term) => documentFrequency.has(term));
    const knownWeight = known.reduce((sum, term) => sum + idf(term), 0);
    const results = [];
    for (const entry of entries.values()) {
      let score = 0;
      let matched = 0;
      let matchedWeight = 0;
      for (const term of queryTerms) {
        const tf = entry.terms.get(term);
        if (!tf) continue;
        matched += 1;
        const weight = idf(term);
        matchedWeight += weight;
        score += (weight * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * entry.length) / average));
      }
      if (matched) {
        results.push({
          passage: entry.passage,
          score,
          matched,
          terms: queryTerms.length,
          coverage: knownWeight ? matchedWeight / knownWeight : 0,
        });
      }
    }
    results.sort((x, y) => y.score - x.score || y.matched - x.matched);
    return results.slice(0, limit);
  };

  return {
    setDoc,
    removeDoc,
    search,
    get size() {
      return entries.size;
    },
    get documents() {
      return byDoc.size;
    },
  };
}

/**
 * Whether a search result is strong enough to put a question to the judge: it
 * shares at least two of the question's words (one when the question has only
 * one), and they are at least half of the weight of the question's words the
 * context knows. One shared word ("launch") is a coincidence, not a source.
 */
export function isStrongMatch(result) {
  if (!result) return false;
  return result.matched >= Math.min(2, result.terms) && result.coverage >= 0.5;
}
