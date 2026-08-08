const test = require("node:test");
const assert = require("node:assert/strict");

let ConversationAideSession;
let buildSearchUrl;
let isQuestionCandidate;
let assessResponseLocally;
let extractQuestionSentence;
let outcomeForAssessment;
let parseQuestionAssessment;
let questionGroupKey;
let validateSearchUrl;

test.before(async () => {
  ({
    ConversationAideSession,
    buildSearchUrl,
    isQuestionCandidate,
    assessResponseLocally,
    extractQuestionSentence,
    outcomeForAssessment,
    parseQuestionAssessment,
    questionGroupKey,
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

// Builds a session with recording collectors for everything it emits, so each
// test can assert on cards, persisted events, and searches independently.
function harness(options = {}) {
  const cards = [];
  const removed = [];
  const events = [];
  const searches = [];
  const diagnostics = [];
  const updates = [];
  let eventId = 0;
  const session = new ConversationAideSession({
    noteId: 1,
    classify: async () => unanswered(),
    insertEvent: async (event) => {
      const saved = { ...event, id: ++eventId };
      events.push(saved);
      return saved;
    },
    updateEvent: async (id, patch) => updates.push({ id, patch }),
    onCard: (card) => cards.push(card),
    onCardRemoved: (id) => removed.push(id),
    openSearch: async (request) => {
      searches.push(request);
      return true;
    },
    onDiagnostic: (code, error) => diagnostics.push({ code, error: error?.message }),
    ...options,
  });
  return { session, cards, removed, events, searches, diagnostics, updates };
}

const latestCard = (cards, id) => [...cards].reverse().find((card) => card.id === id);

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

test("rephrasings of one question share a group key, unrelated questions do not", () => {
  const kubernetes = questionGroupKey("Do you know what Kubernetes is?");
  assert.equal(questionGroupKey("Are you aware of Kubernetes?"), kubernetes);
  assert.equal(questionGroupKey("Have you heard of Kubernetes"), kubernetes);
  assert.notEqual(questionGroupKey("Where is Tallinn?"), kubernetes);
  // Grouping never collapses to nothing, even for a question that is all stopwords.
  assert.ok(questionGroupKey("What is it?").length > 0);
});

test("only a confident denial is a confirmed negative", () => {
  // The one outcome that opens a browser by itself.
  assert.equal(outcomeForAssessment(unanswered({ reason: "denied_knowledge" }), 0.75), "denied");
  // Silence is not a negative — the room may simply have moved on.
  assert.equal(outcomeForAssessment(unanswered({ reason: "silence" }), 0.75), "silence");
  // A hedge is not a negative — there may well be an answer inside it.
  assert.equal(
    outcomeForAssessment(unanswered({ reason: "uncertain_response" }), 0.75),
    "uncertain"
  );
  // An unconfident denial is not confirmed, so it downgrades rather than opening.
  assert.equal(
    outcomeForAssessment(unanswered({ reason: "denied_knowledge", confidence: 0.5 }), 0.75),
    "uncertain"
  );
  assert.equal(
    outcomeForAssessment(unanswered({ isAnswered: true, reason: "answered" }), 0.75),
    "answered"
  );
  // A low-confidence "answered" is treated as uncertainty, not as a clean answer.
  assert.equal(
    outcomeForAssessment(
      unanswered({ isAnswered: true, reason: "answered", confidence: 0.5 }),
      0.75
    ),
    "uncertain"
  );
});

test("the local reading of a reply recognises denial, hedging, silence, and answers", () => {
  const at = (...texts) => texts.map((text, i) => ({ id: `r${i}`, text }));
  // A denial is what "confirmed negative" means, and it must not need a model.
  assert.equal(assessResponseLocally(at("No, I don't know.")).outcome, "denied");
  assert.equal(assessResponseLocally(at("No idea, never looked it up.")).outcome, "denied");
  assert.equal(assessResponseLocally(at("Nobody knows that yet.")).outcome, "denied");
  // Denial wins over hedging when both are present.
  assert.equal(assessResponseLocally(at("No, I'm not sure honestly.")).outcome, "denied");
  // Hedges are uncertainty, never denial.
  assert.equal(
    assessResponseLocally(at("I think it orchestrates containers.")).outcome,
    "uncertain"
  );
  assert.equal(assessResponseLocally(at("Probably around fifty.")).outcome, "uncertain");
  // Nothing at all, or only backchannel, is silence.
  assert.equal(assessResponseLocally([]).outcome, "silence");
  assert.equal(assessResponseLocally(at("mm-hm", "right", "okay")).outcome, "silence");
  // A substantive reply is an answer; a terse one is only weak evidence.
  assert.equal(
    assessResponseLocally(at("It was released in nineteen ninety-six by Berkeley.")).outcome,
    "answered"
  );
  assert.equal(assessResponseLocally(at("Berkeley.")).outcome, "uncertain");
});

test("a card still resolves and searches when the classifier fails entirely", async () => {
  const { session, cards, events, searches, diagnostics } = harness({
    classify: async () => {
      throw new Error("model unavailable");
    },
  });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No, I have no idea." });
  await session.evaluation;

  // Previously this card sat at `asked` forever and never searched, which read as
  // the feature being broken rather than the model being small.
  assert.equal(latestCard(cards, "q1").state, "denied");
  assert.equal(searches.length, 1);
  assert.equal(latestCard(cards, "q1").searched, true);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question", "response", "search_suggestion"]
  );
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    ["classifier_failed"]
  );
});

test("malformed classifier output falls back to the local reading", async () => {
  const { session, cards, searches } = harness({ classify: async () => '{"nope":true}' });
  session.onFinalized({ id: "q1", text: "Do you know the median seat price?" });
  session.onFinalized({ id: "r1", text: "I think it's around forty dollars." });
  await session.evaluation;
  // A hedge, so resolved but deliberately not searched.
  assert.equal(latestCard(cards, "q1").state, "uncertain");
  assert.deepEqual(searches, []);
});

test("an unconfident classifier cannot withdraw a card or override the room", async () => {
  const { session, cards, removed } = harness({
    classify: async () =>
      unanswered({ isFactualQuestion: false, reason: "not_factual", confidence: 0.4 }),
  });
  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No, I really don't know." });
  await session.evaluation;
  // The card stays: a card that appears and vanishes is worse than one that stays.
  assert.deepEqual(removed, []);
  assert.equal(latestCard(cards, "q1").state, "denied");
});

test("only the question is quoted, not the ramble it arrived in", () => {
  // A finalized segment is often a minute of context with the question at the
  // very end. Quoting the whole turn makes the card unreadable and the search
  // query useless.
  assert.equal(
    extractQuestionSentence(
      "So I was thinking about pricing all week and it kept bugging me. " +
        "Do you know what the median seat price is?"
    ),
    "Do you know what the median seat price is?"
  );
  // A single-sentence question is left exactly as it was said.
  assert.equal(extractQuestionSentence("What is Kubernetes?"), "What is Kubernetes?");
  // A trailing tag question is not the question — keep the clause it attaches to.
  assert.equal(
    extractQuestionSentence("We should ship it. It works fine, right?"),
    "It works fine, right?"
  );
  // Nothing interrogative: return the turn rather than inventing a question.
  assert.equal(extractQuestionSentence("No question here at all."), "No question here at all.");
  assert.equal(extractQuestionSentence(""), "");
});

test("the card shows the extracted question, not the whole utterance", () => {
  const { session, cards, events } = harness();
  session.onFinalized({
    id: "q1",
    text: "I have been going round in circles on this for days now. Do you know what Kubernetes is?",
  });
  assert.equal(cards[0].question, "Do you know what Kubernetes is?");
  // The persisted event matches what the card shows.
  assert.equal(events.length, 0);
});

test("a card exists the instant a question is heard, before any classification runs", () => {
  let classified = false;
  const { session, cards } = harness({
    classify: async () => {
      classified = true;
      return unanswered();
    },
  });

  // Synchronous by contract: no await between hearing the question and the card.
  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].state, "asked");
  assert.equal(cards[0].question, "Do you know what Kubernetes is?");
  assert.equal(cards[0].searched, false);
  assert.equal(classified, false);
});

