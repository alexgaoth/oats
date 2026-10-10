import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CONTOUR_RESOLUTION, QUIET_THRESHOLD } from "../../helpers/conversationContour.mjs";
import { markFill, markTone, TONE_TOKEN, type MarkFill, type MarkTone } from "./questionMarks";

// The conversation contour (DESIGN.md §9.8) — Oats' signature mark.
//
// Everything drawn here is a measurement of the conversation it belongs to. The
// geometry comes from `helpers/conversationContour.mjs`, which is pure and
// pinned by `test/helpers/conversationContour.test.js`; this file owns pixels
// and nothing else, so the meaning of the mark cannot drift from its drawing.
//
// Four things are on screen and each one is a fact:
//
//   **The trace** is time, left to right, thick where people spoke and thin
//   where they did not. A silence is a thinning, never a gap — the line does not
//   break, because the conversation did not.
//
//   **A notch** is the subject changing.
//
//   **A mark above the line** is a question, at the moment it was asked. Its
//   shape says how settled it is: filled when settled, half filled when the
//   answer was hedged, a ring when nobody gave a verdict (`questionMarks.ts`).
//   The shape reads in greyscale and with colour blindness. The status colour
//   repeats it.
//
//   **An arc** is the room coming back to a thread it had left — the one thing
//   a transcript cannot show you and a summary always flattens.
//
// There is no animation loop. The drawing changes when the conversation
// changes, which during a recording is roughly once every five seconds and the
// rest of the time never. That is the whole of its `prefers-reduced-motion`
// story: there is no motion to reduce.

export interface ContourPoint {
  x: number;
  y: number;
  quiet: boolean;
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
  returns: ContourReturn[];
  /** Instants somebody pressed "Mark". Optional: older callers build none. */
  moments?: ContourMoment[];
  span: number;
  /** Where the window begins, epoch ms — with `span`, a position is a time. */
  start?: number;
  empty: boolean;
}

interface Palette extends Record<MarkTone, string> {
  ink: string;
  husk: string;
  hairline: string;
}

/**
 * One theme observer for the whole application, not one per contour.
 *
 * Each instance used to install its own `MutationObserver` on
 * `document.documentElement` and do its own `getComputedStyle` read. With the
 * Intelligence list showing a hundred conversations, a single dark-mode toggle
 * fired a hundred observers, forced a hundred style recalculations and pushed a
 * hundred fresh palette objects into state — measured at ~100–170ms. The
 * palette is a property of the document, so it is read once and published.
 */
const paletteSubscribers = new Set<(palette: Palette) => void>();
let sharedPalette: Palette | null = null;
let themeObserver: MutationObserver | null = null;

function subscribeToPalette(element: HTMLElement, notify: (palette: Palette) => void): () => void {
  if (!sharedPalette) sharedPalette = readPalette(element);
  notify(sharedPalette);
  paletteSubscribers.add(notify);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      sharedPalette = readPalette(document.documentElement);
      for (const subscriber of paletteSubscribers) subscriber(sharedPalette);
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
      // Dropped so the next mount re-reads rather than trusting a palette from
      // before a theme change nobody was subscribed to observe.
      sharedPalette = null;
    }
  };
}

function readPalette(element: HTMLElement): Palette {
  const styles = getComputedStyle(element);
  const value = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: value("--color-foreground", "#09090b"),
    husk: value("--color-muted-foreground", "#71717a"),
    hairline: value("--color-border", "#e4e4e7"),
    success: value(TONE_TOKEN.success, "#16a34a"),
    warning: value(TONE_TOKEN.warning, "#d97706"),
    muted: value(TONE_TOKEN.muted, "#71717a"),
  };
}

/**
 * A question's mark at full size: filled, half filled or a ring.
 *
 * The ring is drawn inside the radius, so the three shapes are the same size
 * and only their fill differs.
 */
function questionDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: MarkFill,
  color: string
) {
  ctx.fillStyle = color;
  if (fill === "solid") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const line = 1.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - line / 2, 0, Math.PI * 2);
  ctx.stroke();
  if (fill === "half") {
    // The right half: the same reading as a status icon that is part done.
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * At list-strip size a ring and a half disc are one blur, so the strip keeps
 * the order of the shapes as strength instead: settled is full, hedged is
 * lighter, open is faint.
 */
const STRIP_ALPHA: Record<MarkFill, number> = { solid: 1, half: 0.6, ring: 0.35 };

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
  /** The list strip omits notches and arcs — at 40px they are a smudge. */
  showMarks?: boolean;
  /** Read out instead of the drawing, which is decorative to a screen reader. */
  label?: string;
  /**
   * The question group the reader is currently on, from the annotations below.
   * Its mark is raised so a question and its place in the conversation are
   * visibly the same thing.
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
  const [palette, setPalette] = useState<Palette | null>(null);
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
    return subscribeToPalette(canvas, setPalette);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (!width || !cssHeight) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== width * ratio || canvas.height !== cssHeight * ratio) {
        canvas.width = width * ratio;
        canvas.height = cssHeight * ratio;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, cssHeight);

      // The baseline sits low: the trace grows upward from it and the question
      // marks live in the band above, so nothing has to overlap anything.
      const baseline = cssHeight - (showMarks ? 14 : 3);
      const amplitude = baseline - (showMarks ? 26 : 4);
      const at = (point: { y: number }) => baseline - point.y * amplitude;

      if (contour.empty || !contour.points.length) {
        // A conversation with nothing in it draws its own resting line rather
        // than an invented one. It is the ledger before anybody has written in
        // it, which is a true thing to show.
        ctx.strokeStyle = palette.hairline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, baseline);
        ctx.lineTo(width, baseline);
        ctx.stroke();
        return;
      }

      const x = (value: number) => value * (width - 1);

      // 1. Return arcs, behind everything: they are context, not content. In
      //    the muted ink, lightened, rather than the border colour, which
      //    measured 1.25:1 on the card and hid the one thing a transcript
      //    cannot show.
      if (showMarks) {
        ctx.strokeStyle = palette.husk;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        for (const arc of contour.returns) {
          const from = x(arc.from);
          const to = x(arc.to);
          const lift = Math.min(amplitude * 0.8, (to - from) * 0.28);
          ctx.beginPath();
          ctx.moveTo(from, baseline);
          ctx.bezierCurveTo(from, baseline - lift, to, baseline - lift, to, baseline);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 2. The trace. Drawn as a filled ribbon around the baseline rather than a
      //    stroked path: thickness is the measurement, and a stroke of varying
      //    width cannot be expressed as one path.
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      for (const point of contour.points) ctx.lineTo(x(point.x), at(point));
      ctx.lineTo(width, baseline);
      ctx.closePath();
      ctx.fillStyle = palette.husk;
      ctx.globalAlpha = 0.28;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Its upper edge in ink, so the shape reads as a line and not as a wash.
      ctx.beginPath();
      contour.points.forEach((point, index) => {
        const px = x(point.x);
        const py = at(point);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // The baseline itself, always — it is the ledger rule the entry sits on.
      ctx.strokeStyle = palette.hairline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseline + 0.5);
      ctx.lineTo(width, baseline + 0.5);
      ctx.stroke();

      // 3. Topic shifts: a notch through the baseline.
      if (showMarks) {
        ctx.strokeStyle = palette.husk;
        ctx.globalAlpha = 0.7;
        for (const shift of contour.shifts) {
          const px = Math.round(x(shift.x)) + 0.5;
          ctx.beginPath();
          ctx.moveTo(px, baseline - 3);
          ctx.lineTo(px, baseline + 5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 4. Questions: a mark over the trace, with a hairline down to it so it
      //    is anchored to a moment rather than hovering near one.
      if (showMarks) {
        for (const mark of contour.marks) {
          const px = x(mark.x);
          const py = at(mark);
          const color = palette[markTone(mark.state)];
          const focused = focusedGroup !== null && mark.groupKey === focusedGroup;
          // Reading an annotation lights its own moment on the line. This is
          // the whole connection between the two halves of the surface: the
          // question you are reading, and where in the conversation it happened.
          const stem = focused ? 15 : 9;
          ctx.strokeStyle = color;
          ctx.globalAlpha = focused ? 0.9 : 0.35;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(px) + 0.5, py);
          ctx.lineTo(Math.round(px) + 0.5, py - stem);
          ctx.stroke();
          ctx.globalAlpha = 1;
          // 4px at rest, the smallest radius at which a ring and a half disc
          // still read as different shapes.
          questionDisc(ctx, px, py - stem - 4, focused ? 6 : 4, markFill(mark.state), color);
        }
        // 5. Moments somebody marked: an ink caret under the baseline. Ink, not a
        //    state colour, because it is not a verdict on anything — it is the
        //    reader's own hand in the margin.
        ctx.fillStyle = palette.ink;
        ctx.globalAlpha = 0.8;
        for (const moment of contour.moments ?? []) {
          // Held inside the canvas: a mark made live is made *now*, which is
          // the right-hand edge, and an unclamped caret there drew half a
          // triangle — on the one press whose feedback is that triangle.
          const px = Math.min(width - 4, Math.max(4, Math.round(x(moment.x)))) + 0.5;
          ctx.beginPath();
          ctx.moveTo(px, baseline + 5);
          ctx.lineTo(px + 3.5, baseline + 11);
          ctx.lineTo(px - 3.5, baseline + 11);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        // The list strip keeps the marks — "three unanswered questions in the
        // last third" is exactly what a list is scanned for — but drops the
        // stems, which at this size only thicken the line.
        for (const mark of contour.marks) {
          ctx.fillStyle = palette[markTone(mark.state)];
          ctx.globalAlpha = STRIP_ALPHA[markFill(mark.state)];
          ctx.beginPath();
          ctx.arc(x(mark.x), baseline - amplitude - 1, 1.75, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    };

    // No standalone `draw()` before this: `observe()` delivers an initial
    // callback with the element's current size, so calling both drew every
    // contour in the app exactly twice — 202 canvas clears to mount a 101-canvas
    // list, and another 202 on every theme change.
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
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
        !pickable && className
      )}
      style={{ height }}
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

  if (!pickable) return canvas;

  return (
    <div className={cn("relative", className)}>
      {canvas}
      {hover !== null && (
        // Where a click would land, and when that was.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/30"
          style={{ left: `${hover * 100}%` }}
        >
          {pickLabel && (
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
              {pickLabel(timeAt(hover))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { CONTOUR_RESOLUTION, QUIET_THRESHOLD };
