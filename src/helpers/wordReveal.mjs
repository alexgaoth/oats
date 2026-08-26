// Speech arrives in lumps; it should not appear in lumps.
//
// Local Whisper transcribes fixed ~5s chunks and emits them finished, so a
// sentence lands all at once — fifteen words appearing together, then nothing
// for five seconds, then fifteen more. That is the transcript of a conversation
// rendered as a stack of paragraphs, and it reads as the machine catching up
// rather than as somebody talking. (The streaming providers do send partials,
// but they are not the default and cannot be the only path that feels alive.)
//
// So the words are paid out at the pace they were plausibly said. This is the
// same idea as `conversationContour.mjs` spreading an utterance across the time
// it took to say — an utterance is an instant in the data and an interval in
// the world.
//
// Pure and DOM-free so it can be pinned.

/** Conversational English, unhurried. `conversationContour.mjs` uses the same. */
export const WORDS_PER_SECOND = 2.6;

/**
 * How much faster than speech the reveal may run to clear a backlog.
 *
 * Without this the display falls permanently behind: chunk N+1 arrives while
 * chunk N is still being paid out, and the lag compounds until the transcript
 * is a minute behind the room. With it, a backlog is spent down quickly and the
 * text settles back to speech pace — visible as a brief hurry, which is honest,
 * rather than as a growing debt nobody can see.
 */
export const MAX_CATCH_UP = 4;

/** Words, keeping the whitespace that separates them out of the count. */
export function splitWords(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * The rate to pay words out at, given how many are already waiting.
 *
 * `pending` is the number of words that have arrived but are not yet shown at
 * the moment the reveal starts. One chunk's worth is normal and gets no hurry;
 * beyond that the rate climbs, capped so the text never simply appears.
 */
export function revealRate(pending, base = WORDS_PER_SECOND) {
  const chunk = Math.max(1, base * 5);
  const overflow = Math.max(0, pending - chunk) / chunk;
  return base * Math.min(MAX_CATCH_UP, 1 + overflow);
}

/**
 * How many words of `total` should be visible.
 *
 * `from` is the count already shown when this reveal began, so appending to a
 * turn continues rather than restarting it — otherwise every new chunk would
 * re-type the whole paragraph from the beginning.
 */
export function revealedCount({ total, from = 0, elapsedMs = 0, rate = WORDS_PER_SECOND }) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const start = Math.min(Math.max(0, from), total);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return start;
  const grown = start + Math.floor((elapsedMs / 1000) * Math.max(0, rate));
  return Math.min(total, grown);
}

/** The visible prefix of `text`, and whether anything is still to come. */
export function revealedText(text, count) {
  const all = splitWords(text);
  const shown = Math.min(Math.max(0, count), all.length);
  return { text: all.slice(0, shown).join(" "), done: shown >= all.length, total: all.length };
}
