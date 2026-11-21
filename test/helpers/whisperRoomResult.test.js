const test = require("node:test");
const assert = require("node:assert/strict");
const WhisperManager = require("../../src/helpers/whisper");

test("a valid Whisper response with no speech is an empty room final, not a failure", () => {
  const whisper = WhisperManager.prototype;
  for (const text of ["", " \n ", "[BLANK_AUDIO]"]) {
    assert.deepEqual(whisper.parseWhisperResult({ text }, { allowEmpty: true }), {
      success: true,
      text: "",
    });
    assert.equal(whisper.parseWhisperResult({ text }).success, false, "dictation keeps its result");
  }
  assert.deepEqual(whisper.parseWhisperResult({ text: " hello\n there " }, { allowEmpty: true }), {
    success: true,
    text: "hello there",
  });
  assert.equal(whisper.parseWhisperResult({}, { allowEmpty: true }).success, false);
  assert.equal(whisper.parseWhisperResult({ text: null }, { allowEmpty: true }).success, false);
});
