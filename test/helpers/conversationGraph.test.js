const test = require("node:test");
const assert = require("node:assert/strict");

let answeredQuestionTurns;
let buildConversationGraph;
let questionConfidence;
let responseReason;
let suggestionQuery;
let suggestionState;

test.before(async () => {
  ({
    answeredQuestionTurns,
    buildConversationGraph,
    questionConfidence,
    responseReason,
    suggestionQuery,
    suggestionState,
  } = await import("../../src/helpers/conversationGraph.mjs"));
});

const event = (overrides) => ({
  id: 0,
  noteId: 1,
  kind: "question",
  parentEventId: null,
  segmentIds: [],
  text: "",
  metadata: {},
  createdAt: 0,
  ...overrides,
});

test("groups a question with its response and suggestion", () => {
  const events = [
    event({ id: 1, kind: "question", text: "What is Kubernetes?", createdAt: 100 }),
    event({
      id: 2,
      kind: "response",
      parentEventId: 1,
      text: "No idea",
      metadata: { reason: "denied_knowledge" },
      createdAt: 110,
    }),
    event({
      id: 3,
      kind: "search_suggestion",
      parentEventId: 1,
      text: "what is kubernetes",
      metadata: { query: "what is kubernetes", state: "shown" },
      createdAt: 120,
    }),
  ];
  const nodes = buildConversationGraph(events);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].question.id, 1);
  assert.equal(nodes[0].response.id, 2);
  assert.equal(nodes[0].suggestion.id, 3);
  assert.equal(responseReason(nodes[0].response), "denied_knowledge");
  assert.equal(suggestionQuery(nodes[0].suggestion), "what is kubernetes");
  assert.equal(suggestionState(nodes[0].suggestion), "shown");
});

test("orders nodes by earliest contained event, ascending", () => {
  const events = [
    event({ id: 5, kind: "question", text: "Second?", createdAt: 300 }),
    event({ id: 1, kind: "question", text: "First?", createdAt: 100 }),
    event({ id: 9, kind: "question", text: "Third?", createdAt: 500 }),
  ];
  const nodes = buildConversationGraph(events);
  assert.deepEqual(
    nodes.map((n) => n.question.id),
    [1, 5, 9]
  );
});

test("keeps orphaned responses and suggestions as their own nodes", () => {
  const events = [
    event({
      id: 7,
      kind: "search_suggestion",
      parentEventId: 999, // parent question was never written
      text: "orphan query",
      metadata: { query: "orphan query", state: "expired" },
      createdAt: 50,
    }),
  ];
  const nodes = buildConversationGraph(events);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].question, null);
  assert.equal(nodes[0].suggestion.id, 7);
  assert.equal(suggestionState(nodes[0].suggestion), "expired");
});

test("prefers the latest response and suggestion when duplicates exist", () => {
  const events = [
    event({ id: 1, kind: "question", text: "Q?", createdAt: 100 }),
    event({ id: 2, kind: "response", parentEventId: 1, text: "early", createdAt: 110 }),
    event({ id: 3, kind: "response", parentEventId: 1, text: "late", createdAt: 200 }),
  ];
  const nodes = buildConversationGraph(events);
  assert.equal(nodes[0].response.text, "late");
});

test("reads confidence and falls back to text when metadata query is absent", () => {
  const question = event({ id: 1, kind: "question", metadata: { confidence: 0.9 } });
  assert.equal(questionConfidence(question), 0.9);
  const suggestion = event({
    id: 2,
    kind: "search_suggestion",
    text: "fallback text",
    metadata: {},
  });
  assert.equal(suggestionQuery(suggestion), "fallback text");
});

test("returns null for missing or invalid metadata", () => {
  assert.equal(questionConfidence(null), null);
  assert.equal(suggestionState(null), null);
  assert.equal(suggestionState(event({ metadata: { state: "bogus" } })), null);
  assert.equal(responseReason(event({ metadata: {} })), null);
});

test("handles a non-array input safely", () => {
  assert.deepEqual(buildConversationGraph(undefined), []);
  assert.deepEqual(buildConversationGraph(null), []);
});

// A continued conversation's new topic tracker reads these back to keep the
// topics closed that the earlier sittings' answers closed.
test("the turns of the answered questions, as their cards settled them", () => {
  const events = [
    event({ id: 1, segmentIds: ["seg-a-4"], metadata: { state: "answered" } }),
    event({ id: 2, segmentIds: ["seg-a-9"], metadata: { state: "denied" } }),
    event({ id: 3, segmentIds: ["seg-a-12"], metadata: { state: "asked" } }),
    // The reply's reason is the classifier's; the card's outcome is on the question.
    event({
      id: 4,
      kind: "response",
      parentEventId: 2,
      segmentIds: ["seg-a-10"],
      metadata: { reason: "answered" },
    }),
    event({ id: 5, segmentIds: [7], metadata: { state: "answered" } }),
    event({ id: 6, segmentIds: [], metadata: { state: "answered" } }),
  ];
  assert.deepEqual(answeredQuestionTurns(events), ["seg-a-4", "7"]);
  assert.deepEqual(answeredQuestionTurns(null), []);
});
