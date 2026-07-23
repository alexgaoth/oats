const test = require("node:test");
const assert = require("node:assert/strict");

let ConversationAideSession;
let buildSearchUrl;
let isQuestionCandidate;
let parseQuestionAssessment;
let validateSearchUrl;

test.before(async () => {
  ({
    ConversationAideSession,
    buildSearchUrl,
    isQuestionCandidate,
    parseQuestionAssessment,
    validateSearchUrl,
  } = await import("../../src/helpers/conversationAide.mjs"));
});

const unanswered = (overrides = {}) => ({
  isFactualQuestion: true,
  isAnswered: false,
  normalizedQuestion: "What is Kubernetes?",
  searchQuery: "what is Kubernetes",
  confidence: 0.92,
  reason: "denied_knowledge",
  ...overrides,
});

test("candidate filter accepts factual forms and excludes commands, greetings, and noise", () => {
  assert.equal(isQuestionCandidate("Do you know what Kubernetes is?"), true);
  assert.equal(isQuestionCandidate("Can you explain photosynthesis"), true);
  assert.equal(isQuestionCandidate("Please open the calendar?"), false);
  assert.equal(isQuestionCandidate("How are you?"), false);
  assert.equal(isQuestionCandidate("uh?"), false);
  assert.equal(isQuestionCandidate("Who designed the Golden Gate Bridge"), true);
  assert.equal(isQuestionCandidate("I finished the deployment."), false);
  assert.equal(isQuestionCandidate("Who cares?"), false);
  assert.equal(isQuestionCandidate("x".repeat(601) + "?"), false);
});

test("classifier parser enforces the complete strict schema and confidence range", () => {
  assert.deepEqual(parseQuestionAssessment(JSON.stringify(unanswered())), unanswered());
  assert.equal(parseQuestionAssessment('{"isFactualQuestion":true}'), null);
  assert.equal(parseQuestionAssessment(JSON.stringify(unanswered({ confidence: 1.2 }))), null);
  assert.equal(parseQuestionAssessment("```json\n{}\n```"), null);
  assert.equal(parseQuestionAssessment(JSON.stringify(unanswered({ reason: "guess" }))), null);
  assert.equal(parseQuestionAssessment(JSON.stringify({ ...unanswered(), extra: true })), null);
  assert.equal(
    parseQuestionAssessment(JSON.stringify(unanswered({ confidence: 0 }))).confidence,
    0
  );
  assert.equal(
    parseQuestionAssessment(JSON.stringify(unanswered({ confidence: 1 }))).confidence,
    1
  );
});

test("denied knowledge after a factual question produces exactly one suggestion", async () => {
  const shown = [];
  const events = [];
  const session = new ConversationAideSession({
    noteId: 7,
    classify: async () => unanswered(),
    insertEvent: async (event) => {
      const saved = { ...event, id: events.length + 1 };
      events.push(saved);
      return saved;
    },
    showSuggestion: async (suggestion) => shown.push(suggestion),
  });
  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  assert.equal(shown.length, 1);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question", "response", "search_suggestion"]
  );
  assert.equal(events[1].parentEventId, events[0].id);
  assert.equal(events[2].parentEventId, events[0].id);
});

test("substantive answer, low confidence, duplicate question, and cooldown show no extra card", async () => {
  const shown = [];
  let classifications = 0;
  let verdict = unanswered({ isAnswered: true, reason: "answered" });
  const session = new ConversationAideSession({
    noteId: 9,
    now: () => 1000,
    classify: async () => {
      classifications += 1;
      return verdict;
    },
    insertEvent: async (event) => ({ ...event, id: Math.floor(Math.random() * 10000) }),
    showSuggestion: async (suggestion) => shown.push(suggestion),
  });
  session.onFinalized({ id: "q1", text: "What is a container runtime?" });
  session.onFinalized({ id: "r1", text: "It is a container orchestration platform." });
  await session.evaluation;
  assert.equal(shown.length, 0);

  verdict = unanswered({ confidence: 0.74 });
  session.onFinalized({ id: "q2", text: "Where is Tallinn?" });
  session.onFinalized({ id: "r2", text: "I am not sure." });
  await session.evaluation;
  assert.equal(shown.length, 0);

  verdict = unanswered();
  session.onFinalized({ id: "q3", text: "What is Kubernetes?" });
  session.onFinalized({ id: "r3", text: "No." });
  await session.evaluation;
  session.onFinalized({ id: "q4", text: "What is Kubernetes?" });
  session.onFinalized({ id: "r4", text: "No idea." });
  await session.evaluation;
  assert.equal(shown.length, 1);
  assert.equal(classifications, 3);
});

