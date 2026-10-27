const test = require("node:test");
const assert = require("node:assert/strict");

let isEnglish;
let resolveWhisperModel;

test.before(async () => {
  ({ isEnglish, resolveWhisperModel } = await import("../../src/helpers/whisperEnglishModel.mjs"));
});

const everything = () => true;
const nothing = () => false;
const only =
  (...ids) =>
  (id) =>
    ids.includes(id);

// What each build installs on first launch (bundledWhisperModels.mjs).
const APPLE_SILICON = only("base", "small.en");
const INTEL_AND_LINUX = only("base", "base.en");

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

test("English: the size's English twin when it is installed", () => {
  assert.equal(resolveWhisperModel("base", "en", everything), "base.en");
  assert.equal(resolveWhisperModel("small", "en-US", everything), "small.en");
});

test("English: the size itself when its twin is not installed", () => {
  assert.equal(resolveWhisperModel("small", "en", only("small", "base.en")), "small");
});

test("English: base.en, then base, when neither the twin nor the size is installed", () => {
  assert.equal(resolveWhisperModel("small", "en", INTEL_AND_LINUX), "base.en");
  assert.equal(resolveWhisperModel("medium", "en", APPLE_SILICON), "base");
  assert.equal(resolveWhisperModel("base", "en", APPLE_SILICON), "base");
});

test("English: an .en id is read as its size", () => {
  assert.equal(resolveWhisperModel("base.en", "en", everything), "base.en");
  assert.equal(resolveWhisperModel("small.en", "en", only("small", "base")), "small");
  assert.equal(resolveWhisperModel("small.en", "en", nothing), "base");
});

test("English: a size with no English twin is kept when installed, else base", () => {
  assert.equal(resolveWhisperModel("large", "en", everything), "large");
  assert.equal(resolveWhisperModel("turbo", "en", everything), "turbo");
  assert.equal(resolveWhisperModel("turbo", "en", INTEL_AND_LINUX), "base.en");
  assert.equal(resolveWhisperModel("turbo", "en", only("base")), "base");
});

test("another language: the multilingual size when it is installed", () => {
  assert.equal(resolveWhisperModel("base", "de", everything), "base");
  assert.equal(resolveWhisperModel("small", "fr", everything), "small");
  assert.equal(resolveWhisperModel("turbo", "ja", everything), "turbo");
});

// Apple Silicon starts on "small" and ships small.en, not small.
test("another language: base when the multilingual size is not installed", () => {
  assert.equal(resolveWhisperModel("small", "de", APPLE_SILICON), "base");
  assert.equal(resolveWhisperModel("turbo", "fr", only("base")), "base");
});

test("another language never gets an English-only model", () => {
  assert.equal(resolveWhisperModel("small.en", "de", everything), "small");
  assert.equal(resolveWhisperModel("small.en", "de", APPLE_SILICON), "base");
  assert.equal(resolveWhisperModel("base.en", "fr", INTEL_AND_LINUX), "base");
  for (const language of ["de", "fr", "zh-CN", "auto", null, undefined]) {
    for (const model of ["tiny", "base", "small", "medium", "small.en", "base.en"]) {
      const resolved = resolveWhisperModel(model, language, everything);
      assert.doesNotMatch(resolved, /\.en$/, `${model} in ${String(language)}`);
    }
  }
});

test("auto-detection and an unset language are not English", () => {
  for (const language of ["auto", null, undefined, ""]) {
    assert.equal(resolveWhisperModel("base", language, everything), "base", String(language));
    assert.equal(resolveWhisperModel("small", language, APPLE_SILICON), "base", String(language));
  }
});

// An upgrade that fails to load is worse than the model the user already had.
test("it never selects a model that is not on disk, and names base when nothing is", () => {
  assert.equal(resolveWhisperModel("base", "en", nothing), "base");
  assert.equal(resolveWhisperModel("base", "en", only("small.en")), "base");
  assert.equal(resolveWhisperModel("small", "de", nothing), "base");
  for (const language of ["en", "de", "auto"]) {
    for (const model of ["tiny", "base", "small", "small.en", "medium", "large", "turbo"]) {
      for (const isInstalled of [APPLE_SILICON, INTEL_AND_LINUX, only("base")]) {
        const resolved = resolveWhisperModel(model, language, isInstalled);
        assert.ok(isInstalled(resolved), `${model} in ${language} gave ${resolved}`);
      }
    }
  }
});

test("each build's default model resolves to what that build ships", () => {
  assert.equal(resolveWhisperModel("small", "en", APPLE_SILICON), "small.en");
  assert.equal(resolveWhisperModel("small", "auto", APPLE_SILICON), "base");
  assert.equal(resolveWhisperModel("base", "en", INTEL_AND_LINUX), "base.en");
  assert.equal(resolveWhisperModel("base", "auto", INTEL_AND_LINUX), "base");
});

test("a check that throws counts as not installed", () => {
  const throwing = (id) => {
    if (id === "small.en") throw new Error("Invalid model name");
    return id === "base";
  };
  assert.equal(resolveWhisperModel("small", "en", throwing), "base");
});

test("malformed input returns something loadable or empty, never a guess", () => {
  assert.equal(resolveWhisperModel("", "en", everything), "");
  assert.equal(resolveWhisperModel(null, "en", everything), "");
  assert.equal(resolveWhisperModel("  small  ", "en", everything), "small.en");
  assert.equal(resolveWhisperModel("base", "en", null), "base");
  assert.equal(resolveWhisperModel("small", "de", undefined), "small");
});
