// The request the Anthropic route sends (`process-anthropic-reasoning` in
// ipcHandlers.js), and how it reads the answer. Pure, so it unit-tests under
// node:test.
//
// Claude 4.7 and later models take no sampling settings: Opus 4.7, 4.8, 5 and
// 5.5, Sonnet 5 and Fable 5.x answer HTTP 400 to any `temperature`, and Sonnet
// 5.5 and Haiku 5.5 to any value but the default. The route sent 0.3 to every
// model, so a summary, a topic name or a group sort with one of them failed
// (measured 2026-10-26, docs/fast-models.md). Most of them also think by
// default, and their answer then starts with a thinking block, not text.

/** Output tokens added to the cap when the model may think: thinking counts against it. */
const THINKING_HEADROOM = 4096;

/**
 * The least cap a Claude 4.7 or later request gets. Thinking counts against
 * the cap: Opus 5.5 at medium effort spent 4,096 tokens on a 98-minute
 * conversation and returned a cut summary. About 16,000 is Anthropic's guidance
 * for a request that is not streamed, and only the tokens used are billed.
 */
const MIN_MAX_TOKENS = 16000;

/**
 * Whether a model takes a sampling temperature: Claude 4.6 and older. Every
 * later model, and any model this list does not know, gets none.
 *
 * @param {string} modelId
 */
function anthropicTakesTemperature(modelId) {
  return /^claude-(?:3(?:-|$)|(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:-\d{8})?$)/.test(
    String(modelId ?? "")
  );
}

/**
 * The thinking setting for a request, or null to send none.
 *
 * Claude 4.6 and older think only when asked, so they get none, as before.
 * Later models think by default. With the writing model's "disable thinking"
 * setting on (the default), each gets the off form it accepts: Sonnet 5.5
 * "between_tools" (no thinking in a request without tools), Haiku 5.5, Sonnet
 * 5, Opus 5, Opus 4.7 and 4.8 "disabled", both at their default effort. Opus
 * 5.5 and Fable 5.x refuse every off form, and a model this list does not know
 * may too: those get none, and think.
 *
 * @param {string} modelId
 * @param {boolean | undefined} disableThinking
 * @returns {{ type: string } | null}
 */
function anthropicThinking(modelId, disableThinking) {
  const id = String(modelId ?? "");
  if (anthropicTakesTemperature(id) || disableThinking === false) return null;
  if (/^claude-sonnet-5-5(?:-|$)/.test(id)) return { type: "between_tools" };
  if (/^claude-(?:opus-4-[78]|opus-5|sonnet-5|haiku-5-5)(?:-\d{8})?$/.test(id)) {
    return { type: "disabled" };
  }
  return null;
}

/** The effort levels a request may ask for (`output_config.effort`). */
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

/**
 * Whether a request to this model asks for Anthropic's server-side refusal
 * fallback: a request its safety classifiers decline (a meeting about security
 * work can look like "cyber") is run again on the model Anthropic picks for
 * that kind of refusal, instead of failing. Opus 5 and 5.5, Fable 5.x and
 * Sonnet 5.5 have it; Haiku 5.5 has none. Sonnet 5.5's thinking-off form
 * ("between_tools") is not sent with it.
 *
 * @param {string} modelId
 * @param {{ type: string } | null} thinking
 */
function anthropicFallsBack(modelId, thinking) {
  const id = String(modelId ?? "");
  if (/^claude-sonnet-5-5(?:-|$)/.test(id)) return !thinking;
  return /^claude-(?:opus-5(?:-5)?|fable-5(?:-\d)?)(?:-\d{8})?$/.test(id);
}

/**
 * The header the server-side refusal fallback ("default" form) needs. The
 * Message Batches API rejects `fallbacks`; the app sends no batches.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * The Messages API body for one request.
 *
 * `reasoningEffort` sets `output_config.effort` on Claude 4.7 and later (older
 * models refuse it), and `responseSchema` asks for an answer that is JSON
 * matching the schema (`output_config.format`); the live topic check asks for
 * both (topicLoop.mjs).
 *
 * @param {{ modelId: string, text: string, config?: {
 *   systemPrompt?: string, maxTokens?: number, temperature?: number,
 *   disableThinking?: boolean, reasoningEffort?: string,
 *   responseSchema?: { name: string, schema: object } } }} input
 */
function buildAnthropicRequest({ modelId, text, config = {} }) {
  const base = config.maxTokens || Math.max(100, Math.min(String(text ?? "").length * 2, 4096));
  const thinking = anthropicThinking(modelId, config.disableThinking);
  const old = anthropicTakesTemperature(modelId);
  // A later model sent no off form thinks, and writes its thinking inside the
  // cap; every later model gets at least MIN_MAX_TOKENS. Older ones keep theirs.
  const mayThink = !old && !thinking;
  const body = {
    model: modelId,
    messages: [{ role: "user", content: text }],
    system: config.systemPrompt || "",
    max_tokens: old ? base : Math.max(mayThink ? base + THINKING_HEADROOM : base, MIN_MAX_TOKENS),
  };
  if (old) body.temperature = config.temperature ?? 0.3;
  if (thinking) body.thinking = thinking;
  const output = {};
  if (!old && EFFORTS.has(config.reasoningEffort)) output.effort = config.reasoningEffort;
  if (config.responseSchema?.schema) {
    output.format = { type: "json_schema", schema: config.responseSchema.schema };
  }
  if (Object.keys(output).length) body.output_config = output;
  if (anthropicFallsBack(modelId, thinking)) body.fallbacks = "default";
  return body;
}

/** Extra request headers a body needs: the beta header of the refusal fallback. */
function anthropicHeaders(body) {
  return body?.fallbacks ? { "anthropic-beta": FALLBACK_BETA } : {};
}

/**
 * The text of an answer: every text block, in order. Thinking blocks are
 * skipped. An answer with no text, or one cut at the output limit, is an error
 * that says why: the caller's failure path runs, and a cut summary or name is
 * never saved.
 *
 * @param {{ content?: Array<{ type?: string, text?: string }>, stop_reason?: string }} data
 * @returns {string}
 */
function anthropicAnswerText(data) {
  if (data?.stop_reason === "max_tokens") {
    throw new Error("Claude used its output limit before it finished the answer");
  }
  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
  if (text) return text;
  if (data?.stop_reason === "refusal") throw new Error("Claude declined to answer this request");
  throw new Error("Claude returned no text");
}

module.exports = {
  THINKING_HEADROOM,
  MIN_MAX_TOKENS,
  FALLBACK_BETA,
  anthropicTakesTemperature,
  anthropicThinking,
  anthropicFallsBack,
  buildAnthropicRequest,
  anthropicHeaders,
  anthropicAnswerText,
};
