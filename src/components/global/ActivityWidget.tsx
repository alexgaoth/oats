import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { WEEKS, activityCalendar, densityFor, firstDayOfWeek } from "./activityCalendar";
import type { CalendarDay } from "./activityCalendar";
import { CHART, MAX_CHART_RATIO, ditherFill } from "../charts/chartStyle";
import { useChartPalette } from "./useChartPalette";
import { markTone } from "./linkedHighlight";
import { useGlobalHighlight } from "./highlightStore";
import type { HighlightSource } from "./highlightStore";

// Activity: the last twelve weeks, one cell per day, a column per week. A
// day's dither is as dense as the conversations it held (a quarter of ink each,
// full at four), so the calendar reads in greyscale. Pointing at a day lights
// its conversations everywhere on the board; pointing at a conversation
// anywhere lights its day here. Today has a honey ring: honey is for now.

const PAD = 14;
const MONTH_BAND = 18;
const WEEKDAY_BAND = 30;

interface Geometry {
  cell: number;
  gap: number;
  left: number;
  top: number;
}

function geometry(width: number, height: number): Geometry {
  const across = (width - PAD * 2 - WEEKDAY_BAND) / WEEKS;
  const down = (height - MONTH_BAND - PAD - 6) / 7;
  const cell = Math.max(6, Math.floor(Math.min(across, down, 26)));
  return {
    cell,
    gap: Math.max(2, Math.round(cell * 0.16)),
    left: PAD + WEEKDAY_BAND,
    top: MONTH_BAND + 4,
  };
}

