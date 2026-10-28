const test = require("node:test");
const assert = require("node:assert/strict");

let isOnlySoundLabels;

test.before(async () => {
  ({ isOnlySoundLabels } = await import("../../src/helpers/soundLabels.mjs"));
});

// What base.en and small.en wrote for a whole segment in the room replays.
const LABELS = [
  "[inaudible]",
  "[ Inaudible ]",
  "(muffled speaking)",
  "(mumbles)",
  "(laughing)",
  "[MUSIC PLAYING]",
  "(door closes)",
  "(speaking in foreign language)",
  ">> [INAUDIBLE]",
  "- (laughing)",
  "*clears throat*",
  "♪ Don't you ♪",
  "[Music] [Applause]",
];

test("a segment that is only sound labels is not words anybody said", () => {
  for (const text of LABELS) assert.equal(isOnlySoundLabels(text), true, text);
});

test("words stay, with a label among them", () => {
  for (const text of [
    "Yeah.",
    "(laughs) Yeah, that's right.",
    "Hello (laughs)",
    "3.10 days left.",
  ]) {
    assert.equal(isOnlySoundLabels(text), false, text);
  }
});

test("an empty text is not a label", () => {
  assert.equal(isOnlySoundLabels(""), false);
  assert.equal(isOnlySoundLabels(null), false);
});
