import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  buildThreadMap,
  dotSize,
  placeLabels,
  quotedUtterance,
} from "../../helpers/liveThreadMap.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { cn } from "../lib/utils";

// The live topic map (drawn while recording, Detailed composition).
//
// Where the open-thread stack answers "what is still owed" as a list, this
// answers "where has this conversation been" as a shape, so you can point at
// something raised twenty minutes ago and say "you mentioned X". It sits beside
// the stack rather than replacing it: the list is the readable version of the
// same data and is better under four subjects.
//
// **HTML nodes, not SVG text.** The first version drew labels inside a
// `viewBox="0 0 100 100"`, where a font-size is in user units and gets scaled by
// whatever the box happens to be: measured, five labels at a computed 3.4px with
// three of them overlapping. Only the connecting lines live in SVG now; every
// node is a real button with real type, a real hit target and real focus.
//
// Both axes are measurements (see `liveThreadMap.mjs`) — x is when a subject was
// first raised, y is how unsettled it still is. There is no simulation: a
// force-directed layout is an animation loop, and an animation loop during a
// recording is the defect this repository spent a day removing.

// The §4 thread-state vocabulary, the same one the topic graph and the stack
// speak: gold for the one subject being spoken, terracotta and dense grain for
// open, sage for resolved, husk and sparse grain for dropped. It used to fill
// every unsettled dot gold and outline a "settled" state the tracker never
// emits — so a resolved subject drew exactly like an open one, and a busy map
// put four golds on the live surface beside the seed (§3 allows one).
const THREAD_MARK: Record<string, { style: CSSProperties; className?: string }> = {
  live: { style: { backgroundColor: "var(--color-primary)" } },
  open: { style: { color: "var(--graph-open)" }, className: "oats-dither oats-dither--fine" },
  resolved: { style: { backgroundColor: "var(--graph-answered)", opacity: 0.6 } },
  dropped: {
    style: { color: "var(--graph-silence)" },
    className: "oats-dither oats-dither--sparse",
  },
};

/** The button's padding (`px-1.5 py-0.5`), between its edge and the dot. */
const BUTTON_PAD_X_PX = 6;
const BUTTON_PAD_Y_PX = 2;

/**
 * Where the button goes so that its *dot* lands on the point, for each place
 * `placeLabels` can put the words. The button used to be centred on the point
 * as a whole, so a subject's dot was drawn half a label to the left of when it
 * was raised and the connectors ended in the middle of its words.
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

export default function LiveThreadMap({ className }: { className?: string }) {
  const { t } = useTranslation();
  const snapshot = useMeetingRecordingStore((s) => s.topicSnapshot);
  const segments = useMeetingRecordingStore((s) => s.segments);
  const startedAt = useMeetingRecordingStore((s) => s.recordingStartedAt);
  const [selected, setSelected] = useState<number | null>(null);

  const map = useMemo(
    () => buildThreadMap({ snapshot, startedAt: startedAt ?? 0, now: Date.now() }),
    [snapshot, startedAt]
  );

  const point = useMemo(
    () => map.points.find((p: { id: number }) => p.id === selected) ?? null,
    [map, selected]
  );
  const quote = useMemo(() => quotedUtterance(point, segments), [point, segments]);

  // The box in px, so labels can be placed against each other. Measured on
  // resize only; nothing here runs per frame.
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
  }, [map.empty]);
  const placement = useMemo(() => placeLabels(map.points, size), [map.points, size]);

  if (map.empty) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div ref={box} className="relative h-36 w-full">
        {/* Connectors only. `preserveAspectRatio="none"` is fine for lines and
            would have been ruinous for text, which is why text left. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {map.links.map(
            (link: {
              from: number;
              to: number;
              x1: number;
              y1: number;
              x2: number;
              y2: number;
            }) => (
              <line
                key={`${link.from}-${link.to}`}
                x1={link.x1 * 100}
                y1={link.y1 * 100}
                x2={link.x2 * 100}
                y2={link.y2 * 100}
                stroke="var(--color-border)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
        </svg>

        <ul
          className="absolute inset-0"
          aria-label={t("oats.conversation.threadMapLabel", { count: map.points.length })}
        >
          {map.points.map(
            (p: { id: number; label: string; state: string; x: number; y: number; r: number }) => {
              const isSelected = p.id === selected;
              const size = dotSize(p);
              const { side, align, hidden } = placement.get(p.id) ?? {
                side: "right",
                align: "center",
                hidden: false,
              };
              const mark = THREAD_MARK[p.state] ?? THREAD_MARK.dropped;
              return (
                <li
                  key={p.id}
                  className="absolute"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : p.id)}
                    aria-pressed={isSelected}
                    title={hidden ? p.label : undefined}
                    style={{ transform: anchorTransform(side, align, size) }}
                    // 24px minimum, because it is a real target and WCAG 2.2
                    // asks for one. The dot inside carries the weight.
                    className={cn(
                      "flex min-h-6 rounded-xl px-1.5 py-0.5",
                      LAYOUT[side] ?? LAYOUT.right,
                      side === "left" || side === "right"
                        ? "items-center"
                        : (ALIGN[align] ?? ALIGN.center),
                      "font-mono text-[11px] leading-4 whitespace-nowrap transition-colors",
                      "[transition-duration:var(--motion-instant)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      // Size carries dwell; colour and grain carry state, so
                      // state survives greyscale.
                      className={cn("inline-block shrink-0 rounded-full", mark.className)}
                      style={{ ...mark.style, width: size, height: size }}
                    />
                    {/* Hidden when it has nowhere to go without covering another
                        subject's words; still the button's name, and its title. */}
                    <span className={hidden ? "sr-only" : undefined}>{p.label}</span>
                  </button>
                </li>
              );
            }
          )}
        </ul>
      </div>

      {/* Reserved height, so quoting does not shove the transcript below it down
          the page mid-sentence — §8 forbids layout shift while somebody is being
          helped. */}
      {/* A fixed height, not a minimum: a long quote wraps to three lines and a
          short one to one, so a minimum still moved the transcript below it
          every time a different topic was pressed. */}
      <p className="h-8 overflow-hidden font-mono text-xs leading-4 text-muted-foreground">
        {point && (
          <>
            <span className="text-foreground">{point.label}</span>
            {quote ? (
              <span> — “{quote.text.trim()}”</span>
            ) : (
              <span> — {t("oats.conversation.threadMapNoQuote")}</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
