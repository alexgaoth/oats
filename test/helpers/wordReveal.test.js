const test = require("node:test");
const assert = require("node:assert/strict");

let REVEAL_BUDGET_MS, WORD_INTERVAL_MS, revealRate, revealStart, revealedCount, revealedText;
let splitWords;

test.before(async () => {
  ({
    REVEAL_BUDGET_MS,
    WORD_INTERVAL_MS,
    revealRate,
    revealStart,
    revealedCount,
    revealedText,
    splitWords,
  } = await import("../../src/helpers/wordReveal.mjs"));
});

test("words are split on any run of whitespace, and empty text has none", () => {
  assert.deepEqual(splitWords("so the question is"), ["so", "the", "question", "is"]);
  assert.deepEqual(splitWords("  spaced \n out\ttabs "), ["spaced", "out", "tabs"]);
  assert.deepEqual(splitWords(""), []);
  assert.deepEqual(splitWords("   "), []);
  assert.deepEqual(splitWords(null), []);
});

test("the first word shows at once, and the next follows at the typing pace", () => {
  const rate = revealRate(10);
  assert.equal(revealedCount({ total: 10, elapsedMs: 0, rate }), 1);
  assert.equal(revealedCount({ total: 10, elapsedMs: WORD_INTERVAL_MS - 1, rate }), 1);
  assert.equal(revealedCount({ total: 10, elapsedMs: WORD_INTERVAL_MS + 1, rate }), 2);
});

test("every reveal finishes within the budget, however long it is", () => {
  // The old reveal ran at speaking pace: 13 words took five seconds after they
  // had already been said.
  for (const words of [1, 2, 5, 13, 40, 200, 1000]) {
    const rate = revealRate(words);
    assert.equal(
      revealedCount({ total: words, elapsedMs: REVEAL_BUDGET_MS, rate }),
      words,
      `${words} words`
    );
  }
});

test("a long reveal is hurried, but never shown in one frame", () => {
  for (const words of [13, 40, 200, 1000]) {
    const rate = revealRate(words);
    const firstTick = revealedCount({ total: words, elapsedMs: 45, rate });
    assert.ok(firstTick < words / 2, `${words} words: ${firstTick} after one tick`);
  }
});

test("short text keeps the typing pace rather than racing", () => {
  assert.equal(revealRate(1), 1000 / WORD_INTERVAL_MS);
  assert.equal(revealRate(3), 1000 / WORD_INTERVAL_MS);
  assert.equal(revealRate(0), 1000 / WORD_INTERVAL_MS);
  assert.equal(revealRate(NaN), 1000 / WORD_INTERVAL_MS);
});

test("the rate climbs with the backlog rather than switching on", () => {
  const a = revealRate(20);
  const b = revealRate(60);
  const c = revealRate(120);
  assert.ok(a <= b && b <= c, `expected monotone, got ${a}, ${b}, ${c}`);
});

test("it never overshoots the text it has", () => {
  assert.equal(revealedCount({ total: 4, elapsedMs: 60_000 }), 4);
  assert.equal(revealedCount({ total: 0, elapsedMs: 60_000 }), 0);
  assert.equal(revealedCount({ total: 5, from: 9, elapsedMs: 0 }), 5);
});

test("appending continues from what was already shown, rather than retyping", () => {
  const shown = revealedCount({ total: 30, from: 10, elapsedMs: 100, rate: revealRate(20) });
  assert.ok(shown > 10, "must not go backwards");
  assert.ok(shown < 30, "must not jump the whole remainder");
});

test("a clock that jumps backwards shows no more and takes nothing away", () => {
  assert.equal(revealedCount({ total: 20, from: 7, elapsedMs: -5000 }), 8);
  assert.equal(revealedCount({ total: 20, from: 7, elapsedMs: NaN }), 8);
  assert.equal(revealedCount({ total: 20, from: 7, elapsedMs: 0 }), 8);
});

test("words the live line already showed are not typed again", () => {
  // A new turn whose first six words were on the live line.
  assert.equal(revealStart({ total: 10, carried: 6 }), 6);
  // The live line can say more than the final it became.
  assert.equal(revealStart({ total: 4, carried: 6 }), 4);
  // A turn of 20 words, all on screen, grows by 8, and the live line had 5 of them.
  assert.equal(revealStart({ total: 28, shown: 20, before: 20, carried: 5 }), 25);
});

test("with nothing carried, a reveal continues from what is on screen", () => {
  assert.equal(revealStart({ total: 10 }), 0);
  assert.equal(revealStart({ total: 28, shown: 20, before: 20 }), 20);
  // Still typing the old words when new ones arrive: carry on from there.
  assert.equal(revealStart({ total: 28, shown: 14, before: 20 }), 14);
  assert.equal(revealStart({ total: 0, shown: 3, carried: 3 }), 0);
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
