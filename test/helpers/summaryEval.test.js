const test = require("node:test");
const assert = require("node:assert/strict");

// The summary eval (scripts/summary-eval.mjs, docs/summaries.md) claims to run
// exactly what Finish sends. These pin the pieces that claim rests on: the
// prompt read from the app's source, the transcript as Finish formats it, and
// the two scores that need no judge.

let corpus;
let score;

test.before(async () => {
  corpus = await import("../../scripts/lib/summary-corpus.mjs");
  score = await import("../../scripts/lib/summary-score.mjs");
});

test("the eval reads the summary prompt Finish sends, from the source", () => {
  const prompt = corpus.appSummaryPrompt();
  // MEETING_SYSTEM_PROMPT (actionProcessingStore.ts), then the built-in action's
  // prompt seeded by database.js, joined as runBackgroundAction joins them.
  assert.match(prompt.system, /^You are a professional meeting notes assistant\./);
  assert.match(prompt.system, /\nInstructions: Transform the provided content into clean/);
  assert.ok(prompt.system.includes("(`- [ ]`)"), "the template literal's escapes are undone");
  assert.match(prompt.userPrefix, /^## Conversation [Tt]ranscript\n$/);
  assert.match(prompt.titleSystem, /^Generate a concise 3-8 word title/);
});

test("a room's transcript reaches the model as Finish formats it: no labels, a blank line between", () => {
  const text = corpus.finishTranscript([
    { text: " Okay, shall we start? " },
    { text: "" },
    { text: "The budget is twelve fifty." },
  ]);
  assert.equal(text, "Okay, shall we start?\n\nThe budget is twelve fifty.");
});

test("ROUGE-L is the F1 of the longest common subsequence of words", () => {
  assert.equal(score.rougeL("a b c d", "a b c d"), 1);
  assert.equal(score.rougeL("", "a b"), 0);
  // LCS "a c d": precision 3/4, recall 3/4.
  assert.equal(score.rougeL("A b, c d.", "a c d e"), 0.75);
});

test("lines that give an item to You or Them are counted, and ordinary prose is not", () => {
  const summary = [
    "- [ ] **You:** Draft the budget.",
    "- [ ] Them: Send the samples.",
    "- [ ] Check the cost (You)",
    "- Review the design — Them",
    "You can see the remote was the focus.",
    "- [ ] Ask the designer for a second option.",
  ].join("\n");
  assert.equal(score.youThemLines(summary), 4);
});
