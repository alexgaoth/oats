import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import type { QuestionOutcome } from "../../types/conversationEvents";
import type { ContourData } from "./ConversationContour";
import { StateMark } from "./ConversationSignalRail";
import { markFill } from "./questionMarks";

// The key to a contour. It lists only what this contour actually draws, the way
// a chart legend lists only the series it plots: a conversation with no marked
// moments does not explain the caret. Each swatch is drawn the way the canvas
// draws that thing, so the key and the chart cannot disagree.

/** Settled first, open last: the order a reader scans for. */
const STATES: { state: QuestionOutcome; label: string }[] = [
  { state: "answered", label: "questionCard.state.answered" },
  { state: "denied", label: "questionCard.state.denied" },
  { state: "uncertain", label: "questionCard.state.uncertain" },
  { state: "asked", label: "oats.conversation.legend.open" },
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
  const drawn = new Set(
    contour.marks.map((mark) => (markFill(mark.state) === "ring" ? "asked" : mark.state))
  );
  const states = STATES.filter((entry) => drawn.has(entry.state));
  const hasShifts = contour.shifts.length > 0;
  const hasReturns = contour.returns.length > 0;
  const hasMoments = (contour.moments?.length ?? 0) > 0;
  if (!states.length && !hasShifts && !hasReturns && !hasMoments) return null;

  const row = "flex flex-wrap items-center gap-x-4 gap-y-1.5";
  return (
    // Two rows with one meaning each: how the questions ended, then the shape
    // of the conversation. A single wrapping row broke wherever the width fell.
    <div
      role="group"
      aria-label={t("oats.conversation.legend.label")}
      className={cn("space-y-1.5 text-xs text-muted-foreground", className)}
    >
      {states.length > 0 && (
        <ul className={row}>
          {states.map(({ state, label }) => (
            <Item key={state} swatch={<StateMark state={state} className="" />} label={t(label)} />
          ))}
        </ul>
      )}
      {(hasShifts || hasReturns || hasMoments) && (
        <ul className={row}>
          {hasShifts && (
            <Item
              label={t("oats.conversation.legend.topic")}
              swatch={
                <Swatch>
                  <line x1="0" y1="7.5" x2="12" y2="7.5" className="stroke-border" />
                  <line x1="6" y1="4" x2="6" y2="12" className="stroke-muted-foreground" />
                </Swatch>
              }
            />
          )}
          {hasReturns && (
            <Item
              label={t("oats.conversation.legend.return")}
              swatch={
                <Swatch>
                  <path
                    d="M1 11 C1 3 11 3 11 11"
                    fill="none"
                    className="stroke-muted-foreground"
                    strokeOpacity={0.4}
                  />
                </Swatch>
              }
            />
          )}
          {hasMoments && (
            <Item
              label={t("oats.conversation.legend.marked")}
              swatch={
                <Swatch>
                  <path
                    d="M6 3.5 L9.5 9.5 L2.5 9.5 Z"
                    className="fill-foreground"
                    fillOpacity={0.8}
                  />
                </Swatch>
              }
            />
          )}
        </ul>
      )}
    </div>
  );
}
