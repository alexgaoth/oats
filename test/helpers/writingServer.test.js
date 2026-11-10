const test = require("node:test");
const assert = require("node:assert/strict");

// The writing model's own llama-server while a recording runs
// (src/helpers/writingServer.js): when it exists, which server a request goes
// to, that two servers never take one port, and that a question card's
// classifier never waits behind a topic name.

const gate = require("../../src/helpers/writingServer");
const LlamaServerManager = require("../../src/helpers/llamaServer");

let naming;
let writingTier;

test.before(async () => {
  naming = await import("../../src/helpers/topicNaming.mjs");
  writingTier = await import("../../src/helpers/writingTier.mjs");
});

const GB = 1024 ** 3;
const WRITER = "gemma-4-e4b-it-q4_k_m";
const CLASSIFIER = "qwen2.5-1.5b-instruct-q5_k_m";

test("a server of its own only on Apple silicon with the memory that already gets Gemma", () => {
  assert.equal(gate.MIN_DEDICATED_WRITING_MEMORY_BYTES, writingTier.MIN_LARGE_WRITING_MEMORY_BYTES);
  const mac = { platform: "darwin", arch: "arm64", binaryAvailable: true };
  assert.equal(gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: 16 * GB }), true);
  assert.equal(gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: 48 * GB }), true);
  assert.equal(gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: 16 * GB - 1 }), false);
  assert.equal(gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: 8 * GB }), false);
  assert.equal(gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: null }), false);
  assert.equal(
    gate.dedicatedWritingServerSupported({ ...mac, memoryBytes: 32 * GB, binaryAvailable: false }),
    false
  );
  for (const other of [
    { platform: "darwin", arch: "x64" },
    { platform: "linux", arch: "x64" },
    { platform: "win32", arch: "x64" },
  ]) {
    assert.equal(
      gate.dedicatedWritingServerSupported({
        ...other,
        memoryBytes: 64 * GB,
        binaryAvailable: true,
      }),
      false
    );
  }
  assert.equal(gate.dedicatedWritingServerSupported(), false);
});

test("only a request that asks for it goes to the writing server, and not after it stopped", () => {
  const role = gate.serverRoleFor;
  assert.equal(role({ requested: undefined, mode: "hold" }), "default");
  assert.equal(role({ requested: "default", mode: "hold" }), "default");
  assert.equal(role({ requested: "writing", mode: "off" }), "default");
  assert.equal(role({ requested: "writing", mode: "hold" }), "writing");
  assert.equal(role({ requested: "writing", mode: "hold", writingRunning: false }), "writing");
  assert.equal(role({ requested: "writing", mode: "idle", writingRunning: true }), "writing");
  // After the recording, a stopped writing server is not started again.
  assert.equal(role({ requested: "writing", mode: "idle", writingRunning: false }), "default");
});

test("with a server of its own, a local writing model names while recording beside the classifier", () => {
  const live = naming.namesWhileRecording;
  const local = { mode: "local", model: "qwen3.5-4b", classifier: "qwen2.5-1.5b" };
  assert.equal(live({ ...local, classifierOnDisk: true, dedicatedWritingServer: true }), true);
  assert.equal(live({ ...local, classifierOnDisk: null, dedicatedWritingServer: true }), true);
  // Without one, the old answers stand.
  assert.equal(live({ ...local, classifierOnDisk: true, dedicatedWritingServer: false }), false);
  assert.equal(live({ ...local, classifierOnDisk: true }), false);
  assert.equal(live({ ...local, classifierOnDisk: false }), true);
});

