const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The cloud writing model a person gets when they choose the providers and pick
// none (src/helpers/writingTier.mjs, components/settings/processing.ts).
// Measured in docs/summaries.md (#143): gpt-6.1-sol covers as much of a meeting
// as gpt-6-astra for a fifth of the price, and invents 0.67 facts in a summary
// against gpt-5.6-terra's 3.0. With only an Anthropic key, Claude Opus 5.5.

const ROOT = path.join(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const PROCESSING = read("src/components/settings/processing.ts");
const STORE = read("src/stores/settingsStore.ts");
const REGISTRY = JSON.parse(read("src/models/modelRegistryData.json"));

let tier;
test.before(async () => {
  tier = await import("../../src/helpers/writingTier.mjs");
});

const openai = () => REGISTRY.cloudProviders.find((provider) => provider.id === "openai");

test("the cloud default is gpt-6.1-sol, and Claude Opus 5.5 with only an Anthropic key", () => {
  assert.equal(tier.CLOUD_WRITING_MODELS.openai, "gpt-6.1-sol");
  assert.equal(tier.CLOUD_WRITING_MODELS.anthropic, "claude-opus-5-5");
  // The store resolves the default from the rule, not from a copy of it.
  assert.match(STORE, /return defaultWritingModel\(\{/);
});

test("the default is in the registry, first in OpenAI's list, so Advanced settings offers it first", () => {
  const [first] = openai().models;
  assert.equal(first.id, tier.CLOUD_WRITING_MODELS.openai);
  // GPT-5 and later take no temperature and count reasoning in max_completion_tokens.
  assert.equal(first.tokenParam, "max_completion_tokens");
  assert.equal(first.supportsTemperature, false);
});

test("the default's description is translated in every locale", () => {
  const key = openai().models[0].descriptionKey.split(".");
  for (const locale of fs.readdirSync(path.join(ROOT, "src/locales"))) {
    const file = path.join(ROOT, "src/locales", locale, "translation.json");
    if (!fs.existsSync(file)) continue;
    const value = key.reduce(
      (node, part) => node?.[part],
      JSON.parse(fs.readFileSync(file, "utf8"))
    );
    assert.equal(typeof value, "string", `${locale} has ${key.join(".")}`);
    assert.ok(value.length > 0);
  }
});

test("a model somebody chose is kept: the default is followed only while nothing is stored", () => {
  const start = PROCESSING.indexOf("export function setProcessing(");
  const body = PROCESSING.slice(start, start + 2000);
  // The switch restores the side's last choice, or follows the default; it
  // never stores a default by itself.
  assert.match(body, /if \(remembered\) chooseWritingModel\(/);
  assert.match(body, /else forgetWritingChoice\(\);/);
  assert.doesNotMatch(body, /setCleanupModel\(/);
  // The store moves a setting that follows the default in memory only.
  const follow = STORE.slice(STORE.indexOf("function followDefaultWritingModel("));
  assert.match(
    follow,
    /^function followDefaultWritingModel\(\): void \{\s*if \(!writingModelFollowsDefault\(\)\) return;/
  );
  assert.match(
    follow.slice(0, 600),
    /useSettingsStore\.setState\(\{ cleanupModel: next\.model, cleanupProvider: next\.provider \}\)/
  );
  // Nothing rewrites a stored model to the new default.
  assert.doesNotMatch(PROCESSING, /gpt-5\.6-terra/);
});

test("Use in Settings is a choice, even of the Recommended model; only Use Oats' choice follows the default", () => {
  const chooser = read("src/components/settings/WritingModelChoice.tsx");
  const body = (name) => {
    const start = chooser.indexOf(`const ${name} = (`);
    assert.ok(start > -1, `${name} not found`);
    return chooser.slice(start, chooser.indexOf("\n  };", start));
  };
  const use = body("use");
  assert.match(use, /chooseWritingModel\(useProvider, id\);/);
  assert.doesNotMatch(use, /forgetWritingChoice\(|sideDefault|if \(/, "no case forgets");
  // Either one stops a download the person left behind (not a no), and lets
  // Oats fetch by itself again after a deleted model.
  assert.match(use, /leaveWritingDownload\(id\);/);
  assert.match(use, /writingModelChosen\(\);/);
  const useDefault = body("useDefault");
  assert.match(useDefault, /forgetWritingChoice\(\);/);
  assert.match(useDefault, /writingModelChosen\(\);/);
  // forgetWritingChoice appears nowhere else in the chooser.
  assert.equal([...chooser.matchAll(/forgetWritingChoice\(\)/g)].length, 1);
});

test("choosing your own server stops a download left behind, as Use does", () => {
  const chooser = read("src/components/settings/WritingModelChoice.tsx");
  const server = chooser.slice(chooser.indexOf("view === SERVER ? ("));
  assert.match(
    server.slice(0, 900),
    /store\.setCleanupMode\("self-hosted"\);\s*store\.setNoteFormattingMode\("self-hosted"\);\s*pending\.current = null;\s*leaveWritingDownload\(\);\s*writingModelChosen\(\);/
  );
  // "Remove models" is a no to the download too (writingModelFetch.test.js).
  assert.match(
    read("src/helpers/ipcHandlers.js"),
    /this\.deviceTier\.writing\.removedAll\(this\.deviceTier\.writing\.installed\(\)\);\s*await modelManager\.deleteAllModels\(\);/
  );
});
