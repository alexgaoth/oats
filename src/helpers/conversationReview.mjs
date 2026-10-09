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

import { buildConversationGraph, responseReason, suggestionState } from "./conversationGraph.mjs";

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
 *   answers: Array<{key: string, question: string, reply: string,
 *   segmentId: string|null}>,
 *   answered: number, asked: number, searched: number,
 *   openThreads: Array<{id: string|number, label: string}>, empty: boolean }}
 */
export function buildReview({ events, topics } = {}) {
  const nodes = buildConversationGraph(Array.isArray(events) ? events : []);

  let answered = 0;
  let searched = 0;
  const unresolved = [];
  // The answered questions, with the words that answered them. Verbatim: the
  // response event carries the turns that followed the question, so this
  // quotes the room rather than inferring anything about it.
  const answers = [];

  for (const node of nodes) {
    if (!node.question) continue;
    const outcome = outcomeOf(node);
    // Opened, not offered. Every question that was not answered gets a
    // suggestion row at `shown`, so counting rows marked a question "searched"
    // when nothing was ever sent — and an automatic search that failed stays at
    // `shown` too. "Searched" is a network claim, and this product states those
    // exactly or not at all.
    const wasSearched = suggestionState(node.suggestion) === "opened";
    if (wasSearched) searched += 1;
    if (outcome === "answered") {
      answered += 1;
      answers.push({
        key: node.key,
        question: String(node.question.text ?? "").trim(),
        reply: String(node.response?.text ?? "").trim(),
        // Where the answer was said, falling back to where it was asked.
        segmentId: node.response?.segmentIds?.[0] ?? node.question.segmentIds?.[0] ?? null,
      });
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
    answers,
    answered,
    asked,
    searched,
    openThreads,
    empty: asked === 0 && openThreads.length === 0,
  };
}

/**
 * Which turns asked a question, and how each came out — for the transcript's
 * margin. Keyed by the segment the question started in.
 *
 * @returns {Map<string, string>} segment id → "answered" | "uncertain" |
 *   "silence" | "denied" | "open"
 */
export function questionTurns(events) {
  const turns = new Map();
  for (const node of buildConversationGraph(Array.isArray(events) ? events : [])) {
    const segmentId = node.question?.segmentIds?.[0];
    if (segmentId == null || turns.has(String(segmentId))) continue;
    turns.set(String(segmentId), outcomeOf(node));
  }
  return turns;
}

export { UNRESOLVED };