test("two servers in one process never pick the same port", async () => {
  const a = new LlamaServerManager();
  const b = new LlamaServerManager({ pidName: gate.WRITING_PID_NAME });
  try {
    const [pa, pb] = await Promise.all([a.findAvailablePort(), b.findAvailablePort()]);
    assert.notEqual(pa, pb);
    assert.ok(pa >= 8221 && pa <= 8240 && pb >= 8221 && pb <= 8240);
    // A manager's next scan gives its own port back first; the other's stays taken.
    const again = await a.findAvailablePort();
    assert.notEqual(again, pb);
    // Stopped, the port is free for the other.
    await a.stop();
    assert.equal(a.reservedPort, null);
  } finally {
    a.releasePort();
    b.releasePort();
  }
});

test("each server has its own PID file name", () => {
  assert.equal(new LlamaServerManager().pidName, "llama");
  assert.equal(new LlamaServerManager({ pidName: "llama-writing" }).pidName, "llama-writing");
  const reaperSource = require("fs").readFileSync(
    require("path").join(__dirname, "../../src/helpers/sidecarReaper.js"),
    "utf-8"
  );
  assert.match(reaperSource, /"llama-writing": \["llama-server"\]/);
});

test("a server kept alive is not stopped when idle, and is again once let go", () => {
  const server = new LlamaServerManager();
  server.process = { pid: 0 };
  try {
    server.resetIdleTimer();
    assert.ok(server.idleTimer, "a server not kept alive has its idle timer");
    server.setKeepAlive(true);
    assert.equal(server.idleTimer, null);
    server.resetIdleTimer();
    assert.equal(server.idleTimer, null, "no idle timer while kept alive");
    server.setKeepAlive(false);
    assert.ok(server.idleTimer, "let go, the idle timer starts again");
  } finally {
    server.clearIdleTimer();
    server.process = null;
  }
});

// --- The model manager and the bridge, with the servers faked.

function fakeServer(log, name) {
  return {
    ready: false,
    process: null,
    port: null,
    starts: 0,
    stops: 0,
    keepAlive: false,
    isAvailable: () => true,
    setKeepAlive(on) {
      this.keepAlive = on;
    },
    async start(modelPath) {
      this.starts += 1;
      if (this.failStart) throw new Error("no memory");
      this.ready = true;
      this.process = { pid: 1 };
      this.modelPath = modelPath;
      this.port = name === "default" ? 18621 : 18622;
    },
    async inference(messages) {
      log.push({ server: name, model: this.modelPath, prompt: messages[1].content });
      if (this.hold) await this.hold;
      return `${name} answer`;
    },
    async stop() {
      this.stops += 1;
      this.ready = false;
      this.process = null;
    },
  };
}

function setupManager() {
  const manager = require("../../src/helpers/modelManagerBridge").default;
  const log = [];
  manager._initialized = true;
  manager.modelsDir = "/models";
  manager.checkModelValid = async () => true;
  manager.serverManager = fakeServer(log, "default");
  manager.currentServerModelId = null;
  manager.writingServer = null;
  manager.writingServerModelId = null;
  manager.writingMode = "off";
  manager.writingStartFailed = false;
  manager.dedicatedWritingServerSupported = () => true;
  return { manager, log };
}

async function holdWithFake(manager, log) {
  const answer = await manager.setWritingServer("hold");
  manager.writingServer = Object.assign(fakeServer(log, "writing"), {
    keepAlive: manager.writingServer.keepAlive,
  });
  return answer;
}

test("held, a writing request goes to its own server and the classifier's server keeps its model", async () => {
  const { manager, log } = setupManager();
  await manager.runInference(CLASSIFIER, "card", {});
  assert.deepEqual(await holdWithFake(manager, log), { dedicated: true });
  await manager.runInference(WRITER, "name", { serverRole: "writing" });
  await manager.runInference(CLASSIFIER, "card 2", {});
  assert.deepEqual(
    log.map((entry) => [entry.server, entry.prompt]),
    [
      ["default", "card"],
      ["writing", "name"],
      ["default", "card 2"],
    ]
  );
  assert.equal(manager.serverManager.starts, 1, "the classifier was never unloaded");
  assert.equal(manager.currentServerModelId, CLASSIFIER);
  assert.equal(manager.writingServerModelId, WRITER);
  // Stopped: the writing server goes, the classifier's stays.
  assert.deepEqual(await manager.setWritingServer("stop"), { dedicated: false });
  assert.equal(manager.writingServer.stops, 1);
  assert.equal(manager.serverManager.stops, 0);
  assert.equal(manager.serverRole("writing"), "default");
});