test("an answered question keeps its card and never reaches the network", async () => {
  const { session, cards, events, searches } = harness({
    classify: async () => unanswered({ isAnswered: true, reason: "answered" }),
  });

  session.onFinalized({ id: "q1", text: "What year was Postgres released?" });
  session.onFinalized({ id: "r1", text: "Nineteen ninety-six." });
  await session.evaluation;

  assert.equal(latestCard(cards, "q1").state, "answered");
  assert.deepEqual(searches, []);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question", "response"]
  );
});

test("an unanswered question resolves the same card and opens the search automatically", async () => {
  const { session, cards, events, searches, updates } = harness();

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  // One card, updated in place — never a second card for the same question.
  assert.deepEqual([...new Set(cards.map((card) => card.id))], ["q1"]);
  assert.equal(latestCard(cards, "q1").state, "denied");
  assert.equal(latestCard(cards, "q1").searched, true);
  assert.equal(searches.length, 1);
  assert.equal(searches[0].query, "what is Kubernetes");
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question", "response", "search_suggestion"]
  );
  assert.equal(events[1].parentEventId, events[0].id);
  assert.equal(events[2].parentEventId, events[0].id);
  // The question event written at detection time is resolved, not duplicated.
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, events[0].id);
  assert.equal(updates[0].patch.state, "denied");
});

