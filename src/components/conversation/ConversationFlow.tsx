import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/badge";
import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { ViewSwitch } from "../ui/view-switch";
import { cn } from "../lib/utils";
import {
  DOT_PX,
  DOT_RING_PX,
  buildThreadMap,
  placeLabels,
  quotedUtterance,
} from "../../helpers/liveThreadMap.mjs";
import { edgePath, offsetClock } from "../../helpers/conversationFlow.mjs";
import { LANE_ROW_PX, topicLanes } from "../../helpers/topicLanes.mjs";
import TopicLanes, { LANE_ROWS_SHOWN, type Lanes } from "./TopicLanes";
import { flowCaption, flowViewOptions, stateLabel } from "./flowText";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";
import { useSettingsStore, type ConversationFlowView } from "../../stores/settingsStore";
import type {
  ConversationSuggestion,
  ConversationTopicSnapshot,
  ThreadState,
} from "../../types/conversationEvents";

// The conversation flow: what has been talked about so far, on the default
// recording screen.
//
// Topics, not words. The tracker moves to a new topic every few minutes, so this
// card changes at the pace of the conversation's subject, never at the pace of
// its sentences — which is what lets it sit in the Clean composition beside the
// clock and the contour.
//
// Two views of the same topics. The lanes (`TopicLanes`) are the default: one
// row per topic in the order raised, and one line for the room that ends at now
// and climbs back to an earlier row on a return. The graph is the alternative:
// x is when a topic was first raised, y is how unsettled it still is (geometry
// in `liveThreadMap.mjs`), and an ink curve is a move back to an earlier topic.
//
// There is no animation loop. Positions are a function of the data and are
// recomputed only when the data changes.

/**
 * The graph's dots (DESIGN.md §6): one size, in a ring of the card colour.
 * Honey is the topic now; a dropped topic is an empty ring; every other topic
 * is the quiet grey. Topics never take a status colour: green is for an
 * answered question, and a resolved topic is not one.
 */
const DOT: Record<ThreadState, string> = {
  live: "bg-primary",
  open: "bg-muted-foreground",
  resolved: "bg-muted-foreground",
  dropped: "border-[1.5px] border-muted-foreground bg-card",
};

/** Data lines are 1.5px (DESIGN.md §6). */
const LINE_PX = 1.5;

/**
 * Inter at 13px, per character of a topic label. Measured over real labels:
 * 6.4 on average and 7.0 for the widest, and the estimate must not run short,
 * or two labels the placement thinks apart are drawn touching.
 */
const LABEL_CHAR_PX = 6.9;

/** Space between a dot's ring and the end of an edge. */
const EDGE_GAP_PX = 2;

/** The node button's padding (`px-1.5 py-0.5`, `min-h-6`), which is the plate
 *  its label sits on: a plate must clear other labels and dots by this much. */
const BUTTON_PAD_X_PX = 6;
const BUTTON_PAD_Y_PX = 2;
const PLATE_Y_PX = 4;

const NO_SEGMENTS: TranscriptSegment[] = [];
const NO_SUGGESTIONS: ConversationSuggestion[] = [];

/**
 * Where a node's button goes so that its *dot* lands on the point, for each
 * place `placeLabels` can put the words.
 */
function anchorTransform(side: string, align: string): string {
  const x = BUTTON_PAD_X_PX + DOT_PX / 2;
  const y = BUTTON_PAD_Y_PX + DOT_PX / 2;
  if (side === "left") return `translate(calc(-100% + ${x}px), -50%)`;
  if (side === "right") return `translate(${-x}px, -50%)`;
  const dx = align === "start" ? `${-x}px` : align === "end" ? `calc(-100% + ${x}px)` : "-50%";
  const dy = side === "above" ? `calc(-100% + ${y}px)` : `${-y}px`;
  return `translate(${dx}, ${dy})`;
}

// The gap between dot and words is the ring plus the placement's gap, so the
// words land where `placeLabels` measured them.
const LAYOUT: Record<string, string> = {
  right: "flex-row gap-2",
  left: "flex-row-reverse gap-2",
  above: "flex-col-reverse gap-1",
  below: "flex-col gap-1",
};

