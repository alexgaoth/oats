import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge, type BadgeProps } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { SegmentedControl } from "../ui/segmented";
import { cn } from "../lib/utils";
import {
  buildThreadMap,
  dotSize,
  placeLabels,
  quotedUtterance,
} from "../../helpers/liveThreadMap.mjs";
import {
  chooseFlowView,
  edgePath,
  flowShape,
  offsetClock,
  stackItems,
  suitableView,
} from "../../helpers/conversationFlow.mjs";
import { formatSpan } from "../../helpers/ledgerDate.mjs";
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
// Two views of the same topics. The stack is the topic now, then the ones
// before it, newest first. The graph is where the conversation has been: x is
// when a topic was first raised, y is how unsettled it still is (geometry in
// `liveThreadMap.mjs`), and a dashed honey curve is a move back to an earlier
// topic. Auto picks by the flow's shape and says why; the rule and its
// hysteresis are in `conversationFlow.mjs`.
//
// There is no animation and no loop. Positions are a function of the data and
// are recomputed only when the data changes.

/**
 * The tokens of the four thread states, shared by the stack and the graph.
 * Open is the normal state of a topic in a live conversation, so it is neutral:
 * colour is for the one being spoken (brand), the ones settled (green), and a
 * dropped one is a hollow ring. Amber would have turned every earlier topic into
 * a warning, and sat next to the brand honey at nearly the same hue.
 */
const DOT: Record<ThreadState, string> = {
  live: "bg-primary ring-4 ring-primary/20",
  open: "bg-foreground/60",
  resolved: "bg-success",
  dropped: "border border-muted-foreground/70 bg-transparent",
};

const BADGE: Record<ThreadState, BadgeProps["variant"]> = {
  live: "brand",
  open: "outline",
  resolved: "success",
  dropped: "secondary",
};

/** More rows than this and the stack hides the rest behind "Show N more". */
const STACK_LIMIT = 6;

/**
 * Inter at 13px, per character of a topic label. Measured over real labels:
 * 6.4 on average and 7.0 for the widest, and the estimate must not run short,
 * or two labels the placement thinks apart are drawn touching.
 */
const LABEL_CHAR_PX = 6.9;

/** Space between a dot's rim and the end of an edge, and the live dot's ring. */
const EDGE_GAP_PX = 3;
const LIVE_RING_PX = 4;

/** The node button's padding (`px-1.5 py-0.5`), between its edge and the dot. */
const BUTTON_PAD_X_PX = 6;
const BUTTON_PAD_Y_PX = 2;

const NO_SEGMENTS: TranscriptSegment[] = [];
const NO_SUGGESTIONS: ConversationSuggestion[] = [];

function stateLabel(t: TFunction, state: string): string {
  switch (state) {
    case "live":
      return t("oats.flow.state.live");
    case "open":
      return t("oats.flow.state.open");
    case "resolved":
      return t("oats.flow.state.resolved");
    default:
      return t("oats.flow.state.dropped");
  }
}

function captionFor(
  t: TFunction,
  reason: string | null,
  view: string,
  shape: { topics: number; returns: number }
): string | null {
  switch (reason) {
    // Auto is holding the shown view for a moment before it changes; no reason
    // for the shown view is true, so the caption only names it.
    case "held":
      return view === "graph" ? t("oats.flow.caption.graph") : t("oats.flow.caption.stack");
    case "few":
      return t("oats.flow.caption.few", { count: shape.topics });
    case "linear":
      return t("oats.flow.caption.linear");
    case "returns":
      return t("oats.flow.caption.returns", { count: shape.returns });
    case "branching":
      return t("oats.flow.caption.branching");
    default:
      return null;
  }
}

/**
 * Where a node's button goes so that its *dot* lands on the point, for each
 * place `placeLabels` can put the words.
 */
function anchorTransform(side: string, align: string, size: number): string {
  const x = BUTTON_PAD_X_PX + size / 2;
  const y = BUTTON_PAD_Y_PX + size / 2;
  if (side === "left") return `translate(calc(-100% + ${x}px), -50%)`;
  if (side === "right") return `translate(${-x}px, -50%)`;
  const dx = align === "start" ? `${-x}px` : align === "end" ? `calc(-100% + ${x}px)` : "-50%";
  const dy = side === "above" ? `calc(-100% + ${y}px)` : `${-y}px`;
  return `translate(${dx}, ${dy})`;
}

