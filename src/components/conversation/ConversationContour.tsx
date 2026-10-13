import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import {
  CONTOUR_RESOLUTION,
  LIVE_BUCKET_MS,
  QUIET_THRESHOLD,
} from "../../helpers/conversationContour.mjs";
import { monotoneAt, monotoneTangents } from "../../helpers/chartCurve.mjs";
import {
  CHART,
  DITHER_MIN_HEIGHT,
  ditherFade,
  drawDot,
  observeCanvas,
  subscribeChartPalette,
  traceMonotone,
  washFill,
  type ChartFrame,
  type ChartPalette,
} from "../charts/chartStyle";
import { markKind } from "./questionMarks";

// The conversation contour (DESIGN.md §6) — Oats' signature mark.
//
// Everything drawn here is a measurement of the conversation it belongs to. The
// geometry comes from `helpers/conversationContour.mjs`, which is pure and
// pinned by `test/helpers/conversationContour.test.js`; this file owns pixels
// and nothing else, so the meaning of the mark cannot drift from its drawing.
// The pixels follow the chart rules (`components/charts/chartStyle.ts`).
//
// Four things are on screen and each one is a fact:
//
//   **The line** is time, left to right, high where people spoke and low where
//   they did not. A silence is a dip, never a gap: the line does not break,
//   because the conversation did not. Under it, the fill thins from the line
//   to the baseline.
//
//   **A tick** through the baseline is the subject changing.
//
//   **A dot** is a question, on the line at the moment it was asked. Its fill
//   says how it ended: filled when settled, a soft fill inside a ring when the
//   answer was hedged, a ring when nobody gave a verdict (`questionMarks.ts`).
//   The fill reads in greyscale and with colour blindness; the status colour
//   repeats it.
//
//   **A caret** under the baseline is a moment somebody marked.
//
// Returns to an earlier topic are not drawn here: the flow card's lanes show
// them.
//
// There is no animation loop. A stored conversation draws once. A live one
// (`buildLiveContour`) redraws once a second and rolls: the line and every dot
// move one second to the left, and the canvas glides between the redraws.

export interface ContourPoint {
  x: number;
  y: number;
  quiet: boolean;
  /** Live only: this second is before the sitting started, so nothing is drawn. */
  before?: boolean;
}

export interface ContourMark {
  id: string;
  x: number;
  y: number;
  state: string;
  fill: string;
  groupKey?: string;
  question?: string;
  occurrence?: number;
}

export interface ContourShift {
  id: string;
  x: number;
  label: string;
  state?: string;
}

export interface ContourReturn {
  id: string;
  from: number;
  to: number;
  label: string;
  state?: string;
}

export interface ContourMoment {
  id: string;
  x: number;
  at: number;
  note: string;
}

export interface ContourData {
  points: ContourPoint[];
  marks: ContourMark[];
  shifts: ContourShift[];
  /** Counted in the label; not drawn (the lanes show returns). */
  returns: ContourReturn[];
  /** Instants somebody pressed "Mark". Optional: older callers build none. */
  moments?: ContourMoment[];
  span: number;
  /** Where the window begins, epoch ms — with `span`, a position is a time. */
  start?: number;
  empty: boolean;
  /** A rolling live window (`buildLiveContour`), with now at the right edge. */
  live?: boolean;
  /** Live only: where the sitting starts, below 0 once it has rolled out. */
  sessionX?: number;
  /** Live only: whole minutes since the start, so the roll shows in silence. */
  ticks?: { x: number; minute: number }[];
  /** Live only: the whole sitting, for the label (the window is four minutes). */
  summary?: {
    minutes: number;
    questions: number;
    unresolved: number;
    shifts: number;
    returns: number;
  };
}

/** The fill's density just under the line, and at the baseline (rule 7). */
const FILL_UNDER_LINE = 0.5;
const FILL_AT_BASELINE = 0.08;

/** Room above the highest point for a focused dot and its ring. */
const DOT_ROOM = CHART.focusDot + CHART.ring + 1;

/** How narrow a dip (CSS px either side) the fill bridges rather than follows. */
const FILL_REACH = 10;

