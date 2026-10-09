// Finding the passage a search actually matched, and saying where it came from.
//
// The Intelligence list used to answer a search with a title and the first 160
// characters of the summary — the same preview whether you searched for a word
// somebody said, a word Oats wrote, or nothing at all. For a tool whose whole
// claim is evidence, that is the wrong answer twice over: it does not show you
// the thing you searched for, and it does not tell you whether what it found is
// something that was *said* or something the model *inferred*.
//
// So an excerpt carries its provenance. `transcript` means these are the words
// that were spoken. `summary` means Oats wrote this about the conversation.
// `title` means the name matched and nothing else did. `related` means the
// vector index thinks this conversation is about your question, and no literal
// match exists — the weakest claim, and it is labelled as the weakest claim.
//
// Pure and DOM-free so the ranking and the boundaries can be pinned rather than
// eyeballed; the component owns the rendering.

import { findMatches, foldText } from "./searchFold.mjs";
import { momentSegment, parseMoments } from "./conversationMoments.mjs";

/** Characters of context either side of the match. */
const RADIUS = 96;

/** How far into a summary a match still counts as "about" the conversation. */
const SUMMARY_HEAD = 400;

function parseSegments(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // The same positional ids the reading view gives a transcript saved before
    // ids were kept, so a search still lands on the turn it found.
    return parsed.map((segment, index) =>
      segment && segment.id != null ? segment : { ...segment, id: `legacy-${index}` }
    );
  } catch {
    return [];
  }
}

/** Trim to a word boundary so an excerpt never starts mid-word. */
function trimToWord(text, fromStart) {
  if (fromStart) {
    const space = text.indexOf(" ");
    return space > 0 && space < 24 ? text.slice(space + 1) : text;
  }
  const space = text.lastIndexOf(" ");
  return space > text.length - 24 && space > 0 ? text.slice(0, space) : text;
}

/**
 * The passage a query matched in one conversation.
 *
 * Transcript beats summary beats title, deliberately: what somebody said is
 * better evidence than what a model wrote about it, and both are better than a
 * name. Case- and accent-insensitive, because a search for "resume" should find
 * "résumé" — but the excerpt is returned in the original text, never folded.
 *
 * @returns {{ source: "transcript"|"note"|"summary"|"title", before: string,
 *   match: string, after: string, segmentId?: string, timestamp?: number,
 *   offsetMs?: number, prefixed: boolean, suffixed: boolean } | null}
 *   The three pieces concatenate to the excerpt; `match` is what to mark.
 */
export function findExcerpt(note, query) {
  const needle = foldText(String(query ?? "").trim());
  if (!needle || !note) return null;

  // Whether a field matches is asked of the fast whole-string fold; *where* is
  // asked of `findMatches`, which maps the folded position back to the
  // original — the two differ in length whenever an accent is dropped.
  const locate = (text) => findMatches(text, query)[0] ?? null;

  // 1. What was said.
  const segments = parseSegments(note.transcript);
  const startedAt = segments.find((s) => Number.isFinite(s?.timestamp))?.timestamp;
  for (const segment of segments) {
    const text = String(segment?.text ?? "");
    if (!foldText(text).includes(needle)) continue;
    const [at, end] = locate(text);
    const timestamp = Number.isFinite(segment.timestamp) ? segment.timestamp : undefined;
    return {
      ...window_(text, at, end - at),
      source: "transcript",
      segmentId: segment.id != null ? String(segment.id) : undefined,
      timestamp,
      // How far into the conversation it was said. A recall tool that can tell
      // you *what* was said and not *when* has answered half the question: the
      // whole product draws time as its signature, and a result that lands you
      // in an hour of transcript with no bearing is a result you still have to
      // search by hand.
      offsetMs:
        Number.isFinite(timestamp) && Number.isFinite(startedAt)
          ? Math.max(0, timestamp - startedAt)
          : undefined,
    };
  }

  // 2. What the reader wrote on a mark. Their own words, so it outranks what a
  //    model wrote — and it is a place too: the turn the mark belongs to.
  for (const moment of parseMoments(note.conversation_marks)) {
    if (!moment.note || !foldText(moment.note).includes(needle)) continue;
    const [at, end] = locate(moment.note);
    const segment = momentSegment(moment, segments);
    return {
      ...window_(moment.note, at, end - at),
      source: "note",
      segmentId: segment?.id != null ? String(segment.id) : undefined,
      offsetMs: Number.isFinite(startedAt) ? Math.max(0, moment.at - startedAt) : undefined,
    };
  }

  // 3. What Oats wrote about it.
  const summary = String(note.enhanced_content ?? "");
  const inSummary = foldText(summary).includes(needle) ? locate(summary) : null;
  if (inSummary && inSummary[0] <= SUMMARY_HEAD + summary.length) {
    return { ...window_(summary, inSummary[0], inSummary[1] - inSummary[0]), source: "summary" };
  }

  // 4. The name, and nothing else.
  const title = String(note.title ?? "");
  const inTitle = foldText(title).includes(needle) ? locate(title) : null;
  if (inTitle) {
    return { ...window_(title, inTitle[0], inTitle[1] - inTitle[0]), source: "title" };
  }

  return null;
}

/**
 * A readable window around a match, returned as three pieces.
 *
 * Three pieces rather than a string plus offsets, because offsets into a string
 * that is *then* whitespace-normalised and trimmed are offsets into a different
 * string. The first version returned `matchStart`/`matchEnd` and a `.trim()` at
 * the end silently shifted them by one whenever the window happened to open on a
 * space — the test caught `"nterprise "` where `"enterprise"` was expected.
 * Pieces cannot drift out of step with each other.
 */
function window_(text, at, length) {
  const rawStart = Math.max(0, at - RADIUS);
  const rawEnd = Math.min(text.length, at + length + RADIUS);
  const tidy = (value) => value.replace(/\s+/g, " ");
  let before = tidy(text.slice(rawStart, at));
  let after = tidy(text.slice(at + length, rawEnd));
  const prefixed = rawStart > 0;
  const suffixed = rawEnd < text.length;
  if (prefixed) before = trimToWord(before, true).trimStart();
  else before = before.trimStart();
  if (suffixed) after = trimToWord(after, false).trimEnd();
  else after = after.trimEnd();
  return { before, match: text.slice(at, at + length), after, prefixed, suffixed };
}

/**
 * Merge the literal results with what the vector index suggests.
 *
 * Literal matches come first and keep their order: they are certain, and a
 * search that demotes a word you can see in favour of a guess is a search you
 * stop trusting. Semantic-only results follow, marked `related` — the weakest
 * claim on the list, and shown as the weakest claim.
 */
export function mergeRecall(literal, semantic) {
  const seen = new Set(literal.map((note) => note.id));
  const extra = (semantic ?? []).filter((note) => note && !seen.has(note.id));
  return [
    ...literal.map((note) => ({ note, related: false })),
    ...extra.map((note) => ({ note, related: true })),
  ];
}
