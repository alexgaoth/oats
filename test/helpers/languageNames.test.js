const test = require("node:test");
const assert = require("node:assert/strict");

// The language picker's names in the reader's language (languageNames.mjs),
// and a search that finds a language by that name, its English name or its
// code.

let localizedLanguageName;
let languageMatches;
let localizedLanguageOptions;
let registry;
test.before(async () => {
  ({ localizedLanguageName, languageMatches, localizedLanguageOptions } =
    await import("../../src/helpers/languageNames.mjs"));
  registry = require("../../src/config/languageRegistry.json").languages.map(
    ({ code, label, flag }) => ({ value: code, label, flag })
  );
});

test("a language is named in the interface's language", () => {
  assert.equal(localizedLanguageName("de", "de", "German"), "Deutsch");
  assert.equal(localizedLanguageName("de", "ja", "German"), "ドイツ語");
  assert.equal(localizedLanguageName("fr", "fr", "French"), "Français");
  assert.equal(localizedLanguageName("de", "es", "German"), "Alemán");
  // The registry's Chinese entries are scripts.
  assert.match(localizedLanguageName("zh-CN", "de", "Chinese (Simplified)"), /vereinfacht/i);
});

test("English keeps the registry's names, and so does a name nobody knows", () => {
  assert.equal(
    localizedLanguageName("zh-CN", "en", "Chinese (Simplified)"),
    "Chinese (Simplified)"
  );
  assert.equal(localizedLanguageName("de", "en-GB", "German"), "German");
  assert.equal(localizedLanguageName("auto", "de", "Auto-detect"), "Auto-detect");
  assert.equal(localizedLanguageName("qqq", "de", "Fallback"), "Fallback");
  assert.equal(localizedLanguageName("de", undefined, "German"), "German");
});

test("the search takes the shown name, the English name and the code", () => {
  const options = localizedLanguageOptions(registry, "de", "Automatisch erkennen");
  const found = (query) =>
    options.filter((option) => languageMatches(option, query)).map((o) => o.value);
  assert.ok(found("Deutsch").includes("de"));
  assert.ok(found("Germ").includes("de"));
  assert.ok(found("de").includes("de"));
  assert.ok(found("franzo").includes("fr"), "accents fold: Französisch");
  assert.deepEqual(found("Automatisch"), ["auto"]);
  assert.ok(found("Auto-detect").includes("auto"));
  const ja = localizedLanguageOptions(registry, "ja", "自動検出");
  assert.ok(ja.filter((o) => languageMatches(o, "ドイツ")).some((o) => o.value === "de"));
  // No made-up aliases: a code the registry does not use finds nothing
  // unless it is part of a shown or English name.
  const en = localizedLanguageOptions(registry, "en", "Auto-detect");
  assert.deepEqual(
    en.filter((option) => languageMatches(option, "deu")).map((o) => o.value),
    []
  );
  assert.deepEqual(found("ger-de"), []);
});

test("Auto-detect stays first, and the rest follow the language's own order", () => {
  const options = localizedLanguageOptions(registry, "de", "Automatisch erkennen");
  assert.equal(options[0].value, "auto");
  assert.equal(options[0].label, "Automatisch erkennen");
  assert.equal(options.length, registry.length);
  const labels = options.slice(1).map((o) => o.label);
  const sorted = [...labels].sort(new Intl.Collator("de").compare);
  assert.deepEqual(labels, sorted);
  // English is the registry as it is, order included.
  const en = localizedLanguageOptions(registry, "en", "Auto-detect");
  assert.deepEqual(
    en.map((o) => [o.value, o.label]),
    registry.map((o) => [o.value, o.label])
  );
});

test("a caller's own options are matched by label and code only", () => {
  const option = { value: "de", label: "Deutsch", flag: "" };
  assert.equal(languageMatches(option, "deut"), true);
  assert.equal(languageMatches(option, "DE"), true);
  assert.equal(languageMatches(option, "German"), false);
  assert.equal(languageMatches(option, "  "), true);
});
