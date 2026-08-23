const test = require("node:test");
const assert = require("node:assert/strict");

let DEFAULT_CONVERSATION_DETAIL;
let resolveConversationDetail;
let toggleConversationDetail;

test.before(async () => {
  ({ DEFAULT_CONVERSATION_DETAIL, resolveConversationDetail, toggleConversationDetail } =
    await import("../../src/helpers/conversationDetail.mjs"));
});

// The default is the whole point of the setting: a first conversation must not
// open onto a wall of moving text.
test("nothing stored means the quiet composition", () => {
  assert.equal(DEFAULT_CONVERSATION_DETAIL, "clean");
  assert.equal(resolveConversationDetail(null), "clean");
  assert.equal(resolveConversationDetail(undefined), "clean");
  assert.equal(resolveConversationDetail(""), "clean");
});

// An install that predates the setting has no stored value, so it takes the
// same path as a fresh one — deliberately, not by accident.
test("a stored value is honoured, and only the two real ones are", () => {
  assert.equal(resolveConversationDetail("clean"), "clean");
  assert.equal(resolveConversationDetail("detailed"), "detailed");
  assert.equal(resolveConversationDetail("verbose"), "clean");
  assert.equal(resolveConversationDetail("CLEAN"), "clean");
  assert.equal(resolveConversationDetail(0), "clean");
  assert.equal(resolveConversationDetail({}), "clean");
});

test("the switch alternates, and repairs a bad stored value on the way", () => {
  assert.equal(toggleConversationDetail("clean"), "detailed");
  assert.equal(toggleConversationDetail("detailed"), "clean");
  assert.equal(toggleConversationDetail(null), "detailed");
  assert.equal(toggleConversationDetail("nonsense"), "detailed");
});
