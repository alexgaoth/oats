const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Opening a conversation from Home on the first visit to Intelligence. The
// press parks its id and mounts Intelligence, and the mount's effects decide
// what opens: the parked id is selected, then the default runs. The effects need
// a browser, so the wiring is checked at source level and the decision is
// replayed here the way React settles a state queue.

let newestUnlessSelected;

test.before(async () => {
  ({ newestUnlessSelected } = await import("../../src/helpers/noteSelection.mjs"));
});

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");

// What React does with the updates queued for one piece of state before the
// next render: in order, a value replaces the state and an updater is called
// with it.
const settle = (state, ...updates) =>
  updates.reduce(
    (current, update) => (typeof update === "function" ? update(current) : update),
    state
  );

// Most recent first, as the note store holds them.
const NOTES = [{ id: 30 }, { id: 20 }, { id: 10 }];

test("on the first visit, the conversation pressed on Home is the one that opens", () => {
  // The second row, pressed. The open effect queues the parked id; the default
  // effect runs after it, from a render in which nothing was selected.
  assert.equal(settle(null, 20, newestUnlessSelected(NOTES)), 20);
  // In either order: the default does not depend on running first or last.
  assert.equal(settle(null, newestUnlessSelected(NOTES), 20), 20);
});

test("with nothing asked for, Intelligence opens on the most recent conversation", () => {
  assert.equal(settle(null, newestUnlessSelected(NOTES)), 30);
});

test("with no conversations, nothing is selected", () => {
  assert.equal(settle(null, newestUnlessSelected([])), null);
});

test("a selection is kept, and a cleared one gives way to the most recent", () => {
  assert.equal(settle(10, newestUnlessSelected(NOTES)), 10);
  // A deleted conversation clears the selection before the default runs.
  assert.equal(settle(20, null, newestUnlessSelected(NOTES)), 30);
});

test("the press parks its id, and Intelligence takes it when it mounts", () => {
  assert.match(
    WORKSPACE,
    /parkPendingNote\(noteId\);\s*setSurface\("intelligence"\);/,
    "the shell parks the pressed id before it opens Intelligence"
  );
  assert.match(
    WORKSPACE,
    /const pending = consumePendingNote\(\);\s*if \(pending !== null\) open\(pending\);/,
    "Intelligence selects the parked id when it mounts"
  );
});

test("Intelligence queues its default as the updater, never as a value", () => {
  assert.match(
    WORKSPACE,
    /setSelectedId\(newestUnlessSelected\(notes\)\)/,
    "the default selection goes through newestUnlessSelected"
  );
  assert.doesNotMatch(
    WORKSPACE,
    /setSelectedId\(notes\[0\]/,
    "a value would replace the conversation the press selected"
  );
});
