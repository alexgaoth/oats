import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { QuestionOutcome } from "../../types/conversationEvents";
import type { ContourData } from "./ConversationContour";
import { StateMark } from "./StateMark";
import { markKind, type MarkKind } from "./questionMarks";

// The key to a contour. It lists only what this contour actually draws, the way
// a chart legend lists only the series it plots: a conversation with no marked
// moments does not explain the caret. Each swatch is drawn the way the canvas
// draws that thing (DESIGN.md §6), so the key and the chart cannot disagree.

/** Settled first, open last: the order a reader scans for. */
const KINDS: { kind: MarkKind; state: QuestionOutcome; label: string }[] = [
  { kind: "answered", state: "answered", label: "questionCard.state.answered" },
  { kind: "unknown", state: "denied", label: "questionCard.state.denied" },
  { kind: "hedged", state: "uncertain", label: "questionCard.state.uncertain" },
  { kind: "open", state: "asked", label: "oats.conversation.legend.open" },
];

function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0 overflow-visible">
      {children}
    </svg>
  );
}

function Item({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      {swatch}
      <span>{label}</span>
    </li>
  );
}

export default function ContourLegend({
  contour,
  className,
}: {
  contour: ContourData;
  className?: string;
}) {
  const { t } = useTranslation();
  if (contour.empty) return null;

  // Asked and silence share the ring, so they share one entry.
  const drawn = new Set(contour.marks.map((mark) => markKind(mark.state)));
  const kinds = KINDS.filter((entry) => drawn.has(entry.kind));
  const hasShifts = contour.shifts.length > 0;
  const hasMoments = (contour.moments?.length ?? 0) > 0;
  if (!kinds.length && !hasShifts && !hasMoments) return null;

  // One row: how the questions ended, then the shape marks.
  return (
    <ul
      aria-label={t("oats.conversation.legend.label")}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {kinds.map(({ kind, state, label }) => (
        <Item key={kind} swatch={<StateMark state={state} className="" />} label={t(label)} />
      ))}
      {hasShifts && (
        <Item
          label={t("oats.conversation.legend.topic")}
          swatch={
            <Swatch>
              <line x1="0" y1="7.5" x2="12" y2="7.5" className="stroke-border" />
              <line x1="6.5" y1="4" x2="6.5" y2="11" className="stroke-muted-foreground" />
            </Swatch>
          }
        />
      )}
      {hasMoments && (
        <Item
          label={t("oats.conversation.legend.marked")}
          swatch={
            <Swatch>
              <path d="M6 3.5 L9.5 9.5 L2.5 9.5 Z" className="fill-foreground" />
            </Swatch>
          }
        />
      )}
    </ul>
  );
}
