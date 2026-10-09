import { OUTCOME_FILL } from "../../helpers/conversationContour.mjs";
import type { QuestionOutcome } from "../../types/conversationEvents";

// One vocabulary for a question's mark, on every surface that draws one: the
// contour canvas, the question rail and the transcript margin. The shape says
// how settled the question is (`OUTCOME_FILL`), the colour repeats it.

export type MarkFill = "solid" | "half" | "ring";
export type MarkTone = "success" | "warning" | "muted";

/**
 * The colour per outcome. Red is not used: in Oats red means recording or
 * danger (DESIGN.md §2), and a question nobody could answer is neither.
 */
export const OUTCOME_TONE: Record<QuestionOutcome, MarkTone> = {
  answered: "success",
  denied: "warning",
  uncertain: "warning",
  asked: "muted",
  silence: "muted",
};

/** An outcome this build does not know is drawn as open, never as settled. */
export function markFill(state: string): MarkFill {
  return (OUTCOME_FILL as Record<string, MarkFill | undefined>)[state] ?? "ring";
}

export function markTone(state: string): MarkTone {
  return OUTCOME_TONE[state as QuestionOutcome] ?? "muted";
}

/** The CSS colour token per tone, for code that styles inline or reads it. */
export const TONE_TOKEN: Record<MarkTone, string> = {
  success: "--color-success",
  warning: "--color-warning",
  muted: "--color-muted-foreground",
};
