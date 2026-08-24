// What a finished conversation certainly contains, as distinct from what a
// model wrote about it.
//
// The reading view opened on the summary: prose from a local 1.5B model, which
// CLAUDE.md is explicit "frequently does not" succeed. That is the *inferred*
// account, and it was the first and only thing you saw. Underneath it Oats was
// already holding facts it knows exactly — which questions were asked, how each
// one came out, which ones it went and searched, and which threads were left
// open — and showing none of them.
//
// So this is the certain half, and it is deliberately small. It reports only
// what the aide observed and persisted; it does not infer decisions, it does not
// guess owners, and it does not summarise. Every item can name the turn it came
// from, which is the difference between a review and a second summary.
//
// What it does *not* do is as deliberate: no commitments, no action items, no
// owners. Detecting those means pattern-matching intent, and this product's
// posture on inference is set by the question rules — local patterns first, the
// model only refining, and a false positive treated as expensive. A commitment
// Oats invented and attributed to somebody in the room is exactly that kind of
// expensive, and it wants its own pass with its own evidence.
//
// Pure and DOM-free so the classification can be pinned rather than eyeballed.

import { buildConversationGraph, responseReason } from "./conversationGraph.mjs";

/** Outcomes that mean nobody in the room supplied an answer. */
const UNRESOLVED = new Set(["denied", "silence", "uncertain_response"]);

function outcomeOf(node) {
  const reason = responseReason(node.response);
  if (reason === "answered") return "answered";
  if (reason === "uncertain_response") return "uncertain";
  if (reason === "silence") return "silence";
  if (reason === "denied" || reason === "denied_knowledge") return "denied";
  // No response event at all: the question was asked and never resolved.
  return node.response ? "uncertain" : "open";
}

/**
 * @param {object} input
 * @param {Array} input.events Persisted conversation events for one note.
 * @param {Array} [input.topics] Topic nodes, for the threads left open.
 * @returns {{ unresolved: Array<{key: string, question: string, outcome: string,
 *   segmentId: string|null, searched: boolean, at: number}>,
 *   answered: number, asked: number, searched: number,
 *   openThreads: Array<{id: string|number, label: string}>, empty: boolean }}
 */
export function buildReview({ events, topics } = {}) {
  const nodes = buildConversationGraph(Array.isArray(events) ? events : []);

  let answered = 0;
  let searched = 0;
  const unresolved = [];

  for (const node of nodes) {
    if (!node.question) continue;
    const outcome = outcomeOf(node);
    const wasSearched = node.suggestion != null;
    if (wasSearched) searched += 1;
    if (outcome === "answered") {
      answered += 1;
      continue;
    }
    unresolved.push({
      key: node.key,
      question: String(node.question.text ?? "").trim(),
      outcome,
      // The turn it was asked in, so a review item is a place and not just a
      // sentence. Questions can span segments; the first is where it started.
      segmentId: node.question.segmentIds?.[0] ?? null,
      searched: wasSearched,
      at: node.createdAt,
    });
  }

  const asked = nodes.filter((node) => node.question).length;

  const openThreads = (Array.isArray(topics) ? topics : [])
    .filter((topic) => topic && (topic.state === "open" || topic.state === "dropped"))
    .map((topic) => ({ id: topic.id, label: String(topic.label ?? "").trim() }))
    .filter((topic) => topic.label);

  return {
    unresolved,
    answered,
    asked,
    searched,
    openThreads,
    empty: asked === 0 && openThreads.length === 0,
  };
}

export { UNRESOLVED };
