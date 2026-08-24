const test = require("node:test");
const assert = require("node:assert/strict");

let isEnglish;
let resolveWhisperModel;

test.before(async () => {
  ({ isEnglish, resolveWhisperModel } = await import("../../src/helpers/whisperEnglishModel.mjs"));
});

const everything = () => true;
const nothing = () => false;

test("English in its various spellings is English", () => {
  for (const code of ["en", "EN", "en-US", "en_GB", " en ", "en-gb"]) {
    assert.equal(isEnglish(code), true, code);
  }
});

// Auto-detection needs the multilingual model — an .en build has no language
// head to detect with — so "auto" must not be treated as English.
test("auto is not English, and neither is anything else", () => {
  for (const code of ["auto", "de", "fr", "zh-CN", "", null, undefined, 7]) {
    assert.equal(isEnglish(code), false, String(code));
  }
});

test("an English speaker gets the English model when it is installed", () => {
  assert.equal(resolveWhisperModel("base", "en", everything), "base.en");
  assert.equal(resolveWhisperModel("small", "en-US", everything), "small.en");
});

// An upgrade that fails to load is worse than the model the user already had.
test("it never selects a model that is not on disk", () => {
  assert.equal(resolveWhisperModel("base", "en", nothing), "base");
  assert.equal(
    resolveWhisperModel("base", "en", (id) => id === "small.en"),
    "base"
  );
});

test("a non-English or undecided language keeps the multilingual model", () => {
  assert.equal(resolveWhisperModel("base", "auto", everything), "base");
  assert.equal(resolveWhisperModel("base", "de", everything), "base");
  assert.equal(resolveWhisperModel("base", null, everything), "base");
});

test("sizes with no English twin are left alone", () => {
  assert.equal(resolveWhisperModel("large", "en", everything), "large");
  assert.equal(resolveWhisperModel("turbo", "en", everything), "turbo");
});

test("an already-English choice is not doubled", () => {
  assert.equal(resolveWhisperModel("base.en", "en", everything), "base.en");
});

test("malformed input returns something loadable or empty, never a guess", () => {
  assert.equal(resolveWhisperModel("", "en", everything), "");
  assert.equal(resolveWhisperModel(null, "en", everything), "");
  assert.equal(resolveWhisperModel("base", "en", null), "base");
});
