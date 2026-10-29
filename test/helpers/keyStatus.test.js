const test = require("node:test");
const assert = require("node:assert/strict");

// What a provider's answer to `GET /models/{id}` says of an API key
// (src/helpers/keyStatus.mjs). Setup and Settings refuse a key the provider
// refuses, with its reason; only OpenAI's restricted key is saved unchecked.

let keys;
test.before(async () => {
  keys = await import("../../src/helpers/keyStatus.mjs");
});

const invalid = { error: { code: "invalid_api_key", message: "Incorrect API key provided" } };
const deactivated = {
  error: {
    code: "account_deactivated",
    message:
      "This key is associated with a deactivated account. If you feel this is an error, contact us through our help center at help.openai.com.",
  },
};
// A restricted project key without "Models: read" (OpenAI's own wording).
const restricted = {
  error: {
    code: null,
    message: "You have insufficient permissions for this operation. Missing scopes: api.model.read.",
  },
};

test("OpenAI: a restricted key is limited; every other refusal is a refusal", () => {
  assert.equal(keys.openAiKeyStatus(200), "ok");
  assert.equal(keys.openAiKeyStatus(401, invalid), "rejected");
  // A restricted project key without "Models: read": real, saved, said to be unchecked.
  assert.equal(keys.openAiKeyStatus(401, restricted), "limited");
  assert.equal(keys.openAiKeyStatus(403, restricted), "limited");
  // Any other 401 is refused: a deactivated account, or nothing said.
  assert.equal(keys.openAiKeyStatus(401, deactivated), "rejected");
  assert.equal(keys.openAiKeyStatus(401, null), "rejected");
  assert.equal(keys.openAiKeyStatus(401, "not json"), "rejected");
  // 403 for anything else: the key cannot use this model.
  assert.equal(keys.openAiKeyStatus(403, { error: { code: "model_not_found" } }), "no-access");
  assert.equal(keys.openAiKeyStatus(404), "no-access");
  assert.equal(keys.openAiKeyStatus(400), "no-access");
  // Nothing could be told.
  for (const status of [429, 500, 502, 503]) {
    assert.equal(keys.openAiKeyStatus(status), "unknown", String(status));
  }
});

test("a refusal says the provider's reason, except the plain invalid key", () => {
  assert.equal(
    keys.providerReason(deactivated),
    "This key is associated with a deactivated account. If you feel this is an error, contact us through our help center at help.openai.com."
  );
  // The invalid key's message repeats part of the key: the plain refusal says it.
  assert.equal(keys.providerReason(invalid), null);
  assert.equal(keys.providerReason(null), null);
  assert.equal(keys.providerReason({ error: { message: "  " } }), null);
  const long = keys.providerReason({ error: { message: "x".repeat(500) } });
  assert.equal(long.length, 200);
  assert.ok(long.endsWith("…"));
});

test("Anthropic: a 401 is an unknown key; a 403 is a key that cannot use the model", () => {
  assert.equal(keys.anthropicKeyStatus(200), "ok");
  assert.equal(keys.anthropicKeyStatus(401), "rejected");
  assert.equal(keys.anthropicKeyStatus(403), "no-access");
  assert.equal(keys.anthropicKeyStatus(404), "no-access");
  assert.equal(keys.anthropicKeyStatus(400), "no-access");
  for (const status of [429, 500, 529]) {
    assert.equal(keys.anthropicKeyStatus(status), "unknown", String(status));
  }
});

test("whether the stored key can use a model: a no only when the provider says so of the model", () => {
  assert.equal(keys.modelAvailability(200), true);
  for (const status of [400, 403, 404]) assert.equal(keys.modelAvailability(status), false);
  // A rejected key may be fixed, a server may come back: asked again later.
  for (const status of [401, 429, 500]) assert.equal(keys.modelAvailability(status), null);
});
