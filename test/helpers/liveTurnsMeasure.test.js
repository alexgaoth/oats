const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §3: reading text, transcript turns included, is capped near 70
// characters. The live dialogue's turns are transcript turns, and focus on
// record widens their column (about 130 characters a line at 1200 px), so
// both kinds of turn carry the cap. Source-level: the width needs a browser.

const DIALOGUE = fs.readFileSync(
  path.join(__dirname, "../../src/components/conversation/ConversationDialogue.tsx"),
  "utf8"
);

test("a finished turn is capped near 70 characters", () => {
  assert.match(DIALOGUE, /<li key=\{turn\.id\} className="max-w-\[70ch\][^"]*"/);
});

test("the turn still being heard is capped the same way", () => {
  assert.match(DIALOGUE, /key="in-progress"\s*className="max-w-\[70ch\][^"]*"/);
});
