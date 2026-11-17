const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §9: every control has a name. The 2026-11-08 screen audit found
// switches announced as unnamed on Settings › General, Recording, Connections
// and About: a settings row drew its label as a paragraph tied to nothing.
// The row now names a switch inside it; a switch outside a row names itself.

const ROOT = path.join(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const TOGGLE = read("src/components/ui/toggle.tsx");
const CONTEXT = read("src/components/ui/toggleLabel.ts");
const ROW = read("src/components/ui/SettingsSection.tsx");

const sources = (dir) =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.tsx$/.test(entry.name) ? [file] : [];
  });

test("a settings row names the switch inside it", () => {
  assert.match(CONTEXT, /export const ToggleLabelContext = React\.createContext/);
  assert.match(TOGGLE, /useContext\(ToggleLabelContext\)/);
  assert.match(TOGGLE, /ariaLabelledBy \?\? \(ariaLabel \? undefined : rowLabelId\)/);
  assert.match(ROW, /<p id=\{labelId\}/);
  assert.match(ROW, /<ToggleLabelContext\.Provider value=\{labelId\}>\{children\}/);
});

test("every switch has a name: its own, a label's, or its settings row's", () => {
  const unnamed = [];
  for (const file of sources("src/components")) {
    const source = read(file);
    for (const match of source.matchAll(/<Toggle\b[^>]*?\/>/gs)) {
      const props = match[0];
      if (/aria-label=|aria-labelledby=|\bid=/.test(props)) continue;
      const before = source.slice(0, match.index);
      if (before.lastIndexOf("<SettingsRow") > before.lastIndexOf("</SettingsRow>")) continue;
      unnamed.push(`${file}:${before.split("\n").length}`);
    }
  }
  assert.deepEqual(unnamed, []);
});
