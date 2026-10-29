// What a provider's answer to `GET /models/{id}` says of an API key and a
// model. Oats asks it when a key is added (Settings, setup), and once a session
// for the models it picks itself (topic names, link checks). One request, no
// tokens, no conversation text.
//
// A key the provider calls invalid is refused, and only that one. OpenAI also
// answers 401 to a real key that may not read the model list (a restricted
// project key without "Models: read"), which still transcribes and writes; so
// for OpenAI a 401 is a refusal only when the error's code says the key itself
// is invalid. A real key the check cannot judge is "limited": it is saved, and
// the person is told it could not be checked.
//
// Pure: the renderer (ReasoningService.ts) and the main process (the Anthropic
// check, ipcHandlers.js) share it, and test/helpers/keyStatus.test.js pins it.

/** @typedef {"ok" | "rejected" | "limited" | "no-access" | "unknown"} KeyStatus */

const ok = (status) => status >= 200 && status < 300;

/**
 * @param {number} status The HTTP status of `GET /v1/models/{id}` at api.openai.com.
 * @param {unknown} [body] Its JSON body, when it has one.
 * @returns {KeyStatus}
 */
export function openAiKeyStatus(status, body = null) {
  if (ok(status)) return "ok";
  if (status === 401) {
    return /** @type {any} */ (body)?.error?.code === "invalid_api_key" ? "rejected" : "limited";
  }
  if (status === 403) return "limited";
  if (status === 400 || status === 404) return "no-access";
  return "unknown";
}

/**
 * @param {number} status The HTTP status of `GET /v1/models/{id}` at api.anthropic.com.
 * @returns {KeyStatus}
 */
export function anthropicKeyStatus(status) {
  if (ok(status)) return "ok";
  // Anthropic answers 401 only for a key it does not know (authentication_error).
  if (status === 401) return "rejected";
  if (status === 403) return "limited";
  if (status === 400 || status === 404) return "no-access";
  return "unknown";
}

/**
 * Whether the stored key can use a model, for the callers that pick a model
 * by it: true or false when the provider says so of the model; null when it
 * could not be told (a rejected key may be fixed, a server may be down), so
 * the caller asks again later instead of keeping a no.
 *
 * @param {number} status
 * @returns {boolean | null}
 */
export function modelAvailability(status) {
  if (ok(status)) return true;
  if (status === 400 || status === 403 || status === 404) return false;
  return null;
}
