const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/hotkeyLabel.ts");

test("macOS gets symbols with no separator", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("CommandOrControl+Shift+O", "darwin"), "⇧⌘O");
  assert.equal(formatHotkey("Control+Shift+O", "darwin"), "⌃⇧O");
  assert.equal(formatHotkey("Alt+Space", "darwin"), "⌥Space");
});

test("everything else gets words joined by plus", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("CommandOrControl+Shift+O", "linux"), "Ctrl+Shift+O");
  assert.equal(formatHotkey("CommandOrControl+Shift+F9", "win32"), "Ctrl+Shift+F9");
  assert.equal(formatHotkey("Super+Space", "linux"), "Super+Space");
});

test("single letters are capitalised, named keys are left alone", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("Control+o", "linux"), "Ctrl+O");
  assert.equal(formatHotkey("Control+F9", "linux"), "Ctrl+F9");
  assert.equal(formatHotkey("Control+Space", "linux"), "Ctrl+Space");
});

test("nothing in, nothing out — the idle screen renders no line at all", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("", "linux"), "");
  assert.equal(formatHotkey(null, "linux"), "");
  assert.equal(formatHotkey(undefined, "darwin"), "");
  assert.equal(formatHotkey("+++", "linux"), "");
});

test("whitespace and casing in stored accelerators survive", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey(" CommandOrControl + Shift + O ", "linux"), "Ctrl+Shift+O");
  assert.equal(formatHotkey("commandorcontrol+shift+o", "darwin"), "⇧⌘O");
});

test("a bare key with no modifier still reads", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("F8", "linux"), "F8");
  assert.equal(formatHotkey("F8", "darwin"), "F8");
});

test("macOS writes modifiers in the menu order, whatever order they were stored in", async () => {
  const { formatHotkey } = await load();
  assert.equal(formatHotkey("Command+Shift+Alt+Control+K", "darwin"), "⌃⌥⇧⌘K");
  assert.equal(formatHotkey("Shift+Command+O", "darwin"), "⇧⌘O");
  assert.equal(formatHotkey("Alt+Command+F9", "darwin"), "⌥⌘F9");
  // Order is a Mac convention only; Linux keeps the stored order.
  assert.equal(formatHotkey("Shift+Control+O", "linux"), "Shift+Ctrl+O");
});
