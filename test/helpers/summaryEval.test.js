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

test("named meeting sets expand, in order, each meeting once, and dev never touches eval24", () => {
  assert.deepEqual(corpus.expandMeetings(["TS3003a", "dev16", "ES2002b"]).slice(0, 2), [
    "TS3003a",
    "ES2002b",
  ]);
  assert.equal(corpus.expandMeetings(["dev16"]).length, 16);
  assert.equal(corpus.expandMeetings(["testlong"]).length, 8);
  // Tuning stays off the test meetings: no dev meeting shares a series with eval24.
  const series = (meeting) => meeting.replace(/[a-d]$/, "");
  const tested = new Set(corpus.EVAL24.map(series));
  for (const meeting of corpus.DEV16) assert.ok(!tested.has(series(meeting)), meeting);
  for (const long of corpus.DEV_LONG) {
    for (const part of long.split("+")) assert.ok(!tested.has(series(part)), part);
  }
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
