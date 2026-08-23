// How much of a live conversation the Conversation surface draws.
//
// Two compositions of the same recording, not two capabilities. Everything Oats
// does — detection, classification, the automatic search on a confirmed
// negative, persistence, titling, threads — is identical in both. `clean` hides
// evidence; it never withholds behaviour, and it never changes what a screen
// reader is told.
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

/** The value to store when the switch is pressed. */
export function toggleConversationDetail(current) {
  return resolveConversationDetail(current) === "clean" ? "detailed" : "clean";
}
