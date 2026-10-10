const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const WhisperManager = require("../../src/helpers/whisper");
const { getPrewarmStartOptions } = require("../../src/helpers/whisper");
const { getVadSignature, resolveWhisperThreads } = require("../../src/helpers/whisperServer");
const {
  resolveContextSileroEnabled,
  sanitizeWhisperVadConfig,
} = require("../../src/helpers/whisperVadConfig");

// The pre-warm exists so the first transcription finds whisper-server ready.
// whisper-server restarts when a request's model or VAD signature differs from
// the running one, so a pre-warm with other options is a wasted start followed
// by a cold one: measured at 245-274 ms on the first request after launch.

const VAD_MODEL = "/bundle/whisper-vad/ggml-silero-v5.1.2.bin";

/** The start options `_runServerTranscription` uses with the default VAD settings. */
function requestStartOptions(context) {
  return {
    useCuda: false,
    useVulkan: false,
    vadEnabled: resolveContextSileroEnabled({}, context),
    vadModelPath: VAD_MODEL,
    vadConfig: sanitizeWhisperVadConfig({}),
  };
}

function managerWith(installed) {
  const manager = new WhisperManager();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-prewarm-"));
  for (const file of installed) fs.writeFileSync(path.join(dir, file), "");
  manager.getModelsDir = () => dir;
  manager.getVadModelPath = () => VAD_MODEL;
  manager.ensureBundledDefaultModel = async () => null;
  manager.logDependencyStatus = async () => {};
  const starts = [];
  manager.serverManager = {
    isAvailable: () => true,
    start: async (modelPath, options) => {
      starts.push({ model: path.basename(modelPath), options });
    },
    ready: true,
    port: 8178,
  };
  return { manager, starts, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("the pre-warm has the VAD signature every request context uses by default", () => {
  const warm = getVadSignature(getPrewarmStartOptions({ vadModelPath: VAD_MODEL }));
  for (const context of ["dictation", "noteRecording", "meeting"]) {
    assert.equal(warm, getVadSignature(requestStartOptions(context)), context);
  }
  assert.notEqual(warm, "vad:off");
});

test("the pre-warm resolves the same threads as a request", () => {
  const warm = resolveWhisperThreads(getPrewarmStartOptions({ vadModelPath: VAD_MODEL }));
  const request = resolveWhisperThreads(requestStartOptions("dictation"));
  assert.equal(warm.threads, request.threads);
});

test("without the VAD model the pre-warm runs without VAD, as requests then do", () => {
  const warm = getVadSignature(getPrewarmStartOptions({ vadModelPath: null }));
  assert.equal(warm, getVadSignature({ ...requestStartOptions("dictation"), vadModelPath: null }));
});

test("an English speaker's pre-warm loads the English model a request will ask for", async () => {
  const { manager, starts, cleanup } = managerWith(["ggml-base.bin", "ggml-base.en.bin"]);
  try {
    await manager.initializeAtStartup({
      localTranscriptionProvider: "whisper",
      whisperModel: "base",
      language: "en",
    });
    assert.equal(starts.length, 1);
    assert.equal(starts[0].model, "ggml-base.en.bin");
    assert.equal(manager.currentServerModel, "base.en");
    assert.equal(
      getVadSignature(starts[0].options),
      getVadSignature(requestStartOptions("dictation"))
    );
  } finally {
    cleanup();
  }
});

test("auto-detect and other languages keep the multilingual model", async () => {
  for (const language of [null, "auto", "fr"]) {
    const { manager, starts, cleanup } = managerWith(["ggml-base.bin", "ggml-base.en.bin"]);
    try {
      await manager.initializeAtStartup({
        localTranscriptionProvider: "whisper",
        whisperModel: "base",
        language,
      });
      assert.equal(starts[0]?.model, "ggml-base.bin", String(language));
    } finally {
      cleanup();
    }
  }
});

test("English without the English model installed warms the model that is there", async () => {
  const { manager, starts, cleanup } = managerWith(["ggml-base.bin"]);
  try {
    await manager.initializeAtStartup({
      localTranscriptionProvider: "whisper",
      whisperModel: "base",
      language: "en",
    });
    assert.equal(starts[0]?.model, "ggml-base.bin");
  } finally {
    cleanup();
  }
});
