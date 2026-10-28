const test = require("node:test");
const assert = require("node:assert/strict");

const {
  THINKING_HEADROOM,
  MIN_MAX_TOKENS,
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

test("a later model gets at least 16,000 output tokens, and room for its thinking", () => {
  assert.equal(MIN_MAX_TOKENS, 16000);
  const text = "x".repeat(1000);
  // Claude 4.6 and older keep the cap they had.
  const plain = buildAnthropicRequest({ modelId: "claude-sonnet-4-6", text });
  assert.equal(plain.max_tokens, 2000);
  const named = buildAnthropicRequest({
    modelId: "claude-haiku-4-5",
    text,
    config: { maxTokens: 48 },
  });
  assert.equal(named.max_tokens, 48);
  // Thinking off: the floor only.
  const off = buildAnthropicRequest({ modelId: "claude-sonnet-5-5", text });
  assert.deepEqual(off.thinking, { type: "between_tools" });
  assert.equal(off.max_tokens, MIN_MAX_TOKENS);
  // Thinking on: the asked cap plus the headroom, and never under the floor.
  const thinks = buildAnthropicRequest({ modelId: "claude-opus-5-5", text });
  assert.equal("thinking" in thinks, false);
  assert.equal(thinks.max_tokens, MIN_MAX_TOKENS);
  const asked = buildAnthropicRequest({
    modelId: "claude-fable-5-1",
    text,
    config: { maxTokens: 48 },
  });
  assert.equal(asked.max_tokens, MIN_MAX_TOKENS);
  const long = buildAnthropicRequest({
    modelId: "claude-opus-5-5",
    text,
    config: { maxTokens: 20000 },
  });
  assert.equal(long.max_tokens, 20000 + THINKING_HEADROOM);
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

test("an answer cut at the output limit fails, even with text, so it is never saved", () => {
  assert.throws(
    () =>
      anthropicAnswerText({
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "## Summary\n\nThe team agreed to ship on" },
        ],
        stop_reason: "max_tokens",
      }),
    /output limit/
  );
  // The same text, finished, is the answer.
  assert.equal(
    anthropicAnswerText({
      content: [{ type: "text", text: "## Summary\n\nThe team agreed to ship on Friday." }],
      stop_reason: "end_turn",
    }),
    "## Summary\n\nThe team agreed to ship on Friday."
  );
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

const {
  anthropicFallsBack,
  anthropicHeaders,
  FALLBACK_BETA,
} = require("../../src/helpers/anthropicMessages");

test("effort and a JSON schema go in output_config, on Claude 4.7 and later only", () => {
  const schema = { name: "topic_check", schema: { type: "object", properties: {} } };
  const body = buildAnthropicRequest({
    modelId: "claude-opus-5-5",
    text: "AFTER: ...",
    config: { systemPrompt: "check", reasoningEffort: "low", responseSchema: schema },
  });
  assert.deepEqual(body.output_config, {
    effort: "low",
    format: { type: "json_schema", schema: schema.schema },
  });
  // OpenAI's "none" is not an Anthropic effort: none is sent.
  const none = buildAnthropicRequest({
    modelId: "claude-haiku-5-5",
    text: "x",
    config: { reasoningEffort: "none" },
  });
  assert.equal("output_config" in none, false);
  // Claude 4.6 and older refuse effort; the schema still goes.
  const old = buildAnthropicRequest({
    modelId: "claude-haiku-4-5",
    text: "x",
    config: { reasoningEffort: "low", responseSchema: schema },
  });
  assert.deepEqual(old.output_config, { format: { type: "json_schema", schema: schema.schema } });
  // A request that asks for neither has no output_config, as before.
  const plain = buildAnthropicRequest({ modelId: "claude-opus-5-5", text: "x" });
  assert.equal("output_config" in plain, false);
});

test("the refusal fallback is asked for where the model has one", () => {
  for (const model of ["claude-opus-5-5", "claude-opus-5", "claude-fable-5", "claude-fable-5-1"]) {
    assert.equal(anthropicFallsBack(model, null), true, model);
    const body = buildAnthropicRequest({ modelId: model, text: "x" });
    assert.equal(body.fallbacks, "default", model);
    assert.deepEqual(anthropicHeaders(body), { "anthropic-beta": FALLBACK_BETA });
  }
  assert.equal(FALLBACK_BETA, "server-side-fallback-2026-07-01");
  // Sonnet 5.5: only when its thinking is on, never with "between_tools".
  const off = buildAnthropicRequest({ modelId: "claude-sonnet-5-5", text: "x" });
  assert.deepEqual(off.thinking, { type: "between_tools" });
  assert.equal("fallbacks" in off, false);
  assert.deepEqual(anthropicHeaders(off), {});
  const on = buildAnthropicRequest({
    modelId: "claude-sonnet-5-5",
    text: "x",
    config: { disableThinking: false },
  });
  assert.equal(on.fallbacks, "default");
  // Haiku 5.5 has no fallback, and the older models are left as they were.
  for (const model of [
    "claude-haiku-5-5",
    "claude-sonnet-4-6",
    "claude-opus-4-8",
    "claude-sonnet-5",
  ]) {
    const body = buildAnthropicRequest({ modelId: model, text: "x" });
    assert.equal("fallbacks" in body, false, model);
    assert.deepEqual(anthropicHeaders(body), {});
  }
});

test("a fallback block before the answer is skipped like a thinking block", () => {
  assert.equal(
    anthropicAnswerText({
      content: [
        { type: "fallback", model: "claude-opus-4-8" },
        { type: "text", text: '{"decision":"same"}' },
      ],
      stop_reason: "end_turn",
    }),
    '{"decision":"same"}'
  );
});
