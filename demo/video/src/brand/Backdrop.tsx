import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "./theme";

/**
 * The stage behind the app window: honey light falling across warm paper, with
 * the sidebar's faded oat grains as texture (the same tile as SidebarGrain.tsx,
 * larger). Still: the backdrop never moves.
 */
const TILE = 150;
const GRAINS = (() => {
  let seed = 7;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cell = TILE / 3;
  return Array.from({ length: 9 }, (_, index) => ({
    x: (index % 3) * cell + cell / 2 + (next() - 0.5) * cell * 0.6,
    y: Math.floor(index / 3) * cell + cell / 2 + (next() - 0.5) * cell * 0.6,
    angle: Math.round(next() * 360),
    scale: 0.8 + next() * 0.5,
  }));
})();

export const Backdrop: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(120% 90% at 18% 10%, #3a2508 0%, ${theme.night} 62%)`
        : `radial-gradient(120% 90% at 18% 8%, #ffe2a6 0%, ${theme.honeyWash} 38%, ${theme.paper} 78%)`,
    }}
  >
    {/* Faint, and faded out of the middle where the window sits: texture for the
        edges of the frame, never a pattern behind the app. */}
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        opacity: dark ? 0.06 : 0.045,
        maskImage: "radial-gradient(ellipse 70% 62% at 50% 50%, transparent 55%, black 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 62% at 50% 50%, transparent 55%, black 100%)",
      }}
    >
      <defs>
        <pattern id="film-grain" width={TILE * 2} height={TILE * 2} patternUnits="userSpaceOnUse">
          {GRAINS.map((grain, index) => (
            <ellipse
              key={index}
              rx="8.8"
              ry="15.6"
              fill={dark ? "#f5b544" : "#6b4210"}
              transform={`translate(${(grain.x * 2).toFixed(1)} ${(grain.y * 2).toFixed(1)}) rotate(${grain.angle}) scale(${grain.scale.toFixed(2)})`}
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#film-grain)" />
    </svg>
    {children}
  </AbsoluteFill>
);
