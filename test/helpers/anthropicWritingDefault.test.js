const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The writing model a person gets when they pick Anthropic and no model: the
// first model in Anthropic's list (ReasoningModelSelector selects a provider's
// first model when somebody switches to it). Claude Opus 5.5 at its default
// effort, medium, wrote the most accurate summaries of the Anthropic models
// measured (docs/summaries.md, #143): 85% of the annotators' decisions, actions
// and problems, 0.75 invented facts a summary.

const ROOT = path.join(__dirname, "..", "..");
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/models/modelRegistryData.json"), "utf8")
);
const SELECTOR = fs.readFileSync(
  path.join(ROOT, "src/components/ReasoningModelSelector.tsx"),
  "utf8"
);
const { buildAnthropicRequest } = require("../../src/helpers/anthropicMessages.js");

const anthropic = () => REGISTRY.cloudProviders.find((provider) => provider.id === "anthropic");

test("Claude Opus 5.5 is first in Anthropic's list", () => {
  const [first, second] = anthropic().models;
  assert.equal(first.id, "claude-opus-5-5");
  assert.equal(first.name, "Claude Opus 5.5");
  // The rest keep their order: Fable 5 was first before.
  assert.equal(second.id, "claude-fable-5");
});

test("its description is translated in every locale", () => {
  const key = anthropic().models[0].descriptionKey.split(".");
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

test("the route asks for it at medium effort: no effort, no temperature, thinking left on", () => {
  // The summary's own request (actionProcessingStore.ts): 16,000 output tokens,
  // and the writing model's default "disable thinking".
  const body = buildAnthropicRequest({
    modelId: "claude-opus-5-5",
    text: "## Conversation Transcript\nShall we start?",
    config: {
      systemPrompt: "You are a professional meeting notes assistant.",
      maxTokens: 16000,
      disableThinking: true,
    },
  });
  // No effort sent: Claude Opus 5.5's own default, medium, which was measured.
  assert.equal(body.output_config, undefined);
  // It refuses every way to turn thinking off, and every temperature.
  assert.equal(body.thinking, undefined);
  assert.equal(body.temperature, undefined);
  // Thinking counts against the cap: the summary's 16,000 plus the headroom.
  assert.ok(body.max_tokens >= 16000 + 4096);
});

test("a stored choice is kept: the first model is chosen only when somebody switches provider", () => {
  // Called from the switch to cloud and from a provider change, never on load.
  const calls = SELECTOR.match(/selectDefaultModelForProvider\(/g) ?? [];
  assert.equal(calls.length, 2, "the switch to cloud and the provider change");
  assert.match(
    SELECTOR,
    /const handleCloudProviderChange = \(provider: string\) => \{[\s\S]{0,200}selectDefaultModelForProvider\(provider\);/
  );
  assert.match(SELECTOR, /setReasoningModel\(providerData\.models\[0\]\.value\)/);
});
