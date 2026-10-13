import React from "react";
// The app's own toss, so the film's grain moves exactly as the app's does.
import { HOP, tossFrame, tumbleHeight } from "../../../../src/helpers/oatsMarkMotion.mjs";

/**
 * The Oats symbol, painted for one frame of a toss. The same honey grain as
 * `src/components/shell/OatsMark.tsx`, but driven by a progress value instead
 * of requestAnimationFrame, because Remotion renders frame by frame.
 */

const CX = 512;
const CY = 512;
const HALF_HEIGHT = 344;
const HALF_WIDTH = 240;
const OUTLINE =
  "M512 168 C584 168 752 326 752 512 C752 700 588 856 512 856 C436 856 272 700 272 512 C272 326 440 168 512 168 Z";
const TILT = -18;
const REST = 0.34;
const GROOVE_FROM = 252;
const GROOVE_TO = 772;

function groove(theta: number): { d: string; lip: string } {
  const across = Math.sin(theta);
  const facing = Math.cos(theta);
  const points: [number, number][] = [];
  for (let i = 0; i <= 16; i += 1) {
    const y = GROOVE_FROM + ((GROOVE_TO - GROOVE_FROM) * i) / 16;
    const t = (y - CY) / HALF_HEIGHT;
    const radius = HALF_WIDTH * Math.sqrt(Math.max(0, 1 - t * t));
    points.push([CX + radius * across, y]);
  }
  const path = (shift: number) =>
    points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x + shift).toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
  return { d: path(0), lip: path(-13 * Math.max(0, facing)) };
}

const REST_GROOVE = groove(REST);

function visibility(facing: number) {
  const x = Math.min(1, Math.max(0, facing / 0.35));
  return x * x * (3 - 2 * x);
}

export const Grain: React.FC<{
  /** 0..1 through the toss; 0 and 1 are at rest. */
  progress?: number;
  size: number;
  shadow?: boolean;
  id: string;
}> = ({ progress = 0, size, shadow = true, id }) => {
  const { phi, hop, squash, lean } = tossFrame(progress);
  const seen = visibility(Math.cos(phi));
  const sx = 1 + 0.06 * squash;
  const sy = 1 - 0.08 * squash;
  const lift = Math.min(1, hop / HOP);
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-body`} cx="0.36" cy="0.26" r="0.84" fx="0.33" fy="0.22">
          <stop offset="0" stopColor="#FCD27C" />
          <stop offset="0.36" stopColor="#F7B53A" />
          <stop offset="0.72" stopColor="#EC9810" />
          <stop offset="1" stopColor="#A9590A" />
        </radialGradient>
        <linearGradient id={`${id}-shade`} x1="0.15" y1="0.1" x2="0.95" y2="0.92">
          <stop offset="0.45" stopColor="#7A3A00" stopOpacity="0" />
          <stop offset="1" stopColor="#7A3A00" stopOpacity="0.34" />
        </linearGradient>
        <radialGradient id={`${id}-spec`}>
          <stop offset="0" stopColor="#FFF4DC" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFF4DC" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-ground`}>
          <stop offset="0" stopColor="#3A1C00" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3A1C00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-bounce`} x1="0" y1="1" x2="0.75" y2="0.25">
          <stop offset="0" stopColor="#FFE9B8" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#FFE9B8" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id={`${id}-clip`}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      {shadow && (
        <ellipse
          cx="512"
          cy="920"
          rx="236"
          ry="36"
          fill={`url(#${id}-ground)`}
          opacity={1 - 0.55 * lift}
          transform={`translate(512 920) scale(${1 - 0.35 * lift}) translate(-512 -920)`}
        />
      )}
      <g
        transform={`translate(0 ${-hop}) translate(512 880) scale(${sx} ${sy}) translate(-512 -880)`}
      >
        <g transform={`rotate(${TILT + lean} ${CX} ${CY})`}>
          <g
            transform={`translate(${CX} ${CY}) scale(1 ${tumbleHeight(phi)}) translate(${-CX} ${-CY})`}
          >
            <path d={OUTLINE} fill={`url(#${id}-body)`} />
            <path d={OUTLINE} fill={`url(#${id}-shade)`} />
            <g clipPath={`url(#${id}-clip)`}>
              <path d={OUTLINE} fill="none" stroke={`url(#${id}-bounce)`} strokeWidth="44" />
              <g filter={`url(#${id}-soft)`}>
                <path
                  d={REST_GROOVE.d}
                  fill="none"
                  stroke="#9A4F05"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={30}
                  opacity={0.55 * seen}
                />
                <path
                  d={REST_GROOVE.lip}
                  fill="none"
                  stroke="#FFE2A0"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={10}
                  opacity={0.55 * seen}
                />
              </g>
              <ellipse
                cx="420"
                cy="324"
                rx="56"
                ry="92"
                transform="rotate(-22 420 324)"
                fill={`url(#${id}-spec)`}
              />
              <circle cx="402" cy="290" r="11" fill="#FFF6E2" opacity="0.38" />
              <path d={OUTLINE} fill="none" stroke="#7A3A00" strokeOpacity="0.28" strokeWidth="12" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
};
