const test = require("node:test");
const assert = require("node:assert/strict");

// The demo's context check (`check=1`, demo/harness/context.mjs) run through
// the app's own pieces: the index finds passages, the prompt is built, the
// stand-in judge answers, and the parser accepts the answer. If a change to
// the index or the parser broke the demo, a film would show no card; this
// says so first.

let context;
let check;

test.before(async () => {
  context = await import("../../demo/harness/context.mjs");
  check = await import("../../src/helpers/contextCheck.mjs");
});

const OPEN_QUESTIONS = [
  ["Do we have a date from the auditors yet?", "Fieldwork starts November 10"],
  ["How long does the full migration take on production?", "About six hours end to end"],
  ["Did any of those beta accounts lose data for good?", "No, every partial import was replayed"],
];

for (const [question, answer] of OPEN_QUESTIONS) {
  test(`the demo answers "${question}"`, () => {
    const passages = context.searchDemoContext(question);
    assert.ok(passages.length > 0, "the index finds a passage");
    const prompt = check.buildCheckPrompt({
      question,
      reply: "I don't know.",
      outcome: "denied",
      passages,
    });
    const verdict = check.parseCheckVerdict(context.judgeDemoCheck(prompt), {
      passages,
      outcome: "denied",
    });
    assert.equal(verdict?.verdict, "answer");
    assert.equal(verdict.answer, answer);
  });
}

test("a question the folder does not cover finds nothing", () => {
  assert.deepEqual(context.searchDemoContext("How was everyone's weekend?"), []);
});
