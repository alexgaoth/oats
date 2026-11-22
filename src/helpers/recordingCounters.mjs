// The counter under the recording clock, the questions heard so far, and the
// word count the topic code reads (`countWords`). Both are counts of what Oats
// has measured, nothing estimated:
//
//   questions  the question cards, one per asking, as the contour counts them,
//              in this sitting: from `recordingStartedAt`. Continuing a recent
//              conversation seeds its earlier cards into the store, and
//              counting those would put them beside a clock reading 0:05.
//   words      `countWords`, for the topic namer's thresholds. The screen shows
//              no word count: how many words were spoken helps nobody during a
//              conversation (DESIGN.md §5).
//
// Words are counted with `Intl.Segmenter`, so a language written without
// spaces counts its words rather than its sentences (Japanese and Chinese
// transcripts). Pure. Pinned by test/helpers/recordingCounters.test.js.

let wordSegmenter;

function segmenter() {
  if (wordSegmenter === undefined) {
    wordSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "word" })
        : null;
  }
  return wordSegmenter;
}

// Scripts written without spaces, for the fallback below.
const UNSPACED = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/**
 * The words in a piece of text.
 *
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (typeof text !== "string" || !text.trim()) return 0;
  const words = segmenter();
  if (words) {
    let count = 0;
    for (const part of words.segment(text)) if (part.isWordLike) count += 1;
    return count;
  }
  // No segmenter: spaced words, and each character of an unspaced script.
  const unspaced = (text.match(UNSPACED) || []).length;
  const spaced = text.replace(UNSPACED, " ").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return unspaced + (spaced ? spaced.length : 0);
}

/** Whether something happened in this sitting (or there is no sitting to ask about). */
function inSitting(at, startedAt) {
  if (!Number.isFinite(startedAt)) return true;
  return Number.isFinite(at) && at >= startedAt;
}

/**
 * Questions heard in this sitting: one per question card, so a question asked
 * twice counts twice, as the contour's own label counts it.
 *
 * @param {Array<{ createdAt?: number }>} cards The store's question cards.
 * @param {number | null} startedAt `recordingStartedAt`; null counts every card.
 * @returns {number}
 */
export function sittingQuestionCount(cards, startedAt) {
  return (Array.isArray(cards) ? cards : []).filter(
    (card) => card && inSitting(card.createdAt, startedAt)
  ).length;
}

/**
 * A counter's label around its number, so the number alone can roll when it
 * changes: `t(key, { count })` puts `String(count)` where the locale's
 * `{{count}}` is, and that position differs by language ("12 questions",
 * "質問 5 件").
 *
 * @param {string} label The translated label, with the count in it.
 * @param {number} count
 * @returns {{ before: string, after: string } | null} Null when the label
 *   does not contain the count.
 */
export function splitAroundCount(label, count) {
  const number = String(count);
  const at = typeof label === "string" ? label.indexOf(number) : -1;
  if (at === -1) return null;
  return { before: label.slice(0, at), after: label.slice(at + number.length) };
}
