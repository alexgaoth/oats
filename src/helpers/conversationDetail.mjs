// How much of a live conversation the Conversation surface draws.
//
// Two compositions of the same recording, not two capabilities. Everything Oats
// does (detection, classification, automatic search, persistence and analysis)
// is identical in both. Clean, the plain view, shows eligible questions and
// their reply states. The details add the contour, topic flow, the full
// question rail and the transcript. Both announce the same questions.
//
// Pure and DOM-free so the default can be pinned. The default is the first
// thing every new user sees during the one action the product exists for.
// Since 2026-11-22 it is the details (Alex's decision): a recording opens on
// the contour, the flow card and the Questions tab, and Hide details goes to
// the plain view. A stored value still wins. It is written only when somebody
// changes the view, so an install where nobody did follows this default, and
// a value that has gone missing or bad lands on it too.

/** The details. Shown when nothing valid is stored. */
export const DEFAULT_CONVERSATION_DETAIL = "detailed";

export const CONVERSATION_DETAIL_VALUES = ["clean", "detailed"];

/**
 * @param {unknown} stored The raw persisted value, or null when absent.
 * @returns {"clean" | "detailed"}
 */
export function resolveConversationDetail(stored) {
  return CONVERSATION_DETAIL_VALUES.includes(stored) ? stored : DEFAULT_CONVERSATION_DETAIL;
}

/**
 * The recording store publishes cards in asking order, oldest first.
 * Show every question without a confirmed answer, then the last three
 * answered ones. Keep asking order within each set, even on a late verdict.
 * @template {{ track: boolean, state: string }} Card
 * @param {Card[]} cards
 * @returns {Card[]}
 */
export function selectCleanQuestions(cards) {
  const open = [];
  const answered = [];
  for (const card of cards) {
    if (card.track !== true) continue;
    if (card.state === "answered") answered.push(card);
    else open.push(card);
  }
  return open.concat(answered.slice(-3));
}
