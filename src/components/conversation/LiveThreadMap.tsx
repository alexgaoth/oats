import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildThreadMap, quotedUtterance } from "../../helpers/liveThreadMap.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { cn } from "../lib/utils";

// The live thread map (drawn while recording, Detailed only).
//
// Where the open-thread stack answers "what is still owed" as a list, this
// answers "where has this conversation been" as a shape — so you can point at
// something raised twenty minutes ago and say "you mentioned X". It sits beside
// the stack rather than replacing it: the list is the accessible reading of the
// same data, and under four subjects a list is simply better than a picture.
//
// SVG, not canvas, and no animation loop: it re-renders when the topics change
// and at no other time. Both axes are measurements (see `liveThreadMap.mjs`) —
// x is when a subject was raised, y is how unsettled it still is.

const VIEW = 100;

export default function LiveThreadMap({ className }: { className?: string }) {
  const { t } = useTranslation();
  const snapshot = useMeetingRecordingStore((s) => s.topicSnapshot);
  const segments = useMeetingRecordingStore((s) => s.segments);
  const startedAt = useMeetingRecordingStore((s) => s.recordingStartedAt);
  const [selected, setSelected] = useState<number | null>(null);

  // `now` is read at build time rather than on a timer: the axis only needs to
  // be right when the shape changes, and a ticking clock here would be an
  // animation loop wearing a different hat.
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
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        // Presented as an image with a name, not as an unlabelled graphic: the
        // thread list beside it is the readable version, so this does not try
        // to narrate itself node by node.
        role="img"
        aria-label={t("oats.conversation.threadMapLabel", { count: map.points.length })}
        className="h-28 w-full overflow-visible"
      >
        {map.links.map(
          (link: { from: number; to: number; x1: number; y1: number; x2: number; y2: number }) => (
            <line
              key={`${link.from}-${link.to}`}
              x1={link.x1 * VIEW}
              y1={link.y1 * VIEW}
              x2={link.x2 * VIEW}
              y2={link.y2 * VIEW}
              stroke="var(--color-border)"
              strokeWidth={0.4}
            />
          )
        )}
        {map.points.map(
          (p: { id: number; label: string; state: string; x: number; y: number; r: number }) => {
            const isSelected = p.id === selected;
            return (
              <g key={p.id}>
                <circle
                  cx={p.x * VIEW}
                  cy={p.y * VIEW}
                  r={p.r * 3.2}
                  // State survives greyscale: an unfinished thread is filled,
                  // a settled one is an outline. Colour alone would carry it
                  // for nobody who cannot see colour (§4).
                  fill={p.state === "settled" ? "transparent" : "var(--color-primary)"}
                  fillOpacity={p.state === "dropped" ? 0.9 : 0.55}
                  stroke="var(--color-primary)"
                  strokeWidth={isSelected ? 0.9 : 0.4}
                  className="cursor-pointer"
                  onClick={() => setSelected(isSelected ? null : p.id)}
                />
                <text
                  x={p.x * VIEW}
                  y={p.y * VIEW - p.r * 3.2 - 1.6}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-muted-foreground"
                  style={{ fontSize: 3.4 }}
                >
                  {p.label}
                </text>
              </g>
            );
          }
        )}
      </svg>

      {/* The reason the map is pressable at all. Reserved height, so quoting
          does not shove the transcript below it down the page mid-sentence —
          §8 forbids layout shift while somebody is being helped. */}
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
