import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/badge";
import { CHART } from "../charts/chartStyle";
import { cn } from "../lib/utils";
import { formatSpan } from "../../helpers/ledgerDate.mjs";
import { LANE_ROW_PX, lanePath, runAt } from "../../helpers/topicLanes.mjs";
import { StateMark } from "./ConversationSignalRail";
import { stateLabel } from "./flowText";
import { markFill } from "./questionMarks";
import type { QuestionOutcome } from "../../types/conversationEvents";

// The lanes: how a conversation moved between its topics. One row per topic,
// in the order raised, with its minutes; and one line for the room, which runs
// along a topic's row while the room is on it and bends to the next row when
// the room moves. A return is the line climbing back to an earlier row.
// Geometry in `helpers/topicLanes.mjs`; this file owns pixels.
//
// The rows are HTML, so the words are real text that wraps, truncates and
// reads to a screen reader; the line is one SVG path laid over the middle
// column of the same grid, so it never crosses a word (DESIGN.md §6). The
// columns are shared through subgrid: the line's box is the rows' middle
// column whatever the labels and the minutes measure.
//
// Nothing moves at rest. The line draws itself once when the lanes appear
// (not under reduced motion) and is redrawn only when the data changes.

/** Rows shown before the lanes scroll inside their card. */
export const LANE_ROWS_SHOWN = 8;

/** What `topicLanes` returns, as the lanes read it. */
export interface Lanes {
  rows: { id: number; label: string; state: string; durationMs: number; back: number }[];
  runs: { topic: number; from: number; to: number }[];
  returns: { topic: number; previous: number; at: number }[];
  now: number | null;
  start: number;
  end: number;
  span: number;
  empty: boolean;
}

/** A question to mark on the line: when it was asked, and how it came out. */
export interface LaneQuestion {
  id: string;
  at: number;
  state: QuestionOutcome;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** The element that scrolls `element`, if any: the card body past eight rows. */
function scrollerOf(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
    node = node.parentElement;
  }
  return node;
}

