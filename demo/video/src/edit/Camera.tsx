import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect } from "./types";

/**
 * Where the camera is when it arrives (`at`, seconds into the scene): a zoom
 * and the app point (CSS px) it centres on, or "full" for the whole window.
 * `ease` is how long the move to it takes.
 */
export type Shot = { at: number; ease?: number } & (
  | { full: true }
  | { zoom: number; focus: { x: number; y: number } }
  // A region fitted to the window; kept for the README stills.
  | { rect: Rect | "full" }
);

type View = { zoom: number; cx: number; cy: number };

/**
 * Push-ins and pull-outs, in the app's own coordinates.
 *
 * The camera holds still between moves and never drifts: a slow continuous
 * zoom resamples the picture every frame, and the app's dithered fills and the
 * edges of its words shimmered under it. Held, a shot is the same pixels frame
 * after frame. Zooms of 1 and 2 put the app's pixels on the film's exactly
 * (the window is 1440 film px wide for a 1440 CSS px app captured at 2x), and
 * a held shot's offset is rounded to whole pixels for the same reason.
 */
export const Camera: React.FC<{
  shots: Shot[];
  /** The window's size inside the frame, in frame pixels. */
  width: number;
  height: number;
  viewport: { width: number; height: number };
  children: React.ReactNode;
}> = ({ shots, width, height, viewport, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

  const viewOf = (shot: Shot): View => {
    if ("zoom" in shot) {
      const zoom = Math.max(1, shot.zoom);
      return { zoom, cx: shot.focus.x, cy: shot.focus.y };
    }
    if ("rect" in shot && shot.rect !== "full") {
      const rect = shot.rect;
      const zoom = Math.max(1, Math.min(viewport.width / rect.w, viewport.height / rect.h));
      return { zoom, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
    }
    return { zoom: 1, cx: viewport.width / 2, cy: viewport.height / 2 };
  };

  let from = shots[0];
  let to = shots[0];
  for (const shot of shots) {
    if (shot.at <= t) from = shot;
    if (shot.at > t) {
      to = shot;
      break;
    }
    to = shot;
  }
  const travel = to.ease ?? 0.9;
  const progress =
    to === from
      ? 1
      : interpolate(t, [to.at - travel, to.at], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.45, 0, 0.2, 1),
        });
  const a = viewOf(from);
  const b = viewOf(to);
  // Zoom moves evenly in scale (log space), so a push-in does not lurch at the end.
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * progress);
  const mix = (p: number, q: number) => p + (q - p) * progress;
  // What is shown stays inside the window: a focus near an edge slides inwards.
  const halfW = viewport.width / zoom / 2;
  const halfH = viewport.height / zoom / 2;
  const cx = clamp(mix(a.cx, b.cx), halfW, viewport.width - halfW);
  const cy = clamp(mix(a.cy, b.cy), halfH, viewport.height - halfH);
  const k = width / viewport.width;
  const settled = progress === 0 || progress === 1;
  const snap = (value: number) => (settled ? Math.round(value) : value);
  const tx = snap((viewport.width / 2 - cx * zoom) * k);
  const ty = snap((viewport.height / 2 - cy * zoom) * k);
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative" }}>
      <div style={{ width, height, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }}>
        {children}
      </div>
    </div>
  );
};
