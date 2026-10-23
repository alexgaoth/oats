import { BAYER_4X4, DITHER_TILE, ditherLayers, ditherStep } from "../../helpers/chartDither.mjs";
import { monotoneTangents } from "../../helpers/chartCurve.mjs";
import { TONE_TOKEN, type MarkKind } from "../conversation/questionMarks.ts";

// The chart style (DESIGN.md §6): one drawing module for every chart in Oats.
//
// Every chart draws its lines, dots, labels and fills through this file, so the
// seven rules hold by construction rather than by care:
//
//   1. Two line weights. Data lines are 1.5 px with round caps and joins; rules
//      (baselines, row dividers, ticks) are 1 px. No dashes.
//   2. Three greys. Ink for words and emphasis, quiet for data, rule for rules.
//      No other opacities, except the fill.
//   3. One accent. Honey marks only "now" and "selected or hovered".
//   4. Status colours only for question verdicts (`questionMarks.ts`).
//   5. One dot: radius 4, with a 2 px ring in the card colour.
//   6. Nothing crosses a word: labels sit in a column, or on a plate.
//   7. An area is the field's 4×4 dither of the quiet grey, locked to device
//      pixels; under 24 px tall it is a 12% wash instead.
//
// Nothing here reads the DOM while drawing. The palette is read on mount and on
// a theme change (`subscribeChartPalette`), never per frame.

/** Line weights and dot sizes, in CSS px. */
export const CHART = { line: 1.5, rule: 1, dot: 4, ring: 2, focusDot: 5 } as const;

/** Below this height (CSS px) an area takes the wash: the dither needs room. */
export const DITHER_MIN_HEIGHT = 24;

/** The wash: the quiet grey at 12%. The only fill that is an opacity. */
export const CHART_WASH = 0.12;

/** The hedged dot's soft fill, as the rail's mark draws it (`bg-warning/35`). */
const SOFT_FILL = 0.35;

/** The most a backing store is scaled. A 3x screen draws at 2x, scaled up. */
export const MAX_CHART_RATIO = 2;

const TAU = Math.PI * 2;

export type ChartPalette = {
  /** `--color-foreground`: words and emphasis. */
  ink: string;
  /** `--color-muted-foreground`: data lines, marks and fills. */
  quiet: string;
  /** `--color-border`: baselines, dividers and ticks. */
  rule: string;
  /** `--color-card`: the surface, the dot's ring and the label plate. */
  card: string;
  background: string;
  /** `--color-primary`: now, and selected or hovered. */
  honey: string;
  success: string;
  warning: string;
  /** The sans stack, for canvas text: canvas does not inherit CSS. */
  sans: string;
};

const SANS_FALLBACK = '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif';

function readChartPalette(element: Element): ChartPalette {
  const styles = getComputedStyle(element);
  const value = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: value("--color-foreground", "#09090b"),
    quiet: value("--color-muted-foreground", "#71717a"),
    rule: value("--color-border", "#e4e4e7"),
    card: value("--color-card", "#ffffff"),
    background: value("--color-background", "#ffffff"),
    honey: value("--color-primary", "#f5a30f"),
    success: value(TONE_TOKEN.success, "#16a34a"),
    warning: value(TONE_TOKEN.warning, "#c2410c"),
    sans: value("--font-family-sans", SANS_FALLBACK),
  };
}

const samePalette = (a: ChartPalette, b: ChartPalette) =>
  (Object.keys(a) as (keyof ChartPalette)[]).every((key) => a[key] === b[key]);

/**
 * One theme observer for every chart in the app, not one per chart.
 *
 * Each contour used to install its own `MutationObserver` and read
 * `getComputedStyle` itself. With a hundred conversations listed, one dark-mode
 * toggle then forced a hundred style recalculations, measured at ~100–170ms.
 * The palette belongs to the document, so it is read once and published, and
 * a class change that leaves every colour as it was redraws nothing.
 */
const paletteSubscribers = new Set<(palette: ChartPalette) => void>();
let sharedPalette: ChartPalette | null = null;
let themeObserver: MutationObserver | null = null;

export function subscribeChartPalette(
  element: Element,
  notify: (palette: ChartPalette) => void
): () => void {
  if (!sharedPalette) sharedPalette = readChartPalette(element);
  notify(sharedPalette);
  paletteSubscribers.add(notify);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      const next = readChartPalette(document.documentElement);
      if (sharedPalette && samePalette(sharedPalette, next)) return;
      sharedPalette = next;
      for (const subscriber of paletteSubscribers) subscriber(next);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
  }
  return () => {
    paletteSubscribers.delete(notify);
    if (paletteSubscribers.size === 0) {
      themeObserver?.disconnect();
      themeObserver = null;
      // Dropped so the next mount reads again rather than trusting a palette
      // from before a theme change nobody was subscribed to see.
      sharedPalette = null;
    }
  };
}

