import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../brand/theme";
import { BAND_HEIGHT, WINDOW_LEFT } from "./layout";

const CHIP_HEIGHT = 52;

/**
 * "▸▸ 56×" while time runs fast, so a time-lapse never reads as real time. It
 * sits in the caption band, lined up with the window's right edge, never on
 * the app.
 */
export const SpeedChip: React.FC<{ label: string; from?: number; to?: number }> = ({ label, from = 0.2, to }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const end = to ?? durationInFrames / fps - 0.3;
  const opacity = interpolate(t, [from, from + 0.3, end - 0.3, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: (BAND_HEIGHT - CHIP_HEIGHT) / 2,
        right: WINDOW_LEFT,
        height: CHIP_HEIGHT,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 18px",
        borderRadius: 999,
        background: theme.ink,
        color: "#fafaf9",
        fontFamily: theme.font,
        fontSize: 28,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        opacity,
      }}
    >
      <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
        <path d="M2 2 L11 9 L2 16 Z M14 2 L23 9 L14 16 Z" fill={theme.honey} />
      </svg>
      {label}
    </div>
  );
};
