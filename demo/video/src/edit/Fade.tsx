import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/** A scene that dissolves in and out over a few frames: the film's only transition. */
export const Fade: React.FC<{ inFrames?: number; outFrames?: number; children: React.ReactNode }> = ({
  inFrames = 10,
  outFrames = 10,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = Math.min(
    inFrames ? interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" }) : 1,
    outFrames
      ? interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], { extrapolateLeft: "clamp" })
      : 1
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