type Point = { x: number; y: number };

/**
 * The top the fill thins down from: the line's highest point within
 * `FILL_REACH` either side, averaged over the same reach so it has no corners.
 *
 * The fill thins from the line to the baseline in every column. Thinned from
 * the line itself, every narrow dip (a breath, live) pulled the dense band down
 * to the baseline and drew a dark streak under each silence. From this top, a
 * broad stretch still has its densest grain right under the line, and a dip
 * only cuts into the mass, sparse, as a silence should be.
 */
function fillTop(line: Point[]): number[] {
  const count = line.length;
  if (count < 2) return line.map((point) => point.y);
  const spacing = (line[count - 1].x - line[0].x) / (count - 1) || 1;
  const reach = Math.max(1, Math.round(FILL_REACH / spacing));
  const from = (index: number) => Math.max(0, index - reach);
  const to = (index: number) => Math.min(count - 1, index + reach);
  // Highest is the smallest y: the canvas counts down.
  const highest = line.map((_, index) => {
    let top = Infinity;
    for (let at = from(index); at <= to(index); at += 1) top = Math.min(top, line[at].y);
    return top;
  });
  return highest.map((_, index) => {
    let total = 0;
    for (let at = from(index); at <= to(index); at += 1) total += highest[at];
    return total / (to(index) - from(index) + 1);
  });
}

