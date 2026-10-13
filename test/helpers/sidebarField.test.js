const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The wheat field at the sidebar's foot (approved by Alex, 2026-10-11; taller,
// 2026-10-12): still at rest, swaying only while recording, never twice, as
// tall as the room the sidebar has left, and never at the cost of the recent
// list. The component is source-level here, because it needs WebGL to render;
// its rules are in helpers/sidebarField.mjs.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const FIELD = read("src/components/shell/SidebarField.tsx");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const CSS = read("src/index.css");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");

const loadRules = () => import("../../src/helpers/sidebarField.mjs");
const loadModel = () => import("../../src/components/conversation/field/fieldModel.ts");

const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("it sways only while a conversation is recording and the sidebar is in view", () => {
  assert.match(FIELD, /<Field\s+live\s+intensity=\{[\d.]+\}\s+animate=\{recording && !away\}/);
});

test("the shell says when the sidebar has stepped aside (focus on record)", () => {
  assert.match(WORKSPACE, /<AppSidebar[^>]*\saway=\{sidebarAway\}/);
  assert.match(SIDEBAR, /<SidebarField away=\{away\}>/);
});

test("it is not drawn while the full field backdrop is on", () => {
  assert.match(FIELD, /useSettingsStore\(\(state\) => state\.uiMode\) === "field"/);
  assert.match(FIELD, /\{!fieldMode && \(/);
});

test("it sits at the foot of the app's sidebar, under Settings and the footer", () => {
  const opens = SIDEBAR.indexOf("<SidebarField away={away}>");
  const settings = SIDEBAR.lastIndexOf("<OnDeviceFooter");
  const closes = SIDEBAR.indexOf("</SidebarField>");
  assert.ok(opens > 0 && opens < settings && settings < closes);
  // What stands on the field comes first, and the field is drawn under it.
  assert.ok(FIELD.indexOf("{children}") < FIELD.indexOf("<Field"));
});

test("it is as tall as the room it has, between its minimum and its maximum", async () => {
  const { SIDEBAR_FIELD, sidebarFieldHeight } = await loadRules();
  assert.ok(SIDEBAR_FIELD.minHeight >= 96, "less than the 96px it was is too little to read");
  assert.ok(SIDEBAR_FIELD.maxHeight >= 2 * SIDEBAR_FIELD.minHeight, "it grows on a tall window");
  const { minHeight: min, maxHeight: max } = SIDEBAR_FIELD;
  for (const room of [min, min + 0.5, (min + max) / 2, max - 1]) {
    assert.equal(sidebarFieldHeight(room), room, `${room}px of room is all field`);
  }
  for (const room of [max, max + 1, 900]) {
    assert.equal(sidebarFieldHeight(room), max, "it stops growing at its maximum");
  }
});

test("under its minimum it is not drawn at all, rather than squeezed", async () => {
  const { SIDEBAR_FIELD, sidebarFieldHeight } = await loadRules();
  for (const room of [SIDEBAR_FIELD.minHeight - 0.5, 60, 0, -40, Number.NaN]) {
    assert.equal(sidebarFieldHeight(room), 0, `${room}px of room draws nothing`);
  }
});

test("its height comes from the room the layout leaves, never from a window height", () => {
  // The band shares nothing with the list: it starts at 0 and takes what is
  // left (flex-1 basis-0), up to its maximum.
  assert.match(FIELD, /className="oats-sidebar-field [^"]*\bmin-h-0 flex-1 basis-0\b/);
  assert.match(FIELD, /maxHeight: SIDEBAR_FIELD\.maxHeight,/);
  assert.match(FIELD, /style=\{FIELD_STYLE\}/);
  assert.doesNotMatch(code(FIELD), /\bh-24\b|innerHeight/);
});

test("no stylesheet hides it on a short window: only too little room does", () => {
  // It went at 760px tall and below, whatever room it had (#68).
  assert.doesNotMatch(CSS, /\.oats-sidebar-field\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(CSS, /@media \(max-height:[^)]*\)\s*\{\s*\.oats-sidebar-field/);
  // It is hidden only by the rule, applied to the room measured under the footer.
  assert.match(code(FIELD), /field\.hidden = sidebarFieldHeight\(room\) === 0;/);
});

test("the recent list keeps its own height, and the room under it is the field's", () => {
  const list = SIDEBAR.match(/<div className="([^"]*)">\s*\{recent\.length === 0/);
  assert.ok(list, "the recent list's wrapper");
  assert.doesNotMatch(list[1], /\bflex-1\b/, "the list does not take the room");
  assert.match(list[1], /\bmin-h-0\b/);
  assert.match(list[1], /\boverflow-y-auto\b/, "it scrolls only on a window too short for it");
  // The foot takes the room the list leaves, and keeps what stands on it at
  // the bottom when the field is not drawn.
  assert.match(FIELD, /<div ref=\{footRef\} className="flex flex-1 flex-col justify-end">/);
});

test("the ground keeps one scale at every height: a taller field is more sky", async () => {
  const { SIDEBAR_FIELD } = await loadRules();
  const { HORIZON, sceneFrame } = await loadModel();
  assert.match(FIELD, /sceneHeight=\{SIDEBAR_FIELD\.sceneHeight\}/);
  const ground = (height) => height - sceneFrame(height, SIDEBAR_FIELD.sceneHeight).y(HORIZON);
  const atMin = ground(SIDEBAR_FIELD.minHeight);
  for (const height of [150, 200, SIDEBAR_FIELD.maxHeight]) {
    assert.ok(
      Math.abs(ground(height) - atMin) < 1e-9,
      `the horizon is ${atMin}px up at ${height}px`
    );
  }
  assert.ok(Math.abs(atMin - (1 - HORIZON) * SIDEBAR_FIELD.sceneHeight) < 1e-9);
});

test("the sky fades into the sidebar with no edge at either end", () => {
  const sky = CSS.slice(CSS.indexOf(".oats-sidebar-sky {"));
  const gradient = sky.slice(0, sky.indexOf("}"));
  assert.match(
    gradient,
    /linear-gradient\(\s*180deg,\s*var\(--color-sidebar\) 0%,/,
    "opaque at the top"
  );
  assert.match(
    gradient,
    /transparent calc\(var\(--sky\) \* [\d.]+\)\s*\);/,
    "clear before the horizon"
  );
  // Measured on the sky: the field's height less the ground the field sets.
  assert.match(gradient, /--sky: calc\(100% - var\(--oats-field-ground/);
  assert.match(
    FIELD,
    /"--oats-field-ground": `\$\{\(1 - HORIZON\) \* SIDEBAR_FIELD\.sceneHeight\}px`/
  );
  // Eased, so neither end of the fade shows as a line: more than two stops.
  assert.ok(gradient.split("color-mix(").length - 1 >= 4);
});
