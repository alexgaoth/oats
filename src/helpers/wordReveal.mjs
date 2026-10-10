// Speech arrives in lumps. It should not appear in lumps, and it must not
// appear late.
//
// A transcript segment lands finished, after its speaker paused: fifteen words
// at once, then nothing. Typing them out word by word reads as somebody
// talking rather than as the machine catching up.
//
// The first version typed them at the pace they were said, 2.6 words a second.
// That replayed the time the words took to say after they had been said: the
// last word of a 13-word segment showed five seconds after the segment
// arrived, on top of the pause that closed it. Measured, that was most of why
// the transcript felt slow. So a reveal is now quick and bounded. The first
// word shows at once, the others follow at a typing pace, and every reveal
// finishes within REVEAL_BUDGET_MS, however long it is.
//
// Pure and DOM-free so it can be pinned.

/** The slowest a word follows the one before it: a quick, even typing pace. */
export const WORD_INTERVAL_MS = 60;

/** Every reveal finishes within this, however many words it has. */
export const REVEAL_BUDGET_MS = 700;

/** Words, keeping the whitespace that separates them out of the count. */
export function splitWords(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * The rate to pay `pending` words out at, in words a second: the typing pace,
 * hurried as much as it takes for all of them to show within REVEAL_BUDGET_MS.
 */
export function revealRate(pending) {
  const steady = 1000 / WORD_INTERVAL_MS;
  const words = Number.isFinite(pending) ? Math.max(0, pending) : 0;
  return Math.max(steady, words / (REVEAL_BUDGET_MS / 1000));
}

/**
 * How many words of `total` should be visible.
 *
 * `from` is the count already shown when this reveal began, so appending to a
 * turn continues rather than restarting it. The first new word shows at once:
 * the reveal paces the words after it and never delays the first. A clock that
 * jumps backwards shows no more and takes nothing away.
 */
export function revealedCount({ total, from = 0, elapsedMs = 0, rate = revealRate(0) }) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const start = Math.min(Math.max(0, from), total);
  if (start >= total) return total;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const grown = start + 1 + Math.floor((elapsed / 1000) * Math.max(0, rate));
  return Math.min(total, grown);
}

/**
 * Where a reveal starts when the newest turn appears or grows.
 *
 * `shown` is what is on screen of the turn now and `before` is its word count
 * before it grew. `carried` is how many words the live line was showing for
 * this speaker when the final replaced it. The reader already saw those words,
 * so they show at once and only the rest types on. Without this, the handoff
 * from the live line to the turn would blink the sentence away and type it out
 * again. With nothing carried, the reveal continues from what is on screen.
 */
export function revealStart({ total, shown = 0, before = 0, carried = 0 }) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const onScreen = Math.min(Math.max(0, shown), total);
  if (!(carried > 0)) return onScreen;
  return Math.min(total, Math.max(onScreen, Math.max(0, before) + carried));
}

/** The visible prefix of `text`, and whether anything is still to come. */
export function revealedText(text, count) {
  const all = splitWords(text);
  const shown = Math.min(Math.max(0, count), all.length);
  return { text: all.slice(0, shown).join(" "), done: shown >= all.length, total: all.length };
}
