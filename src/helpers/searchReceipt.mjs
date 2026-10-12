// The line under the Intelligence search box once a search has settled:
// "12 matches in 4 conversations · 9 ms".
//
// It counts what the list shows as matches: the conversations whose words
// contain the query, and every place in them the query was found, in the same
// folded text the filter tested (`recallText`, through `foldText`), so the
// receipt and the list cannot disagree about what matched. Related results from
// the vector index are not matches and are not counted. Pure, so the counting
// is pinned by test/helpers/searchReceipt.test.js.

/**
 * Non-overlapping occurrences of `needle` in `text`, the way `findMatches`
 * walks a transcript: each match resumes the search after itself.
 *
 * @param {string} text folded
 * @param {string} needle folded, non-empty
 */
export function countOccurrences(text, needle) {
  if (!needle) return 0;
  const haystack = String(text ?? "");
  let count = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    count += 1;
  }
  return count;
}

/**
 * @param {string[]} texts the searchable text of each conversation listed as a
 *   match, folded
 * @param {string} needle the folded query
 * @returns {{ matches: number, conversations: number }}
 */
export function tallyMatches(texts, needle) {
  let matches = 0;
  let conversations = 0;
  for (const text of texts) {
    const found = countOccurrences(text, needle);
    if (!found) continue;
    matches += found;
    conversations += 1;
  }
  return { matches, conversations };
}

/**
 * How long a search took, short and in the reader's own number format: a
 * tenth of a millisecond under 10 ms, whole milliseconds under a second, then
 * seconds. Null for a time that is not a time.
 *
 * @param {number} ms
 * @param {string} [locale]
 */
export function formatSearchDuration(ms, locale) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = ms >= 1000;
  const format = (value, unit, digits) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "unit",
        unit,
        unitDisplay: "short",
        maximumFractionDigits: digits,
      }).format(value);
    } catch {
      return `${value.toFixed(digits)} ${unit === "second" ? "s" : "ms"}`;
    }
  };
  if (seconds) return format(ms / 1000, "second", 1);
  return format(ms, "millisecond", ms < 10 ? 1 : 0);
}
