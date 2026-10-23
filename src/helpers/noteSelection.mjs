// Which conversation Intelligence opens on when nobody has asked for one.
//
// The most recent, but only while nothing is selected: a conversation that was
// asked for is never replaced. Pinned by test/helpers/noteSelection.test.js.
//
// It is a state updater rather than a value because of the first visit. A press
// on a recent conversation, on Home or in the sidebar, parks its id and opens
// Intelligence, and on the first visit that press is what mounts it. The
// mount's effects run in one pass: the first selects the parked id, and the
// default's runs after it, reading `selectedId` from a render in which nothing
// was selected yet. As a value, the default landed last, so the most recent
// conversation opened in place of the one pressed. An updater is called with
// what React has queued, so it finds the pressed one and keeps it.
//
// Pure and DOM-free. `IntelligenceViews` in OatsWorkspace.tsx keeps the state.

/**
 * The most recent conversation, unless one is already selected, as an updater
 * for `setSelectedId`.
 *
 * @param {Array<{ id: number }>} notes most recent first, as the note store holds them
 * @returns {(selectedId: number | null) => number | null}
 */
export function newestUnlessSelected(notes) {
  return (selectedId) => selectedId ?? notes[0]?.id ?? null;
}
