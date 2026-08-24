const test = require("node:test");
const assert = require("node:assert/strict");

let partitionKeys;
let prefixesOf;
let stemOf;
let flattenKeys;

test.before(async () => {
  ({ partitionKeys, prefixesOf, stemOf, flattenKeys } =
    await import("../../src/helpers/localeKeyUsage.mjs"));
});

test("a key's prefixes run longest first", () => {
  assert.deepEqual(prefixesOf("a.b.c"), ["a.b.c", "a.b", "a"]);
  assert.deepEqual(prefixesOf("solo"), ["solo"]);
});

test("plural suffixes are stripped, and only real ones", () => {
  assert.equal(stemOf("x.y_one"), "x.y");
  assert.equal(stemOf("x.y_other"), "x.y");
  assert.equal(stemOf("x.y_custom"), "x.y_custom");
  assert.equal(stemOf("x.y"), "x.y");
});

test("nesting flattens to leaf paths", () => {
  assert.deepEqual(flattenKeys({ a: { b: "1", c: { d: "2" } }, e: "3" }), ["a.b", "a.c.d", "e"]);
});

// The defect this exists to prevent: a literal search reports a live key as dead.
test("a dynamically built key survives because its prefix is present", () => {
  const translation = { oats: { match: { transcript: "said", summary: "summary" } } };
  const source = "t(`oats.match.${excerpt.source}`)";
  const { reachable, unreachable } = partitionKeys(translation, source);
  assert.deepEqual(unreachable, []);
  assert.deepEqual(reachable.sort(), ["oats.match.summary", "oats.match.transcript"]);
});

test("a key nothing mentions at any depth is unreachable", () => {
  const translation = { alive: { used: "x" }, dead: { gone: "y" } };
  const { reachable, unreachable } = partitionKeys(translation, 't("alive.used")');
  assert.deepEqual(reachable, ["alive.used"]);
  assert.deepEqual(unreachable, ["dead.gone"]);
});

test("plurals are judged by their stem, and kept with their suffix", () => {
  const translation = { card: { askedTimes_one: "a", askedTimes_other: "b" } };
  const { reachable } = partitionKeys(translation, 't("card.askedTimes", { count })');
  assert.deepEqual(reachable.sort(), ["card.askedTimes_one", "card.askedTimes_other"]);
});

// A bare top-level word appears in prose everywhere; requiring a dot keeps the
// rule from declaring the whole file reachable.
test("a single-segment namespace is not a match on its own", () => {
  const translation = { common: { cancel: "Cancel" } };
  const { unreachable } = partitionKeys(translation, "the word common appears in this comment");
  assert.deepEqual(unreachable, ["common.cancel"]);
});

test("an empty or missing source makes everything unreachable, not everything alive", () => {
  const translation = { a: { b: "x" } };
  assert.deepEqual(partitionKeys(translation, "").unreachable, ["a.b"]);
  assert.deepEqual(partitionKeys(translation, undefined).unreachable, ["a.b"]);
});

test("malformed input does not throw", () => {
  assert.deepEqual(partitionKeys(null, "x"), { reachable: [], unreachable: [] });
  assert.deepEqual(flattenKeys(undefined), []);
});
