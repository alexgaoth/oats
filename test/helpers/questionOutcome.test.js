const test = require("node:test");
const assert = require("node:assert/strict");

// CommonJS with a dynamic import, matching the other helper suites: the helper
// is a native ES module.
let buildConversationGraph, questionOutcome;

test.before(async () => {
  ({ buildConversationGraph } = await import("../../src/helpers/conversationGraph.mjs"));
  ({ questionOutcome } = await import("../../src/helpers/questionOutcome.mjs"));
});

const QUESTION = "who owns the migration?";

/** A stored question and, unless `metadata` is null, the response stored for it. */
function storedEvents(metadata) {
  const events = [
    {
      id: 1,
      kind: "question",
      parentEventId: null,
      segmentIds: ["s1"],
      text: QUESTION,
      metadata: { state: "asked", groupKey: "g1", occurrence: 1 },
      createdAt: 1000,
    },
  ];
  if (metadata) {
    events.push({
      id: 2,
      kind: "response",
      parentEventId: 1,
      segmentIds: ["s2"],
      text: "",
      metadata,
      createdAt: 2000,
    });
  }
  return events;
}

// How the aide stores a verdict (conversationAide.mjs). The local reading of a
// reply writes its outcome as both `reason` and `outcome`; the classifier writes
// its own reason beside the outcome the card reached; a response stored before
// `outcome` was kept has the reason alone.
const local = (outcome) => ({ reason: outcome, outcome, trigger: "silence", source: "local" });
const classifier = (reason, outcome) => ({ reason, outcome, trigger: "silence" });

// One row per stored reason and outcome: [what was stored, the response's
// metadata (null: no response), the outcome every surface shows].
const ROWS = [
  ["no response", null, "asked"],

  ["local answered", local("answered"), "answered"],
  // The reported case: the contour drew this as denied, Connections as asked.
  ["local uncertain", local("uncertain"), "uncertain"],
  ["local silence", local("silence"), "silence"],
  ["local denied", local("denied"), "denied"],

  ["classifier answered", classifier("answered", "answered"), "answered"],
  ["classifier uncertain_response", classifier("uncertain_response", "uncertain"), "uncertain"],
  ["classifier silence", classifier("silence", "silence"), "silence"],
  ["classifier denied_knowledge", classifier("denied_knowledge", "denied"), "denied"],
  // Below the confidence threshold the local reading decides the card, and the
  // card's verdict is the question's.
  ["classifier denied_knowledge, unsure", classifier("denied_knowledge", "uncertain"), "uncertain"],
  ["classifier answered, unsure", classifier("answered", "silence"), "silence"],
  ["classifier not_factual, unsure", classifier("not_factual", "answered"), "answered"],

  ["reason only: answered", { reason: "answered" }, "answered"],
  ["reason only: uncertain", { reason: "uncertain" }, "uncertain"],
  ["reason only: uncertain_response", { reason: "uncertain_response" }, "uncertain"],
  ["reason only: silence", { reason: "silence" }, "silence"],
  ["reason only: denied", { reason: "denied" }, "denied"],
  ["reason only: denied_knowledge", { reason: "denied_knowledge" }, "denied"],
  ["reason only: not_factual", { reason: "not_factual" }, "asked"],

  // A response that names no verdict this build knows is an empty ring.
  ["no reason and no outcome", {}, "asked"],
  ["an unknown outcome", { reason: "answered", outcome: "partial" }, "asked"],
  ["an unknown reason", { reason: "mystery" }, "asked"],
  ["a reason that is an object key", { reason: "toString" }, "asked"],
];

for (const [label, metadata, expected] of ROWS) {
  test(`stored question, ${label}: ${expected}`, () => {
    const [node] = buildConversationGraph(storedEvents(metadata));
    assert.equal(questionOutcome(node), expected);
  });
}

test("a node with no response, or no node, has no verdict", () => {
  assert.equal(questionOutcome({ question: {}, response: null }), "asked");
  assert.equal(questionOutcome(null), "asked");
  assert.equal(questionOutcome(undefined), "asked");
});

// The contour (useContour.ts) and Connections (ConversationGraph.tsx) call the
// rule directly. These are the surfaces node:test can reach, row for row.
test("the review, the transcript's margin, the title line and the vault agree", async () => {
  const { buildReview, questionOutcomes, questionTurns } =
    await import("../../src/helpers/conversationReview.mjs");
  const { openQuestions } = await import("../../src/helpers/obsidianNote.mjs");
  for (const [label, metadata, expected] of ROWS) {
    const events = storedEvents(metadata);
    const answered = expected === "answered";
    assert.equal(questionTurns(events).get("s1"), expected, label);
    assert.deepEqual(questionOutcomes(events).outcomes, [{ outcome: expected, count: 1 }], label);
    const review = buildReview({ events });
    assert.equal(review.answered, answered ? 1 : 0, label);
    assert.deepEqual(
      review.unresolved.map((item) => item.outcome),
      answered ? [] : [expected],
      label
    );
    assert.deepEqual(openQuestions(events), answered ? [] : [QUESTION], label);
  }
});
