const test = require("node:test");
const assert = require("node:assert/strict");

// What a provider's answer to `GET /models/{id}` says of an API key
// (src/helpers/keyStatus.mjs). Setup and Settings refuse only a key the
// provider calls invalid: a real key with limited permissions is saved.

let keys;
test.before(async () => {
  keys = await import("../../src/helpers/keyStatus.mjs");
});

const invalid = { error: { code: "invalid_api_key", message: "Incorrect API key provided" } };
// A restricted project key without "Models: read" (OpenAI's own wording).
const restricted = {
  error: {
    code: null,
    message: "You have insufficient permissions for this operation. Missing scopes: api.model.read.",
  },
};

test("OpenAI: only a key OpenAI calls invalid is refused", () => {
  assert.equal(keys.openAiKeyStatus(200), "ok");
  assert.equal(keys.openAiKeyStatus(401, invalid), "rejected");
  // A 401 for permissions is a real key: saved, said to be unchecked.
  assert.equal(keys.openAiKeyStatus(401, restricted), "limited");
  assert.equal(keys.openAiKeyStatus(401, null), "limited");
  assert.equal(keys.openAiKeyStatus(401, "not json"), "limited");
  assert.equal(keys.openAiKeyStatus(403, { error: { code: "insufficient_permissions" } }), "limited");
  // The key works, but not with this model.
  assert.equal(keys.openAiKeyStatus(404), "no-access");
  assert.equal(keys.openAiKeyStatus(400), "no-access");
  // Nothing could be told.
  for (const status of [429, 500, 502, 503]) {
    assert.equal(keys.openAiKeyStatus(status), "unknown", String(status));
  }
});

test("Anthropic: a 401 is an unknown key; a 403 is a real key with limited permissions", () => {
  assert.equal(keys.anthropicKeyStatus(200), "ok");
  assert.equal(keys.anthropicKeyStatus(401), "rejected");
  assert.equal(keys.anthropicKeyStatus(403), "limited");
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
