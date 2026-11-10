const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Escape on Intelligence steps back (a record or the map to the list), unless
// a layer on top already took it. Radix's menus and dialogs close on Escape
// from a document capture listener and mark the event handled
// (`preventDefault`); Intelligence's listener is on window and runs after.
// Without the check, one Escape that closed the Add menu on the Global board,
// or a conversation's More menu or its Delete dialog, also left the page, and
// the focus fell to <body>.
//
// Source-level, as in menuOpensDialog.test.js: the repo has no DOM test setup,
// and the ordering is between two listeners only a browser runs. The browser
// check is in the pull request that added this file.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function intelligenceKeyHandler() {
  const source = read("src/components/OatsWorkspace.tsx");
  const start = source.indexOf('if (surface !== "intelligence") return undefined;');
  assert.ok(start > 0, "Intelligence's key handler is where it was");
  const end = source.indexOf('window.addEventListener("keydown", onKeyDown);', start);
  assert.ok(end > start);
  return source.slice(start, end);
}

test("Intelligence's Escape leaves a key a menu or dialog already handled", () => {
  const handler = intelligenceKeyHandler();
  const guard = handler.indexOf("if (event.defaultPrevented) return;");
  const back = handler.indexOf('new Event("oats-intelligence-back")');
  assert.ok(guard > 0, "the handler checks defaultPrevented");
  assert.ok(back > guard, "the check comes before the step back");
});

test("the layers it defers to do mark Escape handled", () => {
  const layer = read("node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs");
  assert.match(
    layer,
    /onEscapeKeyDown\?\.\(event\);\s*if \(!event\.defaultPrevented && onDismiss\) \{\s*event\.preventDefault\(\);/
  );
  assert.match(layer, /addEventListener\("keydown", handleKeyDown, \{ capture: true \}\)/);
});
