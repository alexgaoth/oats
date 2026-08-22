// What the Conversation surface's live region should say next, given the cards
// on screen and everything it has already said.
//
// This is a pure function in its own module for one reason: the defect it fixes
// was found three times by a screen reader and never once by reading the
// component. Announcement order is a data problem — which cards are new, in
// what order, and whether a card has been heard before — so it is separated
// from the rendering and pinned by `test/helpers/questionAnnouncement.test.js`.
//
// Two failure modes it exists to prevent, both of which shipped:
//
//   **Going backwards.** Deriving "newest" from the tail of the visible list
//   means dismissing the newest group makes the tail fall back to an older card
//   and the region repeats a question the user already heard — and undo does it
//   again in reverse. The caller therefore passes a set of every id ever
//   announced, not the id of the newest card.
//
//   **Saying nothing.** A live region only announces when its text *changes*.
//   Two questions arriving in the same five-second segment used to announce
//   once, silently dropping the other; and a re-asking of the same question
//   produces identical text, so rule 3's "repeats are never suppressed" became
//   "repeats are never spoken". Both cases are reported here instead, which
//   makes the text differ as a side effect of being accurate.

/**
 * @param {Array<{ id?: string, question?: string, occurrence?: number }>} cards
 *   The cards currently on the surface, oldest first.
 * @param {Set<string>} spoken Every card id the region has already announced.
 * @returns {{ ids: string[], question: string, occurrence: number, count: number } | null}
 *   `null` when there is nothing new. `count` is how many cards arrived
 *   together; `question` and `occurrence` describe the newest of them.
 *   The caller is responsible for adding `ids` to `spoken`.
 */
export function nextAnnouncement(cards, spoken) {
  const fresh = [];
  for (const card of cards ?? []) {
    if (!card?.id || spoken.has(card.id)) continue;
    // A card with no question text has nothing to announce, but it must still
    // be marked spoken or it is reconsidered on every render.
    fresh.push(card);
  }
  if (!fresh.length) return null;

  const ids = fresh.map((card) => card.id);
  const speakable = fresh.filter((card) => card.question);
  if (!speakable.length) return { ids, question: "", occurrence: 1, count: 0 };

  const newest = speakable[speakable.length - 1];
  return {
    ids,
    question: newest.question,
    occurrence: Number.isFinite(newest.occurrence) ? newest.occurrence : 1,
    count: speakable.length,
  };
}
