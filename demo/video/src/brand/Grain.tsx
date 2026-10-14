import React, { useLayoutEffect, useRef } from "react";
// The app's own toss and its own painter, so the film's grain is the app's:
// the same pose each frame, and the same dither of a few honey tones.
import { tossFrame } from "../../../../src/helpers/oatsMarkMotion.mjs";
import { paintGrain } from "../../../../src/components/shell/grainCanvas";

/**
 * The Oats symbol, painted for one frame of a toss. The app's mark
 * (`src/components/shell/OatsMark.tsx`) paints the same grain into a canvas
 * with an ordered dither on device pixels; here a canvas pixel is one pixel of
 * the film, so each dither dot is one pixel of the frame. Driven by a progress
 * value instead of requestAnimationFrame, because Remotion renders frame by
 * frame.
 */
export const Grain: React.FC<{
  /** 0..1 through the toss; 0 and 1 are at rest. */
  progress?: number;
  size: number;
  shadow?: boolean;
  /** Kept for the callers; a canvas needs no ids. */
  id?: string;
}> = ({ progress = 0, size, shadow = true }) => {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const pixels = Math.round(size);
  useLayoutEffect(() => {
    const element = canvas.current;
    // The painter reads every frame back to dither it.
    const context = element?.getContext("2d", { willReadFrequently: true });
    if (context) paintGrain(context, pixels, pixels, tossFrame(progress), shadow);
  }, [pixels, progress, shadow]);
  return (
    <canvas
      ref={canvas}
      width={pixels}
      height={pixels}
      style={{ width: pixels, height: pixels, display: "block", imageRendering: "pixelated" }}
    />
  );
};
