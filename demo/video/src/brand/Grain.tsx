import React, { useLayoutEffect, useRef } from "react";
// The app's own toss and its own painter, so the film's grain is the app's:
// the same pose each frame, and the same dither of a few honey tones.
import { tossFrame } from "../../../../src/helpers/oatsMarkMotion.mjs";
import { GRAIN_PALETTE } from "../../../../src/helpers/grainDither.mjs";
import { paintGrain } from "../../../../src/components/shell/grainCanvas";

/**
 * Film pixels per dither dot. At one, a 220 px grain's dither was too fine to
 * see in a 1080p film; at two it reads as the app's grain does up close.
 */
const CELL = 2;

/**
 * The app's four honey tones, pushed apart: the two outer tones darker and
 * lighter, so the dither between neighbours shows at film size. Same hues.
 */
const STRONGER_TONES: [number, number, number][] = [
  [122, 49, 0],
  [178, 94, 0],
  [236, 154, 18],
  [255, 206, 104],
];
const STRONGER = new Map<string, [number, number, number]>(
  (GRAIN_PALETTE as readonly (readonly number[])[]).map((rgb, index) => [rgb.join(","), STRONGER_TONES[index]])
);

/**
 * The Oats symbol, painted for one frame of a toss. The app's mark
 * (`src/components/shell/OatsMark.tsx`) paints this grain into a canvas with
 * an ordered dither on device pixels. Here it is painted at one dot per `CELL`
 * film pixels and enlarged without smoothing, so each dot is a crisp
 * `CELL`×`CELL` square of the frame. Driven by a progress value instead of
 * requestAnimationFrame, because Remotion renders frame by frame.
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
  const dots = Math.max(8, Math.round(pixels / CELL));
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const small = document.createElement("canvas");
    small.width = dots;
    small.height = dots;
    // The painter reads every frame back to dither it.
    const paint = small.getContext("2d", { willReadFrequently: true });
    if (!paint) return;
    paintGrain(paint, dots, dots, tossFrame(progress), shadow);
    const image = paint.getImageData(0, 0, dots, dots);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const stronger = STRONGER.get(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      if (stronger) [data[i], data[i + 1], data[i + 2]] = stronger;
    }
    paint.putImageData(image, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixels, pixels);
    context.imageSmoothingEnabled = false;
    context.drawImage(small, 0, 0, pixels, pixels);
  }, [dots, pixels, progress, shadow]);
  return (
    <canvas
      ref={canvas}
      width={pixels}
      height={pixels}
      style={{ width: pixels, height: pixels, display: "block", imageRendering: "pixelated" }}
    />
  );
};
