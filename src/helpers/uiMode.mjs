// Which of the two interfaces Oats is wearing.
//
// `work` is the ledger: paper, graphite, gold, nothing on screen that did not
// come out of the conversation. `field` is the same product standing in an oat
// field — sky, horizon, wheat, chaff — with the small delights that go with it.
//
// Two modes, not a theme toggle: they differ in what is *on screen*, not only
// in colour, so the choice is stored and named rather than inferred.
//
// Pure and DOM-free so it can be pinned, and so the renderer and the stored
// value cannot disagree about what an unknown string means.

export const UI_MODES = ["work", "field"];

/** Work is the default: it is the mode the product is judged on. */
export const DEFAULT_UI_MODE = "work";

/**
 * Read a stored value.
 *
 * Anything unrecognised — an older build's value, a hand-edited localStorage,
 * `null` on a fresh install — resolves to the default rather than leaving the
 * interface in a state no code draws.
 */
export function resolveUiMode(stored) {
  return UI_MODES.includes(stored) ? stored : DEFAULT_UI_MODE;
}

export function toggleUiMode(current) {
  return resolveUiMode(current) === "field" ? "work" : "field";
}

export function isFieldMode(stored) {
  return resolveUiMode(stored) === "field";
}