const ALIGN: Record<string, string> = {
  center: "items-center",
  start: "items-start",
  end: "items-end",
};

interface MapPoint {
  id: number;
  label: string;
  state: ThreadState;
  returns: number;
  durationMs: number;
  x: number;
  y: number;
}

interface MapLink {
  from: number;
  to: number;
  kind: "new" | "return";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ThreadMap {
  points: MapPoint[];
  links: MapLink[];
  empty: boolean;
}

/** The last moment a stored snapshot covers, which ends its x axis. */
function lastActivity(snapshot: ConversationTopicSnapshot | null): number {
  let last = 0;
  for (const node of snapshot?.nodes ?? []) last = Math.max(last, node?.lastAt ?? 0);
  return last;
}

/** The first moment a stored snapshot covers, which starts its x axis. */
function firstActivity(snapshot: ConversationTopicSnapshot | null): number {
  let first = Infinity;
  for (const node of snapshot?.nodes ?? []) first = Math.min(first, node?.firstAt ?? Infinity);
  return Number.isFinite(first) ? first : 0;
}

export default function ConversationFlow({
  snapshot: snapshotProp,
  segments: segmentsProp,
  startedAt: startedAtProp,
  suggestions: suggestionsProp,
  compact = false,
  className,
}: {
  /** A stored conversation's topics. Omitted, the live recording's. */
  snapshot?: ConversationTopicSnapshot | null;
  segments?: TranscriptSegment[];
  startedAt?: number | null;
  suggestions?: ConversationSuggestion[];
  /** Beside the live dialogue (the Detailed composition): a shorter graph, so
   *  the words being said keep most of the column. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();

  const storeSnapshot = useMeetingRecordingStore((s) => s.topicSnapshot);
  const storeSegments = useMeetingRecordingStore((s) => s.segments);
  const storeStartedAt = useMeetingRecordingStore((s) => s.recordingStartedAt);
  const storeSuggestions = useMeetingRecordingStore((s) => s.suggestions);
  const live = snapshotProp === undefined;
  const snapshot = live ? storeSnapshot : snapshotProp;
  const segments = segmentsProp ?? storeSegments ?? NO_SEGMENTS;
  const startedAt =
    startedAtProp !== undefined ? startedAtProp : live ? storeStartedAt : firstActivity(snapshot);
  const suggestions = suggestionsProp ?? storeSuggestions ?? NO_SUGGESTIONS;

  const view = useSettingsStore((s) => s.conversationFlowView);
  const setView = useSettingsStore((s) => s.setConversationFlowView);

  // Recomputed when a topic or an utterance lands, never per frame. While
  // recording the axis runs from the press to now, so the line ends at now.
  const lanes = useMemo(
    () =>
      topicLanes({
        snapshot,
        segments,
        start: live && typeof startedAt === "number" ? startedAt : Number.NaN,
        end: live ? Date.now() : Number.NaN,
        live,
      }) as Lanes,
    [snapshot, segments, startedAt, live]
  );
  const map = useMemo(
    () =>
      buildThreadMap({
        snapshot,
        startedAt: startedAt ?? 0,
        now: live ? Date.now() : lastActivity(snapshot),
      }) as ThreadMap,
    [snapshot, startedAt, live]
  );
  const empty = lanes.empty;
  const caption = flowCaption(
    t,
    view === "graph"
      ? {
          topics: map.points.length,
          returns: map.links.filter((link) => link.kind === "return").length,
        }
      : { topics: lanes.rows.length, returns: lanes.returns.length }
  );

  const [selected, setSelected] = useState<number | null>(null);
  // The quote line's room is kept from the first press on, so pressing another
  // topic, or the same one again, never moves what is below. Before the first
  // press it takes no room: an empty band on the recording screen is a hole.
  const [quoting, setQuoting] = useState(false);
  const toggle = (id: number) => {
    setQuoting(true);
    setSelected((current) => (current === id ? null : id));
  };

  const selectedNode = useMemo(
    () => snapshot?.nodes?.find((node) => node?.id === selected) ?? null,
    [snapshot, selected]
  );
  const quote = useMemo(
    () => quotedUtterance(selectedNode, segments) as TranscriptSegment | null,
    [selectedNode, segments]
  );
  const quoteAt =
    quote && typeof quote.timestamp === "number" && typeof startedAt === "number"
      ? offsetClock(quote.timestamp - startedAt)
      : "";

  // Subjects that kept company with this one in earlier conversations. The
  // other two kinds of suggestion are this conversation's own open topics, and
  // the lanes and the graph already show those.
  const earlier = useMemo(() => {
    const seen = new Set<string>();
    return suggestions.filter((suggestion) => {
      if (suggestion.kind !== "adjacent" || !suggestion.label || seen.has(suggestion.label)) {
        return false;
      }
      seen.add(suggestion.label);
      return true;
    });
  }, [suggestions]);

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn("gap-0 overflow-hidden", className)}
    >
      <CardHeader className="shrink-0 flex-row items-start justify-between gap-4 pb-4">
        <div className="flex min-h-8 min-w-0 flex-col justify-center gap-1.5">
          <CardTitle id={titleId}>{t("oats.flow.title")}</CardTitle>
          {caption && <p className="text-[13px] text-muted-foreground">{caption}</p>}
          {empty && <p className="text-sm text-muted-foreground">{t("oats.flow.empty")}</p>}
        </div>
        {/* How topics are drawn changes what this card shows, so it is one of
            the few choices drawn with character (DESIGN.md §2). */}
        <ViewSwitch<ConversationFlowView>
          className="h-8"
          aria-label={t("oats.flow.viewLabel")}
          value={view}
          onValueChange={setView}
          options={flowViewOptions(t)}
        />
      </CardHeader>

      {!empty && (
        <>
          {/* Past eight rows the lanes scroll here, as the Detailed
              composition's shorter card already does. Half a row more shows
              that there is more. */}
          <div
            className="min-h-0 overflow-y-auto border-t border-border"
            style={
              view === "lanes" ? { maxHeight: (LANE_ROWS_SHOWN + 0.5) * LANE_ROW_PX } : undefined
            }
          >
            {view === "lanes" ? (
              <TopicLanes lanes={lanes} selected={selected} onSelect={toggle} live={live} />
            ) : (
              <FlowGraph map={map} compact={compact} selected={selected} onSelect={toggle} />
            )}
          </div>

          {/* A fixed height of two lines, so a long quote and a short one take
              the same room. */}
          {quoting && (
            <div
              className={cn(
                "shrink-0 border-t border-border px-5",
                compact ? "pb-2 pt-2" : "pb-3 pt-2.5"
              )}
            >
              <p className="line-clamp-2 h-10 text-[13px] leading-5 text-muted-foreground">
                {selectedNode && (
                  <>
                    <span className="font-medium text-foreground">{selectedNode.label}</span>
                    {quoteAt && <span className="ml-2 tabular-nums">{quoteAt}</span>}
                    <span className="ml-2">
                      {quote
                        ? t("oats.flow.quote", { text: String(quote.text ?? "").trim() })
                        : t("oats.flow.noQuote")}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}

      {earlier.length > 0 && (
        <CardFooter className="shrink-0 flex-wrap gap-2 text-[13px] text-muted-foreground">
          <span>{t("oats.flow.earlier")}</span>
          {earlier.map((suggestion) => (
            <Badge key={suggestion.label} variant="outline">
              {suggestion.label}
            </Badge>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * The graph: where the conversation has been. x is when a topic was first
 * raised, y how unsettled it still is. Every link is a 1.5px solid curve: a
 * move on in the quiet grey, a return in ink, drawn on top because it is the
 * mark worth reading. The words sit on plates in the card colour, so no link
 * crosses them, and `placeLabels` keeps the plates off each other's words.
 */
function FlowGraph({
  map,
  compact,
  selected,
  onSelect,
}: {
  map: ThreadMap;
  compact: boolean;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();

  // The graph's box in px, so labels can be placed against each other and the
  // edges drawn in real pixels. Measured on resize only; nothing runs per frame.
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const placement = useMemo(
    () =>
      placeLabels(map.points, {
        ...size,
        charPx: LABEL_CHAR_PX,
        plateX: BUTTON_PAD_X_PX,
        plateY: PLATE_Y_PX,
      }),
    [map.points, size]
  );

  // Where an edge stops short of a dot: its ring, and a little air.
  const reach = DOT_PX / 2 + DOT_RING_PX + EDGE_GAP_PX;

  return (
    <div className={cn("px-5 pb-1", compact ? "pt-3" : "pt-4")}>
      <div ref={box} className={cn("relative w-full", compact ? "h-28" : "h-56")}>
        {/* Edges only, in real pixels so the bow is a bow. The words are HTML:
            SVG text in a stretched box scales with it.

            Drawn at the size last measured and stretched to the box, which is
            the same thing at rest. While the box is still changing (the frame
            glides for a recording), the measure lands a frame late: at a fixed
            size the edges trailed the topics by a frame of the glide, tens of
            pixels. Stretched, their ends stay on the dots. */}
        {size.width > 0 && (
          <svg
            aria-hidden="true"
            width="100%"
            height="100%"
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 overflow-visible"
          >
            {[...map.links]
              // Returns on top: they are the mark worth reading.
              .sort((a, b) => Number(a.kind === "return") - Number(b.kind === "return"))
              .map((link) => {
                const d = edgePath({
                  x1: link.x1 * size.width,
                  y1: link.y1 * size.height,
                  x2: link.x2 * size.width,
                  y2: link.y2 * size.height,
                  r1: reach,
                  r2: reach,
                });
                if (!d) return null;
                return (
                  <path
                    key={`${link.from}-${link.to}`}
                    d={d}
                    fill="none"
                    stroke={
                      link.kind === "return"
                        ? "var(--color-foreground)"
                        : "var(--color-muted-foreground)"
                    }
                    strokeWidth={LINE_PX}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
          </svg>
        )}
        <ul
          className="absolute inset-0"
          aria-label={t("oats.flow.graphLabel", { count: map.points.length })}
        >
          {map.points.map((point) => {
            const isSelected = point.id === selected;
            const isLive = point.state === "live";
            const { side, align, hidden } = placement.get(point.id) ?? {
              side: "right",
              align: "center",
              hidden: false,
            };
            const state = stateLabel(t, point.state);
            const name =
              point.returns > 0
                ? t("oats.flow.nodeNameBack", {
                    label: point.label,
                    state,
                    back: t("oats.flow.back", { count: point.returns }),
                  })
                : t("oats.flow.nodeName", { label: point.label, state });
            return (
              <li
                key={point.id}
                className="absolute"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={name}
                  title={hidden ? point.label : undefined}
                  onClick={() => onSelect(point.id)}
                  style={{ transform: anchorTransform(side, align) }}
                  // 24px minimum: a real target, as WCAG 2.2 asks. The button is
                  // the label's plate: opaque, in the card colour.
                  className={cn(
                    "group flex min-h-6 rounded-md px-1.5 py-0.5 text-[13px] leading-4 whitespace-nowrap",
                    LAYOUT[side] ?? LAYOUT.right,
                    side === "left" || side === "right"
                      ? "items-center"
                      : (ALIGN[align] ?? ALIGN.center),
                    "outline-none transition-colors duration-150 motion-reduce:transition-none",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isSelected
                      ? "bg-muted text-foreground"
                      : isLive
                        ? "bg-card font-medium text-foreground hover:bg-muted"
                        : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    isSelected && isLive && "font-medium"
                  )}
                >
                  {/* The ring is the plate's colour, so it shows only where
                      the dot meets something else. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block size-2 shrink-0 rounded-full ring-2",
                      isSelected ? "ring-muted" : "ring-card group-hover:ring-muted",
                      DOT[point.state] ?? DOT.dropped
                    )}
                  />
                  {/* Hidden when it has nowhere to go without covering another
                      topic's words; still the button's title. */}
                  <span aria-hidden="true" className={hidden ? "sr-only" : undefined}>
                    {point.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
