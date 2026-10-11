const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  WINDOW_VISIBILITY_CHANNEL,
  isSeen,
  isWindowSeen,
  nextWindowVisibility,
  trackWindowVisibility,
} = require("../../src/helpers/windowVisibility");

// Enough of a BrowserWindow: its events, its two getters, and webContents.send.
function fakeWindow({ visible = true, minimized = false } = {}) {
  const win = new EventEmitter();
  win.sent = [];
  win.destroyed = false;
  win.isVisible = () => visible;
  win.isMinimized = () => minimized;
  win.isDestroyed = () => win.destroyed;
  win.webContents = { send: (channel, value) => win.sent.push([channel, value]) };
  return win;
}

test("hidden or minimized is unseen; both must clear to be seen again", () => {
  let state = { hidden: false, minimized: false };
  assert.equal(isSeen(state), true);
  state = nextWindowVisibility(state, "minimize");
  assert.equal(isSeen(state), false);
  // On macOS a minimize is also an occlusion ("hide"). Restored but still
  // covered, the window is still unseen.
  state = nextWindowVisibility(state, "hide");
  state = nextWindowVisibility(state, "restore");
  assert.equal(isSeen(state), false);
  state = nextWindowVisibility(state, "show");
  assert.equal(isSeen(state), true);
});

test("other events leave the state alone", () => {
  const state = { hidden: true, minimized: false };
  assert.equal(nextWindowVisibility(state, "focus"), state);
  assert.equal(nextWindowVisibility(state, "blur"), state);
});

test("the page is told when its window goes out of sight and back, once each", () => {
  const win = fakeWindow();
  trackWindowVisibility(win);

  win.emit("hide");
  win.emit("minimize"); // already unseen: nothing new to say
  win.emit("restore"); // still hidden: nothing new to say
  win.emit("show");
  win.emit("show");

  assert.deepEqual(win.sent, [
    [WINDOW_VISIBILITY_CHANNEL, false],
    [WINDOW_VISIBILITY_CHANNEL, true],
  ]);
});

test("a window created hidden is unseen until it is shown", () => {
  const win = fakeWindow({ visible: false });
  trackWindowVisibility(win);
  assert.equal(isWindowSeen(win), false);
  win.emit("show");
  assert.equal(isWindowSeen(win), true);
  assert.deepEqual(win.sent, [[WINDOW_VISIBILITY_CHANNEL, true]]);
});

// Push-plus-pull: a push sent before the page listened is lost, so the page's
// first ask must get what it would have been told.
test("the first ask answers with the tracked state, not a fresh guess", () => {
  const win = fakeWindow({ visible: true });
  trackWindowVisibility(win);
  // macOS: covered by another window. Electron still reports isVisible().
  win.emit("hide");
  assert.equal(win.isVisible(), true);
  assert.equal(isWindowSeen(win), false);
});

test("a destroyed window sends nothing", () => {
  const win = fakeWindow();
  trackWindowVisibility(win);
  win.destroyed = true;
  win.emit("hide");
  assert.deepEqual(win.sent, []);
});

test("when in doubt the page counts as seen", () => {
  assert.equal(isWindowSeen(null), true);
  assert.equal(isWindowSeen(fakeWindow({ visible: false })), false, "untracked: Electron's view");
  assert.equal(isWindowSeen(fakeWindow({ minimized: true })), false);
  assert.equal(isWindowSeen(fakeWindow()), true);
});

// The wiring is four places that must agree on two channel names; a typo in any
// of them fails silently, with the field drawing for nobody again.
test("main pushes, preload listens, and the first ask has a handler", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (relative) => fs.readFileSync(path.join(__dirname, "../..", relative), "utf8");

  const preload = read("preload.js");
  assert.ok(preload.includes(`"${WINDOW_VISIBILITY_CHANNEL}"`), "preload listens on the channel");
  assert.ok(preload.includes('ipcRenderer.invoke("get-window-visibility")'));
  assert.ok(read("src/helpers/ipcHandlers.js").includes('ipcMain.handle("get-window-visibility"'));

  // Tracked from the moment the window exists, so no event is missed.
  const manager = read("src/helpers/windowManager.js");
  const created = manager.indexOf(
    "this.controlPanelWindow = new BrowserWindow(CONTROL_PANEL_CONFIG);"
  );
  const tracked = manager.indexOf("trackWindowVisibility(this.controlPanelWindow);");
  assert.ok(created > -1 && tracked > created, "tracked right after it is created");
  assert.ok(
    manager.slice(created, tracked).split("\n").length <= 4,
    "nothing that could emit an event runs between the two"
  );
});
