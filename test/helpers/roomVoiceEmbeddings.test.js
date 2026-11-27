const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// The worker is a utility process in the app; here its requests are recorded
// and answered in place.
const requests = [];
let answer = async () => ({});

require.cache[require.resolve("electron")] = {
  exports: { app: { getPath: () => os.tmpdir() } },
};
require.cache[require.resolve("../../src/helpers/debugLogger.js")] = {
  exports: { debug() {}, info() {}, warn() {}, error() {} },
};
require.cache[require.resolve("../../src/helpers/onnxWorkerClient.js")] = {
  exports: {
    request: async (method, payload) => {
      requests.push({ method, payload });
      return answer(method, payload);
    },
  },
};

const { RoomVoiceEmbeddings, MODEL_FILE } = require("../../src/helpers/roomVoiceEmbeddings.js");

test.beforeEach(() => {
  requests.length = 0;
  answer = async (method) =>
    method === "roomVoice.extract"
      ? { embeddingBuffer: Float32Array.of(0.5, -0.5).buffer }
      : { ok: true };
});

test("a line's samples go to the worker in [-1, 1], after the model is loaded once", async () => {
  const voices = new RoomVoiceEmbeddings();
  const first = await voices.extract(Int16Array.of(16384, -32768, 0));
  await voices.extract(Int16Array.of(1));
  assert.deepEqual(Array.from(first), [0.5, -0.5]);
  assert.deepEqual(
    requests.map((r) => r.method),
    ["roomVoice.load", "roomVoice.extract", "roomVoice.extract"]
  );
  assert.ok(requests[0].payload.modelPath.endsWith(MODEL_FILE));
  assert.deepEqual(Array.from(new Float32Array(requests[1].payload.samplesBuffer)), [0.5, -1, 0]);
});

test("a worker that came back without the model is given it again, once", async () => {
  const voices = new RoomVoiceEmbeddings();
  await voices.extract(Int16Array.of(1));
  let failed = false;
  answer = async (method) => {
    if (method === "roomVoice.extract" && !failed) {
      failed = true;
      throw new Error("room voice session not loaded");
    }
    return method === "roomVoice.extract"
      ? { embeddingBuffer: Float32Array.of(1).buffer }
      : { ok: true };
  };
  const voice = await voices.extract(Int16Array.of(1));
  assert.deepEqual(Array.from(voice), [1]);
  assert.deepEqual(
    requests.map((r) => r.method),
    [
      "roomVoice.load",
      "roomVoice.extract",
      "roomVoice.extract",
      "roomVoice.load",
      "roomVoice.extract",
    ]
  );
});

test("other worker errors are not retried", async () => {
  const voices = new RoomVoiceEmbeddings();
  answer = async (method) => {
    if (method === "roomVoice.extract") throw new Error("ONNX worker request timed out");
    return { ok: true };
  };
  await assert.rejects(voices.extract(Int16Array.of(1)), /timed out/);
});

test("grouping sends each line's voice, or none, and returns the worker's turns", async () => {
  const voices = new RoomVoiceEmbeddings();
  const turns = [{ start: 0, end: 3, speaker: "speaker_00" }];
  answer = async () => ({ turns });
  const result = await voices.group([
    { startMs: 0, endMs: 3000, embedding: Float32Array.of(1, 2) },
    { startMs: 3500, endMs: 3800, embedding: null },
  ]);
  assert.deepEqual(result, turns);
  const { lines } = requests[0].payload;
  assert.equal(requests[0].method, "roomVoice.group");
  assert.deepEqual(Array.from(new Float32Array(lines[0].embeddingBuffer)), [1, 2]);
  assert.equal(lines[1].embeddingBuffer, null);
});

test("the bundled model is preferred", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-voices-"));
  const bundled = path.join(dir, "bin", "diarization-models", MODEL_FILE);
  fs.mkdirSync(path.dirname(bundled), { recursive: true });
  fs.writeFileSync(bundled, "");
  const original = process.resourcesPath;
  try {
    process.resourcesPath = dir;
    const voices = new RoomVoiceEmbeddings();
    assert.equal(voices.getModelPath(), bundled);
    assert.equal(voices.isAvailable(), true);
    fs.rmSync(bundled);
    // Without it: a development checkout's or the models folder's, or the
    // bundled path when there is none, and then the pass is off.
    assert.equal(voices.isAvailable(), fs.existsSync(voices.getModelPath()));
  } finally {
    process.resourcesPath = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
