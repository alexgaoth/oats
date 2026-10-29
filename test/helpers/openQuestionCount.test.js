const test = require("node:test");
const assert = require("node:assert/strict");

let openQuestionCount, questionOutcomes;

test.before(async () => {
  ({ openQuestionCount, questionOutcomes } = await import(
    "../../src/helpers/conversationReview.mjs"
  ));
});

let nextId = 1;
const question = () => ({
  id: nextId++,
  kind: "question",
  parentEventId: null,
  segmentIds: [`s${nextId}`],
  text: "q?",
  metadata: {},
  createdAt: 1000 + nextId,
});
const response = (parent, reason) => ({
  id: nextId++,
  kind: "response",
  parentEventId: parent.id,
  segmentIds: [],
  text: "",
  metadata: { reason },
  createdAt: parent.createdAt + 1,
});

// "Open" is what the contour's label calls still unanswered: no verdict,
// nobody answered, nobody knew. A hedge is not counted, nor an answer.
test("questions left open are the unanswered, the unknown and the unresolved", () => {
  const events = [];
  const add = (reason) => {
    const asked = question();
    events.push(asked);
    if (reason) events.push(response(asked, reason));
  };
  add("answered");
  add("answered");
  add("denied_knowledge");
  add("denied"); // a local verdict
  add("silence");
  add("uncertain_response");
  add("uncertain"); // a local hedge
  add(null); // never got a verdict
  assert.equal(openQuestionCount(events), 4);
});

test("the count agrees with the line under the record's title", () => {
  const events = [];
  for (const reason of ["answered", "silence", "denied_knowledge", null, "uncertain_response"]) {
    const asked = question();
    events.push(asked);
    if (reason) events.push(response(asked, reason));
  }
  const line = questionOutcomes(events).outcomes;
  const open = line
    .filter(({ outcome }) => ["asked", "silence", "denied"].includes(outcome))
    .reduce((total, { count }) => total + count, 0);
  assert.equal(openQuestionCount(events), open);
  assert.equal(open, 3);
});

test("nothing asked is nothing open", () => {
  assert.equal(openQuestionCount([]), 0);
  assert.equal(openQuestionCount(null), 0);
});
