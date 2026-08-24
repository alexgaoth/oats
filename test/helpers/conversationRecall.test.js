const test = require("node:test");
const assert = require("node:assert/strict");

let findExcerpt;
let mergeRecall;

test.before(async () => {
  ({ findExcerpt, mergeRecall } = await import("../../src/helpers/conversationRecall.mjs"));
});

const SAID = "so the question is whether enterprise pricing lands before the board meeting";

function note(overrides = {}) {
  return {
    id: 1,
    title: "Board prep",
    enhanced_content: "We agreed on enterprise pricing before the demo.",
    transcript: JSON.stringify([{ id: "s1", text: SAID, timestamp: 1700 }]),
    ...overrides,
  };
}

// The whole point of the provenance label: an evidence tool must say whether it
// found something somebody said or something a model wrote.
test("what was said outranks what Oats wrote, which outranks the name", () => {
  // "pricing" is in all three; the transcript wins.
  assert.equal(findExcerpt(note(), "pricing").source, "transcript");
  // "agreed" is only in the summary.
  assert.equal(findExcerpt(note(), "agreed").source, "summary");
  // "prep" is only in the title.
  assert.equal(findExcerpt(note(), "prep").source, "title");
});

test("a transcript match carries the segment it came from", () => {
  const found = findExcerpt(note(), "board meeting");
  assert.equal(found.segmentId, "s1");
  assert.equal(found.timestamp, 1700);
  assert.equal(found.match, "board meeting");
  assert.equal(`${found.before}${found.match}${found.after}`, SAID);
});

// Offsets into a string that is then normalised and trimmed are offsets into a
// different string. Three pieces cannot drift out of step with each other.
test("the excerpt is returned as pieces that concatenate", () => {
  const long = "x ".repeat(200) + SAID + " y".repeat(200);
  const found = findExcerpt(
    note({ transcript: JSON.stringify([{ id: "s9", text: long }]) }),
    "enterprise"
  );
  assert.ok(found.prefixed, "a match deep in a long turn is preceded by more text");
  assert.equal(found.match, "enterprise");
  assert.ok(!found.before.startsWith(" "), "no leading space to be trimmed away later");
  assert.ok(!found.after.endsWith(" "));
});

test("matching is case-insensitive but the excerpt is not folded", () => {
  const found = findExcerpt(note({ title: "Board Prep" }), "BOARD PREP");
  assert.equal(found.source, "title");
  assert.equal(found.match, "Board Prep");
});

test("no match anywhere is null, not an empty excerpt", () => {
  assert.equal(findExcerpt(note(), "sailboat"), null);
  assert.equal(findExcerpt(note(), ""), null);
  assert.equal(findExcerpt(note(), "   "), null);
  assert.equal(findExcerpt(null, "pricing"), null);
});

test("a malformed transcript falls through instead of throwing", () => {
  assert.equal(findExcerpt(note({ transcript: "{not json" }), "agreed").source, "summary");
  assert.equal(findExcerpt(note({ transcript: null }), "agreed").source, "summary");
  assert.equal(findExcerpt(note({ transcript: '{"a":1}' }), "prep").source, "title");
});

// A search that demotes a word you can see in favour of a guess is a search you
// stop trusting.
test("literal results keep their order and their place ahead of guesses", () => {
  const literal = [{ id: 1 }, { id: 2 }];
  const semantic = [{ id: 3 }, { id: 2 }, { id: 4 }];
  const merged = mergeRecall(literal, semantic);
  assert.deepEqual(
    merged.map((m) => [m.note.id, m.related]),
    [
      [1, false],
      [2, false],
      [3, true],
      [4, true],
    ]
  );
});

test("merging survives a missing or empty semantic result", () => {
  assert.deepEqual(mergeRecall([{ id: 1 }], undefined), [{ note: { id: 1 }, related: false }]);
  assert.deepEqual(mergeRecall([], []), []);
});
