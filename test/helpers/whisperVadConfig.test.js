const test = require("node:test");
const assert = require("node:assert/strict");

test("sanitizeWhisperVadConfig applies defaults and clamps invalid values", async () => {
  const { DEFAULT_WHISPER_VAD_CONFIG, sanitizeWhisperVadConfig } =
    await import("../../src/helpers/whisperVadConfig.js");

  const cfg = sanitizeWhisperVadConfig({
    threshold: 99,
    minSpeechDurationMs: -20,
    minSilenceDurationMs: "bad",
    maxSpeechDurationS: 0,
    speechPadMs: null,
    samplesOverlap: -1,
  });

  assert.deepEqual(cfg, {
    threshold: 0.95,
    minSpeechDurationMs: 50,
    minSilenceDurationMs: DEFAULT_WHISPER_VAD_CONFIG.minSilenceDurationMs,
    maxSpeechDurationS: 5,
    speechPadMs: DEFAULT_WHISPER_VAD_CONFIG.speechPadMs,
    samplesOverlap: 0,
  });
});

test("resolveContextSileroEnabled prefers context value then falls back to true", async () => {
  const { resolveContextSileroEnabled } = await import("../../src/helpers/whisperVadConfig.js");

  assert.equal(resolveContextSileroEnabled({ dictationSileroEnabled: false }, "dictation"), false);
  assert.equal(
    resolveContextSileroEnabled({ noteRecordingSileroEnabled: true }, "noteRecording"),
    true
  );
  assert.equal(resolveContextSileroEnabled({}, "meeting"), true);
});

test("the shipped overlap is the measured one", () => {
  // 0.5 s fed the start of the next phrase to whisper twice ("she said, she
  // said"). On LibriSpeech, base.en + VAD: 5.69% → 5.34% (n=200); long
  // dictation cut at pauses: 4.63% → 4.16% (docs/dictation-accuracy.md).
  const constants = require("../../src/constants/whisperVad.json");
  assert.equal(constants.DEFAULTS.samplesOverlap, 0.1);
});
