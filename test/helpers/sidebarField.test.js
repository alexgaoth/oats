const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The wheat field at the sidebar's foot (approved by Alex, 2026-10-11): still at
// rest, swaying only while recording, never twice, and never at the cost of the
// recent list on a short window. Source-level: it needs WebGL to render.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const FIELD = read("src/components/shell/SidebarField.tsx");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const CSS = read("src/index.css");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");

test("it sways only while a conversation is recording and the sidebar is in view", () => {
  assert.match(FIELD, /<Field live intensity=\{[\d.]+\} animate=\{recording && !away\}/);
});

test("the shell says when the sidebar has stepped aside (focus on record)", () => {
  assert.match(WORKSPACE, /<AppSidebar[^>]*\saway=\{sidebarAway\}/);
  assert.match(SIDEBAR, /<SidebarField away=\{away\} \/>/);
});

test("it is not drawn while the full field backdrop is on", () => {
  assert.match(FIELD, /useSettingsStore\(\(state\) => state\.uiMode\) === "field"/);
  assert.match(FIELD, /if \(fieldMode\) return null;/);
});

test("it gives its height back on short windows", () => {
  assert.match(CSS, /@media \(max-height: \d+px\) \{\s*\.oats-sidebar-field \{\s*display: none;/);
});

test("it sits at the foot of the app's sidebar, under Settings", () => {
  const settings = SIDEBAR.lastIndexOf("<OnDeviceFooter");
  assert.ok(settings > 0 && SIDEBAR.indexOf("<SidebarField away={away} />") > settings);
});
