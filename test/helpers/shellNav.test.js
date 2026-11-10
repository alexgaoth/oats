const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");

let shellNav;
let isSearching;
let openWhileRecording;

test.before(async () => {
  ({ shellNav, isSearching, openWhileRecording } = await import("../../src/helpers/shellNav.mjs"));
});

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

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

// DESIGN.md §1: navigation stays available while recording, and Settings is the
// one destination closed. The 2026-11-08 screen audit found Search closed too,
// in the sidebar and for the recall hotkey.
test("while recording, every destination opens but Settings", () => {
  assert.equal(openWhileRecording("conversation"), true);
  assert.equal(openWhileRecording("intelligence"), true);
  assert.equal(openWhileRecording("search"), true);
  assert.equal(openWhileRecording("settings"), false);
});

test("the sidebar's Search and the recall hotkey are not refused while recording", () => {
  const sidebar = read("src/components/shell/AppSidebar.tsx");
  const search = sidebar.match(/<NavItem\s+icon=\{Search\}[\s\S]*?\/>/);
  assert.ok(search, "the sidebar has a Search item");
  assert.doesNotMatch(search[0], /disabled=/);
  const settings = sidebar.match(/<NavItem\s+icon=\{Settings\}[\s\S]*?\/>/);
  assert.match(settings[0], /disabled=\{recording && !openWhileRecording\("settings"\)\}/);

  const workspace = read("src/components/OatsWorkspace.tsx");
  const goToSearch = workspace.match(/const goToSearch = \(\) => \{[\s\S]*?\n {4}\};/);
  assert.ok(goToSearch, "the recall hotkey has its handler");
  assert.doesNotMatch(goToSearch[0], /isRecording/);
  assert.match(workspace, /isRecording &&\s+!openWhileRecording\(next\)/);
});
