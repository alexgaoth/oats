// When the field draws (DESIGN.md §9.8). The render loop's decisions, kept pure
// and DOM-free so they can be pinned (test/helpers/fieldLoop.test.js); FieldGL
// and FieldCanvas both run on them.
//
// Measured on an M5 Pro while recording, before this existed: the GPU renderer
// drew a frame on every vsync, 120 a second on a ProMotion display, and went on
// drawing them with the window minimized, closed to the tray or covered. The
// field alone was about 22% of a core in the GPU process and 14% in the
// renderer, spent on wheat whose tips move less than half a pixel between two
// frames at 30 fps.

/**
 * Frames per second while the wind blows.
 *
 * The motion is slow. At 1200x800, 99% of blade-tip movement is under 13 px a
 * second, the chaff drifts at most 31 px a second and the birds 29 — under half
 * a pixel per frame for the wheat at 30 fps, and about one for a mote. A higher
 * rate buys nothing anyone can see. 30 also divides 60 and 120 Hz evenly, so
 * every frame is held for the same number of vsyncs.
 */
export const FIELD_FPS = 30;

export const FRAME_INTERVAL_MS = 1000 / FIELD_FPS;

/**
 * How early a vsync may arrive and still count as on time. Frames land only on
 * vsyncs, and 33.3ms is four 120 Hz vsyncs give or take float error; without
 * slack the fourth can measure as early and the frame slips to the fifth.
 */
export const FRAME_SLACK_MS = 4;

/** Whether a vsync at `now` may draw, when the last frame was drawn at `lastDrawAt`. */
export function frameDue(now: number, lastDrawAt: number): boolean {
  return now - lastDrawAt >= FRAME_INTERVAL_MS - FRAME_SLACK_MS;
}

/**
 * How long to sleep before asking for the vsync the next frame lands on.
 *
 * The loop sleeps on a timer and only then asks for a frame. A
 * requestAnimationFrame loop that skips three vsyncs in four still wakes the
 * page and the compositor on all four: measured, an empty 120 Hz loop on its own
 * cost 5 points of a core in the renderer.
 */
export function frameDelay(now: number, lastDrawAt: number): number {
  return Math.max(0, lastDrawAt + FRAME_INTERVAL_MS - FRAME_SLACK_MS - now);
}

/**
 * Above this median interval between frames, the device is not keeping up and
 * the GPU renderer thins its blades. Relative to the cap: judged by the old
 * 60 fps budget (20.5ms), every capped frame counts as a slow one, and the field
 * would thin itself twice in its first ten seconds of wind.
 */
export const FRAME_BUDGET_MS = FRAME_INTERVAL_MS * 1.5;

/**
 * What the loop does.
 *
 *   still  — one frame, then nothing: a reading surface, no conversation, or
 *            prefers-reduced-motion. Drawn whether or not anybody can see it,
 *            so the canvas is right the moment somebody can. One frame per
 *            change costs nothing.
 *   moving — the wind, at FIELD_FPS.
 *   easing — no wind, but the picture is moving to another screen's
 *            composition (MOVE_MS): a frame per vsync for that long, then
 *            still again. Only while somebody can see it; otherwise the move
 *            is skipped and the new picture drawn once.
 *   paused — the wind, with nobody to see it: the window is minimized, closed
 *            to the tray or covered, or the backdrop is off screen. No frames
 *            and no timers until that changes.
 */
export type FieldLoopState = "still" | "moving" | "easing" | "paused";

export function fieldLoopState({
  animate,
  reduced,
  visible,
  easing = false,
}: {
  animate: boolean;
  reduced: boolean;
  visible: boolean;
  /** A move between compositions is under way. */
  easing?: boolean;
}): FieldLoopState {
  if (reduced) return "still";
  if (animate) return visible ? "moving" : "paused";
  return easing && visible ? "easing" : "still";
}

/**
 * How long the field takes to move from one screen's picture to the next: the
 * frame's own time (`--motion-frame`), so the horizon settles as the sidebar
 * and the panes do. Under prefers-reduced-motion there is no move at all.
 */
export const MOVE_MS = 280;

export interface FieldClock {
  /** Stop the clock at `now`. Stopping a stopped clock does nothing. */
  pause(now: number): void;
  /** Start it again at `now`. The time it was stopped is not animation time. */
  resume(now: number): void;
  /** Animation time at `now`, in ms. */
  elapsed(now: number): number;
  readonly paused: boolean;
}

/**
 * The field's clock: time since it started, less the time it spent paused.
 *
 * On the wall clock, a field coming back from a minute in the tray jumps a
 * minute of wind in one frame — every gust somewhere else, every bird across
 * the sky. A clock that stops while nobody is looking resumes the picture
 * exactly where it was left. With no pause it is the wall clock, so a field
 * that is never hidden moves exactly as it did before.
 */
export function createFieldClock(startedAt: number): FieldClock {
  let pausedAt: number | null = null;
  let pausedFor = 0;
  return {
    pause(now) {
      if (pausedAt === null) pausedAt = now;
    },
    resume(now) {
      if (pausedAt === null) return;
      pausedFor += Math.max(0, now - pausedAt);
      pausedAt = null;
    },
    elapsed(now) {
      return Math.max(0, (pausedAt ?? now) - startedAt - pausedFor);
    },
    get paused() {
      return pausedAt !== null;
    },
  };
}

/**
 * Ease `current` toward `target` at the same speed at any frame rate.
 *
 * `perFrame` is the fraction of the gap closed per 60 Hz frame, which is what
 * the renderers applied once per frame before the cap: as a per-frame step the
 * pointer's parting eased half as fast at 30 fps as at 60, and twice as fast on
 * a 120 Hz display.
 */
export function easeToward(
  current: number,
  target: number,
  dtMs: number,
  perFrame: number
): number {
  const frames = Math.max(0, dtMs) / (1000 / 60);
  const k = 1 - Math.pow(1 - perFrame, frames);
  return current + (target - current) * k;
}
