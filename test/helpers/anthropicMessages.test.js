const test = require("node:test");
const assert = require("node:assert/strict");

const {
  THINKING_HEADROOM,
  anthropicTakesTemperature,
  anthropicThinking,
  buildAnthropicRequest,
  anthropicAnswerText,
} = require("../../src/helpers/anthropicMessages");

// Every model in the app's Anthropic list (modelRegistryData.json) and the
// current ones, with what the API accepts (measured 2026-10-26 and -28).
const OLD = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-6",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5",
  "claude-opus-4-5-20251101",
  "claude-opus-4-1-20250805",
  "claude-sonnet-4-20250514",
  "claude-3-5-haiku-20241022",
];
const NEW = [
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-opus-5-5",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-fable-5",
  "claude-fable-5-1",
];

test("only Claude 4.6 and older get a temperature", () => {
  for (const model of OLD) assert.equal(anthropicTakesTemperature(model), true, model);
  for (const model of NEW) assert.equal(anthropicTakesTemperature(model), false, model);
  // A model this list does not know is sent none: later models refuse it.
  assert.equal(anthropicTakesTemperature("claude-opus-6"), false);
  assert.equal(anthropicTakesTemperature(""), false);
  assert.equal(anthropicTakesTemperature(undefined), false);
});

test("no request to a Claude 4.7 or later model carries a temperature", () => {
  for (const model of NEW) {
    const body = buildAnthropicRequest({
      modelId: model,
      text: "hello",
      config: { systemPrompt: "x", temperature: 0 },
    });
    assert.equal("temperature" in body, false, model);
  }
});

test("an older model keeps its temperature, and 0 stays 0", () => {
  const named = buildAnthropicRequest({
    modelId: "claude-sonnet-4-6",
    text: "hello",
    config: { systemPrompt: "Name the topic.", temperature: 0 },
  });
  assert.equal(named.temperature, 0);
  const summary = buildAnthropicRequest({ modelId: "claude-haiku-4-5", text: "hello" });
  assert.equal(summary.temperature, 0.3);
  assert.equal("thinking" in summary, false);
});

test("thinking is off where the model allows it, with the form it accepts", () => {
  assert.deepEqual(anthropicThinking("claude-sonnet-5-5", true), { type: "between_tools" });
  for (const model of [
    "claude-haiku-5-5",
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-opus-4-7",
    "claude-opus-4-8",
  ]) {
    assert.deepEqual(anthropicThinking(model, true), { type: "disabled" }, model);
    // Unset counts as the default, which is on.
    assert.deepEqual(anthropicThinking(model, undefined), { type: "disabled" }, model);
  }
  // Opus 5.5 and Fable 5.x refuse every off form; so may an unknown model.
  for (const model of ["claude-opus-5-5", "claude-fable-5", "claude-fable-5-1", "claude-opus-6"]) {
    assert.equal(anthropicThinking(model, true), null, model);
  }
  // The person turned thinking on: none is sent, and the later models think.
  assert.equal(anthropicThinking("claude-sonnet-5-5", false), null);
  // Older models think only when asked: nothing changes for them.
  assert.equal(anthropicThinking("claude-sonnet-4-6", true), null);
});

test("a model that thinks gets room for it under the cap", () => {
  const text = "x".repeat(1000);
  const plain = buildAnthropicRequest({ modelId: "claude-sonnet-4-6", text });
  assert.equal(plain.max_tokens, 2000);
  const off = buildAnthropicRequest({ modelId: "claude-sonnet-5-5", text });
  assert.equal(off.max_tokens, 2000);
  assert.deepEqual(off.thinking, { type: "between_tools" });
  const thinks = buildAnthropicRequest({ modelId: "claude-opus-5-5", text });
  assert.equal(thinks.max_tokens, 2000 + THINKING_HEADROOM);
  assert.equal("thinking" in thinks, false);
  const asked = buildAnthropicRequest({
    modelId: "claude-fable-5-1",
    text,
    config: { maxTokens: 48 },
  });
  assert.equal(asked.max_tokens, 48 + THINKING_HEADROOM);
});

test("the body keeps the prompt, the system prompt and the model", () => {
  const body = buildAnthropicRequest({
    modelId: "claude-haiku-5-5",
    text: "What was said",
    config: { systemPrompt: "Name the topic." },
  });
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.system, "Name the topic.");
  assert.deepEqual(body.messages, [{ role: "user", content: "What was said" }]);
});

test("the answer is every text block, after any thinking block", () => {
  assert.equal(
    anthropicAnswerText({
      content: [
        { type: "thinking", thinking: "", signature: "s" },
        { type: "text", text: "Remote control " },
        { type: "text", text: "battery life\n" },
      ],
      stop_reason: "end_turn",
    }),
    "Remote control battery life"
  );
  assert.equal(anthropicAnswerText({ content: [{ type: "text", text: " A name " }] }), "A name");
});

test("an answer with no text fails with the reason", () => {
  assert.throws(
    () =>
      anthropicAnswerText({
        content: [{ type: "thinking", thinking: "" }],
        stop_reason: "max_tokens",
      }),
    /output limit/
  );
  assert.throws(() => anthropicAnswerText({ content: [], stop_reason: "refusal" }), /declined/);
  assert.throws(() => anthropicAnswerText({}), /no text/);
  assert.throws(() => anthropicAnswerText(null), /no text/);
});