const LAYOUT: Record<string, string> = {
  right: "flex-row gap-1.5",
  left: "flex-row-reverse gap-1.5",
  above: "flex-col-reverse gap-0.5",
  below: "flex-col gap-0.5",
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
  r: number;
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
  const { t, i18n } = useTranslation();
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

  const mode = useSettingsStore((s) => s.conversationFlowView);
  const setMode = useSettingsStore((s) => s.setConversationFlowView);

  const shape = useMemo(() => flowShape(snapshot), [snapshot]);
  const items = useMemo(() => stackItems(snapshot), [snapshot]);
  const empty = items.length === 0;

  // Auto's choice, advanced once per snapshot (and per mode change), never per
  // render: the hysteresis counts snapshots, and React 19's StrictMode renders
  // twice. The updater is pure, so a double-invoked updater changes nothing.
  const [flow, setFlow] = useState(() =>
    chooseFlowView({ mode, previous: null, shape, now: Date.now() })
  );
  useEffect(() => {
    setFlow((current) => chooseFlowView({ mode, previous: current.state, shape, now: Date.now() }));
  }, [mode, shape]);
  // Between a change and the effect above, draw what the effect is about to
  // choose: a manual mode is its own view, and Auto with no view chosen yet
  // shows the suitable view at once, so pressing a segment never flashes the
  // old view.
  const fresh = suitableView(shape);
  const chosen = mode === "auto" && flow.state.view !== null;
  const view = mode !== "auto" ? mode : chosen ? flow.view : fresh.view;
  const reason = mode !== "auto" ? null : chosen ? flow.reason : fresh.reason;
  const caption = mode === "auto" && !empty ? captionFor(t, reason, view, shape) : null;

  const [selected, setSelected] = useState<number | null>(null);
  // The quote line's room is kept from the first press on, so pressing another
  // topic, or the same one again, never moves what is below. Before the first
  // press it takes no room: an empty band on the recording screen is a hole.
  const [quoting, setQuoting] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  const map = useMemo(
    () =>
      buildThreadMap({
        snapshot,
        startedAt: startedAt ?? 0,
        now: live ? Date.now() : lastActivity(snapshot),
      }) as { points: MapPoint[]; links: MapLink[]; empty: boolean },
    [snapshot, startedAt, live]
  );

  // The graph's box in px, so labels can be placed against each other and the
  // edges drawn in real pixels. Measured on resize only; nothing runs per frame.
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drawingGraph = view === "graph" && !empty;
  useEffect(() => {
    const element = box.current;
    if (!drawingGraph || !element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [drawingGraph]);
  const placement = useMemo(
    () => placeLabels(map.points, { ...size, charPx: LABEL_CHAR_PX }),
    [map.points, size]
  );

  // Subjects that kept company with this one in earlier conversations. The
  // other two kinds of suggestion are this conversation's own open topics, and
  // the stack and the graph already show those.
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

  const locale = i18n.language;
  const hiddenRows = Math.max(0, items.length - STACK_LIMIT);
  const rows = expanded ? items : items.slice(0, STACK_LIMIT);

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
        <SegmentedControl<ConversationFlowView>
          className="h-8"
          aria-label={t("oats.flow.viewLabel")}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "auto", label: t("oats.flow.mode.auto") },
            { value: "stack", label: t("oats.flow.mode.stack") },
            { value: "graph", label: t("oats.flow.mode.graph") },
          ]}
        />
      </CardHeader>

      {!empty && (
        <>
          <div className="min-h-0 overflow-y-auto border-t border-border">
            {view === "stack" ? (
              <>
                <ul aria-label={t("oats.flow.stackLabel")} className="divide-y divide-border">
                  {rows.map((item) => {
                    const isSelected = item.id === selected;
                    const isLive = item.state === "live";
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => toggle(item.id)}
                          className={cn(
                            "flex w-full items-center gap-3 px-5 py-3 text-left outline-none",
                            "transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none",
                            "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
                            isSelected && "bg-muted hover:bg-muted"
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              DOT[item.state] ?? DOT.dropped
                            )}
                          />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              isLive && "font-medium"
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge variant={BADGE[item.state] ?? "secondary"}>
                              {stateLabel(t, item.state)}
                            </Badge>
                            {item.returns > 0 && (
                              <Badge variant="info">
                                {t("oats.flow.back", { count: item.returns })}
                              </Badge>
                            )}
                            <span className="min-w-14 text-right text-[13px] tabular-nums text-muted-foreground">
                              {formatSpan(item.durationMs, { locale })}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hiddenRows > 0 && (
                  <div className="border-t border-border px-3 py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      onClick={() => setExpanded((current) => !current)}
                    >
                      {expanded ? (
                        <ChevronUp aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                      {expanded
                        ? t("oats.flow.showFewer")
                        : t("oats.flow.showMore", { count: hiddenRows })}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className={cn("px-5 pb-1", compact ? "pt-3" : "pt-4")}>
                <div ref={box} className={cn("relative w-full", compact ? "h-28" : "h-56")}>
                  {/* Edges only, in real pixels so the bow is a bow. The words
                      are HTML: SVG text in a stretched box scales with it. */}
                  {size.width > 0 && (
                    <svg
                      aria-hidden="true"
                      width={size.width}
                      height={size.height}
                      viewBox={`0 0 ${size.width} ${size.height}`}
                      className="absolute inset-0 overflow-visible"
                    >
                      {[...map.links]
                        // Returns on top: they are the mark worth reading.
                        .sort((a, b) => Number(a.kind === "return") - Number(b.kind === "return"))
                        .map((link) => {
                          const from = map.points.find((p) => p.id === link.from);
                          const to = map.points.find((p) => p.id === link.to);
                          const radius = (point: MapPoint | undefined) =>
                            point
                              ? dotSize(point) / 2 +
                                EDGE_GAP_PX +
                                (point.state === "live" ? LIVE_RING_PX : 0)
                              : 0;
                          const d = edgePath({
                            x1: link.x1 * size.width,
                            y1: link.y1 * size.height,
                            x2: link.x2 * size.width,
                            y2: link.y2 * size.height,
                            r1: radius(from),
                            r2: radius(to),
                          });
                          if (!d) return null;
                          // A move on is a quiet grey line; a return is the
                          // honey dash, a little heavier, because it is the
                          // mark the graph is for. The border token measured
                          // 1.2:1 on the card, which drew no line at all.
                          const back = link.kind === "return";
                          return (
                            <path
                              key={`${link.from}-${link.to}`}
                              d={d}
                              fill="none"
                              stroke={
                                back ? "var(--color-primary)" : "var(--color-muted-foreground)"
                              }
                              strokeOpacity={back ? 0.7 : 0.45}
                              strokeWidth={back ? 1.5 : 1}
                              strokeDasharray={back ? "4 3" : undefined}
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
                      const dot = dotSize(point);
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
                            onClick={() => toggle(point.id)}
                            style={{ transform: anchorTransform(side, align, dot) }}
                            // 24px minimum: a real target, as WCAG 2.2 asks.
                            className={cn(
                              "flex min-h-6 rounded-md px-1.5 py-0.5 text-[13px] leading-4 whitespace-nowrap",
                              LAYOUT[side] ?? LAYOUT.right,
                              side === "left" || side === "right"
                                ? "items-center"
                                : (ALIGN[align] ?? ALIGN.center),
                              "outline-none transition-colors duration-150 motion-reduce:transition-none",
                              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                              isSelected
                                ? "bg-muted text-foreground"
                                : isLive
                                  ? "font-medium text-foreground hover:bg-muted/60"
                                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                              isSelected && isLive && "font-medium"
                            )}
                          >
                            <span
                              aria-hidden="true"
                              // Size carries dwell; colour carries state.
                              className={cn(
                                "inline-block shrink-0 rounded-full",
                                DOT[point.state] ?? DOT.dropped
                              )}
                              style={{ width: dot, height: dot }}
                            />
                            {/* Hidden when it has nowhere to go without covering
                                another topic's words; still the button's title. */}
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
            )}
          </div>

          {/* A fixed height of two lines, so a long quote and a short one take
              the same room. */}
          {quoting && (
            <div className={cn("shrink-0 px-5", compact ? "pb-2 pt-1" : "pb-3 pt-2")}>
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
