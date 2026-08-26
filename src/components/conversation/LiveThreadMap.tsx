import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildThreadMap, quotedUtterance } from "../../helpers/liveThreadMap.mjs";
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

  if (map.empty) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative h-36 w-full">
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
              return (
                <li
                  key={p.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : p.id)}
                    aria-pressed={isSelected}
                    // 24px minimum, because it is a real target and WCAG 2.2
                    // asks for one. The dot inside carries the weight.
                    className={cn(
                      "flex min-h-6 items-center gap-1.5 rounded-full px-1.5 py-0.5",
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
                      // State survives greyscale: unfinished is filled, settled
                      // is an outline. Size carries dwell.
                      className={cn(
                        "inline-block shrink-0 rounded-full border border-primary",
                        p.state === "settled" ? "bg-transparent" : "bg-primary"
                      )}
                      style={{ width: 5 + p.r * 5, height: 5 + p.r * 5 }}
                    />
                    {p.label}
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
      <p className="min-h-8 font-mono text-xs leading-4 text-muted-foreground">
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
