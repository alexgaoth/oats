// How long ago a question was asked, as its card says it beside the verdict:
// "now" for the first 15 seconds, then seconds, then minutes.
//
// The rail's ages tick once every 15 seconds, so they do not move in the
// corner of somebody's eye (ConversationSignalRail). A fresh card therefore
// said "0s" until the first tick, and one asked and settled inside that
// window read "Answered · 0s", which looks broken.
//
// Pure, so it is tested.

/** Under this many seconds a card's age reads "now". */
export const NOW_SECONDS = 15;

/**
 * @param {number} from When the question was asked (ms).
 * @param {number} now The rail's clock (ms).
 * @returns {{ kind: "now" } | { kind: "ago", label: string }}
 */
export function questionAge(from, now) {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < NOW_SECONDS) return { kind: "now" };
  if (seconds < 60) return { kind: "ago", label: `${seconds}s` };
  return { kind: "ago", label: `${Math.round(seconds / 60)}m` };
}