test("silence timer evaluates, while retraction and shutdown cancel a staged candidate", async () => {
  let timerCallback;
  let classifications = 0;
  const session = new ConversationAideSession({
    noteId: 11,
    setTimer: (callback) => {
      timerCallback = callback;
      return 1;
    },
    clearTimer: () => {},
    classify: async () => {
      classifications += 1;
      return unanswered({ reason: "silence" });
    },
  });
  session.onFinalized({ id: "q1", text: "Where is Tallinn?" });
  timerCallback();
  await session.evaluation;
  assert.equal(classifications, 1);

  session.onFinalized({ id: "q2", text: "Where is Riga?" });
  session.onRetracted("q2");
  timerCallback();
  await session.evaluation;
  assert.equal(classifications, 1);

  session.onFinalized({ id: "q3", text: "Where is Vilnius?" });
  await session.shutdown();
  timerCallback();
  await session.evaluation;
  assert.equal(classifications, 1);
});

test("preceding chatter is never treated as the answer or stored as the response", async () => {
  const events = [];
  const seen = [];
  let timerCallback;
  const session = new ConversationAideSession({
    setTimer: (callback) => {
      timerCallback = callback;
      return 1;
    },
    clearTimer: () => {},
    noteId: 21,
    classify: async ({ context }) => {
      seen.push(context.map((item) => item.text));
      return unanswered({ reason: "silence" });
    },
    insertEvent: async (event) => {
      const saved = { ...event, id: events.length + 1 };
      events.push(saved);
      return saved;
    },
    showSuggestion: async () => {},
  });

  session.onFinalized({ id: "c1", text: "Let's talk about infrastructure." });
  session.onFinalized({ id: "c2", text: "The cluster is down." });
  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  timerCallback();
  await session.evaluation;

  // The classifier only ever sees the question itself, never the earlier chatter.
  assert.deepEqual(seen, [["Do you know what Kubernetes is?"]]);
  const response = events.find((event) => event.kind === "response");
  assert.deepEqual(response.segmentIds, []);
  assert.equal(response.text, "");
});

test("search URL is encoded and unsafe protocols or changed hosts are rejected", () => {
  const url = buildSearchUrl("C++ URL encoding & safety");
  assert.equal(url, "https://www.google.com/search?q=C%2B%2B+URL+encoding+%26+safety");
  assert.equal(validateSearchUrl(url), true);
  assert.equal(validateSearchUrl("http://www.google.com/search?q=x"), false);
  assert.equal(validateSearchUrl("https://evil.example/search?q=x"), false);
  assert.throws(() => buildSearchUrl("x", "javascript:alert(1)"));
  assert.throws(() => buildSearchUrl("x", "https://user:password@example.com/search"));

  const custom = buildSearchUrl("local first", "https://search.example.test/find?old=1#top");
  assert.equal(custom, "https://search.example.test/find?q=local+first");
  assert.equal(validateSearchUrl(custom, "https://search.example.test/find"), true);
  assert.equal(validateSearchUrl("https://search.example.test.evil.test/find?q=x", custom), false);
});

test("confidence threshold is inclusive at 0.75", async () => {
  const shown = [];
  let confidence = 0.75;
  const session = new ConversationAideSession({
    noteId: 12,
    confidenceThreshold: 0.75,
    classify: async ({ candidate }) =>
      unanswered({
        normalizedQuestion: candidate.text,
        searchQuery: candidate.text,
        confidence,
      }),
    insertEvent: async (event) => ({ ...event, id: `${event.kind}-${event.text}` }),
    showSuggestion: async (suggestion) => shown.push(suggestion),
  });

  session.onFinalized({ id: "q1", text: "Where is Tallinn?" });
  session.onFinalized({ id: "r1", text: "I do not know." });
  await session.evaluation;
  assert.equal(shown.length, 1);

  confidence = 0.749;
  session.onFinalized({ id: "q2", text: "Where is Riga?" });
  session.onFinalized({ id: "r2", text: "I do not know." });
  await session.evaluation;
  assert.equal(shown.length, 1);
});

