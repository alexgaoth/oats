import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import {
  DATE_OFFSET,
  MARGIN,
  TITLE_LINE,
  TITLE_OFFSET,
  arcsBetween,
  conversationAt,
  layoutArcTimeline,
} from "./arcGeometry";
import type { ArcTimelineLayout } from "./arcGeometry";
import {
  DATA_LINE,
  DOT_RADIUS,
  DOT_RING,
  LABEL_SIZE,
  RULE_LINE,
  chartRatio,
  drawDot,
  labelFont,
  truncateText,
  useChartPalette,
} from "./chartPaint";
import { lineTone, markTone } from "./linkedHighlight";
import type { Highlight } from "./linkedHighlight";
import type { HighlightSource } from "./highlightStore";
import { shortTitle } from "./boardData";

// The arc timeline: every conversation on one line in date order, and an arc
// between every two that share a subject, as high as it reaches far. A new
// conversation is added at the right end and nothing else moves.
//
// Drawn on one canvas the size of the visible part of the card. A timeline too
// long for the card scrolls sideways inside it, and only what is in view is
// drawn. Pointing at something composites cached layers, so a highlight costs
// a few draws however many conversations there are.

export interface TimelineConversation {
  id: number;
  title: string;
  createdAt: number;
}

interface Labelled {
  id: number;
  x: number;
  date: string;
  lines: string[];
}

