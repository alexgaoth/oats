import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect } from "./types";

export type Shot = { at: number; rect: Rect | "full"; ease?: number };

/**
 * Push-ins and pull-outs, in the app's own coordinates. Each shot names a
 * region of the window and when (seconds into the scene) the camera arrives on
 * it; between shots the camera eases. "full" is the whole window.
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
  const full: Rect = { x: 0, y: 0, w: viewport.width, h: viewport.height };
  const rectOf = (shot: Shot) => (shot.rect === "full" ? full : shot.rect);
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
    to === from ? 1 : interpolate(t, [to.at - travel, to.at], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.45, 0, 0.2, 1),
    });
  const a = rectOf(from);
  const b = rectOf(to);
  const mix = (p: number, q: number) => p + (q - p) * progress;
  const rect = { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) };
  // Fit the region in the window frame, keeping the aspect ratio, and keep
  // what is shown inside the window: a region near an edge slides inwards.
  const zoom = Math.max(1, Math.min(viewport.width / rect.w, viewport.height / rect.h));
  const halfW = viewport.width / zoom / 2;
  const halfH = viewport.height / zoom / 2;
  const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
  const cx = clamp(rect.x + rect.w / 2, halfW, viewport.width - halfW);
  const cy = clamp(rect.y + rect.h / 2, halfH, viewport.height - halfH);
  const k = width / viewport.width;
  const tx = (viewport.width / 2 - cx * zoom) * k;
  const ty = (viewport.height / 2 - cy * zoom) * k;
  return (
    <div style={{ width, height, overflow: "hidden", position: "relative" }}>
      <div style={{ width, height, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }}>
        {children}
      </div>
    </div>
  );
};
