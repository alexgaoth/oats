const test = require("node:test");
const assert = require("node:assert/strict");

// House convention for a pure `.mjs` helper from CommonJS (see
// conversationGraph.test.js): no build step, reached by dynamic import.
let newQuestionAnnouncements;
let nextCheckAnnouncement;

test.before(async () => {
  ({ newQuestionAnnouncements, nextCheckAnnouncement } =
    await import("../../src/helpers/questionAnnouncement.mjs"));
});

/** A card. Cards arrive oldest first, which is the order the rail holds them. */
function card(id, question, occurrence = 1) {
  return { id, question, occurrence };
}

test("nothing new produces no announcement", () => {
  assert.deepEqual(newQuestionAnnouncements([], new Set()), []);
  const spoken = new Set(["a"]);
  assert.deepEqual(newQuestionAnnouncements([card("a", "who owns pricing?")], spoken), []);
});

test("the first question of a conversation is announced", () => {
  const cards = [card("a", "who owns pricing?")];
  assert.deepEqual(newQuestionAnnouncements(cards, new Set()), cards);
});

// The failure the screen reader caught three times: the region went backwards.
test("dismissing the newest card does not re-announce an older one", () => {
  const cards = [card("a", "who owns pricing?"), card("b", "what is churn?")];
  const spoken = new Set();
  const first = newQuestionAnnouncements(cards, spoken);
  for (const { id } of first) spoken.add(id);

  // "b" is dismissed, so the list's tail falls back to "a".
  assert.deepEqual(newQuestionAnnouncements([card("a", "who owns pricing?")], spoken), []);
  // ...and undo restores it. Still already heard.
  assert.deepEqual(newQuestionAnnouncements(cards, spoken), []);
});

test("a card is never announced twice however the list is reordered", () => {
  const spoken = new Set();
  const cards = [card("a", "one?"), card("b", "two?"), card("c", "three?")];
  for (const card of cards) {
    const result = newQuestionAnnouncements([card], spoken);
    for (const { id } of result) spoken.add(id);
  }
  assert.deepEqual(newQuestionAnnouncements([...cards].reverse(), spoken), []);
  assert.deepEqual(newQuestionAnnouncements(cards, spoken), []);
});

// Segments finalize every ~5s, so two questions in one batch is ordinary.
test("questions arriving together each supply their own text to the live region", () => {
  const cards = [card("a", "who owns pricing?"), card("b", "what is churn?")];
  assert.deepEqual(newQuestionAnnouncements(cards, new Set()), cards);
});

// Rule 3: repeats are never suppressed. A live region only speaks when its text
// changes, so an identical re-asking has to be announced as a re-asking.
test("a re-asking carries its occurrence, so its text differs from the first", () => {
  const first = card("a", "what is churn?");
  const again = card("b", "what is churn?", 2);
  assert.deepEqual(newQuestionAnnouncements([first, again], new Set(["a"])), [again]);
});

test("a card with no question text is still marked spoken, not reconsidered forever", () => {
  const result = newQuestionAnnouncements([{ id: "a" }], new Set());
  assert.deepEqual(result, [card("a", "")]);
});

test("malformed input does not throw", () => {
  assert.deepEqual(newQuestionAnnouncements(undefined, new Set()), []);
  assert.deepEqual(newQuestionAnnouncements([null, { question: "no id?" }], new Set()), []);
});

test("a check's verdict is spoken once, and checking never", () => {
  const spoken = new Set();
  const checking = [{ id: "a", check: { state: "checking", by: "context" } }];
  assert.equal(nextCheckAnnouncement(checking, spoken), null);

  const landed = [
    { id: "a", check: { state: "wrong", answer: "October 30", source: { label: "plan.md" } } },
    { id: "b" },
  ];
  const first = nextCheckAnnouncement(landed, spoken);
  assert.deepEqual(first, { ids: ["a"], state: "wrong", answer: "October 30", source: "plan.md" });
  for (const id of first.ids) spoken.add(id);
  assert.equal(nextCheckAnnouncement(landed, spoken), null);

  // Two verdicts in one update: the newest is spoken, both are marked.
  const two = [
    { id: "c", check: { state: "right", answer: "Dana", source: { label: "owners.md" } } },
    {
      id: "d",
      check: { state: "answer", answer: "Friday", source: { label: "Hiring (2026-10-12)" } },
    },
  ];
  const next = nextCheckAnnouncement(two, spoken);
  assert.deepEqual(next.ids, ["c", "d"]);
  assert.equal(next.answer, "Friday");
});
