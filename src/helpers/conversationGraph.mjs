// Pure helpers that turn the conversation aide's flat, time-ordered event list
// (see database.js: conversation_events) into the grouped structure the graph
// view renders. Kept as a dependency-free ES module — no React, no Electron — so
// it can be unit-tested with node:test the same way conversationAide.mjs is.

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function suggestionState(event) {
  const state = event?.metadata?.state;
  if (state === "shown" || state === "opened" || state === "dismissed" || state === "expired") {
    return state;
  }
  return null;
}

function suggestionQuery(event) {
  if (!event) return null;
  return readString(event.metadata?.query) ?? readString(event.text);
}

function questionConfidence(event) {
  const value = event?.metadata?.confidence;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function responseReason(event) {
  return readString(event?.metadata?.reason);
}

// Groups a note's time-ordered events into question nodes. Responses and
// suggestions attach to their parent question by `parentEventId`; anything whose
// parent is absent becomes its own node so orphans stay visible. Nodes keep the
// input time order (ascending) via the earliest contained event.
function buildConversationGraph(events) {
  const list = Array.isArray(events) ? events : [];
  const questions = new Map();
  const orphans = [];

  for (const event of list) {
    if (event.kind !== "question") continue;
    questions.set(event.id, {
      key: `q${event.id}`,
      question: event,
      response: null,
      suggestion: null,
      createdAt: event.createdAt,
    });
  }

  for (const event of list) {
    if (event.kind === "question") continue;
    const parent = event.parentEventId != null ? questions.get(event.parentEventId) : undefined;
    if (parent) {
      if (event.kind === "response") {
        // Keep the latest response if several were somehow written.
        if (!parent.response || event.createdAt >= parent.response.createdAt) {
          parent.response = event;
        }
      } else if (event.kind === "search_suggestion") {
        if (!parent.suggestion || event.createdAt >= parent.suggestion.createdAt) {
          parent.suggestion = event;
        }
      }
      parent.createdAt = Math.min(parent.createdAt, event.createdAt);
      continue;
    }
    orphans.push({
      key: `${event.kind}${event.id}`,
      question: null,
      response: event.kind === "response" ? event : null,
      suggestion: event.kind === "search_suggestion" ? event : null,
      createdAt: event.createdAt,
    });
  }

  return [...questions.values(), ...orphans].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    const aId = a.question?.id ?? a.response?.id ?? a.suggestion?.id ?? 0;
    const bId = b.question?.id ?? b.response?.id ?? b.suggestion?.id ?? 0;
    return aId - bId;
  });
}

export {
  buildConversationGraph,
  questionConfidence,
  responseReason,
  suggestionQuery,
  suggestionState,
};
