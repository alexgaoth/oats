// Whether anybody can see a window, told to the page inside it.
//
// The control panel runs with `backgroundThrottling: false`, so a conversation
// recorded with the window closed to the tray is never throttled. That setting
// "also affects the Page Visibility API" (Electron's WebPreferences docs), and
// frames go on being drawn: measured, `document.visibilityState` stayed
// "visible" with the window minimized or hidden, and the field backdrop went on
// drawing 120 frames a second for nobody. The page cannot know when nobody is
// looking.
//
// Main does know. On macOS the window's "show" and "hide" events are occlusion
// events (see dockManager.js): they fire when the window is covered, minimized,
// closed to the tray or on another Space, which is exactly the question. On
// Windows and Linux they fire on show() and hide(), and "minimize"/"restore"
// cover the rest. Push on change, and answer a pull for the page's first look
// (an event sent before the page listens is lost).

const WINDOW_VISIBILITY_CHANNEL = "window-visibility";

/** The window's visibility after one of its events. Pure. */
function nextWindowVisibility(state, event) {
  switch (event) {
    case "show":
      return { ...state, hidden: false };
    case "hide":
      return { ...state, hidden: true };
    case "minimize":
      return { ...state, minimized: true };
    case "restore":
      return { ...state, minimized: false };
    default:
      return state;
  }
}

/** Seen means not hidden (or covered, on macOS) and not minimized. Pure. */
function isSeen(state) {
  return !state.hidden && !state.minimized;
}

const tracked = new WeakMap();

/**
 * Tell `win`'s page whenever it goes in or out of sight. Call once, right after
 * creating the window, so no event is missed.
 */
function trackWindowVisibility(win) {
  let state = { hidden: !win.isVisible(), minimized: win.isMinimized() };
  tracked.set(win, () => isSeen(state));
  for (const event of ["show", "hide", "minimize", "restore"]) {
    win.on(event, () => {
      const was = isSeen(state);
      state = nextWindowVisibility(state, event);
      const seen = isSeen(state);
      if (seen === was || win.isDestroyed()) return;
      win.webContents.send(WINDOW_VISIBILITY_CHANNEL, seen);
    });
  }
}

/**
 * The answer to the page's first ask. Untracked windows fall back to what
 * Electron reports, and anything unknown counts as seen: a page that wrongly
 * thinks it is visible costs some frames, one that wrongly thinks it is hidden
 * stands still in front of somebody.
 */
function isWindowSeen(win) {
  if (!win || win.isDestroyed()) return true;
  const seen = tracked.get(win);
  if (seen) return seen();
  return win.isVisible() && !win.isMinimized();
}

module.exports = {
  WINDOW_VISIBILITY_CHANNEL,
  isSeen,
  isWindowSeen,
  nextWindowVisibility,
  trackWindowVisibility,
};