export default function TopicLanes({
  lanes,
  selected,
  onSelect,
  live = false,
  questions,
  inset = "px-5",
  className,
}: {
  lanes: Lanes;
  selected: number | null;
  onSelect: (id: number) => void;
  /** A recording: the line ends at now, in honey, and earlier topics are quiet. */
  live?: boolean;
  /** Questions to mark on the line, each on the topic the room was on. */
  questions?: LaneQuestion[];
  /** A row's side padding: the card's in a card, less on a page. */
  inset?: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const list = useRef<HTMLUListElement | null>(null);
  const plot = useRef<HTMLDivElement | null>(null);
  const { rows, runs } = lanes;

  // The line's box in px, so a bend is the same few pixels however wide the
  // card is. Measured once before the first paint and then on resize only.
  //
  // Drawn at the size last measured and stretched to the box, which is the
  // same thing at rest. While the box is still changing (the frame glides for
  // a recording), the measure lands a frame late: at a fixed size the line
  // trailed the rows by a frame of the glide. Stretched, it stays on them; the
  // stroke does not stretch (`non-scaling-stroke`), and the dots are HTML
  // placed in percentages, so they are never late at all.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = plot.current;
    if (!element) return undefined;
    const measure = (next: number) => setWidth((previous) => (previous === next ? previous : next));
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rowOf = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);
  const height = rows.length * LANE_ROW_PX;
  const d = useMemo(() => lanePath({ runs, rows: rowOf, width }), [runs, rowOf, width]);
  const centre = (index: number) => index * LANE_ROW_PX + LANE_ROW_PX / 2;

  // Where the line ends while recording: now, on the topic the room is on.
  const last = runs[runs.length - 1];
  const now =
    live && last && rowOf.has(last.topic) ? { x: last.to, row: rowOf.get(last.topic) } : null;

  // Each question on the topic the room was on when it was asked, in the marks
  // every surface uses (`questionMarks.ts`). Rings first, so a settled mark is
  // drawn over an open ring it touches.
  const marks = useMemo(() => {
    if (!questions?.length || !(lanes.span > 0)) return [];
    return questions
      .flatMap((question) => {
        const run = runAt(lanes, question.at);
        if (!run || !rowOf.has(run.topic)) return [];
        const x = clamp01((question.at - lanes.start) / lanes.span);
        return [{ id: question.id, state: question.state, x, row: rowOf.get(run.topic) }];
      })
      .sort((a, b) => Number(markFill(b.state) === "ring") - Number(markFill(a.state) === "ring"));
  }, [questions, lanes, rowOf]);

  // While recording, the topic now stays in view: past eight rows the card
  // scrolls inside, and a new topic is a new row at the bottom. Only when the
  // topic changes, and only as far as needed.
  const nowTopic = live ? lanes.now : null;
  useEffect(() => {
    const element = list.current;
    const index = nowTopic == null ? undefined : rowOf.get(nowTopic);
    const scroller = scrollerOf(element);
    if (!element || index === undefined || !scroller) return;
    const top =
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop +
      index * LANE_ROW_PX;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + LANE_ROW_PX > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = top + LANE_ROW_PX - scroller.clientHeight;
    }
    // The row index moves with the topic; the rows only grow below it.
  }, [nowTopic, rowOf]);

  const locale = i18n.language;

  return (
    <ul
      ref={list}
      aria-label={t("oats.flow.lanesLabel")}
      // Label, line, minutes. The label column is as wide as the longest label,
      // up to 13rem or 30% of the card, whichever is less; the minutes as wide
      // as the longest minutes. A longer label is cut with an ellipsis.
      className={cn(
        "grid grid-cols-[fit-content(min(13rem,30%))_minmax(0,1fr)_max-content] gap-x-3",
        className
      )}
      style={{ gridTemplateRows: `repeat(${rows.length}, ${LANE_ROW_PX}px)` }}
    >
      {rows.map((row, index) => {
        const isSelected = row.id === selected;
        const isNow = live && row.id === lanes.now;
        // "Now" is where the line ends, so it is said of one row only.
        const state = stateLabel(t, isNow ? "live" : row.state === "live" ? "open" : row.state);
        const name =
          row.back > 0
            ? t("oats.flow.nodeNameBack", {
                label: row.label,
                state,
                back: t("oats.flow.back", { count: row.back }),
              })
            : t("oats.flow.nodeName", { label: row.label, state });
        return (
          <li
            key={row.id}
            className={cn(
              "col-span-full grid grid-cols-subgrid",
              index > 0 && "border-t border-border"
            )}
            style={{ gridRow: index + 1 }}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(row.id)}
              className={cn(
                "group col-span-full grid grid-cols-subgrid items-center text-left outline-none",
                inset,
                "transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none",
                "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
                isSelected && "bg-muted hover:bg-muted"
              )}
            >
              <span className="sr-only">{name}</span>
              <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "truncate text-[13px]",
                    isNow && "font-medium text-foreground",
                    !isNow &&
                      (live && !isSelected
                        ? "text-muted-foreground group-hover:text-foreground"
                        : "text-foreground")
                  )}
                >
                  {row.label}
                </span>
                {isNow && <Badge variant="brand">{t("oats.flow.state.live")}</Badge>}
              </span>
              {/* The line's column: the line itself is drawn over all rows. */}
              <span aria-hidden="true" />
              <span className="text-right text-[13px] tabular-nums text-muted-foreground">
                {formatSpan(row.durationMs, { locale })}
              </span>
            </button>
          </li>
        );
      })}
      <li
        aria-hidden="true"
        className="pointer-events-none relative col-start-2"
        style={{ gridRow: `1 / span ${rows.length}` }}
      >
        <div ref={plot} className="oats-lanes-draw absolute inset-0">
          {width > 0 && d && (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              className="absolute inset-0 overflow-visible"
            >
              <path
                d={d}
                fill="none"
                stroke="var(--color-muted-foreground)"
                strokeWidth={CHART.line}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {/* The chart's one dot (DESIGN.md §6): `CHART.dot` across in a
              `CHART.ring` ring of the card colour. A question's mark sits on
              a disc of the card colour that wide, so the line stops at its
              edge and never runs through an open ring, and two marks side by
              side stay apart. */}
          {marks.map((mark) => (
            <span
              key={mark.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-card"
              style={{ left: `${mark.x * 100}%`, top: centre(mark.row), padding: CHART.ring }}
            >
              <StateMark state={mark.state} className="block" />
            </span>
          ))}
          {now && (
            <span
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
              style={{
                left: `${now.x * 100}%`,
                top: centre(now.row),
                width: CHART.dot * 2,
                height: CHART.dot * 2,
                boxShadow: `0 0 0 ${CHART.ring}px var(--color-card)`,
              }}
            />
          )}
        </div>
      </li>
    </ul>
  );
}
