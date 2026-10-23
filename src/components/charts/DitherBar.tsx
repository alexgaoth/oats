import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { ditherFill, observeCanvas, subscribeChartPalette, type ChartPalette } from "./chartStyle";

/** A bar's dither: half the cells, the checkerboard (DESIGN.md §6, rule 7). */
const BAR_DENSITY = 0.5;

/**
 * A bar filled with the chart dither of the quiet grey, as long and as tall as
 * its box, with round ends. Decorative: the number beside it is what is read.
 */
export default function DitherBar({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [palette, setPalette] = useState<ChartPalette | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return subscribeChartPalette(canvas, setPalette);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette) return;
    return observeCanvas(canvas, ({ ctx, width, height }) => {
      ditherFill(
        ctx,
        (c) => c.roundRect(0, 0, width, height, Math.min(height, width) / 2),
        palette.quiet,
        BAR_DENSITY
      );
    });
  }, [palette]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("block size-full", className)} />;
}
