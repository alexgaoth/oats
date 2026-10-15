const test = require("node:test");
const assert = require("node:assert/strict");

let shellNav;
let isSearching;

test.before(async () => {
  ({ shellNav, isSearching } = await import("../../src/helpers/shellNav.mjs"));
});

// The bug this exists for: pressing Search lit Conversations and titled the
// page Conversations.
test("searching on the Conversations page is Search in the sidebar and the title", () => {
  assert.deepEqual(shellNav("intelligence", true), {
    current: "search",
    titleKey: "oats.shell.search",
  });
  assert.deepEqual(shellNav("intelligence", false), {
    current: "conversations",
    titleKey: "oats.shell.conversations",
  });
});

test("Home and Settings stay themselves whether or not a search is held", () => {
  for (const searching of [true, false]) {
    assert.equal(shellNav("conversation", searching).current, "home");
    assert.equal(shellNav("settings", searching).current, "settings");
  }
  assert.equal(shellNav("conversation", false).titleKey, "oats.shell.home");
  assert.equal(shellNav("settings", false).titleKey, "oats.nav.settings");
});

test("searching means the list, with the field focused or a query in it", () => {
  assert.equal(isSearching({ view: "list", reading: false, focused: true, query: "" }), true);
  assert.equal(
    isSearching({ view: "list", reading: false, focused: false, query: "import bug" }),
    true
  );
  assert.equal(isSearching({ view: "list", reading: false, focused: false, query: "   " }), false);
  assert.equal(isSearching({ view: "list", reading: false, focused: false, query: "" }), false);
});

test("reading a result, or the board, is not searching", () => {
  assert.equal(
    isSearching({ view: "list", reading: true, focused: false, query: "import bug" }),
    false
  );
  assert.equal(
    isSearching({ view: "global", reading: false, focused: true, query: "import bug" }),
    false
  );
});
