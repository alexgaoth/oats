// The Open questions widget's rows: every question in a tab's conversations
// that was left open, newest first.
//
// "Left open" is what Home counts as open (`openQuestionCount`, stored on the
// note as `notes.open_questions`): asked and never answered, met with silence,
// or met with "I don't know". A hedged answer is an answer of a kind, and an
// answered question is settled; neither is here. The outcome is read by the
// app's own review (`helpers/conversationReview.mjs`), so this list cannot
// disagree with the count on Home or with the marks in a transcript's margin,
// and each row carries its state for the one mark component
// (`StateMark`, read through `markKind`'s fill and tone).

import { buildReview } from "../../helpers/conversationReview.mjs";
import type { QuestionOutcome } from "../../types/conversationEvents";

/**
 * The review's outcomes Home counts as open, each with the state its mark is
 * drawn from: no verdict and silence are an empty ring, nobody knew is the
 * filled warning mark ("unknown").
 */
const LEFT_OPEN = new Map<string, QuestionOutcome>([
  ["open", "asked"],
  ["silence", "silence"],
  ["denied", "denied"],
]);

export interface OpenQuestionRow {
  key: string;
  noteId: number;
  question: string;
  /** The turn it was asked in, to open the conversation there. */
  segmentId: string | null;
  /** When it was asked, epoch ms. */
  at: number;
  /** How it was left, in the marks' vocabulary: "asked", "silence" or "denied". */
  state: QuestionOutcome;
}

export function openQuestionRows(
  eventsByConversation: Map<number, unknown[]>,
  limit = 100
): OpenQuestionRow[] {
  const rows: OpenQuestionRow[] = [];
  for (const [noteId, events] of eventsByConversation) {
    const review = buildReview({ events }) as {
      unresolved: {
        key: string;
        question: string;
        outcome: string;
        segmentId: string | null;
        at: number;
      }[];
    };
    for (const item of review.unresolved) {
      const state = LEFT_OPEN.get(item.outcome);
      if (!state || !item.question) continue;
      rows.push({
        key: `${noteId}:${item.key}`,
        noteId,
        question: item.question,
        segmentId: item.segmentId,
        at: Number(item.at) || 0,
        state,
      });
    }
  }
  rows.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  return rows.slice(0, limit);
}
