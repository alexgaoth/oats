const test = require("node:test");
const assert = require("node:assert/strict");
let comparisonEvidence, sharedTopicLabels;
test.before(async () => {
  ({ comparisonEvidence, sharedTopicLabels } =
    await import("../../src/helpers/conversationComparison.mjs"));
});
test("comparison quotes stored marks and keeps legacy source ids", () => {
  const note = {
    transcript: JSON.stringify([
      { text: "Actual source.", timestamp: 100 },
      { id: "two", text: "Later source.", timestamp: 800 },
    ]),
    conversation_marks: JSON.stringify([{ at: 101, note: "My annotation" }]),
    conversation_topics: JSON.stringify({
      nodes: [{ label: "Budget", description: "Stored description." }],
    }),
  };
  const result = comparisonEvidence(note);
  assert.equal(result.marks[0].quote, "Actual source.");
  assert.equal(result.marks[0].segmentId, "legacy-0");
  assert.equal(result.marks[0].note, "My annotation");
  assert.deepEqual(result.topics, [{ label: "Budget", description: "Stored description." }]);
  assert.equal(result.questionsKnown, false);
  assert.equal(comparisonEvidence({ open_questions: 0 }).questionsKnown, true);
});
test("malformed or missing source data does not become invented evidence", () => {
  const result = comparisonEvidence({
    transcript: "{",
    conversation_topics: "null",
    conversation_marks: JSON.stringify([{ at: 10, note: "Still kept" }]),
  });
  assert.equal(result.marks[0].quote, "");
  assert.equal(result.marks[0].segmentId, null);
  assert.deepEqual(result.topics, []);
  assert.deepEqual(result.questions, []);
  assert.doesNotThrow(() => comparisonEvidence({ transcript: "[null,12,{}]" }));
});
test("shared topic labels do not infer semantic equivalence", () => {
  const result = sharedTopicLabels(
    [{ label: "Résumé" }, { label: "Costs" }],
    [{ label: "resume" }, { label: "Budget" }]
  );
  assert.deepEqual([...result], ["resume"]);
});
