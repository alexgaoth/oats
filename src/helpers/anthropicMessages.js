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

/**
 * The Messages API body for one request.
 *
 * @param {{ modelId: string, text: string, config?: {
 *   systemPrompt?: string, maxTokens?: number, temperature?: number,
 *   disableThinking?: boolean } }} input
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
  return body;
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
  anthropicTakesTemperature,
  anthropicThinking,
  buildAnthropicRequest,
  anthropicAnswerText,
};
