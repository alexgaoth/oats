// What a provider's answer to `GET /models/{id}` says of an API key and a
// model. Oats asks it when a key is added (Settings, setup), and once a session
// for the models it picks itself (topic names, link checks). One request, no
// tokens, no conversation text.
//
// A key the provider refuses is not saved. One answer is not a refusal:
// OpenAI's to a restricted project key without "Models: read" (insufficient
// permissions, missing scopes). That key still transcribes and writes, so it
// is "limited": saved, with a line that says it could not be checked. Any
// other 401 from OpenAI (an invalid key, a deactivated account) is refused,
// with OpenAI's own reason (`providerReason`).
//
// Pure: the renderer (ReasoningService.ts) and the main process (the Anthropic
// check, ipcHandlers.js) share it, and test/helpers/keyStatus.test.js pins it.

/** @typedef {"ok" | "rejected" | "limited" | "no-access" | "unknown"} KeyStatus */

const ok = (status) => status >= 200 && status < 300;

/** OpenAI's answer to a restricted key that may not read the model list. */
const RESTRICTED = /insufficient permissions|missing scopes/i;

/** The error OpenAI gave, or an empty object. */
function openAiError(body) {
  const error = /** @type {any} */ (body)?.error;
  return error && typeof error === "object" ? error : {};
}

/**
 * @param {number} status The HTTP status of `GET /v1/models/{id}` at api.openai.com.
 * @param {unknown} [body] Its JSON body, when it has one.
 * @returns {KeyStatus}
 */
export function openAiKeyStatus(status, body = null) {
  if (ok(status)) return "ok";
  const error = openAiError(body);
  const restricted = RESTRICTED.test(String(error.message ?? ""));
  if (status === 401) return restricted ? "limited" : "rejected";
  if (status === 403) return restricted ? "limited" : "no-access";
  if (status === 400 || status === 404) return "no-access";
  return "unknown";
}

/**
 * The reason a provider gave for refusing a key, to show beside the refusal:
 * its own words, at most 200 characters, or null when it gave none or when
 * the plain refusal says it (an invalid key, whose message repeats part of
 * the key).
 *
 * @param {unknown} [body]
 * @returns {string | null}
 */
export function providerReason(body = null) {
  const error = openAiError(body);
  if (error.code === "invalid_api_key") return null;
  const message = String(error.message ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!message) return null;
  return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}

/**
 * @param {number} status The HTTP status of `GET /v1/models/{id}` at api.anthropic.com.
 * @returns {KeyStatus}
 */
export function anthropicKeyStatus(status) {
  if (ok(status)) return "ok";
  // Anthropic answers 401 only for a key it does not know (authentication_error).
  if (status === 401) return "rejected";
  // 403 is a key that may not use this model, as 400 and 404 are.
  if (status === 400 || status === 403 || status === 404) return "no-access";
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