export default function ConversationContour({
  contour,
  className,
  height = 96,
  showMarks = true,
  label,
  focusedGroup = null,
  onPick,
  pickLabel,
}: {
  contour: ContourData;
  className?: string;
  /** CSS length. A string so a caller can hand it a `clamp()`. */
  height?: number | string;
  /** The list strip omits ticks, carets and dots: at 16px they are a smudge. */
  showMarks?: boolean;
  /** Read out instead of the drawing, which is decorative to a screen reader. */
  label?: string;
  /**
   * The question group the reader is currently on, from the annotations below.
   * Its dot is raised and ringed in honey, so a question and its place in the
   * conversation are visibly the same thing.
   */
  focusedGroup?: string | null;
  /**
   * Makes the trace a way into the record: a click is turned back into the
   * moment it stands for. Pointer-only by design — the transcript it lands on
   * is the keyboard path to the same place.
   */
  onPick?: (time: number) => void;
  /** What the hover hairline says about the moment under the pointer. */
  pickLabel?: (time: number) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [palette, setPalette] = useState<ChartPalette | null>(null);
  // Where the pointer is over a pickable trace, as a fraction of its width.
  // A DOM hairline rather than a redraw: hovering must not repaint the canvas.
  const [hover, setHover] = useState<number | null>(null);
  const pickable = Boolean(onPick) && !contour.empty && contour.span > 0;
  const timeAt = (fraction: number) => (contour.start ?? 0) + fraction * contour.span;

  // Read on mount and on theme change only — never in a draw (the house rule:
  // getComputedStyle in a loop forces a style recalculation every frame).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return subscribeChartPalette(canvas, setPalette);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette) return;

    // The glide. Data arrive once a second, so the drawing would move in
    // one-second steps. Instead each redraw starts the canvas at the part of
    // the second already gone and lets the compositor slide it one bucket
    // left by the next tick: continuous motion at the display's frame rate
    // with no animation loop in JavaScript. A redraw mid-second (a segment
    // arriving) picks up where the slide is, so nothing jumps. Under reduced
    // motion it stays still and moves in steps.
    const glide = (bucketPx: number) => {
      canvas.style.transition = "none";
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!contour.live || reduce || !contour.span) {
        canvas.style.transform = "";
        return;
      }
      const secondStart = (contour.start ?? 0) + contour.span - LIVE_BUCKET_MS;
      const gone = Math.min(1, Math.max(0, (Date.now() - secondStart) / LIVE_BUCKET_MS));
      canvas.style.transform = `translateX(${(-gone * bucketPx).toFixed(2)}px)`;
      void canvas.offsetWidth;
      canvas.style.transition = `transform ${Math.round((1 - gone) * LIVE_BUCKET_MS)}ms linear`;
      canvas.style.transform = `translateX(${(-bucketPx).toFixed(2)}px)`;
    };

    const draw = ({ ctx, width: canvasWidth, height: cssHeight }: ChartFrame) => {
      // Live, the canvas is one bucket wider than the window it plots, so it
      // can glide left by that bucket between once-a-second redraws (above).
      const buckets = contour.live ? Math.max(1, contour.points.length) : 0;
      const width = contour.live ? canvasWidth * (buckets / (buckets + 1)) : canvasWidth;
      if (!width || !cssHeight) return;
      glide(width / Math.max(1, buckets));

      // The baseline sits low and on a whole pixel, so the 1px rule is crisp:
      // the line grows up from it, and ticks and carets hang under it.
      const baseline = Math.round(cssHeight - (showMarks ? 14 : 3));
      const amplitude = Math.max(4, baseline - (showMarks ? DOT_ROOM : 3));
      const at = (value: number) => baseline - value * amplitude;
      const x = (value: number) => value * (width - 1);
      // Live, the line begins where the sitting began, and rolls left from there.
      const left = contour.live ? Math.min(width, Math.max(0, x(contour.sessionX ?? 0))) : 0;

      const rule = (from: number) => {
        ctx.beginPath();
        ctx.moveTo(from, baseline + 0.5);
        ctx.lineTo(canvasWidth, baseline + 0.5);
        ctx.lineWidth = CHART.rule;
        ctx.lineCap = "butt";
        ctx.strokeStyle = palette.rule;
        ctx.stroke();
      };

      if (contour.empty || !contour.points.length) {
        // A conversation with nothing in it draws its own resting baseline
        // rather than an invented line: a true thing to show.
        rule(0);
        return;
      }

      const drawn = contour.live ? contour.points.filter((point) => !point.before) : contour.points;
      const line = drawn.map((point) => ({ x: x(point.x), y: at(point.y) }));
      const tangents = monotoneTangents(line);
      const first = line[0];
      const last = line[line.length - 1];

      // 1. The fill under the line: a dither thinning to the baseline, or a
      //    wash where the strip is too small for the grain. Live, the grain is
      //    pinned to the start of the sitting, so it rolls with the line
      //    instead of shimmering under it.
      const area = (c: CanvasRenderingContext2D) => {
        c.moveTo(first.x, baseline);
        c.lineTo(first.x, first.y);
        traceMonotone(c, line, tangents);
        c.lineTo(last.x, baseline);
        c.closePath();
      };
      if (line.length > 1 && cssHeight < DITHER_MIN_HEIGHT) {
        washFill(ctx, area, palette.quiet);
      } else if (line.length > 1) {
        const top = fillTop(line);
        // `share` of the way down from the fill's top to the baseline.
        const down = (share: number, index: number) => top[index] + share * (baseline - top[index]);
        ctx.save();
        ctx.beginPath();
        area(ctx);
        ctx.clip();
        ditherFade(
          ctx,
          // The part of the fill between `start` and `end` of the way down;
          // the clip keeps it under the line.
          (c, start, end) => {
            if (start <= 0) {
              c.moveTo(first.x, 0);
              c.lineTo(last.x, 0);
            } else {
              line.forEach((point, index) => c.lineTo(point.x, down(start, index)));
            }
            if (end >= 1) {
              c.lineTo(last.x, baseline);
              c.lineTo(first.x, baseline);
            } else {
              for (let index = line.length - 1; index >= 0; index -= 1) {
                c.lineTo(line[index].x, down(end, index));
              }
            }
            c.closePath();
          },
          palette.quiet,
          FILL_UNDER_LINE,
          FILL_AT_BASELINE,
          contour.live ? { origin: { x: x(contour.sessionX ?? 0), y: 0 } } : {}
        );
        ctx.restore();
      }

      // 2. The baseline, always: the rule the line stands on.
      rule(left);

      // 3. Live: a tick under the baseline at each whole minute since the
      //    start. They roll with the line, so the movement shows in a silence.
      ctx.lineWidth = CHART.rule;
      ctx.lineCap = "butt";
      if (contour.live && showMarks) {
        ctx.strokeStyle = palette.rule;
        ctx.beginPath();
        for (const tick of contour.ticks ?? []) {
          const px = Math.round(x(tick.x)) + 0.5;
          if (px < left) continue;
          ctx.moveTo(px, baseline + 1);
          ctx.lineTo(px, baseline + 4);
        }
        ctx.stroke();
      }

      // 4. A topic change: a tick through the baseline.
      if (showMarks) {
        ctx.strokeStyle = palette.quiet;
        ctx.beginPath();
        for (const shift of contour.shifts) {
          const px = Math.round(x(shift.x)) + 0.5;
          ctx.moveTo(px, baseline - 3);
          ctx.lineTo(px, baseline + 4);
        }
        ctx.stroke();
      }

      // 5. The line.
      if (line.length > 1) {
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        traceMonotone(ctx, line, tangents);
        ctx.lineWidth = CHART.line;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = palette.quiet;
        ctx.stroke();
      }

      if (!showMarks) return;

      // 6. Moments somebody marked: an ink caret under the baseline. Ink, not a
      //    status colour: it is not a verdict, it is the reader's own hand.
      ctx.fillStyle = palette.ink;
      for (const moment of contour.moments ?? []) {
        // Held inside the canvas: a mark made live is made *now*, at the
        // right-hand edge, and an unclamped caret there drew half a triangle.
        const px = Math.min(width - 4, Math.max(4, Math.round(x(moment.x)))) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, baseline + 5);
        ctx.lineTo(px + 3.5, baseline + 11);
        ctx.lineTo(px - 3.5, baseline + 11);
        ctx.closePath();
        ctx.fill();
      }

      // 7. Questions: a dot on the line at the moment each was asked. Open
      //    ones go under settled ones, and the one being read goes on top, a
      //    size up and ringed in honey. A dot near an edge is held inside, on
      //    the line where it is drawn, rather than cut in half.
      const focused = (mark: ContourMark) =>
        focusedGroup !== null && mark.groupKey === focusedGroup;
      const rank = (mark: ContourMark) =>
        focused(mark) ? 2 : markKind(mark.state) === "open" ? 0 : 1;
      const ordered = [...contour.marks].sort((a, b) => rank(a) - rank(b) || a.x - b.x);
      for (const mark of ordered) {
        const lit = focused(mark);
        const radius = lit ? CHART.focusDot : CHART.dot;
        const inset = radius + CHART.ring;
        const px = Math.min(width - inset, Math.max(inset, x(mark.x)));
        const py = line.length ? monotoneAt(line, tangents, px) : baseline;
        drawDot(ctx, px, py, markKind(mark.state), palette, radius, { focus: lit });
      }
    };

    return observeCanvas(canvas, draw);
  }, [contour, palette, showMarks, focusedGroup]);

  const canvas = (
    <canvas
      ref={canvasRef}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "block w-full",
        pickable ? "cursor-pointer" : undefined,
        !pickable && !contour.live && className
      )}
      style={
        contour.live
          ? {
              height,
              width: `calc(100% * ${(contour.points.length + 1) / Math.max(1, contour.points.length)})`,
              willChange: "transform",
            }
          : { height }
      }
      onPointerMove={
        pickable
          ? (event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setHover(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
            }
          : undefined
      }
      onPointerLeave={pickable ? () => setHover(null) : undefined}
      onClick={
        pickable
          ? (event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
              onPick?.(timeAt(fraction));
            }
          : undefined
      }
    />
  );

  // Live, a clipping frame round the wider canvas, so the bucket sliding in
  // from the right and the one leaving on the left are never seen past it.
  if (contour.live) return <div className={cn("overflow-hidden", className)}>{canvas}</div>;
  if (!pickable) return canvas;

  return (
    <div className={cn("relative", className)}>
      {canvas}
      {hover !== null && (
        // Where a click would land, and when that was: hovered, so honey
        // (rule 3). The time sits above the canvas, clear of the line.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-primary"
          style={{ left: `${hover * 100}%` }}
        >
          {pickLabel && (
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {pickLabel(timeAt(hover))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { CONTOUR_RESOLUTION, QUIET_THRESHOLD };