/** A title broken at words into at most two lines of `width`, the second cut with an ellipsis. */
function titleLines(ctx: CanvasRenderingContext2D, title: string, width: number): string[] {
  if (width <= 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(/\s+/).filter(Boolean)) {
    const attempt = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(attempt).width <= width) {
      line = attempt;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines.map((text) => truncateText(ctx, text, width));
  return [truncateText(ctx, lines[0], width), truncateText(ctx, `${lines[1]}…`, width)];
}

export default function ArcTimeline({
  conversations,
  edges,
  highlight,
  onHoverChange,
  onActivate,
  onBackgroundPress,
  describe,
  "aria-label": ariaLabel,
}: {
  conversations: TimelineConversation[];
  edges: { from: number; to: number }[];
  highlight: HighlightSource;
  onHoverChange: (id: number | null, previous: number | null) => void;
  onActivate: (id: number) => void;
  /** A press on the timeline away from every conversation. */
  onBackgroundPress?: () => void;
  describe: (conversation: TimelineConversation) => string;
  "aria-label"?: string;
}) {
  const { i18n } = useTranslation();
  const palette = useChartPalette();
  const viewport = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scrollRef = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  // Layers for the current scroll position, size and theme; see `draw`.
  const layersRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [current, setCurrent] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout: ArcTimelineLayout = useMemo(
    () =>
      layoutArcTimeline({
        conversations,
        edges,
        width: size.width,
        height: size.height,
      }),
    [conversations, edges, size]
  );
  const byId = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  );

  // Dates in the reader's language: "Oct 12".
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language]
  );

  // Every label measured and broken once per layout and theme, not per draw.
  const labels = useMemo(() => {
    const map = new Map<number, Labelled>();
    if (!palette || typeof document === "undefined") return map;
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return map;
    measure.font = labelFont(palette);
    for (const id of layout.order) {
      const conversation = byId.get(id);
      const x = layout.x.get(id);
      if (!conversation || x === undefined) continue;
      map.set(id, {
        id,
        x,
        date: dateFormat.format(new Date(conversation.createdAt)),
        lines: titleLines(measure, shortTitle(conversation.title), layout.titleWidth),
      });
    }
    return map;
  }, [layout, byId, palette, dateFormat]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette || !size.width || !size.height) return;
    const ratio = chartRatio();
    const pixelWidth = Math.round(size.width * ratio);
    const pixelHeight = Math.round(size.height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      layersRef.current.clear();
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const left = scrollRef.current;
    const right = left + size.width;
    const { baseline } = layout;
    const arcs = arcsBetween(layout.arcs, left - 1, right + 1);
    const visible = layout.order.filter((id) => {
      const x = layout.x.get(id) ?? 0;
      return x + layout.step >= left && x - layout.step <= right;
    });
    const current: Highlight = highlightRef.current.get();

    const strokeArcs = (target: CanvasRenderingContext2D, list: typeof arcs, color: string) => {
      if (!list.length) return;
      target.beginPath();
      for (const arc of list) {
        target.moveTo(arc.left - left, baseline);
        target.ellipse(arc.cx - left, baseline, arc.rx, arc.ry, 0, Math.PI, Math.PI * 2);
      }
      target.lineWidth = DATA_LINE;
      target.strokeStyle = color;
      target.stroke();
    };

    const paintMarks = (
      target: CanvasRenderingContext2D,
      ids: number[],
      fill: (id: number) => string,
      dateColor: (id: number) => string,
      titleColor: (id: number) => string
    ) => {
      for (const id of ids) {
        const x = (layout.x.get(id) ?? 0) - left;
        drawDot(target, x, baseline, fill(id), palette);
      }
      target.textAlign = "center";
      target.textBaseline = "top";
      for (const id of ids) {
        const label = labels.get(id);
        if (!label) continue;
        const x = label.x - left;
        target.font = labelFont(palette, 500);
        target.fillStyle = dateColor(id);
        target.fillText(label.date, x, baseline + DATE_OFFSET);
        target.font = labelFont(palette);
        target.fillStyle = titleColor(id);
        label.lines.forEach((line, index) =>
          target.fillText(line, x, baseline + TITLE_OFFSET + index * TITLE_LINE)
        );
      }
    };

    const baselineRule = (target: CanvasRenderingContext2D) => {
      target.beginPath();
      target.moveTo(Math.max(0, MARGIN - left), baseline + 0.5);
      target.lineTo(Math.min(size.width, layout.contentWidth - MARGIN - left), baseline + 0.5);
      target.lineWidth = RULE_LINE;
      target.strokeStyle = palette.rule;
      target.stroke();
    };

    const layer = (name: string, paint: (target: CanvasRenderingContext2D) => void) => {
      let image = layersRef.current.get(name);
      if (!image) {
        image = document.createElement("canvas");
        image.width = canvas.width;
        image.height = canvas.height;
        const target = image.getContext("2d");
        if (target) {
          target.setTransform(ratio, 0, 0, ratio, 0, 0);
          target.lineCap = "round";
          paint(target);
        }
        layersRef.current.set(name, image);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };

    const focus = visible.filter((id) => markTone(current, id) === "focus");
    if (!current.active) {
      layer("rest", (target) => {
        baselineRule(target);
        strokeArcs(target, arcs, palette.quiet);
        paintMarks(
          target,
          visible,
          () => palette.quiet,
          () => palette.quiet,
          () => palette.ink
        );
      });
    } else {
      layer("recede-arcs", (target) => {
        baselineRule(target);
        strokeArcs(target, arcs, palette.rule);
      });
      strokeArcs(
        ctx,
        arcs.filter((arc) => lineTone(current, arc.key) === "lit"),
        palette.ink
      );
      // The receded titles stay readable: text recedes to the quiet grey, never
      // to the rule grey, which is a line colour and fails contrast as type.
      layer("recede-marks", (target) =>
        paintMarks(
          target,
          visible,
          () => palette.rule,
          () => palette.quiet,
          () => palette.quiet
        )
      );
      paintMarks(
        ctx,
        visible.filter((id) => markTone(current, id) === "rest"),
        () => palette.quiet,
        () => palette.quiet,
        () => palette.ink
      );
    }
    paintMarks(
      ctx,
      focus,
      () => palette.honey,
      () => palette.ink,
      () => palette.ink
    );
  }, [layout, labels, palette, size]);

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    layersRef.current.clear();
    draw();
  }, [draw]);

  useEffect(() => {
    drawRef.current();
    return highlight.subscribe(() => drawRef.current());
  }, [highlight]);

  // A long timeline opens at its newest end, where the reader is most likely
  // to be looking, and keeps its place when it is redrawn.
  const opened = useRef(false);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !layout.scrolls || opened.current || !size.width) return;
    opened.current = true;
    element.scrollLeft = layout.contentWidth;
    scrollRef.current = element.scrollLeft;
  }, [layout, size.width]);

  const frame = useRef(0);
  const onScroll = () => {
    const element = viewport.current;
    if (!element) return;
    scrollRef.current = element.scrollLeft;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      layersRef.current.clear();
      drawRef.current();
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const setHover = useCallback(
    (id: number | null) => {
      const previous = hoverRef.current;
      if (previous === id) return;
      hoverRef.current = id;
      if (canvasRef.current) canvasRef.current.style.cursor = id !== null ? "pointer" : "";
      onHoverChange(id, previous);
    },
    [onHoverChange]
  );

  const pointAt = (event: { clientX: number; clientY: number }) => {
    const element = viewport.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return conversationAt(
      layout,
      event.clientX - rect.left + element.scrollLeft,
      event.clientY - rect.top
    );
  };

  const order = layout.order;
  const buttonTop = layout.baseline - DOT_RADIUS - DOT_RING - 4;
  const tabStop =
    current !== null && byId.has(current) ? current : (order[order.length - 1] ?? null);
  const move = (step: number | "first" | "last") => {
    if (!order.length) return;
    const index = Math.max(0, order.indexOf(tabStop ?? order[0]));
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? order.length - 1
          : Math.min(order.length - 1, Math.max(0, index + step));
    setCurrent(order[next]);
    buttons.current.get(order[next])?.focus();
  };

  return (
    <div
      ref={viewport}
      onScroll={onScroll}
      className={cn(
        "relative h-full w-full overflow-x-auto overflow-y-hidden",
        // Stops on whole columns, which fill the card exactly (`arcGeometry`).
        layout.scrolls && "snap-x snap-mandatory"
      )}
      onPointerMove={(event) => setHover(pointAt(event))}
      onPointerLeave={() => setHover(null)}
      onClick={(event) => {
        const id = pointAt(event);
        if (id !== null) onActivate(id);
        else onBackgroundPress?.();
      }}
    >
      <div className="relative h-full" style={{ width: layout.contentWidth }}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="sticky left-0 top-0 block"
          style={{ width: size.width, height: size.height }}
        />
        <ul
          aria-label={ariaLabel}
          className="pointer-events-none absolute inset-0 m-0 list-none p-0"
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : event.key === "Home"
                    ? "first"
                    : event.key === "End"
                      ? "last"
                      : null;
            if (step === null) return;
            event.preventDefault();
            move(step);
          }}
        >
          {order.map((id) => {
            const conversation = byId.get(id);
            const x = layout.x.get(id) ?? 0;
            if (!conversation) return null;
            return (
              <li key={id}>
                <button
                  ref={(element) => {
                    if (element) buttons.current.set(id, element);
                    else buttons.current.delete(id);
                  }}
                  type="button"
                  tabIndex={id === tabStop ? 0 : -1}
                  onFocus={() => {
                    setCurrent(id);
                    setHover(id);
                  }}
                  onBlur={() => setHover(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivate(id);
                  }}
                  className={cn(
                    "pointer-events-none absolute snap-start rounded-md",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                  style={{
                    scrollMarginLeft: MARGIN + 2,
                    left: x - layout.step / 2 + 2,
                    width: layout.step - 4,
                    top: buttonTop,
                    height: Math.max(LABEL_SIZE * 2, size.height - buttonTop - 4),
                  }}
                >
                  <span className="sr-only">{describe(conversation)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
