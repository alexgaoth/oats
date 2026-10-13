const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A menu item that opens a dialog opens it once the menu has closed
// (`onSelectAfterClose`, documented in src/components/ui/dropdown-menu.tsx).
// Opened from `onSelect`, the dialog mounts while the menu still holds
// `pointer-events: none` on <body>. It records that as the page's own value,
// puts it back when it closes, and the window takes no clicks until a reload.
//
// Source-level: the repo has no DOM test setup, and the failure is an ordering
// between two Radix layers that only a browser runs. The browser check is in
// the pull request that added this file.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const MENU_ITEMS = [
  "DropdownMenuItem",
  "DropdownMenuCheckboxItem",
  "DropdownMenuRadioItem",
  "ContextMenuItem",
  "MenubarItem",
];
const DIALOGS = ["Dialog", "ConfirmDialog", "AlertDialog", "Sheet"];

function components(dir = "src") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "dist" ? [] : components(relative);
    }
    return /\.(tsx|jsx)$/.test(entry.name) ? [relative] : [];
  });
}

// From `from`, the index of the first character where `stop(char, depth)` holds,
// counting braces and skipping strings, and comments inside braces.
function scan(source, from, stop) {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      i++;
      while (i < source.length && source[i] !== char) i += source[i] === "\\" ? 2 : 1;
      continue;
    }
    if (depth > 0 && source.startsWith("//", i)) {
      i = source.indexOf("\n", i);
      continue;
    }
    if (depth > 0 && source.startsWith("/*", i)) {
      i = source.indexOf("*/", i) + 1;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (stop(char, depth)) return i;
  }
  return source.length - 1;
}

// Each opening tag `<Name ...>` in the source, attributes and all.
function openingTags(source, name) {
  return [...source.matchAll(new RegExp(`<${name}(?![\\w.])`, "g"))].map((match) => {
    const from = match.index + match[0].length;
    const end = scan(source, from, (char, depth) => char === ">" && depth === 0);
    return source.slice(match.index, end + 1);
  });
}

// The expression of `name={...}` in an opening tag, braces included.
function attribute(tag, name) {
  const match = new RegExp(`\\s${name}=\\{`).exec(tag);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  const close = scan(tag, open, (char, depth) => char === "}" && depth === 0);
  return tag.slice(open, close + 1);
}

// The state setters that open a dialog in this file: `open={x}` on a dialog,
// where `const [x, setX] = useState(...)`.
function dialogSetters(source) {
  const setters = new Set();
  for (const tag of DIALOGS.flatMap((name) => openingTags(source, name))) {
    const open = attribute(tag, "open");
    for (const [name] of (open ?? "").matchAll(/[A-Za-z_$][\w$]*/g)) {
      const state = new RegExp(`const \\[\\s*${name}\\s*,\\s*(set\\w+)\\s*\\]\\s*=\\s*useState`);
      const setter = state.exec(source)?.[1];
      if (setter) setters.add(setter);
    }
  }
  return setters;
}

test("no menu item opens a dialog from onSelect", () => {
  let items = 0;
  for (const file of components()) {
    const source = read(file);
    const tags = MENU_ITEMS.flatMap((name) => openingTags(source, name));
    items += tags.length;
    const setters = dialogSetters(source);
    for (const tag of tags) {
      const onSelect = attribute(tag, "onSelect");
      if (!onSelect) continue;
      for (const setter of setters) {
        assert.doesNotMatch(
          onSelect,
          new RegExp(`\\b${setter}\\(`),
          `${file}: a menu item opens a dialog from onSelect; use onSelectAfterClose\n${tag}`
        );
      }
      assert.doesNotMatch(
        onSelect,
        /\bshow\w*Dialog\(/,
        `${file}: a menu item opens a dialog from onSelect; use onSelectAfterClose\n${tag}`
      );
    }
  }
  // The scan has to find the menus, and the dialog the conversation's menu
  // opens, or it passes without looking.
  assert.ok(items > 0, "the scan found no menu items");
  assert.ok(
    dialogSetters(read("src/components/OatsWorkspace.tsx")).has("setConfirming"),
    "the scan no longer finds the state that opens the Delete dialog"
  );
});

test("the menu runs an item's after-close action once it has closed", () => {
  const MENU = read("src/components/ui/dropdown-menu.tsx");
  // Recorded on select, unless the item's onSelect kept the menu open.
  assert.match(
    MENU,
    /if \(onSelectAfterClose && afterClose && !event\.defaultPrevented\) \{\s*afterClose\.current = onSelectAfterClose;/
  );
  // Run once, from onCloseAutoFocus: the menu has unmounted and given the pointer back.
  assert.match(
    MENU,
    /onCloseAutoFocus=\{\(event\) => \{\s*onCloseAutoFocus\?\.\(event\);\s*const action = afterClose\.current;\s*afterClose\.current = null;\s*action\?\.\(event\);/
  );
});

test("Delete asks after the menu has closed and gives the focus back to the menu's button", () => {
  const WORKSPACE = read("src/components/OatsWorkspace.tsx");
  const actions = WORKSPACE.slice(WORKSPACE.indexOf("function ConversationActions"));
  // Only about the conversation it was chosen on: the menu takes a moment to close.
  assert.match(
    actions,
    /<DropdownMenuItem\s+variant="destructive"\s+onSelectAfterClose=\{\(\) => \{\s*if \(shownId\.current === note\.id\) setConfirming\(true\);/
  );
  assert.match(actions, /<Button\s+ref=\{moreButton\}/);
  assert.match(
    actions,
    /onCloseAutoFocus=\{\(event\) => \{\s*event\.preventDefault\(\);\s*moreButton\.current\?\.focus\(\);/
  );
  // ConfirmDialog hands it to the dialog.
  assert.match(
    read("src/components/ui/dialog.tsx"),
    /<DialogContent className="sm:max-w-\[425px\]" onCloseAutoFocus=\{onCloseAutoFocus\}>/
  );
});
