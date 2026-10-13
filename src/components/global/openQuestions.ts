// The Open questions widget's rows: every question in a tab's conversations
// that has no verdict, newest first.
//
// "No verdict" is the empty ring of the question marks' one vocabulary
// (`conversation/questionMarks.ts`): asked and never answered, or met with
// silence. A question somebody said they did not know, or answered with a
// hedge, has a verdict, and is not here. The outcome is read by the app's own
// review (`helpers/conversationReview.mjs`), so this list cannot disagree with
// the marks in a transcript's margin.

import { buildReview } from "../../helpers/conversationReview.mjs";

/** Outcomes with no verdict. */
const NO_VERDICT = new Set(["open", "silence"]);

export interface OpenQuestionRow {
  key: string;
  noteId: number;
  question: string;
  /** The turn it was asked in, to open the conversation there. */
  segmentId: string | null;
  /** When it was asked, epoch ms. */
  at: number;
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
      if (!NO_VERDICT.has(item.outcome) || !item.question) continue;
      rows.push({
        key: `${noteId}:${item.key}`,
        noteId,
        question: item.question,
        segmentId: item.segmentId,
        at: Number(item.at) || 0,
      });
    }
  }
  rows.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  return rows.slice(0, limit);
}
