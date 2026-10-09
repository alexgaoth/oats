// One fold for every place Oats compares what somebody typed with what was
// said: lowercase, and accents dropped.
//
// "resume" finds "résumé", "senor" finds "señor", "istanbul" finds "İstanbul".
// People type a query faster than they type its diacritics, and half the
// interface languages carry them; a recall tool that answers "nothing matches"
// to `cafe` in a conversation about the café has failed at its first job.
//
// Pure and DOM-free so the list filter, the tab a result opens on, the
// highlight and the excerpt all fold the same way — four places that used to
// each call `toLocaleLowerCase()` and that must never disagree about what
// matched.

const MARKS = /\p{M}/gu;

/** The fold of a whole string, for asking *whether* it matches. */
export function foldText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(MARKS, "")
    .toLocaleLowerCase();
}

/**
 * The fold of a string, and for every folded position the original position it
 * came from — for asking *where* it matches.
 *
 * Folding is not length-preserving: `é` loses its mark and `İ` lowercases to
 * two code units, so an index found in a folded copy and sliced out of the
 * original drifts by one per such character before the match, and the
 * highlight marks the wrong span. In a transcript a wrong span is a misquote.
 * Folding one character at a time keeps the way back.
 *
 * @param {string} text
 * @returns {{ folded: string, origin: number[] }} `origin` has one entry per
 *   folded code unit plus a final `text.length`.
 */
export function foldWithOrigin(text) {
  const source = String(text ?? "");
  let folded = "";
  const origin = [];
  for (let i = 0; i < source.length;) {
    const char = String.fromCodePoint(/** @type {number} */ (source.codePointAt(i)));
    const piece = foldText(char);
    for (let k = 0; k < piece.length; k += 1) origin.push(i);
    folded += piece;
    i += char.length;
  }
  origin.push(source.length);
  return { folded, origin };
}

/**
 * Every match of `query` in `text`, as `[start, end)` ranges of the original.
 *
 * @param {string} text
 * @param {string} query
 * @returns {Array<[number, number]>}
 */
export function findMatches(text, query) {
  const needle = foldText(String(query ?? "").trim());
  if (!needle) return [];
  const { folded, origin } = foldWithOrigin(text);
  const ranges = [];
  for (let from = 0; ;) {
    const at = folded.indexOf(needle, from);
    if (at === -1) break;
    const start = origin[at];
    // A match can end inside a character that folded to more than one unit;
    // the range still covers that whole character.
    const end = Math.max(origin[at + needle.length], start + 1);
    ranges.push([start, end]);
    from = at + needle.length;
  }
  return ranges;
}
