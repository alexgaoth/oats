const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The cloud writing model a person gets when they choose the providers and pick
// none (components/settings/processing.ts). Measured in docs/summaries.md (#143):
// gpt-6.1-sol covers as much of a meeting as gpt-6-astra for a fifth of the
// price, and invents 0.67 facts in a summary against gpt-5.6-terra's 3.0.

const ROOT = path.join(__dirname, "..", "..");
const PROCESSING = fs.readFileSync(
  path.join(ROOT, "src/components/settings/processing.ts"),
  "utf8"
);
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/models/modelRegistryData.json"), "utf8")
);

const defaultCloudModel = () =>
  /export const DEFAULT_CLOUD_MODEL = "([^"]+)";/.exec(PROCESSING)?.[1];
const openai = () => REGISTRY.cloudProviders.find((provider) => provider.id === "openai");

test("the cloud default is gpt-6.1-sol", () => {
  assert.equal(defaultCloudModel(), "gpt-6.1-sol");
});

test("the default is in the registry, first in OpenAI's list, so Advanced settings offers it first", () => {
  // ReasoningModelSelector selects a provider's first model when somebody switches to it.
  const [first] = openai().models;
  assert.equal(first.id, defaultCloudModel());
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

test("a model somebody chose is kept: the default is used only when nothing is remembered", () => {
  const start = PROCESSING.indexOf("export function setProcessing(");
  const body = PROCESSING.slice(start, start + 2000);
  assert.match(body, /setCleanupModel\(remembered\?\.cleanupModel \|\| DEFAULT_CLOUD_MODEL\)/);
  // Nothing rewrites a stored model to the new default.
  assert.doesNotMatch(PROCESSING, /gpt-5\.6-terra/);
});
