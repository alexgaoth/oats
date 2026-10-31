import { cn } from "../lib/utils";
import type { QuestionOutcome } from "../../types/conversationEvents";
import { markFill, markTone, type MarkTone } from "./questionMarks";

// The mark's shape and colour come from `questionMarks.ts`, the vocabulary the
// contour canvas draws in too, so the rail, the transcript margin and the trace
// above them cannot drift apart.
const TONE_CLASS: Record<MarkTone, { fill: string; soft: string; ring: string }> = {
  success: { fill: "bg-success", soft: "bg-success/35", ring: "border-success" },
  warning: { fill: "bg-warning", soft: "bg-warning/35", ring: "border-warning" },
  muted: {
    fill: "bg-muted-foreground",
    soft: "bg-muted-foreground/35",
    ring: "border-muted-foreground",
  },
};

/**
 * A question's state mark, always a complete circle of one size: filled when
 * settled, a soft fill inside a ring when the answer was hedged, an empty ring
 * when nobody gave a verdict.
 *
 * One mark component for every surface that draws one (the question rail, the
 * transcript's margin, the lanes, the contour's key), so they cannot drift
 * apart. Its own module, with no store behind it, so the demo pieces
 * (`components/demo/`) can draw it outside the app.
 */
export function StateMark({
  state,
  className = "mt-[5px]",
}: {
  state: QuestionOutcome;
  /** Placement only; the default aligns it with the rail's first line. */
  className?: string;
}) {
  const fill = markFill(state);
  const tone = TONE_CLASS[markTone(state)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        fill === "solid" && tone.fill,
        fill !== "solid" && cn("border-[1.5px]", tone.ring),
        fill === "soft" && tone.soft,
        className
      )}
    />
  );
}
