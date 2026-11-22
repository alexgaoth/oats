// How much of a live conversation the Conversation surface draws.
//
// Two compositions of the same recording, not two capabilities. Everything Oats
// does (detection, classification, automatic search, persistence and analysis)
// is identical in both. Clean shows eligible questions and their reply states.
// Words adds the contour, topic flow, transcript and full question rail.
// Both announce the same questions.
//
// Pure and DOM-free so the default can be pinned. The default matters more than
// it looks: it is the first thing every new user sees during the one action the
// product exists for, and a stored value that has gone missing or bad must land
// on the quiet composition rather than on the busy one.

/** The quiet composition. Shown when nothing valid is stored. */
export const DEFAULT_CONVERSATION_DETAIL = "clean";

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
