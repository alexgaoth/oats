const test = require("node:test");
const assert = require("node:assert/strict");

// The receipt under the Intelligence search box (searchReceipt.mjs):
// "12 matches in 4 conversations · 9 ms". It must count what the list shows,
// in the same folded text the filter and the highlight use.

let countOccurrences;
let tallyMatches;
let formatSearchDuration;
let foldText;
let findMatches;
let recallText;
test.before(async () => {
  ({ countOccurrences, tallyMatches, formatSearchDuration } =
    await import("../../src/helpers/searchReceipt.mjs"));
  ({ foldText, findMatches } = await import("../../src/helpers/searchFold.mjs"));
  ({ recallText } = await import("../../src/helpers/conversationRecall.mjs"));
});

test("occurrences are counted the way findMatches walks: each resumes after itself", () => {
  assert.equal(countOccurrences("aaaa", "aa"), 2);
  assert.equal(countOccurrences("price and rice", "rice"), 2);
  assert.equal(countOccurrences("nothing here", "rice"), 0);
  assert.equal(countOccurrences("anything", ""), 0);
  assert.equal(countOccurrences(undefined, "x"), 0);
});

const note = (id, overrides = {}) => ({
  id,
  title: "Board prep",
  enhanced_content: "We agreed on enterprise pricing before the demo.",
  transcript: JSON.stringify([
    { id: "s1", text: "So, enterprise pricing lands before the board meeting?", timestamp: 1 },
    { id: "s2", text: "Enterprise first. Pricing after the résumé review.", timestamp: 2 },
  ]),
  conversation_marks: null,
  ...overrides,
});

test("a tally counts every match in the conversations that match, and only those", () => {
  const notes = [
    note(1),
    note(2, { title: "Café with Marco", enhanced_content: "", transcript: "[]" }),
    note(3, { title: "Pricing review", enhanced_content: "PRICING again", transcript: "[]" }),
  ];
  const texts = notes.map((n) => foldText(recallText(n)));
  assert.deepEqual(tallyMatches(texts, foldText("pricing")), { matches: 5, conversations: 2 });
  assert.deepEqual(tallyMatches(texts, foldText("cafe")), { matches: 1, conversations: 1 });
  assert.deepEqual(tallyMatches(texts, foldText("resume")), { matches: 1, conversations: 1 });
  assert.deepEqual(tallyMatches(texts, foldText("zebra")), { matches: 0, conversations: 0 });
});

test("the receipt agrees with the highlight on every query", () => {
  const notes = [
    note(1),
    note(2, {
      title: "İstanbul trip",
      enhanced_content: "Señor Díaz said istanbul twice: Istanbul.",
    }),
    note(3, {
      title: "定价会议",
      enhanced_content: "我们讨论了定价和价格。定价很重要。",
      transcript: "[]",
    }),
  ];
  for (const query of [
    "pricing",
    "enterprise",
    "istanbul",
    "senor",
    "résumé",
    "定价",
    "价格",
    "e",
    "  board  ",
  ]) {
    const expected = notes.reduce((sum, n) => sum + findMatches(recallText(n), query).length, 0);
    const { matches } = tallyMatches(
      notes.map((n) => foldText(recallText(n))),
      foldText(query.trim())
    );
    assert.equal(matches, expected, query);
  }
});

test("a duration reads in the reader's number format, finer when it is short", () => {
  assert.equal(formatSearchDuration(0.42, "en"), "0.4 ms");
  assert.equal(formatSearchDuration(9.04, "en"), "9 ms");
  assert.equal(formatSearchDuration(9.46, "en"), "9.5 ms");
  assert.equal(formatSearchDuration(12.6, "en"), "13 ms");
  assert.equal(formatSearchDuration(1234, "en"), "1.2 sec");
  assert.equal(formatSearchDuration(0.42, "de"), "0,4 ms");
  // Never "0 ms": that reads as a search that did not run.
  assert.equal(formatSearchDuration(0.03, "en"), "<0.1 ms");
  assert.equal(formatSearchDuration(0, "en"), "<0.1 ms");
  assert.equal(formatSearchDuration(0.03, "de"), "<0,1 ms");
  assert.equal(formatSearchDuration(0.05, "en"), "0.1 ms");
  assert.equal(formatSearchDuration(Number.NaN, "en"), null);
  assert.equal(formatSearchDuration(-1, "en"), null);
});
