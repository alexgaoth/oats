const test = require("node:test");
const assert = require("node:assert/strict");

let topics;
let loop;
test.before(async () => {
  topics = await import("../../src/helpers/topicModels.mjs");
  loop = await import("../../src/helpers/topicLoop.mjs");
});

test("each provider has a list for each topic job, best first, with valid settings", () => {
  const efforts = {
    openai: new Set(["none", "minimal", "low", "medium", "high", "xhigh"]),
    anthropic: new Set(["low", "medium", "high", "xhigh", "max"]),
  };
  assert.deepEqual(Object.keys(topics.TOPIC_MODELS).sort(), ["anthropic", "openai"]);
  for (const [provider, jobs] of Object.entries(topics.TOPIC_MODELS)) {
    assert.deepEqual(Object.keys(jobs).sort(), ["check", "names"], provider);
    for (const [job, list] of Object.entries(jobs)) {
      assert.ok(list.length >= 1, `${provider} ${job}`);
      const ids = list.map((choice) => choice.model);
      assert.equal(new Set(ids).size, ids.length, `${provider} ${job}: no model twice`);
      for (const choice of list) {
        assert.ok(efforts[provider].has(choice.effort), `${provider} ${job} ${choice.model}`);
        if (provider === "openai") assert.match(choice.model, /^gpt-/);
        if (provider === "anthropic") assert.match(choice.model, /^claude-/);
      }
      assert.ok(Object.isFrozen(list), `${provider} ${job}: frozen`);
    }
  }
  // The check's OpenAI list is the loop's default list.
  assert.deepEqual(loop.FAST_MODELS, topics.topicModelIds("openai", "check"));
});

test("only OpenAI's and Anthropic's own APIs, chosen as the writing model, use them", () => {
  const provider = topics.topicProvider;
  assert.equal(provider({ mode: "providers", config: { provider: "openai" } }), "openai");
  assert.equal(provider({ mode: "providers", config: { provider: "anthropic" } }), "anthropic");
  for (const other of [
    { mode: "providers", config: { provider: "gemini" } },
    { mode: "providers", config: { provider: "custom" } },
    { mode: "providers", config: { provider: "openrouter" } },
    { mode: "providers", config: {} },
    { mode: "local", config: { provider: "local" } },
    { mode: "self-hosted", config: { provider: "openai" } },
    null,
    undefined,
  ]) {
    assert.equal(provider(other), null, JSON.stringify(other));
  }
});

test("a model id the key can use maps back to its settings", () => {
  for (const provider of ["openai", "anthropic"]) {
    for (const job of ["names", "check"]) {
      const ids = topics.topicModelIds(provider, job);
      for (const id of ids) {
        assert.equal(topics.topicModelChoice(provider, job, id).model, id);
      }
    }
  }
  assert.equal(topics.topicModelChoice("openai", "check", "gpt-4o"), null);
  assert.deepEqual(topics.topicModelIds("gemini", "check"), []);
});

test("a check request: the schema, the effort, and room for OpenAI's reasoning", () => {
  const request = {
    system: "You check the topics",
    maxTokens: 200,
    schema: { name: "topic_check", schema: { type: "object" } },
  };
  const fast = topics.checkRequestConfig(
    "openai",
    { model: "gpt-6.1-terra", effort: "none" },
    request
  );
  assert.deepEqual(fast, {
    provider: "openai",
    systemPrompt: "You check the topics",
    maxTokens: 200,
    reasoningEffort: "none",
    responseSchema: request.schema,
    disableThinking: true,
  });
  const reasons = topics.checkRequestConfig(
    "openai",
    { model: "gpt-6.1-sol", effort: "low" },
    request
  );
  assert.equal(reasons.maxTokens, 200 + topics.REASONING_HEADROOM);
  // Anthropic's route adds its own room for a model that thinks.
  const claude = topics.checkRequestConfig(
    "anthropic",
    { model: "claude-opus-5-5", effort: "low" },
    request
  );
  assert.equal(claude.provider, "anthropic");
  assert.equal(claude.maxTokens, 200);
  assert.equal(claude.reasoningEffort, "low");
  assert.equal(claude.disableThinking, true);
  assert.deepEqual(claude.responseSchema, request.schema);
});

test("a naming request keeps the writing route's settings and adds the model's effort", () => {
  const route = { mode: "providers", config: { provider: "anthropic", disableThinking: false } };
  const config = topics.nameRequestConfig(
    { model: "claude-opus-5-5", effort: "low" },
    route,
    "You name one topic"
  );
  assert.equal(config.provider, "anthropic");
  assert.equal(config.systemPrompt, "You name one topic");
  assert.equal(config.temperature, 0);
  assert.equal(config.reasoningEffort, "low");
  // A name is a short job: thinking off where the model allows it.
  assert.equal(config.disableThinking, true);
  // As for any provider name request, no cap of its own (topicNameConfig).
  assert.equal("maxTokens" in config, false);
});
