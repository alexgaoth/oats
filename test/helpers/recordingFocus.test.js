const test = require("node:test");
const assert = require("node:assert/strict");

let FOCUS_AT_REST;
let focusApplies;
let focusStep;
let isSidebarKey;
let sidebarHidden;

test.before(async () => {
  ({ FOCUS_AT_REST, focusApplies, focusStep, isSidebarKey, sidebarHidden } =
    await import("../../src/helpers/recordingFocus.mjs"));
});

const started = { type: "recording", recording: true };
const stopped = { type: "recording", recording: false };
const toggle = (surface = "conversation") => ({ type: "toggle", surface });
const run = (...events) => events.reduce(focusStep, FOCUS_AT_REST);

test("at rest the sidebar is shown everywhere and nothing is offered", () => {
  for (const surface of ["conversation", "intelligence", "settings"]) {
    assert.equal(sidebarHidden(FOCUS_AT_REST, surface), false);
    assert.equal(focusApplies(FOCUS_AT_REST, surface), false);
  }
});

test("a recording starting focuses the conversation", () => {
  const state = run(started);
  assert.equal(sidebarHidden(state, "conversation"), true);
  assert.equal(focusApplies(state, "conversation"), true);
});

test("a recording stopping brings the sidebar back", () => {
  const state = run(started, stopped);
  assert.equal(sidebarHidden(state, "conversation"), false);
  assert.equal(focusApplies(state, "conversation"), false);
  assert.deepEqual(state, FOCUS_AT_REST);
});

test("brought back mid-recording, the sidebar stays until the recording stops", () => {
  let state = run(started, toggle());
  assert.equal(sidebarHidden(state, "conversation"), false);
  // The store reporting the same recording again is not a new recording.
  state = focusStep(state, started);
  assert.equal(sidebarHidden(state, "conversation"), false);
  // Neither is looking elsewhere and coming back.
  assert.equal(sidebarHidden(state, "intelligence"), false);
  assert.equal(sidebarHidden(state, "conversation"), false);
  state = focusStep(state, stopped);
  assert.equal(sidebarHidden(state, "conversation"), false);
});

test("the same button or key hides it again", () => {
  const state = run(started, toggle(), toggle());
  assert.equal(sidebarHidden(state, "conversation"), true);
  assert.equal(sidebarHidden(run(started, toggle(), toggle(), toggle()), "conversation"), false);
});

test("the next recording starts focused again", () => {
  const state = run(started, toggle(), stopped, started);
  assert.equal(sidebarHidden(state, "conversation"), true);
});

test("Intelligence and Settings keep their sidebar while a recording runs", () => {
  const state = run(started);
  assert.equal(sidebarHidden(state, "intelligence"), false);
  assert.equal(sidebarHidden(state, "settings"), false);
  assert.equal(focusApplies(state, "intelligence"), false);
  assert.equal(focusApplies(state, "settings"), false);
  // Back on the conversation, it is focused again: nobody asked for the sidebar.
  assert.equal(sidebarHidden(state, "conversation"), true);
});

test("the toggle does nothing where focus does not apply", () => {
  assert.equal(focusStep(FOCUS_AT_REST, toggle()), FOCUS_AT_REST);
  const recording = run(started);
  assert.equal(focusStep(recording, toggle("intelligence")), recording);
  assert.equal(focusStep(recording, toggle("settings")), recording);
  assert.equal(focusStep(recording, { type: "toggle" }), recording);
});

test("an unknown event changes nothing", () => {
  const recording = run(started);
  assert.equal(focusStep(recording, { type: "other" }), recording);
  assert.equal(focusStep(recording, undefined), recording);
});

const key = (overrides) => ({
  key: "\\",
  code: "Backslash",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  ...overrides,
});

test("the sidebar key is Command-backslash on macOS", () => {
  assert.equal(isSidebarKey(key({ metaKey: true }), "darwin"), true);
  assert.equal(isSidebarKey(key({ ctrlKey: true }), "darwin"), false);
  assert.equal(isSidebarKey(key({ metaKey: true, ctrlKey: true }), "darwin"), false);
  assert.equal(isSidebarKey(key({}), "darwin"), false);
});

test("the sidebar key is Control-backslash on Windows and Linux", () => {
  for (const platform of ["win32", "linux"]) {
    assert.equal(isSidebarKey(key({ ctrlKey: true }), platform), true);
    assert.equal(isSidebarKey(key({ metaKey: true }), platform), false);
    assert.equal(isSidebarKey(key({ ctrlKey: true, metaKey: true }), platform), false);
  }
});

test("a held key does not make the sidebar flap", () => {
  assert.equal(isSidebarKey(key({ metaKey: true, repeat: true }), "darwin"), false);
});

test("other keys are not the sidebar key", () => {
  assert.equal(isSidebarKey(key({ metaKey: true, key: ",", code: "Comma" }), "darwin"), false);
  assert.equal(
    isSidebarKey(key({ metaKey: true, key: "|", code: "IntlBackslash" }), "darwin"),
    false
  );
});

test("a layout that types the backslash with Option still has the chord", () => {
  // German macOS: Option-Shift-7 types a backslash.
  const german = key({ metaKey: true, altKey: true, key: "\\", code: "Digit7" });
  assert.equal(isSidebarKey(german, "darwin"), true);
  // The physical backslash key, whatever it types, without Option.
  assert.equal(isSidebarKey(key({ metaKey: true, key: "#" }), "darwin"), true);
  assert.equal(isSidebarKey(key({ metaKey: true, altKey: true, key: "#" }), "darwin"), false);
});
