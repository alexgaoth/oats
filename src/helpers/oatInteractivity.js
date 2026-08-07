// Who owns whether the floating oat swallows the mouse or lets it through.
//
// The oat's window is a 96×96 transparent square holding a ~40px seed, so most
// of it must be click-through or it eats presses meant for whatever is behind
// it. The renderer used to be the sole authority on that, toggling on its own
// `mouseenter`/`mouseleave`. That has a hole big enough to lose the feature
// through:
//
//   `setIgnoreMouseEvents(true, { forward: true })` only forwards on macOS and
//   Windows. On Linux, Electron replaces the window's X11 *input shape* with a
//   1×1 rectangle, and a window that receives no mouse events can never receive
//   the `mouseenter` that would turn itself back on. One `mouseleave` and the oat
//   is inert until the app restarts.
//
// Dragging is exactly how that `mouseleave` gets delivered: the window is moved
// by the main process at 60fps and trails the cursor by a frame, so the pointer
// slips off the seed constantly while a drag is in flight. Hence the report that
// the oat can be dragged once and then never again — the first drag turns it off
// and nothing can turn it back on.
//
// So the decision moves here, main-side, where the cursor's real position is
// knowable without the renderer's help, and the renderer's request becomes one
// input among three rather than the whole answer.

/** Is `point` inside `bounds` (an Electron rectangle)? Edges count as inside. */
function isPointInsideBounds(point, bounds) {
  if (!point || !bounds) return false;
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Should the oat's window ignore mouse events?
 *
 * - `hold` is the renderer asking to stay interactive for something that outlives
 *   the pointer being over the seed: an open command menu, a visible toast.
 * - `cursorInside` is the truth the renderer cannot see once it has gone
 *   click-through. It is what makes the state recoverable.
 * - `dragging` outranks both. A drag must never be interrupted by the window
 *   turning to glass halfway through it.
 *
 * Windows is excluded entirely: its click-through forwarding is unreliable for a
 * frameless always-on-top panel, so that platform keeps the panel interactive and
 * accepts the cost. That was already true before this file existed.
 */
function shouldIgnoreMouseEvents({ platform, hold, cursorInside, dragging }) {
  if (platform === "win32") return false;
  return !(hold || cursorInside || dragging);
}

module.exports = { isPointInsideBounds, shouldIgnoreMouseEvents };
