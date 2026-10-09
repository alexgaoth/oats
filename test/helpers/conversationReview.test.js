const test = require("node:test");
const assert = require("node:assert/strict");

let buildReview;

test.before(async () => {
  ({ buildReview } = await import("../../src/helpers/conversationReview.mjs"));
});

let nextId = 1;
function question(text, segmentId = `s${nextId}`) {
  return {
    id: nextId++,
    kind: "question",
    parentEventId: null,
    segmentIds: [segmentId],
    text,
    metadata: {},
    createdAt: 1000 + nextId,
  };
}
function response(parent, reason) {
  return {
    id: nextId++,
    kind: "response",
    parentEventId: parent.id,
    segmentIds: [],
    text: "",
    metadata: { reason },
    createdAt: parent.createdAt + 1,
  };
}
function suggestion(parent, state = "opened") {
  return {
    id: nextId++,
    kind: "search_suggestion",
    parentEventId: parent.id,
    segmentIds: [],
    text: "q",
    metadata: { state },
    createdAt: parent.createdAt + 2,
  };
}

test("nothing recorded is empty, not a review of nothing", () => {
  const review = buildReview({});
  assert.equal(review.empty, true);
  assert.deepEqual(review.unresolved, []);
  assert.equal(review.asked, 0);
});

// The point of the whole thing: what nobody could answer is what you need after.
test("an answered question leaves the list; an unanswered one stays", () => {
  const asked = question("what is the median seat price?");
  const known = question("who owns the migration?");
  const review = buildReview({
    events: [asked, response(asked, "denied_knowledge"), known, response(known, "answered")],
  });
  assert.equal(review.asked, 2);
  assert.equal(review.answered, 1);
  assert.deepEqual(
    review.unresolved.map((item) => item.question),
    ["what is the median seat price?"]
  );
  assert.equal(review.unresolved[0].outcome, "denied");
});

test("a question with no response at all is open, not answered", () => {
  const asked = question("did anybody check the invoice?");
  const review = buildReview({ events: [asked] });
  assert.equal(review.unresolved[0].outcome, "open");
  assert.equal(review.answered, 0);
});

test("silence and a hedge are both unresolved, and keep their difference", () => {
  const quiet = question("who is on call?");
  const hedged = question("is the migration done?");
  const review = buildReview({
    events: [quiet, response(quiet, "silence"), hedged, response(hedged, "uncertain_response")],
  });
  assert.deepEqual(
    review.unresolved.map((item) => item.outcome),
    ["silence", "uncertain"]
  );
});

// A review item has to be a place, not just a sentence.
test("each item names the turn it was asked in", () => {
  const asked = question("what is the median seat price?", "seg-42");
  const review = buildReview({ events: [asked, response(asked, "silence")] });
  assert.equal(review.unresolved[0].segmentId, "seg-42");
});

test("a question with no segment reports null rather than a wrong turn", () => {
  const asked = { ...question("stray"), segmentIds: [] };
  const review = buildReview({ events: [asked] });
  assert.equal(review.unresolved[0].segmentId, null);
});

test("what Oats went and searched is counted and marked on the item", () => {
  const asked = question("what is the median seat price?");
  const review = buildReview({
    events: [asked, response(asked, "denied_knowledge"), suggestion(asked)],
  });
  assert.equal(review.searched, 1);
  assert.equal(review.unresolved[0].searched, true);
});

// Every unanswered question gets a suggestion row at `shown`; only `opened`
// means the question text actually left for the search host. An automatic
// search that failed also stays at `shown`.
test("a search that was only offered is not reported as searched", () => {
  const offered = question("has anyone benchmarked seat price?");
  const failedAuto = question("what is our net revenue retention?");
  const review = buildReview({
    events: [
      offered,
      response(offered, "uncertain_response"),
      suggestion(offered, "shown"),
      failedAuto,
      response(failedAuto, "denied_knowledge"),
      { ...suggestion(failedAuto, "shown"), metadata: { state: "shown", auto: true } },
    ],
  });
  assert.equal(review.searched, 0);
  assert.deepEqual(
    review.unresolved.map((item) => item.searched),
    [false, false]
  );
});

test("open and dropped threads are carried; resolved and live are not", () => {
  const review = buildReview({
    events: [],
    topics: [
      { id: 1, label: "enterprise pricing", state: "open" },
      { id: 2, label: "onboarding flow", state: "resolved" },
      { id: 3, label: "hiring", state: "dropped" },
      { id: 4, label: "live one", state: "live" },
      { id: 5, label: "   ", state: "open" },
    ],
  });
  assert.deepEqual(
    review.openThreads.map((thread) => thread.label),
    ["enterprise pricing", "hiring"]
  );
  assert.equal(review.empty, false, "threads alone are still a review");
});

test("malformed input does not throw", () => {
  assert.equal(buildReview({ events: null, topics: "nope" }).empty, true);
  assert.equal(buildReview().empty, true);
});

// The transcript's margin marks the turn a question was asked in, with the same
// outcome the review reports for it.
test("question turns map the asking turn to its outcome", async () => {
  const { questionTurns } = await import("../../src/helpers/conversationReview.mjs");
  const asked = question("what is the median seat price?", "turn-4");
  const known = question("who owns the migration?", "turn-9");
  const open = question("anyone benchmarked it?", "turn-12");
  const turns = questionTurns([
    asked,
    response(asked, "denied_knowledge"),
    known,
    response(known, "answered"),
    open,
  ]);
  assert.deepEqual(Object.fromEntries(turns), {
    "turn-4": "denied",
    "turn-9": "answered",
    "turn-12": "open",
  });
  assert.equal(questionTurns(null).size, 0);
});

// The answered half of the review quotes the reply the response event carries,
// and places it at the turn the answer was said in.
test("an answered question carries its reply, verbatim, and where it was said", () => {
  const known = question("who owns the migration?", "turn-9");
  const reply = {
    ...response(known, "answered"),
    text: " Priya does, since March. ",
    segmentIds: ["turn-10"],
  };
  const silent = question("anyone?", "turn-12");
  const bare = { ...response(silent, "answered"), text: "", segmentIds: [] };
  const review = buildReview({ events: [known, reply, silent, bare] });
  assert.deepEqual(
    review.answers.map((item) => [item.question, item.reply, item.segmentId]),
    [
      ["who owns the migration?", "Priya does, since March.", "turn-10"],
      ["anyone?", "", "turn-12"],
    ]
  );
  assert.equal(review.unresolved.length, 0);
});
