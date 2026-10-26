// Shared types for the conversation aide's persisted event graph. The main
// process persists three event kinds per note (see database.js:
// conversation_events): a `question`, its `response` outcome, and an optional
// `search_suggestion`. The runtime helpers that group these into graph nodes live
// in src/helpers/conversationGraph.mjs (kept as plain ESM so node:test can import
// them without a TypeScript build step).

export type ConversationEventKind = "question" | "response" | "search_suggestion";

export type SuggestionState = "shown" | "opened" | "dismissed" | "expired";

// A question's outcome (DESIGN.md §4). Every detected question enters at `asked`
// the instant it is spoken; the classifier moves it onward. Only `denied` — a
// confirmed "I don't know" — ever opens a search on its own.
export type QuestionOutcome = "asked" | "answered" | "uncertain" | "silence" | "denied";

// One live question card. Cards are created by `ConversationAideSession` during a
// recording and mirrored into the always-on-top rail. `groupKey` decides which
// cards nest together — repeats and rephrasings of one question share a key, and
// are shown nested rather than suppressed.
export interface ConversationCard {
  id: string;
  question: string;
  state: QuestionOutcome;
  groupKey: string;
  occurrence: number;
  searched: boolean;
  suggestionId: number | null;
  createdAt: number;
  // Present once the question has a verdict that produced a suggestion. Lets the
  // rail offer a manual search without ever handling a URL itself.
  query?: string | null;
  searchBaseUrl?: string | null;
  // The context check (contextCheck.mjs): set only for a reply somebody was not
  // sure of, and only when the team's context had something to say about it.
  check?: ContextCheck;
}

// Where a context check's evidence came from: a file in the context folder
// (contextService.js), a past conversation, or a page the agent read.
export type ContextSource =
  | { kind: "file"; path: string; heading: string; label: string }
  | { kind: "conversation"; noteId: number; title: string; day: string; label: string }
  | { kind: "link"; url: string; label: string };

// One passage the context search found for a question.
export interface ContextPassage {
  id: string;
  label: string;
  text: string;
  source: ContextSource;
}

// What a question card says about its reply. `checking` while the judge
// reads; then a verdict with the answer and its source. A check that finds
// nothing leaves no trace on the card.
export type ContextCheck =
  | { state: "checking"; by: "context" | "agent"; sources?: string[] }
  | {
      state: "right" | "wrong" | "answer";
      by: "context" | "agent";
      answer: string;
      quote: string;
      source: ContextSource;
    };

// The context folder's index, as Settings shows it.
export interface ContextStatus {
  folder: string | null;
  files: number;
  passages: number;
  indexing: boolean;
  truncated: boolean;
  error: "missing" | "unreadable" | null;
}

// A thread's state (DESIGN.md §4). `live` is the topic being spoken, `open` was
// started and never closed, `dropped` has gone cold, `resolved` reached an end.
export type ThreadState = "live" | "open" | "resolved" | "dropped";

// One row of the open-thread stack shown during recording. Only unfinished
// threads appear — resolved ones are not reminders.
export interface OpenThread {
  id: number;
  label: string;
  state: Extract<ThreadState, "open" | "dropped">;
  lastAt: number;
  durationMs: number;
}

// A topic in the graph. `durationMs` drives node radius; `returns` counts the
// times the conversation came back, which is what the back-edges encode.
export interface ConversationTopicNode {
  id: number;
  /** The name shown: the writing model's when it named the topic, else the on-device one. */
  label: string;
  /** The on-device name, present only when `label` is the writing model's (topicNaming.mjs). */
  deviceLabel?: string;
  words: string[];
  durationMs: number;
  utteranceIds: string[];
  firstAt: number;
  lastAt: number;
  returns: number;
  state: ThreadState;
}

// A directed transition between topics: the conversation moved from → to.
export interface ConversationTopicEdge {
  from: number;
  to: number;
  weight: number;
  kind: "new" | "return";
}

// A quiet nudge toward what else is worth raising (DESIGN.md §9.6).
//   `unfinished` — a thread this conversation opened and walked away from
//   `shallow`    — a topic that got a sentence and never developed
//   `adjacent`   — a subject that historically accompanies the live one
export type SuggestionKind = "unfinished" | "shallow" | "adjacent";

export interface ConversationSuggestion {
  kind: SuggestionKind;
  topicId: number | null;
  label: string;
  score: number;
  at: number;
  // Only on `adjacent`: how many past conversations it turned up in.
  seenIn?: number;
}

export interface ConversationTopicSnapshot {
  nodes: ConversationTopicNode[];
  edges: ConversationTopicEdge[];
}

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
