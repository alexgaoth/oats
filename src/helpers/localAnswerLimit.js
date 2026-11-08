// Why llama-server cut a local answer short, read from its own counts.
//
// A request that must come back whole (the summary, `requireComplete`) fails
// when llama-server stops it with finish_reason "length". That one word covers
// two different limits, and only one of them is the conversation's length:
//
// - The context filled: the prompt and the answer so far reached the context
//   the server was started with before the answer reached its own limit. The
//   same request fails the same way every time ("summary-too-long").
// - The answer reached its own limit (max_tokens) with room left in the
//   context: the model wrote too much, or rambled ("summary-output-limit").
//
// Measured on b9763 with Gemma 4 E4B at --ctx-size 16384 (2026-11-08): a
// 98-minute meeting stopped with prompt 16,111 + completion 273 = 16,384, the
// context, with max_tokens 2,048; a two-line exchange stopped with completion
// 16 = max_tokens 16 and 72 tokens in all. Without both counts nothing is
// claimed, and the cut stays an ordinary failure.

const CONTEXT_FULL = "summary-too-long";
const ANSWER_FULL = "summary-output-limit";

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

/**
 * @param {{ promptTokens?: number, completionTokens?: number, maxTokens?: number, contextTokens?: number }} counts
 * @returns {"summary-too-long" | "summary-output-limit" | null}
 */
function truncationReason({ promptTokens, completionTokens, maxTokens, contextTokens } = {}) {
  const prompt = count(promptTokens);
  const completion = count(completionTokens);
  const max = count(maxTokens);
  const context = count(contextTokens);
  if (prompt === null || completion === null || max === null || !context) return null;
  if (completion >= max) return ANSWER_FULL;
  if (prompt + completion >= context) return CONTEXT_FULL;
  return null;
}

const DETAIL_FIELDS = ["promptTokens", "completionTokens", "contextTokens", "maxTokens"];

/** Only the counts: they are all a reason carries across IPC. */
function limitDetails(details) {
  const safe = {};
  for (const field of DETAIL_FIELDS) {
    const value = count(details?.[field]);
    if (value !== null) safe[field] = value;
  }
  return safe;
}

/**
 * The reason an error carries, for the IPC result, or null.
 *
 * @param {unknown} error
 * @returns {{ code: string, details: Record<string, number> } | null}
 */
function limitFailure(error) {
  const code = error && typeof error === "object" ? error.code : null;
  if (code !== CONTEXT_FULL && code !== ANSWER_FULL) return null;
  return { code, details: limitDetails(error.details) };
}

module.exports = { CONTEXT_FULL, ANSWER_FULL, truncationReason, limitDetails, limitFailure };
