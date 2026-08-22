const test = require("node:test");
const assert = require("node:assert/strict");

// House convention for a pure `.mjs` helper from CommonJS (see
// conversationGraph.test.js): no build step, reached by dynamic import.
let nextAnnouncement;

test.before(async () => {
  ({ nextAnnouncement } = await import("../../src/helpers/questionAnnouncement.mjs"));
});

/** A card. Cards arrive oldest first, which is the order the rail holds them. */
function card(id, question, occurrence = 1) {
  return { id, question, occurrence };
}

test("nothing new produces no announcement", () => {
  assert.equal(nextAnnouncement([], new Set()), null);
  const spoken = new Set(["a"]);
  assert.equal(nextAnnouncement([card("a", "who owns pricing?")], spoken), null);
});

test("the first question of a conversation is announced", () => {
  const result = nextAnnouncement([card("a", "who owns pricing?")], new Set());
  assert.deepEqual(result.ids, ["a"]);
  assert.equal(result.question, "who owns pricing?");
  assert.equal(result.count, 1);
  assert.equal(result.occurrence, 1);
});

// The failure the screen reader caught three times: the region went backwards.
test("dismissing the newest card does not re-announce an older one", () => {
  const cards = [card("a", "who owns pricing?"), card("b", "what is churn?")];
  const spoken = new Set();
  const first = nextAnnouncement(cards, spoken);
  for (const id of first.ids) spoken.add(id);
  assert.equal(first.question, "what is churn?");

  // "b" is dismissed, so the list's tail falls back to "a".
  assert.equal(nextAnnouncement([card("a", "who owns pricing?")], spoken), null);
  // ...and undo restores it. Still already heard.
  assert.equal(nextAnnouncement(cards, spoken), null);
});

test("a card is never announced twice however the list is reordered", () => {
  const spoken = new Set();
  const cards = [card("a", "one?"), card("b", "two?"), card("c", "three?")];
  for (const card of cards) {
    const result = nextAnnouncement([card], spoken);
    for (const id of result.ids) spoken.add(id);
  }
  assert.equal(nextAnnouncement([...cards].reverse(), spoken), null);
  assert.equal(nextAnnouncement(cards, spoken), null);
});

// Segments finalize every ~5s, so two questions in one batch is ordinary.
test("questions arriving together are all marked spoken and counted", () => {
  const cards = [card("a", "who owns pricing?"), card("b", "what is churn?")];
  const result = nextAnnouncement(cards, new Set());
  assert.deepEqual(result.ids, ["a", "b"]);
  assert.equal(result.count, 2);
  // The newest is the one read out; the count says the other one exists.
  assert.equal(result.question, "what is churn?");
});

// Rule 3: repeats are never suppressed. A live region only speaks when its text
// changes, so an identical re-asking has to be announced as a re-asking.
test("a re-asking carries its occurrence, so its text differs from the first", () => {
  const spoken = new Set();
  const first = nextAnnouncement([card("a", "what is churn?", 1)], spoken);
  for (const id of first.ids) spoken.add(id);
  assert.equal(first.occurrence, 1);

  const again = nextAnnouncement(
    [card("a", "what is churn?", 1), card("b", "what is churn?", 2)],
    spoken
  );
  assert.deepEqual(again.ids, ["b"]);
  assert.equal(again.occurrence, 2);
  assert.equal(again.question, "what is churn?");
});

test("a card with no question text is still marked spoken, not reconsidered forever", () => {
  const result = nextAnnouncement([{ id: "a" }], new Set());
  assert.deepEqual(result.ids, ["a"]);
  assert.equal(result.count, 0);
  assert.equal(result.question, "");
});

test("malformed input does not throw", () => {
  assert.equal(nextAnnouncement(undefined, new Set()), null);
  assert.equal(nextAnnouncement([null, { question: "no id?" }], new Set()), null);
});