test("classifier exceptions and malformed output fail closed with local diagnostics", async () => {
  const shown = [];
  const events = [];
  const diagnostics = [];
  let shouldThrow = true;
  const session = new ConversationAideSession({
    noteId: 13,
    classify: async () => {
      if (shouldThrow) throw new Error("model unavailable");
      return '{"not":"the contract"}';
    },
    insertEvent: async (event) => events.push(event),
    showSuggestion: async (suggestion) => shown.push(suggestion),
    onDiagnostic: (code, error) => diagnostics.push({ code, error: error?.message }),
  });

  session.onFinalized({ id: "q1", text: "What is a service mesh?" });
  session.onFinalized({ id: "r1", text: "I am not sure." });
  await session.evaluation;

  shouldThrow = false;
  session.onFinalized({ id: "q2", text: "Where is Tartu?" });
  session.onFinalized({ id: "r2", text: "No idea." });
  await session.evaluation;

  assert.deepEqual(events, []);
  assert.deepEqual(shown, []);
  assert.deepEqual(diagnostics, [
    { code: "classifier_failed", error: "model unavailable" },
    { code: "malformed_classifier_output", error: undefined },
  ]);
});

test("a persistence failure prevents the card and is contained by the evaluation queue", async () => {
  const shown = [];
  const diagnostics = [];
  const session = new ConversationAideSession({
    noteId: 14,
    classify: async () => unanswered(),
    insertEvent: async () => {
      throw new Error("database is read-only");
    },
    showSuggestion: async (suggestion) => shown.push(suggestion),
    onDiagnostic: (code, error) => diagnostics.push({ code, error: error?.message }),
  });
  session.onFinalized({ id: "q1", text: "What is Kubernetes?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  assert.deepEqual(shown, []);
  assert.deepEqual(diagnostics, [{ code: "evaluation_failed", error: "database is read-only" }]);
});

test("cooldown blocks different questions until the full interval has elapsed", async () => {
  let now = 1000;
  let eventId = 0;
  const shown = [];
  const session = new ConversationAideSession({
    noteId: 15,
    now: () => now,
    cooldownMs: 30000,
    classify: async ({ candidate }) =>
      unanswered({
        normalizedQuestion: candidate.text,
        searchQuery: candidate.text,
      }),
    insertEvent: async (event) => ({ ...event, id: ++eventId }),
    showSuggestion: async (suggestion) => shown.push(suggestion),
  });

  session.onFinalized({ id: "q1", text: "Where is Tallinn?" });
  session.onFinalized({ id: "r1", text: "No idea." });
  await session.evaluation;

  now += 29999;
  session.onFinalized({ id: "q2", text: "Where is Riga?" });
  session.onFinalized({ id: "r2", text: "No idea." });
  await session.evaluation;
  assert.equal(shown.length, 1);

  now += 1;
  session.onFinalized({ id: "q3", text: "Where is Vilnius?" });
  session.onFinalized({ id: "r3", text: "No idea." });
  await session.evaluation;
  assert.equal(shown.length, 2);
});

test("shutdown suppresses an inference result that was already in flight", async () => {
  let resolveClassifier;
  const classifierResult = new Promise((resolve) => {
    resolveClassifier = resolve;
  });
  const shown = [];
  const events = [];
  const session = new ConversationAideSession({
    noteId: 16,
    classify: () => classifierResult,
    insertEvent: async (event) => events.push(event),
    showSuggestion: async (suggestion) => shown.push(suggestion),
  });
  session.onFinalized({ id: "q1", text: "What is Kubernetes?" });
  session.onFinalized({ id: "r1", text: "No." });

  await Promise.resolve();
  const shutdown = session.shutdown();
  resolveClassifier(unanswered());
  await shutdown;

  assert.deepEqual(events, []);
  assert.deepEqual(shown, []);
});
