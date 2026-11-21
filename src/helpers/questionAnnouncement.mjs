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
//   **Saying nothing.** Two questions can arrive in one render, and a repeat
//   can have identical text. Give each asking its own keyed addition to the
//   live region instead of replacing the region's text with the latest quote.

/**
 * @param {Array<{ id?: string, question?: string, occurrence?: number }>} cards
 *   The cards currently on the surface, oldest first.
 * @param {Set<string>} spoken Every card id the region has already announced.
 * @returns {{ id: string, question: string, occurrence: number }[]}
 *   The caller marks every returned id spoken, including cards with no text.
 */
export function newQuestionAnnouncements(cards, spoken) {
  const fresh = [];
  for (const card of cards ?? []) {
    if (!card?.id || spoken.has(card.id)) continue;
    fresh.push({
      id: card.id,
      question: card.question ?? "",
      occurrence: Number.isFinite(card.occurrence) ? card.occurrence : 1,
    });
  }
  return fresh;
}

const CHECK_VERDICTS = new Set(["right", "wrong", "answer"]);

/**
 * The context check's verdict the live region should say next, if any.
 *
 * A verdict is spoken once, when it lands; "checking" is never spoken, since a
 * status nobody can act on is noise beside a live conversation. The same
 * forwards-only rule as above: `spoken` holds every card id whose verdict was
 * announced, so dismissing or restoring a card cannot repeat one.
 *
 * @param {Array<{ id?: string, check?: { state?: string, answer?: string, source?: { label?: string } } }>} cards
 * @param {Set<string>} spoken
 * @returns {{ ids: string[], state: string, answer: string, source: string } | null}
 */
export function nextCheckAnnouncement(cards, spoken) {
  const ids = [];
  let newest = null;
  for (const card of cards ?? []) {
    if (!card?.id || spoken.has(card.id) || !CHECK_VERDICTS.has(card.check?.state)) continue;
    ids.push(card.id);
    newest = card;
  }
  if (!newest) return null;
  return {
    ids,
    state: newest.check.state,
    answer: String(newest.check.answer || ""),
    source: String(newest.check.source?.label || ""),
  };
}
