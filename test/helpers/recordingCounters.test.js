const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A pure `.mjs` helper reached through a dynamic import, like
// conversationContour.test.js.
let countWords, sittingWordCount, sittingQuestionCount, splitAroundCount;

test.before(async () => {
  ({ countWords, sittingWordCount, sittingQuestionCount, splitAroundCount } = await import(
    "../../src/helpers/recordingCounters.mjs"
  ));
});

const T0 = 1_700_000_000_000;

test("words are words, not characters or punctuation", () => {
  assert.equal(countWords("So the question is whether we ship it."), 8);
  // A contraction is one word; a number is a word; punctuation is not.
  assert.equal(countWords("We don't know, it's 3.5 times faster."), 7);
  assert.equal(countWords("  ...  "), 0);
  assert.equal(countWords(""), 0);
  assert.equal(countWords(undefined), 0);
  assert.equal(countWords("Das Gespräch läuft. Wörter zählen!"), 5);
  assert.equal(countWords("Это проверка, правда?"), 3);
});

test("a language written without spaces counts its words, not its sentences", () => {
  // Split on spaces, each of these is one "word".
  const japanese = countWords("移行は取締役会の前に着地すべきです");
  const chinese = countWords("我们今天讨论一下新的设置页面。");
  assert.ok(japanese >= 6 && japanese <= 17, `ja ${japanese}`);
  assert.ok(chinese >= 5 && chinese <= 14, `zh ${chinese}`);
});

/** A segment said `seconds` after T0. */
const said = (seconds, text) => ({ id: `s${seconds}`, text, timestamp: T0 + seconds * 1000 });

test("only this sitting's words count, as the clock and the contour measure it", () => {
  // Continuing a conversation seeds its earlier segments into the store.
  const segments = [
    said(-600, "This was said in the previous sitting."),
    said(-5, "And this just before record was pressed."),
    said(3, "Now the conversation starts."),
    said(9, "And it goes on."),
  ];
  assert.equal(sittingWordCount(segments, T0, new WeakMap()), 8);
  // With no sitting to ask about, everything counts.
  assert.equal(sittingWordCount(segments, null, new WeakMap()), 22);
  // A segment with no time is not this sitting's.
  assert.equal(sittingWordCount([{ text: "no time" }], T0, new WeakMap()), 0);
  assert.equal(sittingWordCount(undefined, T0, new WeakMap()), 0);
});

test("each segment is counted once, and again when the store replaces it", () => {
  const cache = new WeakMap();
  const first = said(1, "one two three");
  const segments = [first, said(2, "four five")];
  assert.equal(sittingWordCount(segments, T0, cache), 5);
  assert.equal(cache.get(first), 3);
  // A retraction removes a segment; its words go with it.
  assert.equal(sittingWordCount(segments.slice(1), T0, cache), 2);
  // A segment the store rewrote (a new object) is counted from its new text.
  const rewritten = { ...first, text: "one two three four" };
  assert.equal(sittingWordCount([rewritten, segments[1]], T0, cache), 6);
});

test("questions: one per card, repeats included, this sitting only", () => {
  const cards = [
    { id: "a", createdAt: T0 - 1000 },
    { id: "b", createdAt: T0 + 4000 },
    { id: "b2", createdAt: T0 + 9000, occurrence: 2 },
    { id: "c", createdAt: T0 + 12000 },
  ];
  assert.equal(sittingQuestionCount(cards, T0), 3);
  assert.equal(sittingQuestionCount(cards, null), 4);
  assert.equal(sittingQuestionCount([], T0), 0);
  assert.equal(sittingQuestionCount(null, T0), 0);
});

test("the label splits around its number, wherever the language puts it", () => {
  assert.deepEqual(splitAroundCount("1234 words", 1234), { before: "", after: " words" });
  assert.deepEqual(splitAroundCount("質問 5 件", 5), { before: "質問 ", after: " 件" });
  assert.deepEqual(splitAroundCount("0 questions", 0), { before: "", after: " questions" });
  assert.equal(splitAroundCount("words", 12), null);
  assert.equal(splitAroundCount(undefined, 12), null);
});

// Every locale's counter strings put the count in, so the split always finds it.
test("every locale's counters carry their count", () => {
  const dir = path.join(__dirname, "../../src/locales");
  for (const locale of fs.readdirSync(dir)) {
    const file = path.join(dir, locale, "translation.json");
    if (!fs.existsSync(file)) continue;
    const counters = JSON.parse(fs.readFileSync(file, "utf8")).oats.conversation.counters;
    assert.ok(counters, `${locale} has counters`);
    for (const [key, value] of Object.entries(counters)) {
      assert.match(value, /\{\{count\}\}/, `${locale} ${key}`);
      // The copy rules: no em or en dash in a counter.
      assert.doesNotMatch(value, /[–—]/, `${locale} ${key}`);
    }
  }
});