export interface ChartFrame {
  ctx: CanvasRenderingContext2D;
  /** The canvas box, in CSS px. Draw in CSS px: the context is scaled. */
  width: number;
  height: number;
  /** Device pixels per CSS px in the backing store. */
  ratio: number;
}

/**
 * Sizes a canvas's backing store to the exact device pixels its box covers and
 * calls `draw` with a context in CSS px, now and on every resize.
 *
 * Exact because the dither is one device pixel per cell: a backing store one
 * pixel off the box is resampled by the browser and the grain goes soft. For
 * the same reason a 1:1 store is shown with `image-rendering: pixelated`: a
 * canvas that sits a fraction of a pixel off, or glides (the live contour), is
 * then moved in whole pixels instead of blurred. The device-pixel box also
 * changes when the window moves to another screen or the zoom changes, so those
 * redraw too. Over 2x the store is capped at 2x and scaled up smoothly, so a
 * large screen is not 9x the work.
 *
 * `ResizeObserver.observe` reports the first size straight away, so there is no
 * separate first draw: calling both drew every canvas twice.
 */
export function observeCanvas(
  canvas: HTMLCanvasElement,
  draw: (frame: ChartFrame) => void
): () => void {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    const box = entry.contentBoxSize?.[0];
    const width = box ? box.inlineSize : entry.contentRect.width;
    const height = box ? box.blockSize : entry.contentRect.height;
    if (!width || !height) return;
    const native = window.devicePixelRatio || 1;
    const ratio = Math.min(native, MAX_CHART_RATIO);
    // The device box is the screen's own count, so it is trusted only within a
    // pixel of the CSS box at this ratio: emulated ratios (headless Chrome's
    // device metrics) report it in CSS pixels.
    const device = ratio === native ? entry.devicePixelContentBoxSize?.[0] : undefined;
    const exact =
      device &&
      Math.abs(device.inlineSize - width * ratio) < 2 &&
      Math.abs(device.blockSize - height * ratio) < 2;
    const pixelWidth = exact ? device.inlineSize : Math.round(width * ratio);
    const pixelHeight = exact ? device.blockSize : Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const sampling = ratio === native ? "pixelated" : "auto";
    if (canvas.style.imageRendering !== sampling) canvas.style.imageRendering = sampling;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw({ ctx, width, height, ratio });
  });
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}

/**
 * What a dot means. The four verdicts come from `markKind` in
 * `questionMarks.ts`; `plain` is a data point with no verdict (quiet), and `now`
 * and `selected` are the accent (honey).
 */
export type DotKind = MarkKind | "plain" | "now" | "selected";

/**
 * The one dot (rule 5): radius 4 by default, filled by what it means, with a
 * 2 px ring in the card colour that clears the line or the dot under it.
 * `focus` makes that ring honey, for the dot the reader is on (radius
 * `CHART.focusDot` is the caller's to pass).
 */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: DotKind,
  palette: ChartPalette,
  radius: number = CHART.dot,
  { focus = false }: { focus?: boolean } = {}
) {
  ctx.beginPath();
  ctx.arc(x, y, radius + CHART.ring, 0, TAU);
  ctx.fillStyle = focus ? palette.honey : palette.card;
  ctx.fill();
  if (focus) {
    // A ring-only dot keeps the surface inside it, not the honey.
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = palette.card;
    ctx.fill();
  }

  const solid =
    kind === "answered"
      ? palette.success
      : kind === "unknown"
        ? palette.warning
        : kind === "plain"
          ? palette.quiet
          : kind === "now" || kind === "selected"
            ? palette.honey
            : null;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  if (solid) {
    ctx.fillStyle = solid;
    ctx.fill();
    return;
  }
  // Hedged: a soft warning fill inside a warning ring. Open: a quiet ring.
  const tone = kind === "hedged" ? palette.warning : palette.quiet;
  if (kind === "hedged") {
    ctx.save();
    ctx.globalAlpha = SOFT_FILL;
    ctx.fillStyle = tone;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(x, y, radius - CHART.line / 2, 0, TAU);
  ctx.lineWidth = CHART.line;
  ctx.strokeStyle = tone;
  ctx.stroke();
}

/** A label's plate, in CSS px. */
export interface PlateBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The plate's padding beside the text, and above and below it. */
const PLATE_PAD_X = 4;
const PLATE_PAD_Y = 3;

/** `text`, cut to `maxWidth` with an ellipsis, in the context's current font. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * A label on a plate in the card colour (rule 6), so no line or dot runs
 * through its letters. `y` is the text's middle. Returns the plate, so a caller
 * can keep the next label off it.
 */
export function drawPlateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  palette: ChartPalette,
  {
    align = "left",
    weight = 400,
    size = 12,
    color = palette.ink,
    maxWidth,
  }: {
    align?: "left" | "center" | "right";
    weight?: number;
    size?: number;
    color?: string;
    /** Cut the text with an ellipsis past this width (CSS px). */
    maxWidth?: number;
  } = {}
): PlateBox {
  ctx.save();
  ctx.font = `${weight} ${size}px ${palette.sans}`;
  const shown = maxWidth === undefined ? text : fitText(ctx, text, maxWidth);
  const width = ctx.measureText(shown).width;
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  const box = {
    left: left - PLATE_PAD_X,
    top: y - size / 2 - PLATE_PAD_Y,
    right: left + width + PLATE_PAD_X,
    bottom: y + size / 2 + PLATE_PAD_Y,
  };
  ctx.beginPath();
  ctx.roundRect(box.left, box.top, box.right - box.left, box.bottom - box.top, 4);
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(shown, left, y);
  ctx.restore();
  return box;
}

