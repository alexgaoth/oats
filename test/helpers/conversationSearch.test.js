const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/conversationSearch.ts");

const NOTE = {
  title: "Board prep and the pricing decision",
  summary: "## Threads\nThe room agreed to hold the enterprise tier.",
  transcript: "You: what did Ramp land on for seat price?\nConversation: nobody knew.",
};

test("a result opens on the view the query actually matched", async () => {
  const { matchTarget } = await load();

  assert.equal(matchTarget(NOTE, "pricing"), "summary", "a title match reads as a summary match");
  assert.equal(matchTarget(NOTE, "enterprise tier"), "summary");
  // The regression this exists for: finding a conversation by something said in
  // it used to drop you at the top of the summary, with the sentence you
  // searched for still to be hunted for by eye.
  assert.equal(matchTarget(NOTE, "seat price"), "transcript");
  assert.equal(matchTarget(NOTE, "ramp"), "transcript");
  // Nothing matched, and nothing typed, both mean "just open it".
  assert.equal(matchTarget(NOTE, "kubernetes"), "summary");
  assert.equal(matchTarget(NOTE, "   "), "summary");
});

test("matches are split out of the original text, not the folded copy", async () => {
  const { splitOnMatches } = await load();

  const parts = splitOnMatches("Ramp and RAMP and ramp", "ramp");
  assert.deepEqual(
    parts.map((part) => part.text),
    ["Ramp", " and ", "RAMP", " and ", "ramp"]
  );
  assert.deepEqual(
    parts.map((part) => part.match),
    [true, false, true, false, true]
  );
  // Reassembly is lossless — a highlight that drops a character is a transcript
  // that lies about what was said.
  assert.equal(parts.map((part) => part.text).join(""), "Ramp and RAMP and ramp");
});

test("a query that is not a valid regular expression is still just text", async () => {
  const { splitOnMatches } = await load();

  const parts = splitOnMatches("the cost (per seat) went up", "(per seat)");
  assert.deepEqual(
    parts.filter((part) => part.match).map((part) => part.text),
    ["(per seat)"]
  );
});

test("no query and no match both leave the text in one piece", async () => {
  const { splitOnMatches } = await load();

  assert.deepEqual(splitOnMatches("nothing to mark", ""), [
    { text: "nothing to mark", match: false },
  ]);
  assert.deepEqual(splitOnMatches("nothing to mark", "absent"), [
    { text: "nothing to mark", match: false },
  ]);
});
