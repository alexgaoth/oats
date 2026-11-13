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
 * Where the scan of the older conversations stands for `query`: "idle" with
 * no query, "pending" until an answer for this very query has arrived,
 * "failed" when that answer was an error, and "done" otherwise. Keyed on the
 * query, so an answer for an earlier query never settles a later one, and
 * "nothing matches" can wait for "done".
 *
 * @param {string} query
 * @param {boolean} pending a scan is in flight
 * @param {{ needle: string, complete: boolean } | null} result the last answer
 * @returns {"idle" | "pending" | "failed" | "done"}
 */
export function olderScanState(query, pending, result) {
  const needle = String(query ?? "").trim();
  if (!needle) return "idle";
  if (pending || !result || result.needle !== needle) return "pending";
  return result.complete ? "done" : "failed";
}

/**
 * How long a search took, short and in the reader's own number format: a
 * tenth of a millisecond under 10 ms, whole milliseconds under a second, then
 * seconds. Under a twentieth of a millisecond it reads "<0.1 ms": rounded, it
 * read "0 ms", and a search that took no time at all looks like one that did
 * not run. Null for a time that is not a time.
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
  if (ms < 0.05) return `<${format(0.1, "millisecond", 1)}`;
  return format(ms, "millisecond", ms < 10 ? 1 : 0);
}
