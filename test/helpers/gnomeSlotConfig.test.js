const test = require("node:test");
const assert = require("node:assert/strict");

// Regression test for a startup crash.
//
// `hotkeyManager` decides which slots route through native GNOME shortcuts via
// GNOME_NATIVE_SLOTS. `gnomeShortcut` looks each one up in its own SLOT_CONFIG
// and *throws* on a miss. Adding the `conversation` slot to the first list and
// not the second meant `getSlotConfig` threw inside `registerSlot`, which runs
// on the startup path — so the entire application failed to launch on GNOME
// with "Unknown slot: conversation".
//
// The two lists must agree. This is cheap to check and expensive to discover.

const GnomeShortcutManager = require("../../src/helpers/gnomeShortcut.js");
const { GNOME_NATIVE_SLOTS } = require("../../src/helpers/hotkeyManager.js");

test("every GNOME-native slot has a gsettings configuration", () => {
  const known = new Set(GnomeShortcutManager.knownSlots());
  const missing = [...GNOME_NATIVE_SLOTS].filter((slot) => !known.has(slot));
  assert.deepEqual(
    missing,
    [],
    `these slots route through GNOME but have no SLOT_CONFIG entry, which throws during startup: ${missing.join(", ")}`
  );
});

test("the conversation slot is bindable on GNOME", () => {
  // The primary action registers unconditionally, so it is on the startup path
  // for every GNOME user whether or not they configured a shortcut.
  assert.ok(
    GnomeShortcutManager.knownSlots().includes("conversation"),
    "the conversation slot must be GNOME-bindable"
  );
  assert.ok(GNOME_NATIVE_SLOTS.has("conversation"));
});

test("each slot has its own gsettings path and name", () => {
  // Two slots sharing a keybinding path would silently overwrite each other in
  // GNOME's custom-keybindings list, so one shortcut would replace the other.
  const config = GnomeShortcutManager.slotConfig();
  const entries = Object.entries(config);

  const paths = entries.map(([, value]) => value.path);
  assert.equal(new Set(paths).size, entries.length, "gsettings paths must be unique per slot");

  const names = entries.map(([, value]) => value.name);
  assert.equal(new Set(names).size, entries.length, "displayed shortcut names must be unique");

  for (const [slot, value] of entries) {
    assert.ok(value.path.endsWith("/"), `${slot} path must end in a slash: ${value.path}`);
    assert.ok(value.name.startsWith("Oats"), `${slot} should be identifiable in GNOME settings`);
  }
});
