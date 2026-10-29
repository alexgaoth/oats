const test = require("node:test");
const assert = require("node:assert/strict");

// The summary at Finish (src/helpers/summaryCall.mjs): the limits its request
// gets on each writing route, and what may be saved as the summary.

let call;

test.before(async () => {
  call = await import("../../src/helpers/summaryCall.mjs");
});

test("a cloud model gets room to reason and time to finish", () => {
  assert.deepEqual(call.summaryLimits("providers"), {
    requireComplete: true,
    timeoutMs: call.SUMMARY_TIMEOUT_MS,
    maxTokens: call.SUMMARY_MAX_TOKENS,
  });
  // Above what was measured: gpt-5.5-pro took up to 125 s, and reasoning
  // models wrote up to 4,096 tokens and more.
  assert.ok(call.SUMMARY_TIMEOUT_MS >= 150_000);
  assert.ok(call.SUMMARY_MAX_TOKENS >= 4 * 3_811);
});

test("a self-hosted server gets the time but keeps its own output limit", () => {
  assert.deepEqual(call.summaryLimits("self-hosted"), {
    requireComplete: true,
    timeoutMs: call.SUMMARY_TIMEOUT_MS,
  });
});

test("a model on this computer keeps its limits: its context holds the transcript", () => {
  assert.deepEqual(call.summaryLimits("local"), { requireComplete: true });
});

test("nothing, or the transcript given back, is never a summary", () => {
  const transcript = "## Conversation Transcript\nOkay, shall we start?";
  assert.equal(call.summaryAnswerProblem("", transcript), "empty");
  assert.equal(call.summaryAnswerProblem("  \n ", transcript), "empty");
  assert.equal(call.summaryAnswerProblem(null, transcript), "empty");
  assert.equal(call.summaryAnswerProblem(`${transcript}\n`, transcript), "echo");
  assert.equal(call.summaryAnswerProblem("The team chose a yellow case.", transcript), null);
});
