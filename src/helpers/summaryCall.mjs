// The summary at Finish: the limits its request gets, and what may be saved as
// the summary. The numbers are measured (docs/summaries.md, the summary eval on
// 24 AMI meetings and two 60- and 98-minute conversations, 2026-10-28).
//
// Pure and DOM-free: actionProcessingStore.ts uses it, and
// test/helpers/summaryCall.test.js pins it.

/**
 * How long one attempt may take on an OpenAI-compatible route (the app's
 * default is 30 s). At Finish a reasoning model reads the whole conversation:
 * gpt-5.5-pro took 95 to 99 s at the standard tier (51 to 125 s at Flex), so it
 * never wrote a summary, and gpt-6-astra at high reasoning took 27 s at the 95th
 * percentile. Other routes keep theirs: the Anthropic route has no limit, and
 * the local server 300 s.
 */
export const SUMMARY_TIMEOUT_MS = 180_000;

/**
 * The output limit for a cloud model (the app's default is 4,096). A reasoning
 * model's reasoning counts against it: 4,096 cut gpt-5.5-pro's answer in 7 of 24
 * meetings, and Claude Opus 5.5's (it always thinks) in 2 of 66, its 95th
 * percentile being 3,483 tokens at medium effort and 3,811 at high. Only the
 * tokens written are paid for. A model on this computer keeps 2,048: its context
 * (16,384 tokens) holds the transcript too.
 */
export const SUMMARY_MAX_TOKENS = 16_000;

/**
 * The request limits for the summary on a writing route ("local", "providers"
 * or "self-hosted"). Every route fails a cut or empty answer instead of
 * returning it (`requireComplete`).
 *
 * @param {string} mode
 * @returns {{ requireComplete: true, timeoutMs?: number, maxTokens?: number }}
 */
export function summaryLimits(mode) {
  const limits = { requireComplete: true };
  if (mode === "local") return limits;
  limits.timeoutMs = SUMMARY_TIMEOUT_MS;
  // A self-hosted server's context is unknown: it keeps its own output limit.
  if (mode === "providers") limits.maxTokens = SUMMARY_MAX_TOKENS;
  return limits;
}

/**
 * Why an answer cannot be saved as the summary, or null when it can: nothing,
 * or the request's own input given back (OpenAI's route returns the input when
 * the answer is empty, and the transcript was then saved as the summary).
 *
 * @param {string | null | undefined} answer
 * @param {string} input
 * @returns {"empty" | "echo" | null}
 */
export function summaryAnswerProblem(answer, input) {
  const text = String(answer ?? "").trim();
  if (!text) return "empty";
  if (text === String(input ?? "").trim()) return "echo";
  return null;
}
