import { useEffect, useState } from "react";

// The drawing rules the board's charts share, until the shared chart style
// module (`components/charts/chartStyle.ts`) is on main:
//
// 1. Data lines are 1.5 px and rules are 1 px. No dashes.
// 2. Three greys: ink, quiet, rule. No other opacities.
// 3. Honey marks only hovered, selected and now.
// 5. One dot: radius 4 with a 2 px ring in the card colour.
// 6. Nothing crosses a word: labels sit on plates in the card colour, and are
//    never cut at a card's edge.
// 7. Masses use an ordered dither on device pixels.

export const DATA_LINE = 1.5;
export const RULE_LINE = 1;
export const DOT_RADIUS = 4;
export const DOT_RING = 2;
export const LABEL_SIZE = 12;
export const PLATE_PAD = 4;

export interface ChartPalette {
  ink: string;
  quiet: string;
  rule: string;
  card: string;
  honey: string;
  font: string;
}

const FONT_FALLBACK = '"Inter Variable", ui-sans-serif, system-ui, sans-serif';

function readPalette(element: Element): ChartPalette {
  const styles = getComputedStyle(element);
  const value = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: value("--color-foreground", "#09090b"),
    quiet: value("--color-muted-foreground", "#71717a"),
    rule: value("--color-border", "#e4e4e7"),
    card: value("--color-card", "#ffffff"),
    honey: value("--color-primary", "#f5a30f"),
    font: value("--font-family-sans", FONT_FALLBACK),
  };
}

// One theme observer for every chart on the board, read once per theme change
// and never inside a draw (CLAUDE.md, the contour's rule 4).
const subscribers = new Set<(palette: ChartPalette) => void>();
let shared: ChartPalette | null = null;
let observer: MutationObserver | null = null;

export function subscribeChartPalette(notify: (palette: ChartPalette) => void): () => void {
  if (!shared) shared = readPalette(document.documentElement);
  notify(shared);
  subscribers.add(notify);
  if (!observer) {
    observer = new MutationObserver(() => {
      shared = readPalette(document.documentElement);
      for (const subscriber of subscribers) subscriber(shared);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
  }
  return () => {
    subscribers.delete(notify);
    if (!subscribers.size) {
      observer?.disconnect();
      observer = null;
      shared = null;
    }
  };
}

export function useChartPalette(): ChartPalette | null {
  const [palette, setPalette] = useState<ChartPalette | null>(null);
  useEffect(() => subscribeChartPalette(setPalette), []);
  return palette;
}

/** The pixel ratio a chart draws at: clamped to 2, as every canvas here is. */
export function chartRatio(): number {
  return Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
}

/**
 * Size a canvas's backing store for `width` by `height` CSS pixels. Assigning
 * the size clears and reallocates it, so it happens only when it changed.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  ratio = chartRatio()
): CanvasRenderingContext2D | null {
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return ctx;
}

/** An offscreen layer the size of `canvas`, for caching what does not change on hover. */
export function makeLayer(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  return layer;
}

// The 4x4 Bayer matrix, row by row: the field's (`field/shaders.ts`).
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Whether the dither puts ink on the device pixel at (x, y) for `density`. */
export function ditherOn(x: number, y: number, density: number): boolean {
  return (BAYER_4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < density;
}

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();

/**
 * A fill that dithers `color` at `density` (0 to 1) on device pixels. The tile
 * is four device pixels square and the pattern is scaled back by the context's
 * ratio, so every dot is one device pixel at every zoom and the pattern lines
 * up across shapes: two masses side by side read as one surface.
 */
export function ditherFill(
  ctx: CanvasRenderingContext2D,
  color: string,
  density: number,
  ratio = chartRatio()
): CanvasPattern | string {
  let cache = patterns.get(ctx);
  if (!cache) {
    cache = new Map();
    patterns.set(ctx, cache);
  }
  const key = `${color}|${density.toFixed(3)}|${ratio}`;
  if (!cache.has(key)) {
    const tile = document.createElement("canvas");
    tile.width = 4;
    tile.height = 4;
    const tileCtx = tile.getContext("2d");
    if (tileCtx) {
      tileCtx.fillStyle = color;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          if (ditherOn(x, y, density)) tileCtx.fillRect(x, y, 1, 1);
        }
      }
    }
    const pattern = ctx.createPattern(tile, "repeat");
    pattern?.setTransform(new DOMMatrix([1 / ratio, 0, 0, 1 / ratio, 0, 0]));
    cache.set(key, pattern);
  }
  return cache.get(key) ?? color;
}

export interface PlateBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function boxesOverlap(a: PlateBox, b: PlateBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Cut a label to fit, ending in an ellipsis: never squeezed by `maxWidth`. */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

export function labelFont(palette: ChartPalette, weight = 400, size = LABEL_SIZE): string {
  return `${weight} ${size}px ${palette.font}`;
}

/** The box a plate for `width` of text centred on (x, y) takes. */
export function plateBox(x: number, y: number, width: number, size = LABEL_SIZE): PlateBox {
  return {
    left: x - width / 2 - PLATE_PAD,
    right: x + width / 2 + PLATE_PAD,
    top: y - size / 2 - 3,
    bottom: y + size / 2 + 3,
  };
}

/** A label centred on (x, y), on a plate in the card colour. */
export function drawPlateLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  palette: ChartPalette,
  size = LABEL_SIZE
): void {
  ctx.font = labelFont(palette, 400, size);
  const width = ctx.measureText(text).width;
  const box = plateBox(x, y, width, size);
  ctx.fillStyle = palette.card;
  ctx.beginPath();
  ctx.roundRect(box.left, box.top, box.right - box.left, box.bottom - box.top, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
}

/** The one dot: radius 4, a 2 px ring in the card colour, filled by what it means. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  palette: ChartPalette
): void {
  ctx.beginPath();
  ctx.arc(x, y, DOT_RADIUS + DOT_RING, 0, Math.PI * 2);
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