export default function ActivityWidget({
  conversations,
  highlight,
}: {
  conversations: { id: number; createdAt: number }[];
  highlight: HighlightSource;
}) {
  const { t, i18n } = useTranslation();
  const palette = useChartPalette();
  const box = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [current, setCurrent] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const calendar = useMemo(
    () =>
      activityCalendar(conversations, {
        now: Date.now(),
        firstDay: firstDayOfWeek(i18n.language),
      }),
    [conversations, i18n.language]
  );
  const grid = useMemo(() => geometry(size.width, size.height), [size]);
  const months = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short" }),
    [i18n.language]
  );
  const weekdays = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "short" }),
    [i18n.language]
  );
  const dayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, { weekday: "long", month: "long", day: "numeric" }),
    [i18n.language]
  );

  const cellAt = useCallback(
    (day: CalendarDay) => ({
      x: grid.left + day.column * grid.cell,
      y: grid.top + day.row * grid.cell,
      side: grid.cell - grid.gap,
    }),
    [grid]
  );

  // Everything a highlight does not change, drawn once per calendar, size and
  // theme: the grid, its labels, today's ring, and every busy day in each of
  // its two tones. Pointing at something blits one layer and fills the few
  // days it lights, rather than dithering every day again.
  const layersRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  useEffect(() => layersRef.current.clear(), [calendar, grid, palette, size, months, weekdays]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !palette || !size.width || !size.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_CHART_RATIO);
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

    const busy = calendar.days.filter((day) => day.ids.length && !day.future);
    const fillDay = (target: CanvasRenderingContext2D, day: CalendarDay, tone: string) => {
      const { x, y, side } = cellAt(day);
      const cell = (path: CanvasRenderingContext2D) => path.roundRect(x, y, side, side, 2);
      if (tone === palette.honey) {
        target.beginPath();
        cell(target);
        target.fillStyle = palette.honey;
        target.fill();
        return;
      }
      // A mass (rule 7): the shared dither, as dense as the day was busy.
      ditherFill(target, cell, tone, densityFor(day.ids.length));
    };
    const paintGrid = (target: CanvasRenderingContext2D, dayTone: string) => {
      // An empty day is its outline: the grid stays legible with nothing in it.
      target.beginPath();
      for (const day of calendar.days) {
        if (day.future || day.ids.length) continue;
        const { x, y, side } = cellAt(day);
        target.roundRect(x + 0.5, y + 0.5, side - 1, side - 1, 2);
      }
      target.lineWidth = CHART.rule;
      target.strokeStyle = palette.rule;
      target.stroke();
      for (const day of busy) fillDay(target, day, dayTone);
      // Today, in honey: a ring around its cell.
      const today = calendar.days.find((day) => day.today);
      if (today) {
        const { x, y, side } = cellAt(today);
        target.beginPath();
        target.roundRect(x - 2, y - 2, side + 4, side + 4, 3);
        target.lineWidth = CHART.line;
        target.strokeStyle = palette.honey;
        target.stroke();
      }
      // Months along the top, weekdays down the side, in the quiet grey.
      // Nothing is drawn across them.
      target.fillStyle = palette.quiet;
      target.font = `400 12px ${palette.sans}`;
      target.textBaseline = "alphabetic";
      target.textAlign = "left";
      for (const month of calendar.months) {
        target.fillText(
          months.format(new Date(month.start)),
          grid.left + month.column * grid.cell,
          MONTH_BAND - 2
        );
      }
      target.textAlign = "right";
      target.textBaseline = "middle";
      for (const day of calendar.days.slice(0, 7)) {
        if (day.row % 2) continue;
        const { y, side } = cellAt(day);
        target.fillText(weekdays.format(new Date(day.start)), grid.left - 6, y + side / 2 + 0.5);
      }
    };
    const layer = (name: string, dayTone: string) => {
      let image = layersRef.current.get(name);
      if (!image) {
        image = document.createElement("canvas");
        image.width = canvas.width;
        image.height = canvas.height;
        const target = image.getContext("2d");
        if (target) {
          target.setTransform(ratio, 0, 0, ratio, 0, 0);
          paintGrid(target, dayTone);
        }
        layersRef.current.set(name, image);
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };

    const lit = highlight.get();
    const pointedDay = useGlobalHighlight.getState().hoveredDay;
    const focus = (day: CalendarDay) =>
      day.key === pointedDay || day.ids.some((id) => markTone(lit, id) === "focus");
    const rest = (day: CalendarDay) => day.ids.some((id) => markTone(lit, id) === "rest");
    if (!lit.active && !pointedDay) {
      layer("rest", palette.quiet);
    } else {
      layer("recede", palette.rule);
      for (const day of busy) if (!focus(day) && rest(day)) fillDay(ctx, day, palette.quiet);
    }
    for (const day of busy) if (focus(day)) fillDay(ctx, day, palette.honey);
  }, [calendar, cellAt, grid, highlight, months, palette, size, weekdays]);

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);
  useEffect(() => {
    drawRef.current();
    return highlight.subscribe(() => drawRef.current());
  }, [highlight]);

  const pointed = useRef<string | null>(null);
  const point = (key: string | null) => {
    const previous = pointed.current;
    if (previous === key) return;
    pointed.current = key;
    const store = useGlobalHighlight.getState();
    if (key) store.pointAtDay(key);
    else if (previous) store.leaveDay(previous);
  };
  const dayAt = (event: { clientX: number; clientY: number }): CalendarDay | null => {
    const element = box.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left - grid.left) / grid.cell);
    const row = Math.floor((event.clientY - rect.top - grid.top) / grid.cell);
    if (column < 0 || column >= WEEKS || row < 0 || row > 6) return null;
    const day = calendar.days[column * 7 + row];
    return day && day.ids.length && !day.future ? day : null;
  };

  const busy = calendar.days.filter((day) => day.ids.length && !day.future);
  const tabStop =
    current && busy.some((day) => day.key === current) ? current : busy[busy.length - 1]?.key;
  const move = (step: number) => {
    const index = Math.max(
      0,
      busy.findIndex((day) => day.key === tabStop)
    );
    const next = busy[Math.min(busy.length - 1, Math.max(0, index + step))];
    if (!next) return;
    setCurrent(next.key);
    buttons.current.get(next.key)?.focus();
  };

  return (
    <div
      ref={box}
      className="relative h-full w-full"
      onPointerMove={(event) => {
        const day = dayAt(event);
        point(day?.key ?? null);
        if (canvasRef.current) canvasRef.current.style.cursor = "";
      }}
      onPointerLeave={() => point(null)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0"
        style={{ width: size.width, height: size.height }}
      />
      <ul
        aria-label={t("oats.global.widgets.activity.name")}
        className="pointer-events-none absolute inset-0 m-0 list-none p-0"
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : 0;
          if (!step) return;
          event.preventDefault();
          move(step);
        }}
      >
        {busy.map((day) => {
          const { x, y, side } = cellAt(day);
          return (
            <li key={day.key}>
              <button
                ref={(element) => {
                  if (element) buttons.current.set(day.key, element);
                  else buttons.current.delete(day.key);
                }}
                type="button"
                tabIndex={day.key === tabStop ? 0 : -1}
                onFocus={() => {
                  setCurrent(day.key);
                  point(day.key);
                }}
                onBlur={() => point(null)}
                className={cn(
                  "pointer-events-none absolute rounded-[3px]",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                )}
                style={{ left: x - 1, top: y - 1, width: side + 2, height: side + 2 }}
              >
                <span className="sr-only">
                  {t("oats.global.widgets.activity.day", {
                    date: dayLabel.format(new Date(day.start)),
                    count: day.ids.length,
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
