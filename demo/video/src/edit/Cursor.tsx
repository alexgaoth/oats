import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Capture } from "./types";

/**
 * The pointer, drawn from the director's log: a macOS arrow that follows the
 * logged path, and a honey ring that opens on each click. Positions are in the
 * app's CSS pixels; `scale` maps them into the window as drawn.
 */
export const Cursor: React.FC<{
  capture: Capture;
  scale: number;
  /** Where in the clip this scene starts, in ms (the clip may be trimmed). */
  offsetMs?: number;
  /** Clip time runs this many times faster than scene time (a time-lapse). */
  rate?: number;
}> = ({ capture, scale, offsetMs = 0, rate = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = offsetMs + (frame / fps) * 1000 * rate;
  const points = capture.cursor;
  if (!points.length) return null;
  let i = 0;
  while (i + 1 < points.length && points[i + 1].t <= now) i += 1;
  const a = points[i];
  const b = points[Math.min(i + 1, points.length - 1)];
  const span = Math.max(1, b.t - a.t);
  const p = b === a || now <= a.t ? 0 : Math.min(1, (now - a.t) / span);
  const x = (a.x + (b.x - a.x) * p) * scale;
  const y = (a.y + (b.y - a.y) * p) * scale;
  const clicks = points.filter((point) => point.kind === "down" && point.t <= now && now - point.t < 600);
  const pressed = points.some((point) => point.kind === "down" && point.t <= now && now - point.t < 90);
  const size = 22 * scale;
  return (
    <>
      {clicks.map((click) => {
        const age = (now - click.t) / 600;
        const r = (10 + 26 * Math.sqrt(age)) * scale;
        return (
          <div
            key={click.t}
            style={{
              position: "absolute",
              left: click.x * scale - r,
              top: click.y * scale - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `${2.5 * scale}px solid rgba(245,163,15,${0.85 * (1 - age)})`,
              background: `rgba(245,163,15,${0.16 * (1 - age)})`,
            }}
          />
        );
      })}
      <svg
        width={size}
        height={size}
        viewBox="0 0 22 22"
        style={{
          position: "absolute",
          left: x - 3 * scale,
          top: y - 2 * scale,
          transform: `scale(${pressed ? 0.88 : 1})`,
          transformOrigin: "3px 2px",
          filter: `drop-shadow(0 ${1.5 * scale}px ${2.5 * scale}px rgba(0,0,0,0.3))`,
        }}
      >
        <path d="M3 2 L3 17.5 L7.2 13.6 L10 19.8 L12.8 18.6 L10.1 12.6 L15.8 12.6 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </>
  );
};
