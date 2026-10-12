const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");

const { createOnDeviceStatus, speechState } = require("../../src/helpers/onDeviceStatus");
const { createNetworkLedger } = require("../../src/helpers/networkLedger");
const { parseWhisperBackend } = require("../../src/helpers/whisperBackend");
const WhisperServerManager = require("../../src/helpers/whisperServer");

// The main-process half of the sidebar's footer: the request count and the
// speech model are pushed when they change, never polled.

test("the speech line is the running local server's model and reported backend", () => {
  assert.deepEqual(speechState({ running: true, modelName: "base.en", backend: "Metal" }), {
    model: "base.en",
    backend: "Metal",
  });
  assert.deepEqual(speechState({ running: true, modelName: "small", backend: undefined }), {
    model: "small",
    backend: null,
  });
  assert.equal(speechState({ running: false, modelName: "base.en", backend: "Metal" }), null);
  assert.equal(speechState({ running: true, isRemote: true, modelName: "base" }), null);
  assert.equal(speechState({ running: true, modelName: null }), null);
  assert.equal(speechState(undefined), null);
});

function fakeTimers() {
  const pending = [];
  return {
    setTimer: (fn) => {
      pending.push(fn);
      return pending.length;
    },
    clearTimer: () => pending.splice(0),
    flush: () => pending.splice(0).forEach((fn) => fn()),
    get size() {
      return pending.length;
    },
  };
}

test("a burst of requests is one push, and a speech server change is another", () => {
  const ledger = createNetworkLedger({ now: () => 42 });
  const server = new EventEmitter();
  let status = { running: false, modelName: null, backend: null };
  server.getStatus = () => status;
  const timers = fakeTimers();
  const pushed = [];
  const onDevice = createOnDeviceStatus({
    ledger,
    speechServer: server,
    publish: (snapshot) => pushed.push(snapshot),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  assert.deepEqual(onDevice.snapshot(), {
    requests: { outbound: 0, since: 42 },
    speech: null,
  });

  ledger.recordUrl("chromium", "https://api.openai.com/v1/models");
  ledger.recordUrl("chromium", "https://api.openai.com/v1/chat/completions");
  ledger.recordUrl("chromium", "http://127.0.0.1:8178/inference");
  assert.equal(timers.size, 1, "one push scheduled for the burst");
  timers.flush();
  assert.deepEqual(pushed, [{ requests: { outbound: 2, since: 42 }, speech: null }]);

  status = { running: true, modelName: "base.en", backend: "Metal" };
  server.emit("status");
  timers.flush();
  assert.deepEqual(pushed.at(-1), {
    requests: { outbound: 2, since: 42 },
    speech: { model: "base.en", backend: "Metal" },
  });

  onDevice.dispose();
  ledger.recordUrl("chromium", "https://api.openai.com/v1/models");
  server.emit("status");
  assert.equal(timers.size, 0, "nothing is pushed once disposed");
});

test("the backend is what whisper-server said, the last word winning", () => {
  const line = (rest) => `whisper_backend_init_gpu: ${rest}\n`;
  assert.equal(parseWhisperBackend(""), null);
  assert.equal(
    parseWhisperBackend("whisper_init_from_file_with_params_no_state: loading model"),
    null
  );
  assert.equal(parseWhisperBackend(line("using MTL0 backend")), "Metal");
  assert.equal(parseWhisperBackend(line("using Metal backend")), "Metal");
  assert.equal(parseWhisperBackend(line("using CUDA0 backend")), "CUDA");
  assert.equal(parseWhisperBackend(line("using Vulkan0 backend")), "Vulkan");
  assert.equal(parseWhisperBackend(line("no GPU found")), "CPU");
  assert.equal(
    parseWhisperBackend(line("using CUDA0 backend") + line("failed to initialize CUDA0 backend")),
    "CPU",
    "a device that did not start leaves the CPU"
  );
  assert.equal(parseWhisperBackend(line("using SYCL0 backend")), "SYCL0");
  // As logged by a real run on an M-series Mac (DEBUG logs, 2026-10).
  const real = [
    "whisper_init_with_params_no_state: use gpu    = 1",
    "whisper_backend_init_gpu: device 0: MTL0 (type: 1)",
    "whisper_backend_init_gpu: found GPU device 0: MTL0 (type: 1, cnt: 0)",
    "whisper_backend_init_gpu: using MTL0 backend",
    "ggml_metal_init: allocating",
    "ggml_metal_library_init: using embedded metal library",
  ].join("\n");
  assert.equal(parseWhisperBackend(real), "Metal");
});

test("the speech server's status carries the backend it reported", () => {
  const manager = new WhisperServerManager();
  manager.ready = true;
  manager.process = {};
  manager.modelPath = "/models/ggml-base.en.bin";
  manager.backend = "Metal";
  assert.equal(manager.getStatus().modelName, "base.en");
  assert.equal(manager.getStatus().backend, "Metal");
  manager.isRemote = true;
  assert.equal(manager.getStatus().backend, null, "a remote server's backend is not ours to state");
});
