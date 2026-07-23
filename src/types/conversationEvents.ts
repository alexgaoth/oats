// Shared types for the conversation aide's persisted event graph. The main
// process persists three event kinds per note (see database.js:
// conversation_events): a `question`, its `response` outcome, and an optional
// `search_suggestion`. The runtime helpers that group these into graph nodes live
// in src/helpers/conversationGraph.mjs (kept as plain ESM so node:test can import
// them without a TypeScript build step).

export type ConversationEventKind = "question" | "response" | "search_suggestion";

export type SuggestionState = "shown" | "opened" | "dismissed" | "expired";

export interface ConversationEvent {
  id: number;
  noteId: number;
  kind: ConversationEventKind;
  parentEventId: number | null;
  segmentIds: string[];
  text: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

// One question and everything the aide derived from it. A node may have a missing
// question (orphaned response/suggestion whose parent was never written or was
// deleted) — the graph still renders those so nothing is silently dropped.
export interface ConversationGraphNode {
  key: string;
  question: ConversationEvent | null;
  response: ConversationEvent | null;
  suggestion: ConversationEvent | null;
  createdAt: number;
}
