// How a stored question came out: the one rule for every surface that reads a
// finished conversation's questions from its events.
//
// The contour, the review (with the transcript's margin and the line under a
// record's title), Connections and the note mirrored into the vault each used
// to map the stored events themselves, and they disagreed: a local "uncertain"
// reply drew as "denied" on the contour and as "asked" in Connections. They all
// read this now, so a question comes out the same everywhere.
//
// The vocabulary is DESIGN.md §6's, the one every question mark draws
// (`conversation/questionMarks.ts`). Pure and DOM-free, so `node:test` pins it
// row by row.

import { responseReason } from "./conversationGraph.mjs";

/** @typedef {"asked" | "answered" | "uncertain" | "silence" | "denied"} QuestionOutcome */

const OUTCOMES = new Set(["asked", "answered", "uncertain", "silence", "denied"]);

/**
 * A stored `reason`, as an outcome. The aide writes two vocabularies there: the
 * local reading of a reply writes its outcome, and the classifier writes a
 * reason from its own contract (`buildClassifierPrompt`).
 */
const REASON_OUTCOME = new Map([
  ["answered", "answered"],
  ["uncertain", "uncertain"],
  ["uncertain_response", "uncertain"],
  ["silence", "silence"],
  ["denied", "denied"],
  ["denied_knowledge", "denied"],
]);

/**
 * How a stored question came out.
 *
 * - No response event: the question never got a verdict, so it is `asked`.
 * - The response's `outcome`: the verdict the card showed live. The classifier
 *   overrides the local reading only when it is confident, so its `reason` can
 *   name a verdict the question never reached.
 * - No `outcome`: the response's `reason`. Responses written before `outcome`
 *   was kept carry only that.
 * - A verdict this build does not know is `asked`: an empty ring, never a
 *   settled mark.
 *
 * @param {{ response?: { metadata?: object } | null } | null} [node] A node from
 *   `buildConversationGraph`.
 * @returns {QuestionOutcome}
 */
export function questionOutcome(node) {
  const response = node?.response;
  if (!response) return "asked";
  const outcome = response.metadata?.outcome;
  if (outcome != null) return OUTCOMES.has(outcome) ? outcome : "asked";
  return REASON_OUTCOME.get(responseReason(response)) ?? "asked";
}