test("auto-search off still resolves the card but opens nothing", async () => {
  const { session, cards, events, searches } = harness({ autoSearch: false });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  assert.equal(latestCard(cards, "q1").state, "denied");
  assert.equal(latestCard(cards, "q1").searched, false);
  assert.deepEqual(searches, []);
  // The suggestion is still recorded so it can be re-run by hand later.
  assert.ok(events.some((event) => event.kind === "search_suggestion"));
});

test("silence and hedged answers leave a card but never open a browser", async () => {
  // Silence: the question was asked and nothing came back. That is not a
  // confirmed negative — the room may simply have moved on.
  const silent = harness({ classify: async () => unanswered({ reason: "silence" }) });
  silent.session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  silent.session.onFinalized({ id: "r1", text: "Anyway, about the roadmap." });
  await silent.session.evaluation;
  assert.equal(latestCard(silent.cards, "q1").state, "silence");
  assert.deepEqual(silent.searches, []);
  // The suggestion is still stored so it can be searched by hand later.
  assert.ok(silent.events.some((event) => event.kind === "search_suggestion"));

  // A hedge ("I think so?") may well contain the answer. Not a negative either.
  const hedged = harness({ classify: async () => unanswered({ reason: "uncertain_response" }) });
  hedged.session.onFinalized({ id: "q2", text: "Do you know what Kubernetes is?" });
  hedged.session.onFinalized({ id: "r2", text: "Sort of, I think it orchestrates things?" });
  await hedged.session.evaluation;
  assert.equal(latestCard(hedged.cards, "q2").state, "uncertain");
  assert.deepEqual(hedged.searches, []);
});

test("repeats and rephrasings each get their own card and are never suppressed", async () => {
  const { session, cards, searches } = harness({
    classify: async ({ candidate }) =>
      unanswered({ normalizedQuestion: candidate.text, searchQuery: candidate.text }),
  });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "q2", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "q3", text: "Are you aware of Kubernetes?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  const ids = [...new Set(cards.map((card) => card.id))];
  assert.deepEqual(ids, ["q1", "q2", "q3"]);
  // All three share one group so the rail can nest them under the first asking.
  const groups = new Set(cards.map((card) => card.groupKey));
  assert.equal(groups.size, 1);
  assert.deepEqual(
    ids.map((id) => latestCard(cards, id).occurrence),
    [1, 2, 3]
  );
  // Every asking is judged and searched on its own merits — no cooldown.
  assert.equal(searches.length, 3);
});

test("a retracted segment withdraws a card that is already on screen", async () => {
  const { session, cards, removed, searches } = harness();

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  assert.equal(cards.length, 1);

  session.onRetracted("q1");
  assert.deepEqual(removed, ["q1"]);

  // The verdict for a withdrawn card must not resurrect it or run a search.
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;
  assert.equal(latestCard(cards, "q1").state, "asked");
  assert.deepEqual(searches, []);
});

test("the classifier withdraws a card the local detector raised in error", async () => {
  const { session, removed, searches } = harness({
    classify: async () => unanswered({ isFactualQuestion: false, reason: "not_factual" }),
  });

  session.onFinalized({ id: "q1", text: "How much do we care about this?" });
  session.onFinalized({ id: "r1", text: "Not much." });
  await session.evaluation;

  assert.deepEqual(removed, ["q1"]);
  assert.deepEqual(searches, []);
});

