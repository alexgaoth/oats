const test = require("node:test");
const assert = require("node:assert/strict");

let MAX_CATCH_UP, WORDS_PER_SECOND, revealRate, revealedCount, revealedText, splitWords;

test.before(async () => {
  ({ MAX_CATCH_UP, WORDS_PER_SECOND, revealRate, revealedCount, revealedText, splitWords } =
    await import("../../src/helpers/wordReveal.mjs"));
});

test("words are split on any run of whitespace, and empty text has none", () => {
  assert.deepEqual(splitWords("so the question is"), ["so", "the", "question", "is"]);
  assert.deepEqual(splitWords("  spaced \n out\ttabs "), ["spaced", "out", "tabs"]);
  assert.deepEqual(splitWords(""), []);
  assert.deepEqual(splitWords("   "), []);
  assert.deepEqual(splitWords(null), []);
});

test("nothing is shown before any time has passed, and one word appears immediately after", () => {
  assert.equal(revealedCount({ total: 10, elapsedMs: 0 }), 0);
  assert.equal(revealedCount({ total: 10, elapsedMs: 1000 / WORDS_PER_SECOND + 1 }), 1);
});

test("the reveal runs at speech pace", () => {
  // Five seconds of speech is about thirteen words.
  const shown = revealedCount({ total: 100, elapsedMs: 5000 });
  assert.ok(shown >= 12 && shown <= 14, `expected ~13 words in 5s, got ${shown}`);
});

test("it never overshoots the text it has", () => {
  assert.equal(revealedCount({ total: 4, elapsedMs: 60_000 }), 4);
  assert.equal(revealedCount({ total: 0, elapsedMs: 60_000 }), 0);
});

test("appending continues from what was already shown, rather than retyping", () => {
  // Ten words already visible, one second more of speech.
  const shown = revealedCount({ total: 30, from: 10, elapsedMs: 1000 });
  assert.ok(shown > 10, "must not go backwards");
  assert.ok(shown < 16, "must not jump the whole remainder");
});

test("a backlog is hurried, but never simply dumped", () => {
  const calm = revealRate(5);
  const behind = revealRate(200);
  assert.equal(calm, WORDS_PER_SECOND, "one chunk's worth is not a backlog");
  assert.ok(behind > calm, "a real backlog must speed up");
  assert.ok(behind <= WORDS_PER_SECOND * MAX_CATCH_UP, "but the hurry is capped");
});

test("the rate climbs with the backlog rather than switching on", () => {
  const a = revealRate(20);
  const b = revealRate(60);
  const c = revealRate(120);
  assert.ok(a <= b && b <= c, `expected monotone, got ${a}, ${b}, ${c}`);
});

test("the visible prefix is whole words, and it reports when it is finished", () => {
  const partial = revealedText("so the question is", 2);
  assert.equal(partial.text, "so the");
  assert.equal(partial.done, false);
  assert.equal(partial.total, 4);

  const whole = revealedText("so the question is", 4);
  assert.equal(whole.text, "so the question is");
  assert.equal(whole.done, true);
});

test("asking for more words than exist is finished, not an error", () => {
  const over = revealedText("two words", 99);
  assert.equal(over.text, "two words");
  assert.equal(over.done, true);
});

test("empty text is finished immediately, so nothing waits on it", () => {
  const empty = revealedText("", 0);
  assert.equal(empty.text, "");
  assert.equal(empty.done, true);
  assert.equal(empty.total, 0);
});

test("a clock that jumps backwards does not un-reveal words", () => {
  assert.equal(revealedCount({ total: 20, from: 7, elapsedMs: -5000 }), 7);
  assert.equal(revealedCount({ total: 20, from: 7, elapsedMs: NaN }), 7);
});
