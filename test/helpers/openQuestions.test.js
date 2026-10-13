const test = require("node:test");
const assert = require("node:assert/strict");

let questions;
let review;
let marks;

test.before(async () => {
  questions = await import("../../src/components/global/openQuestions.ts");
  review = await import("../../src/helpers/conversationReview.mjs");
  marks = await import("../../src/components/conversation/questionMarks.ts");
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

test("every question Home counts as open, newest first, each with its mark and turn", () => {
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
    [
      "Are we doing the webinar?",
      "What does the audit need?",
      "Can we ship on Friday?",
      "Who owns the rollout?",
    ],
    "asked and never answered, met with silence, or nobody knew; not answered, not hedged"
  );
  assert.deepEqual(
    rows.map((row) => [row.noteId, row.segmentId]),
    [
      [12, "s-9"],
      [11, "s-4"],
      [11, "s-3"],
      [11, "s-1"],
    ]
  );
  // The marks every surface draws: an empty ring with no verdict, the filled
  // warning mark when nobody knew.
  assert.deepEqual(
    rows.map((row) => marks.markKind(row.state)),
    ["open", "unknown", "open", "open"]
  );
  // The count Home shows ("N open", `notes.open_questions`) is the same count.
  for (const [noteId, list] of events) {
    assert.equal(
      rows.filter((row) => row.noteId === noteId).length,
      review.openQuestionCount(list),
      `conversation ${noteId}`
    );
  }
});

test("no conversations, or none with questions, make no rows", () => {
  const { openQuestionRows } = questions;
  assert.deepEqual(openQuestionRows(new Map()), []);
  assert.deepEqual(openQuestionRows(new Map([[3, []]])), []);
});