test("not held, or not supported, everything goes to the one server as before", async () => {
  const { manager, log } = setupManager();
  await manager.runInference(WRITER, "name", { serverRole: "writing" });
  assert.equal(log[0].server, "default");
  manager.dedicatedWritingServerSupported = () => false;
  assert.deepEqual(await manager.setWritingServer("hold"), { dedicated: false });
  assert.equal(manager.writingMode, "off");
  assert.equal(manager.serverRole("writing"), "default");
});

test("after the recording, the names use a writing server still running, and never start one", async () => {
  const { manager, log } = setupManager();
  await holdWithFake(manager, log);
  assert.equal(manager.serverRole("writing"), "writing", "held: started on the first request");
  await manager.runInference(WRITER, "name", { serverRole: "writing" });
  assert.deepEqual(await manager.setWritingServer("idle"), { dedicated: true });
  assert.equal(manager.writingServer.keepAlive, false, "idle again: stops after the idle time");
  assert.equal(manager.serverRole("writing"), "writing");
  await manager.writingServer.stop();
  assert.equal(manager.serverRole("writing"), "default");
});

test("a writing server that failed to start is not tried again in that recording", async () => {
  const { manager, log } = setupManager();
  await holdWithFake(manager, log);
  manager.writingServer.failStart = true;
  await assert.rejects(
    manager.runInference(WRITER, "name", { serverRole: "writing" }),
    /no memory/
  );
  await assert.rejects(
    manager.runInference(WRITER, "name 2", { serverRole: "writing" }),
    (error) => error.code === "WRITING_SERVER_FAILED"
  );
  assert.equal(manager.writingServer.starts, 1);
  assert.equal(manager.serverManager.starts, 0, "the classifier's server was not touched");
});

test("a question card's classifier never waits behind a topic name", async () => {
  const { manager, log } = setupManager();
  await holdWithFake(manager, log);
  const bridge = require("../../src/services/localReasoningBridge").default;
  let release;
  manager.writingServer.hold = new Promise((resolve) => {
    release = resolve;
  });
  const naming = bridge.processText("name", WRITER, { serverRole: "writing" });
  // Let the name reach its server.
  await new Promise((resolve) => setImmediate(resolve));
  const verdict = await bridge.processText("card", CLASSIFIER, {});
  assert.equal(verdict, "default answer");
  assert.equal(bridge.writingTurns.running, true, "the name is still being written");
  release();
  assert.equal(await naming, "writing answer");
  await manager.setWritingServer("stop");
});

test("a hold ends with the page that asked for it, and only that page", () => {
  const { EventEmitter } = require("node:events");
  let released = 0;
  const owner = gate.createHoldOwner(() => {
    released += 1;
  });
  const page = new EventEmitter();
  const other = new EventEmitter();

  owner.held(page);
  owner.held(page);
  for (const name of gate.PAGE_GONE_EVENTS) assert.equal(page.listenerCount(name), 1, name);
  page.emit("did-navigate");
  assert.equal(released, 1, "a reload of the holding page lets go");
  page.emit("render-process-gone");
  assert.equal(released, 1, "once");

  owner.held(page);
  owner.letGo();
  page.emit("destroyed");
  assert.equal(released, 1, "not after the page let go itself");

  owner.held(page);
  owner.held(other);
  page.emit("did-navigate");
  assert.equal(released, 1, "not for a page another page's hold replaced");
  other.emit("render-process-gone");
  assert.equal(released, 2);

  owner.held(null);
  assert.equal(released, 2);
});
