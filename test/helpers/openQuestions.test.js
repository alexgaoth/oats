const test = require("node:test");
const assert = require("node:assert/strict");

let questions;

test.before(async () => {
  questions = await import("../../src/components/global/openQuestions.ts");
});

let nextId = 1;
const question = (text, createdAt, segment) => ({
  id: nextId++,
  kind: "question",
  parentEventId: null,
  segmentIds: [segment],
  text,
  metadata: { state: "asked" },
  createdAt,
});
const response = (parent, reason, createdAt) => ({
  id: nextId++,
  kind: "response",
  parentEventId: parent.id,
  segmentIds: [`r-${parent.id}`],
  text: "reply",
  metadata: { reason, outcome: reason },
  createdAt,
});

test("only questions with no verdict, newest first, each with the turn it was asked in", () => {
  const { openQuestionRows } = questions;
  const open = question("Who owns the rollout?", 1000, "s-1");
  const answered = question("Is Tuesday the date?", 2000, "s-2");
  const silent = question("Can we ship on Friday?", 3000, "s-3");
  const unknown = question("What does the audit need?", 4000, "s-4");
  const hedged = question("Will legal sign off?", 5000, "s-5");
  const later = question("Are we doing the webinar?", 9000, "s-9");
  const events = new Map([
    [
      11,
      [
        open,
        answered,
        response(answered, "answered", 2100),
        silent,
        response(silent, "silence", 3100),
        unknown,
        response(unknown, "denied", 4100),
        hedged,
        response(hedged, "uncertain_response", 5100),
      ],
    ],
    [12, [later]],
  ]);
  const rows = openQuestionRows(events);
  assert.deepEqual(
    rows.map((row) => row.question),
    ["Are we doing the webinar?", "Can we ship on Friday?", "Who owns the rollout?"],
    "asked and never answered, or met with silence; not answered, not 'did not know', not hedged"
  );
  assert.deepEqual(
    rows.map((row) => [row.noteId, row.segmentId]),
    [
      [12, "s-9"],
      [11, "s-3"],
      [11, "s-1"],
    ]
  );
});

test("no conversations, or none with questions, make no rows", () => {
  const { openQuestionRows } = questions;
  assert.deepEqual(openQuestionRows(new Map()), []);
  assert.deepEqual(openQuestionRows(new Map([[3, []]])), []);
});