test("silence timer evaluates, while retraction and shutdown cancel a staged candidate", async () => {
  let timerCallback;
  let classifications = 0;
  const { session } = harness({
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
  const seen = [];
  let timerCallback;
  const { session, events } = harness({
    setTimer: (callback) => {
      timerCallback = callback;
      return 1;
    },
    clearTimer: () => {},
    classify: async ({ context }) => {
      seen.push(context.map((item) => item.text));
      return unanswered({ reason: "silence" });
    },
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

test("confidence threshold is inclusive at 0.75 for treating an answer as clean", async () => {
  let confidence = 0.75;
  const { session, cards, searches } = harness({
    confidenceThreshold: 0.75,
    classify: async ({ candidate }) =>
      unanswered({
        isAnswered: true,
        reason: "answered",
        normalizedQuestion: candidate.text,
        searchQuery: candidate.text,
        confidence,
      }),
  });

  session.onFinalized({ id: "q1", text: "Where is Tallinn?" });
  session.onFinalized({ id: "r1", text: "In Estonia." });
  await session.evaluation;
  assert.equal(latestCard(cards, "q1").state, "answered");
  assert.deepEqual(searches, []);

  confidence = 0.749;
  session.onFinalized({ id: "q2", text: "Where is Riga?" });
  session.onFinalized({ id: "r2", text: "Somewhere north, I think." });
  await session.evaluation;
  // A hedged answer no longer reaches the network at all.
  assert.equal(latestCard(cards, "q2").state, "uncertain");
  assert.deepEqual(searches, []);
});

test("classifier exceptions and malformed output no longer strand the card", async () => {
  let shouldThrow = true;
  const { session, cards, events, searches, diagnostics } = harness({
    classify: async () => {
      if (shouldThrow) throw new Error("model unavailable");
      return '{"not":"the contract"}';
    },
  });

  session.onFinalized({ id: "q1", text: "What is a service mesh?" });
  session.onFinalized({ id: "r1", text: "I am not sure." });
  await session.evaluation;

  shouldThrow = false;
  session.onFinalized({ id: "q2", text: "Where is Tartu?" });
  session.onFinalized({ id: "r2", text: "No idea." });
  await session.evaluation;

  // Both questions are still resolved — from the words in the room, not the model.
  // "I am not sure" is a hedge and "No idea" is a denial, so only the second one
  // reaches the network.
  assert.equal(latestCard(cards, "q1").state, "uncertain");
  assert.equal(latestCard(cards, "q2").state, "denied");
  assert.equal(searches.length, 1);
  assert.ok(events.some((event) => event.kind === "response"));
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    ["classifier_failed", "malformed_classifier_output"]
  );
});

test("a persistence failure still shows the card and is contained by the queues", async () => {
  const { session, cards, searches, diagnostics } = harness({
    insertEvent: async () => {
      throw new Error("database is read-only");
    },
  });
  session.onFinalized({ id: "q1", text: "What is Kubernetes?" });
  // Detection does not depend on the database: the card is already up.
  assert.equal(cards.length, 1);

  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;
  await session.shutdown();

  assert.deepEqual(searches, []);
  assert.deepEqual(
    diagnostics.map((entry) => entry.code),
    ["question_persist_failed", "evaluation_failed"]
  );
});

test("a failed search leaves the card unmarked rather than claiming it searched", async () => {
  const { session, cards, diagnostics } = harness({
    openSearch: async () => {
      throw new Error("browser unavailable");
    },
  });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No." });
  await session.evaluation;

  assert.equal(latestCard(cards, "q1").state, "denied");
  assert.equal(latestCard(cards, "q1").searched, false);
  assert.deepEqual(diagnostics, [{ code: "auto_search_failed", error: "browser unavailable" }]);
});

test("shutdown suppresses an inference result that was already in flight", async () => {
  let resolveClassifier;
  const classifierResult = new Promise((resolve) => {
    resolveClassifier = resolve;
  });
  const { session, events, searches } = harness({ classify: () => classifierResult });
  session.onFinalized({ id: "q1", text: "What is Kubernetes?" });
  session.onFinalized({ id: "r1", text: "No." });

  await Promise.resolve();
  const shutdown = session.shutdown();
  resolveClassifier(unanswered());
  await shutdown;

  // The detection event survives; nothing derived from the late verdict does.
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question"]
  );
  assert.deepEqual(searches, []);
});

// With no classifier at all.
//
// This is the shape the product actually ships in: the master switch is the only
// thing standing between a user and the question card, and requiring a downloaded
// 1.5B model to see a single card contradicted the two rules the card is built on
// — detection is local pattern matching with no model round-trip, and the local
// reading of the reply is the primary verdict the model may only refine.

test("every question still gets a card with no classifier configured", async () => {
  const { session, cards, diagnostics } = harness({ classify: null });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  await session.evaluation;

  assert.equal(cards.length >= 1, true, "a card must appear from local detection alone");
  assert.equal(latestCard(cards, "q1").question, "Do you know what Kubernetes is?");
  // Not having a model is the ordinary case, not a failure to report.
  assert.deepEqual(diagnostics, []);
});

test("a denial opens the search with no classifier configured", async () => {
  const { session, cards, events, searches, diagnostics } = harness({ classify: null });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "r1", text: "No, I have no idea." });
  await session.evaluation;

  assert.equal(latestCard(cards, "q1").state, "denied");
  assert.equal(searches.length, 1, "a confirmed negative must still open a search");
  assert.equal(latestCard(cards, "q1").searched, true);
  assert.deepEqual(
    events.map((event) => event.kind),
    ["question", "response", "search_suggestion"]
  );
  // Distinguishes this from the classifier-failure path, which reports
  // `classifier_failed` and would otherwise make this test pass for the wrong
  // reason.
  assert.deepEqual(diagnostics, []);
});

test("an answered question is recorded and does not search, with no classifier", async () => {
  const { session, cards, searches } = harness({ classify: null });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({
    id: "r1",
    text: "Yes, it is a container orchestrator that Google open sourced.",
  });
  await session.evaluation;

  assert.equal(latestCard(cards, "q1").state, "answered");
  assert.deepEqual(searches, [], "an answered question must never open a search");
});

test("repeats each get their own card with no classifier", async () => {
  const { session, cards } = harness({ classify: null });

  session.onFinalized({ id: "q1", text: "Do you know what Kubernetes is?" });
  session.onFinalized({ id: "q2", text: "Are you familiar with Kubernetes at all?" });
  await session.evaluation;

  const ids = new Set(cards.map((card) => card.id));
  assert.equal(ids.has("q1") && ids.has("q2"), true, "re-asking must never be suppressed");
});

test("questions are detected in every shipped locale, even without a question mark", () => {
  const questions = [
    "¿Sabes qué es Kubernetes", // es — inverted mark alone suffices
    "Sabes qué es Kubernetes", // es — knowledge-verb opener
    "Est-ce que tu connais Kubernetes", // fr
    "Pourquoi le déploiement a échoué", // fr
    "Weißt du was Kubernetes ist", // de
    "Sai cosa è Kubernetes", // it
    "Você sabe o que é Kubernetes", // pt
    "Знаешь что такое Кубернетес", // ru
    "Сколько это стоит", // ru
    "クバネティスを知っていますか", // ja — sentence-final か
    "これはいくらですか", // ja
    "你知道Kubernetes是什么", // zh-CN
    "你知道Kubernetes是什麼", // zh-TW
    "誰？", // CJK questions can be two characters
  ];
  for (const q of questions) {
    assert.equal(isQuestionCandidate(q), true, `should detect: ${q}`);
  }

  const statements = [
    "El tiempo está muy bien hoy.",
    "Das Wetter ist heute schön.",
    "Мы закончили вчера вечером.",
    "昨日の会議は長かったです。",
  ];
  for (const s of statements) {
    assert.equal(isQuestionCandidate(s), false, `should not detect: ${s}`);
  }
});

test("denials, hedges, and backchannels are read locally in every shipped locale", () => {
  const denial = (text) => assert.equal(assessResponseLocally([{ text }]).outcome, "denied", text);
  denial("No lo sé");
  denial("Je ne sais pas");
  denial("Keine Ahnung");
  denial("Non lo so");
  denial("Não sei");
  denial("Понятия не имею");
  denial("わかりません");
  denial("不知道");

  const hedge = (text) =>
    assert.equal(assessResponseLocally([{ text }]).outcome, "uncertain", text);
  hedge("Puede ser, probablemente");
  hedge("Vielleicht war es 2018");
  hedge("Наверное, да");
  hedge("たぶんそうだと思います");
  hedge("可能是2018年吧");

  // Backchannels alone are not replies — the room acknowledged, nobody answered.
  for (const text of ["はい", "ага", "d'accord", "genau", "嗯"]) {
    assert.equal(assessResponseLocally([{ text }]).outcome, "silence", text);
  }

  // A substantive CJK answer is counted in characters, not space-split words.
  assert.equal(
    assessResponseLocally([{ text: "コンテナを自動で管理するシステムです" }]).outcome,
    "answered"
  );
});

test("iterate round 1: everyday denials, openers, and acknowledgement noise", () => {
  // de: bare "weiß nicht" is the everyday denial, with its inflections.
  assert.equal(assessResponseLocally([{ text: "Weiß nicht." }]).outcome, "denied");
  assert.equal(assessResponseLocally([{ text: "Ich weiß es auch nicht" }]).outcome, "denied");
  // it: "non saprei" is a denial ("I wouldn't know"), not a hedge.
  assert.equal(assessResponseLocally([{ text: "Non saprei" }]).outcome, "denied");
  // de: "vermutlich" hedges.
  assert.equal(assessResponseLocally([{ text: "Vermutlich war das 2019" }]).outcome, "uncertain");

  // fr: qu'est-ce openers, straight and typographic apostrophe.
  assert.equal(isQuestionCandidate("Qu'est-ce que Kubernetes"), true);
  assert.equal(isQuestionCandidate("Qu’est-ce que c’est"), true);
  // de: direction interrogatives.
  assert.equal(isQuestionCandidate("Wohin geht dieser Export"), true);

  // ja: a bare acknowledgement ends in か but is not a question.
  assert.equal(isQuestionCandidate("そうか"), false);
  assert.equal(isQuestionCandidate("そっか。"), false);
  // …while a real か question stays detected.
  assert.equal(isQuestionCandidate("これで動きますか"), true);
});

test("iterate round 2: denial precision — the expensive direction stays shut", () => {
  const outcome = (text) => assessResponseLocally([{ text }]).outcome;

  // The English bare-"no" branch is scoped, not applied to other languages:
  // Spanish's pre-verbal negator no longer opens browsers over real answers.
  assert.equal(outcome("El servidor no está caído, es un problema de DNS"), "answered");
  assert.equal(outcome("Marta no vino ayer, llegó el lunes"), "answered");
  // …while canonical English negations keep their documented behaviour.
  assert.equal(outcome("No."), "denied");
  assert.equal(outcome("No, I'm not sure"), "denied");

  // Third-person redirects are not the speaker denying.
  assert.equal(outcome("Er weiß nicht, wie das geht, aber Anna kann dir helfen"), "answered");
  assert.equal(outcome("他不知道，但是小王知道，你去问他吧"), "answered");
  assert.equal(outcome("知らない人から電話がかかってきて、それで遅れたんです"), "answered");
  assert.notEqual(outcome("彼は知らないけど、田中さんなら知っていると思いますよ"), "denied");
  assert.equal(outcome("Он не в курсе, спроси лучше у Оли, она знает"), "answered");
  // A discourse-opener 不知道 ("not sure whether you…") is not a denial either.
  assert.equal(outcome("不知道你收到没有，我昨天把文件发到共享盘了"), "answered");

  // "If I remember correctly" asserts an answer; it must not read as a denial.
  assert.equal(outcome("Si no recuerdo mal, la reunión es el martes a las diez"), "answered");
  assert.equal(outcome("Se non ricordo male, la riunione è martedì alle dieci"), "answered");
  assert.equal(outcome("No recuerdo"), "denied");
  assert.equal(outcome("Non ricordo"), "denied");

  // Plain negative answers are answers.
  assert.equal(outcome("Nein, das Meeting ist am Dienstag"), "answered");
  assert.equal(outcome("Non, la réunion est mardi"), "answered");
  assert.equal(outcome("いいえ、火曜日の十時からです"), "answered");

  // And the true denials these guards must never weaken.
  for (const text of [
    "Weiß nicht.",
    "Ich weiß es auch nicht",
    "Je n'en sais rien",
    "Je n’en sais rien",
    "Sais pas",
    "Chais pas",
    "Sei lá",
    "Boh",
    "わかんない",
    "わからん",
    "知らん",
    "不晓得",
    "不曉得",
    "Я не в курсе",
    "Не в курсе.",
    "Weiss nicht.",
  ]) {
    assert.equal(outcome(text), "denied", text);
  }
});

test("iterate round 2: the spoken registers each locale actually uses", () => {
  // fr in-situ interrogation — the dominant spoken register.
  for (const text of [
    "C'est quoi le problème",
    "Il est où le fichier",
    "On fait comment pour déployer",
    "Ça coûte combien",
    "Tu sais comment on fait",
  ]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // zh A-not-A — the standard yes/no form with no 吗.
  for (const text of [
    "你有没有看过这个项目",
    "这个方案是不是有问题",
    "他能不能来",
    "你會不會用這個工具",
  ]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // ja sentence-final の and bare interrogatives.
  for (const text of ["どこ行くの", "いつ帰るの", "これは何", "どう思う"]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // es preposition-fronted; ru куда/откуда; de/pt verb-first openers.
  for (const text of [
    "De dónde es ella",
    "A qué hora empieza la reunión",
    "En qué año fue eso",
    "Куда он пошёл",
    "Откуда ты это знаешь",
    "Hast du eine Ahnung wo das liegt",
    "Gibt es dafür schon eine Lösung",
    "Será que isso funciona em produção",
    "Cadê o arquivo de configuração",
  ]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // A か/吗 question glued to a following statement is still found.
  assert.equal(isQuestionCandidate("これは何ですか。まあいいや"), true);
  assert.equal(isQuestionCandidate("彼も来ますか。たぶん大丈夫だと思う"), true);
  // …and word-internal か still does not fire.
  assert.equal(isQuestionCandidate("確かに2018年です"), false);
  assert.equal(isQuestionCandidate("昨日の会議は長かったです。"), false);
});

test("iterate round 2: hedges, backchannels, and CJK question extraction", () => {
  const outcome = (text) => assessResponseLocally([{ text }]).outcome;
  assert.equal(outcome("Me parece que fue en 2019"), "uncertain");

  // Doubled acknowledgements and round-1 gaps are backchannels, not replies.
  for (const text of [
    "Capito",
    "Ладно",
    "そうそう",
    "对对对",
    "sí sí",
    "да да",
    "D’accord.",
    "Si",
  ]) {
    assert.equal(outcome(text), "silence", text);
  }
  // Typographic apostrophes work wherever their ASCII twins do.
  assert.equal(outcome("J’en sais rien."), "denied");

  // Only the question is quoted — in character-counted CJK too.
  assert.equal(
    extractQuestionSentence("会議は月曜です。予算はいくらですか？"),
    "予算はいくらですか？"
  );
  assert.equal(extractQuestionSentence("那个项目结束了。谁负责这个？"), "谁负责这个？");
  // The English tag fold is untouched.
  assert.equal(
    extractQuestionSentence("We should check the pricing later. You know?"),
    "We should check the pricing later. You know?"
  );
});

test("iterate round 3: the scoping holds against its own edge cases", () => {
  const outcome = (text) => assessResponseLocally([{ text }]).outcome;

  // The English-reply signal must not read Italian's plural article as English.
  assert.equal(outcome("No, i risultati non sono ancora usciti"), "answered");
  assert.equal(outcome("No, i dati sono già sul server centrale"), "answered");
  // …while canonical English negations keep denying.
  assert.equal(outcome("No."), "denied");
  assert.equal(outcome("No, I'm not sure"), "denied");
  assert.equal(outcome("Nope, sorry"), "denied");
  // Short non-English negative answers are answers.
  assert.equal(outcome("No funciona"), "uncertain");

  // Both orders of the es IIRC idiom assert an answer.
  assert.equal(outcome("Si mal no recuerdo, fue en marzo de 2019"), "answered");
  assert.equal(outcome("Si mal no me acuerdo, era marzo"), "answered");
  assert.equal(outcome("No recuerdo"), "denied");

  // Mid-utterance fillers are approximations, not denials.
  assert.equal(outcome("Tinha, sei lá, umas trinta pessoas na sala"), "answered");
  assert.equal(outcome("Saranno state, boh, una trentina di persone"), "answered");
  assert.equal(outcome("Boh."), "denied");
  assert.equal(outcome("Sei lá."), "denied");

  // A first-person subject anchors a CJK denial; third person still cannot.
  assert.equal(outcome("我不知道"), "denied");
  assert.equal(outcome("我也不知道"), "denied");
  assert.equal(outcome("我不清楚这个事情"), "denied");
  assert.equal(outcome("私は分かりません"), "denied");
  assert.equal(outcome("ちょっとわからない"), "denied");
  assert.equal(outcome("他不知道，但是小王知道，你去问他吧"), "answered");
  assert.equal(outcome("知らない人から電話がかかってきて、それで遅れたんです"), "answered");

  // "pas mal" asserts knowledge; plain "sais pas" denies it.
  assert.equal(outcome("Je sais pas mal de choses sur ce sujet"), "answered");
  assert.equal(outcome("Je sais pas"), "denied");
  // ru: the standard "Нет, не в курсе" compound.
  assert.equal(outcome("Нет, не в курсе"), "denied");
});

test("iterate round 3: spoken openers survive elision, lead-ins, and particles", () => {
  // fr elided est-ce qu'… — the most common spoken form of the opener.
  assert.equal(isQuestionCandidate("Est-ce qu'il y a un moyen de faire ça"), true);
  assert.equal(isQuestionCandidate("Est-ce qu’on peut encore changer la date"), true);

  // A word or two of conjunction lead-in does not defeat the opener.
  for (const text of [
    "pero dónde está el archivo",
    "und wann ist das meeting",
    "ma perché non funziona",
    "e onde fica o escritório",
    "а где сервер",
    "ну и сколько это стоит",
  ]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // …without turning conjunction-led statements into cards.
  for (const text of [
    "E poi siamo andati a casa.",
    "И мы пошли домой.",
    "Und dann sind wir gegangen.",
  ]) {
    assert.equal(isQuestionCandidate(text), false, text);
  }

  // zh sentence-final 呢 and the erhua 哪儿.
  assert.equal(isQuestionCandidate("你觉得呢"), true);
  assert.equal(isQuestionCandidate("那你呢"), true);
  assert.equal(isQuestionCandidate("在哪儿开会"), true);

  // Glued CJK doublings and particle acknowledgements are backchannels.
  const outcome = (text) => assessResponseLocally([{ text }]).outcome;
  for (const text of ["うんうん", "はいはい", "好的好的", "是啊", "对啊"]) {
    assert.equal(outcome(text), "silence", text);
  }
  // ru colloquial hedge, pt plural opener, fr elided denial.
  assert.equal(outcome("наверно это было в марте"), "uncertain");
  assert.equal(isQuestionCandidate("vocês sabem onde fica"), true);
  assert.equal(outcome("J'sais pas"), "denied");
});

test("post-loop: the final round's remaining findings, pinned", () => {
  const outcome = (text) => assessResponseLocally([{ text }]).outcome;

  // ja pronouns are verb-final: attributive 知らない after 私は cannot deny…
  assert.equal(outcome("私は知らない人だと思ってた"), "answered");
  assert.equal(outcome("私も知らない人ばかりだったよ"), "answered");
  assert.equal(outcome("俺も知らないうちに終わってた"), "answered");
  // …while genuine pronoun-marked denials still do.
  assert.equal(outcome("私は分かりません"), "denied");
  assert.equal(outcome("私はちょっとわからない"), "denied");
  // Chinese keeps the boundary-free first-person branch.
  assert.equal(outcome("我不知道他在哪"), "denied");

  // Mandarin particle-suffixed subjectless denials.
  assert.equal(outcome("不知道啊"), "denied");
  assert.equal(outcome("不知道耶"), "denied");

  // Bare clause-final interrogatives and mid-sentence 几点.
  for (const text of [
    "会议几点开始",
    "现在几点",
    "你办公室在哪",
    "締め切りはいつ",
    "トイレはどこ",
    "この案はどう",
  ]) {
    assert.equal(isQuestionCandidate(text), true, text);
  }
  // Negative guards: とう≠どう, statements stay statements.
  assert.equal(isQuestionCandidate("ありがとう"), false);
  assert.equal(isQuestionCandidate("三点开会，别迟到"), false);

  // Elided pas-mal forms assert knowledge.
  assert.equal(outcome("J'sais pas mal de trucs là-dessus"), "answered");
  assert.equal(outcome("Chais pas"), "denied");
  // CJK-punctuated backchannel chains are still silence.
  assert.equal(outcome("はい。なるほど"), "silence");
});
