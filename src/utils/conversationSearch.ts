// Finding a conversation by something that was said in it, and then finding the
// sentence once you are inside it.
//
// Pure and DOM-free so both halves can be checked directly: which view a result
// opens on, and where the matches are in it. `OatsWorkspace` renders what these
// return and owns nothing else about search.

export type MatchTarget = "summary" | "transcript";

export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Which view a search result should open on.
 *
 * Summary unless the query matched only what was *said* — in which case the
 * transcript is the answer to the question the user actually asked. Opening
 * every result on the summary left them at the top of a different document with
 * the sentence they searched for still to be found by eye.
 */
export function matchTarget(
  {
    title,
    summary,
    transcript,
  }: { title?: string | null; summary?: string | null; transcript?: string | null },
  query: string
): MatchTarget {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return "summary";
  const inSummary = [title, summary]
    .filter(Boolean)
    .some((field) => String(field).toLocaleLowerCase().includes(needle));
  if (inSummary) return "summary";
  return String(transcript ?? "")
    .toLocaleLowerCase()
    .includes(needle)
    ? "transcript"
    : "summary";
}

/**
 * Split text into alternating plain and matching runs.
 *
 * Deliberately not a regular expression: the query is whatever somebody typed
 * into a search box, and a stray `(` must never become a syntax error in a view.
 * Case-insensitive by the same lowercase fold the filter itself uses, so what
 * the list matched is what the reading view marks.
 */
export function splitOnMatches(text: string, query: string): TextPart[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [{ text, match: false }];
  const haystack = text.toLocaleLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push({ text: text.slice(cursor, at), match: false });
    // Sliced out of the *original* text, never out of the folded copy: the
    // highlight has to show what was written, not what it was compared as.
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
