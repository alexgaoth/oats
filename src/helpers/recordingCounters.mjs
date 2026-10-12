// The two counters under the recording clock: words captured so far, and
// questions heard so far. Both are counts of what Oats has measured in this
// sitting, nothing estimated:
//
//   words      the committed transcript (finalized segments; the live line
//              still being transcribed is not counted until it lands), and
//   questions  the question cards, one per asking, as the contour counts them.
//
// "This sitting" is what the clock measures: from `recordingStartedAt`.
// Continuing a recent conversation seeds its earlier segments into the store,
// and counting those would put a thousand words beside a clock reading 0:05.
//
// Words are counted with `Intl.Segmenter`, so a language written without
// spaces counts its words rather than its sentences (Japanese and Chinese
// transcripts). Pure, apart from a per-segment cache keyed by the segment
// object, which the store replaces whenever a segment changes. Pinned by
// test/helpers/recordingCounters.test.js.

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

const segmentWords = new WeakMap();

/** Whether something happened in this sitting (or there is no sitting to ask about). */
function inSitting(at, startedAt) {
  if (!Number.isFinite(startedAt)) return true;
  return Number.isFinite(at) && at >= startedAt;
}

/**
 * Words captured in this sitting: the finalized segments said since it began.
 *
 * @param {Array<{ text?: string, timestamp?: number }>} segments The store's segments.
 * @param {number | null} startedAt `recordingStartedAt`; null counts every segment.
 * @param {WeakMap<object, number>} [cache] Counts per segment object.
 * @returns {number}
 */
export function sittingWordCount(segments, startedAt, cache = segmentWords) {
  let total = 0;
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || !inSitting(segment.timestamp, startedAt)) continue;
    let words = cache.get(segment);
    if (words === undefined) {
      words = countWords(segment.text);
      cache.set(segment, words);
    }
    total += words;
  }
  return total;
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
 * `{{count}}` is, and that position differs by language ("1234 words",
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