/**
 * Adds a monotone cubic through `points` (CSS px, sorted by x) to the current
 * path, from the first point, which the caller has moved or lined to. Every
 * rise and fall is kept and nothing overshoots (`helpers/chartCurve.mjs`), and
 * `monotoneAt` with the same tangents is this curve's y at any x.
 */
export function traceMonotone(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  tangents: number[] = monotoneTangents(points)
) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const third = (b.x - a.x) / 3;
    ctx.bezierCurveTo(
      a.x + third,
      a.y + tangents[index] * third,
      b.x - third,
      b.y - tangents[index + 1] * third,
      b.x,
      b.y
    );
  }
}

/** A dither's density: one number, or one per point (CSS px). */
export type ChartDensity = number | ((x: number, y: number) => number);

export interface DitherOptions {
  /**
   * A point (CSS px) the pattern is pinned to. By default the pattern starts at
   * the canvas's own first pixel; a chart that rolls (the live contour) pins it
   * to a moment instead, so the grain travels with the line.
   */
  origin?: { x: number; y: number };
}

/**
 * The 4×4 tiles, per (step, colour). A tile is in device pixels whatever the
 * screen's ratio, because every fill paints it with the identity transform, so
 * it needs no ratio in its key. The patterns made from them belong to one
 * context each.
 */
const tiles = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

function ditherTile(step: number, color: string) {
  const key = `${step}|${color}`;
  let tile = tiles.get(key);
  if (!tile) {
    tile =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(DITHER_TILE, DITHER_TILE)
        : Object.assign(document.createElement("canvas"), {
            width: DITHER_TILE,
            height: DITHER_TILE,
          });
    const paint = tile.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (paint) {
      paint.fillStyle = color;
      BAYER_4X4.forEach((rank, index) => {
        if (rank < step) paint.fillRect(index % DITHER_TILE, Math.floor(index / DITHER_TILE), 1, 1);
      });
    }
    // Two themes and a few colours each: a bound, not an expectation.
    if (tiles.size >= 256) tiles.clear();
    tiles.set(key, tile);
  }
  return tile;
}

function ditherPattern(ctx: CanvasRenderingContext2D, step: number, color: string) {
  let own = patterns.get(ctx);
  if (!own) {
    own = new Map();
    patterns.set(ctx, own);
  }
  const key = `${step}|${color}`;
  let pattern = own.get(key);
  if (!pattern) {
    pattern = ctx.createPattern(ditherTile(step, color), "repeat") ?? undefined;
    if (!pattern) return null;
    if (own.size >= 256) own.clear();
    own.set(key, pattern);
  }
  return pattern;
}

/** Where the pattern starts, in device pixels, 0..3 on each axis. */
function patternPhase(ctx: CanvasRenderingContext2D, origin?: { x: number; y: number }) {
  if (!origin) return { x: 0, y: 0 };
  const m = ctx.getTransform();
  const wrap = (value: number) => ((Math.round(value) % DITHER_TILE) + DITHER_TILE) % DITHER_TILE;
  return {
    x: wrap(m.a * origin.x + m.c * origin.y + m.e),
    y: wrap(m.b * origin.x + m.d * origin.y + m.f),
  };
}

