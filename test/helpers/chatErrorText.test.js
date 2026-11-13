const test = require("node:test");
const assert = require("node:assert/strict");

// The agent's line when a reply fails (chatErrorText.mjs).

let chatErrorText;
test.before(async () => {
  ({ chatErrorText } = await import("../../src/helpers/chatErrorText.mjs"));
});

const t = (key, options) => `${key}${options ? JSON.stringify(options) : ""}`;

test("a missing key is said in the reader's language, with its provider", () => {
  const error = Object.assign(new Error("Groq API key not configured"), {
    code: "API_KEY_MISSING",
    provider: "Groq",
  });
  assert.equal(chatErrorText(error, t), 'agentMode.chat.apiKeyMissing{"provider":"Groq"}');
});

test("any other failure keeps its own words after the prefix", () => {
  assert.equal(
    chatErrorText(new Error("socket hang up"), t),
    "agentMode.chat.errorPrefix: socket hang up"
  );
  // Without a provider there is no name to say, so the error's words stay.
  const bare = Object.assign(new Error("API key not configured"), { code: "API_KEY_MISSING" });
  assert.equal(chatErrorText(bare, t), "agentMode.chat.errorPrefix: API key not configured");
  assert.equal(chatErrorText("plain", t), "agentMode.chat.errorPrefix: plain");
});
