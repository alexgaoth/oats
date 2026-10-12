const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// E1, as Alex chose it: the keys people reach for mid-conversation wear a chip
// (Mark M, Search /, Start and Stop recording); every other control with a key
// names it in its tooltip or menu. Source-level: tooltips need a browser.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const SIDEBAR = read("src/components/shell/AppSidebar.tsx");
const TOOLTIP = read("src/components/ui/shortcut-tooltip.tsx");

test("Stop wears the conversation key, as Mark wears M", () => {
  const stop = WORKSPACE.slice(WORKSPACE.indexOf('variant="destructive"'));
  assert.match(stop, /aria-keyshortcuts=\{shortcutAria \|\| undefined\}/);
  assert.match(stop.slice(0, 900), /\{shortcut && \(\s*<Kbd[^>]*>\s*\{shortcut\}\s*<\/Kbd>/);
});

test("the sidebar's record button and Settings name their keys in a tooltip", () => {
  assert.match(
    SIDEBAR,
    /<ShortcutTooltip\s+label=\{recording \? t\("oats\.shell\.stop"\) : t\("oats\.shell\.record"\)\}\s+keys=\{keys\.record\}/
  );
  assert.match(
    SIDEBAR,
    /<ShortcutTooltip label=\{t\("oats\.nav\.settings"\)\} keys=\{keys\.settings\}/
  );
  assert.match(SIDEBAR, /formatHotkey\("CommandOrControl\+,", platform\)/);
  // A tooltip trigger passes its ref and handlers through to the item's button.
  assert.match(SIDEBAR, /<button\s+\{\.\.\.props\}/);
});

test("Back names Escape, the key that steps back on that surface", () => {
  const back = WORKSPACE.slice(WORKSPACE.indexOf("function BackButton"));
  assert.match(back, /<ShortcutTooltip label=\{t\("oats\.shell\.back"\)\} keys="Esc"/);
  assert.match(back, /aria-keyshortcuts="Escape"/);
});

test("Find, which has a key and no button, is named in the conversation's menu", () => {
  assert.match(WORKSPACE, /formatHotkey\("CommandOrControl\+F", platform\)/);
  assert.match(
    WORKSPACE,
    /window\.dispatchEvent\(new Event\("oats-find"\)\);[\s\S]{0,200}<DropdownMenuShortcut>\{findKeys\.label\}<\/DropdownMenuShortcut>/
  );
  // The menu leaves the focus to the find line it opened.
  assert.match(
    WORKSPACE,
    /onCloseAutoFocus=\{\(event\) => \{\s*if \(!findChosen\.current\) return;/
  );
});

test("a control with no key (cleared in Settings) shows no tooltip at all", () => {
  assert.match(TOOLTIP, /if \(!keys\) return children;/);
});