/**
 * Fills the shape `buildPath` traces (CSS px) with the ordered dither of
 * `color` at `density` (rule 7): one device pixel per cell at any device pixel
 * ratio, the field's matrix, a pattern per density step.
 *
 * The path is traced under the context's scale and filled under the identity
 * transform, so the pattern lands on device pixels. A number is one cached
 * pattern fill. A function is sampled once per 4×4 device-pixel tile (CSS px
 * in, 0..1 out), which costs a call per tile: on a chart that redraws often,
 * prefer a number or `ditherFade`.
 */
export function ditherFill(
  ctx: CanvasRenderingContext2D,
  buildPath: (ctx: CanvasRenderingContext2D) => void,
  color: string,
  density: ChartDensity,
  options: DitherOptions = {}
) {
  const phase = patternPhase(ctx, options.origin);
  if (typeof density === "function") {
    ditherByTile(ctx, buildPath, color, density, phase);
    return;
  }
  const step = ditherStep(density);
  if (!step) return;
  const pattern = ditherPattern(ctx, step, color);
  if (!pattern) return;
  ctx.save();
  ctx.beginPath();
  buildPath(ctx);
  ctx.setTransform(1, 0, 0, 1, phase.x, phase.y);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = pattern;
  ctx.fill();
  ctx.restore();
}

function ditherByTile(
  ctx: CanvasRenderingContext2D,
  buildPath: (ctx: CanvasRenderingContext2D) => void,
  color: string,
  density: (x: number, y: number) => number,
  phase: { x: number; y: number }
) {
  const { width, height } = ctx.canvas;
  const user = ctx.getTransform().inverse();
  // Runs of tiles with the same step, per step, in pattern space (the device
  // pixels counted from the pattern's origin).
  const runs = new Map<number, Path2D>();
  const add = (step: number, x: number, y: number, w: number) => {
    let path = runs.get(step);
    if (!path) {
      path = new Path2D();
      runs.set(step, path);
    }
    path.rect(x, y, w, DITHER_TILE);
  };
  for (let y = phase.y ? -DITHER_TILE : 0; y + phase.y < height; y += DITHER_TILE) {
    let runStep = 0;
    let runStart = 0;
    for (let x = phase.x ? -DITHER_TILE : 0; ; x += DITHER_TILE) {
      const inside = x + phase.x < width;
      let step = 0;
      if (inside) {
        const cx = x + phase.x + DITHER_TILE / 2;
        const cy = y + phase.y + DITHER_TILE / 2;
        step = ditherStep(
          density(user.a * cx + user.c * cy + user.e, user.b * cx + user.d * cy + user.f)
        );
      }
      if (step !== runStep) {
        if (runStep) add(runStep, runStart, y, x - runStart);
        runStep = step;
        runStart = x;
      }
      if (!inside) break;
    }
  }
  if (!runs.size) return;
  ctx.save();
  ctx.beginPath();
  buildPath(ctx);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, phase.x, phase.y);
  ctx.imageSmoothingEnabled = false;
  for (const [step, path] of runs) {
    const pattern = ditherPattern(ctx, step, color);
    if (!pattern) continue;
    ctx.fillStyle = pattern;
    ctx.fill(path);
  }
  ctx.restore();
}

/**
 * A dither whose density changes in a straight line across a shape: `from` at
 * one edge (0) and `to` at the other (1), such as the contour's fill thinning
 * from its line to its baseline. `buildBand(ctx, start, end)` traces the part
 * of the shape between those two fractions.
 *
 * It paints one fixed-density layer per step, sparsest first: the masks are
 * nested, so the result is exactly the per-pixel dither of the fade, for a few
 * path fills and no work per pixel (`ditherLayers`).
 */
export function ditherFade(
  ctx: CanvasRenderingContext2D,
  buildBand: (ctx: CanvasRenderingContext2D, start: number, end: number) => void,
  color: string,
  from: number,
  to: number,
  options: DitherOptions = {}
) {
  for (const layer of ditherLayers(from, to)) {
    ditherFill(ctx, (c) => buildBand(c, layer.start, layer.end), color, layer.density, options);
  }
}

/** The fill of an area too small for the dither (rule 7): the quiet grey at 12%. */
export function washFill(
  ctx: CanvasRenderingContext2D,
  buildPath: (ctx: CanvasRenderingContext2D) => void,
  color: string
) {
  ctx.save();
  ctx.beginPath();
  buildPath(ctx);
  ctx.globalAlpha = CHART_WASH;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
