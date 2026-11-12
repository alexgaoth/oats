const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const Module = require("module");

const nativeE2E = require("../../src/helpers/nativeE2E");
const runner = require("../../scripts/run-native-e2e.js");

function tempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

test("the fixture finishes onboarding with the migration sentinel, so no reminder covers Start", async () => {
  const userData = tempDir("oats-native-e2e-fixture-");
  // What the app itself creates on a fresh test profile before the fixture runs.
  fs.writeFileSync(path.join(userData, "transcriptions.db"), "");
  fs.writeFileSync(path.join(userData, ".env"), "");
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return { app: { getPath: () => userData } };
    return originalLoad.call(this, request, ...rest);
  };
  const detectorPath = require.resolve("../../src/helpers/postMigrationDetector");
  delete require.cache[detectorPath];
  try {
    const detector = require(detectorPath);
    if (process.platform === "darwin") {
      assert.equal(
        detector.isReturningFromOldBundle(),
        true,
        "the unfixed profile shows the reminder"
      );
    }
    const storage = new Map();
    const calls = [];
    const context = vm.createContext({
      localStorage: {
        setItem: (key, value) => storage.set(key, String(value)),
        getItem: (key) => storage.get(key) ?? null,
      },
      window: {
        electronAPI: {
          markBundleMigrated: async () => {
            calls.push("markBundleMigrated");
            detector.markBundleMigrated();
          },
          getPostMigrationState: async () => ({
            justMigrated: detector.isReturningFromOldBundle(),
          }),
        },
      },
    });
    const result = await vm.runInContext(runner.FIXTURE_ONBOARDING, context);
    assert.equal(storage.get("onboardingCompleted"), "true");
    assert.deepEqual(calls, ["markBundleMigrated"]);
    assert.ok(fs.existsSync(path.join(userData, ".bundle-migrated")));
    assert.equal(result.postMigration.justMigrated, false);
    assert.equal(detector.isReturningFromOldBundle(), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[detectorPath];
  }
});

test("the reminder's only answer is Remind Me Later, never Grant Access", () => {
  assert.match(runner.DISMISS_REMINDER, /"Remind Me Later"/);
  assert.doesNotMatch(runner.DISMISS_REMINDER, /Grant Access/);
});

test("debugger events with no command id are kept, and replies still settle their command", () => {
  const settled = [];
  const pending = new Map([
    [
      1,
      { resolve: (v) => settled.push(["ok", v]), reject: (e) => settled.push(["err", e.message]) },
    ],
    [
      2,
      { resolve: (v) => settled.push(["ok", v]), reject: (e) => settled.push(["err", e.message]) },
    ],
  ]);
  const file = path.join(tempDir("oats-native-e2e-events-"), "events.jsonl");
  const recorder = runner.eventRecorder(file);
  const route = (msg) => runner.dispatchCdpMessage(msg, pending, recorder.onEvent);

  assert.equal(route({ id: 1, result: { value: 3 } }), "reply");
  assert.equal(route({ id: 2, error: { message: "no" } }), "reply");
  assert.equal(
    route({
      method: "Runtime.consoleAPICalled",
      params: {
        type: "error",
        timestamp: 5,
        args: [
          { type: "string", value: "Meeting transcription setup failed" },
          {
            type: "object",
            preview: { properties: [{ name: "error", value: "NotReadableError" }] },
          },
        ],
      },
    }),
    "event"
  );
  route({
    method: "Runtime.exceptionThrown",
    params: {
      timestamp: 6,
      exceptionDetails: {
        text: "Uncaught",
        exception: { description: "TypeError: x" },
        url: "file:///a.js",
        lineNumber: 4,
      },
    },
  });
  route({
    method: "Log.entryAdded",
    params: { entry: { level: "warning", source: "other", text: "fake device", timestamp: 7 } },
  });
  route({ method: "Page.frameNavigated", params: {} });
  assert.equal(route({ id: 99, result: {} }), "ignored");

  assert.deepEqual(settled, [
    ["ok", { value: 3 }],
    ["err", '{"message":"no"}'],
  ]);
  assert.deepEqual(
    recorder.kept.map((e) => [e.kind, e.level ?? null, e.text]),
    [
      ["console", "error", "Meeting transcription setup failed {error: NotReadableError}"],
      ["exception", null, "TypeError: x"],
      ["log", "warning", "fake device"],
    ]
  );
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  assert.equal(runner.summarizeCdpEvent({ method: "Network.requestWillBeSent", params: {} }), null);
});

function fakeBrowser({ getUserMedia, resume } = {}) {
  const sent = [];
  class FakeAudioContext extends EventTarget {
    constructor(options = {}) {
      super();
      this.sampleRate = options.sampleRate ?? 48000;
      this.state = "suspended";
    }
    resume() {
      if (resume) return resume(this);
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
      return Promise.resolve();
    }
    setSinkId() {
      return Promise.resolve();
    }
  }
  class FakeWorklet {
    addModule() {
      return Promise.resolve();
    }
  }
  const channels = [];
  class FakeWorkletNode {
    constructor(context, name) {
      this.context = context;
      this.name = name;
      const channel = new MessageChannel();
      channels.push(channel);
      this.port = channel.port1;
      this.processorPort = channel.port2;
    }
  }
  const track = {
    label: "Fake Default Audio Input",
    readyState: "live",
    muted: false,
    enabled: true,
    getSettings: () => ({ sampleRate: 48000, channelCount: 1 }),
    addEventListener() {},
  };
  const stream = { getAudioTracks: () => [track] };
  const global = {
    performance,
    navigator: {
      mediaDevices: {
        getUserMedia: getUserMedia ?? (async () => stream),
        enumerateDevices: async () => [{ kind: "audioinput", label: track.label, deviceId: "d" }],
      },
    },
    AudioContext: FakeAudioContext,
    Worklet: FakeWorklet,
    AudioWorkletNode: FakeWorkletNode,
    electronAPI: {
      meetingTranscriptionSend: (buffer, source) => sent.push([buffer.byteLength, source]),
    },
  };
  global.window = global;
  return {
    global,
    stream,
    sent,
    close: () => channels.forEach((c) => (c.port1.close(), c.port2.close())),
  };
}

test("the capture probe records each stage without changing what the app gets", async () => {
  const browser = fakeBrowser();
  const context = vm.createContext(browser.global);
  vm.runInContext(runner.CAPTURE_PROBE, context);
  vm.runInContext(runner.CAPTURE_PROBE, context);
  const g = browser.global;
  try {
    assert.equal(
      await g.navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: "d" } } }),
      browser.stream
    );
    const ctx = new g.AudioContext({ sampleRate: 24000 });
    await ctx.setSinkId({ type: "none" });
    await ctx.resume();
    await new g.Worklet().addModule("blob:file:///x");
    const node = new g.AudioWorkletNode(ctx, "meeting-pcm-processor");
    const appGot = [];
    const delivered = new Promise((resolve) => {
      node.port.onmessage = (event) => {
        appGot.push(event.data.byteLength);
        g.electronAPI.meetingTranscriptionSend(event.data, "mic");
        if (appGot.length === 2) resolve();
      };
    });
    const loud = new Int16Array(800);
    loud[3] = -1200;
    node.processorPort.postMessage(new Int16Array(800).buffer);
    node.processorPort.postMessage(loud.buffer);
    await delivered;

    const probe = JSON.parse(JSON.stringify(g.__oatsE2EProbe));
    assert.equal(probe.gum.length, 1, "installing twice wraps once");
    assert.equal(probe.gum[0].exactDevice, true);
    assert.equal(probe.gum[0].tracks[0].readyState, "live");
    assert.deepEqual(
      probe.contexts.map((c) => [c.sampleRate, c.state]),
      [[24000, "running"]]
    );
    assert.equal(probe.resumes[0].stateAfter, "running");
    assert.equal(probe.sinks.length, 1);
    assert.equal(probe.modules[0].scheme, "blob");
    assert.deepEqual(appGot, [1600, 1600], "the app still receives every chunk");
    assert.equal(probe.nodes[0].messages, 2);
    assert.equal(probe.nodes[0].firstPeak, 0);
    assert.equal(probe.nodes[0].peak, 1200);
    assert.equal(probe.send.wrapped, "yes");
    assert.equal(probe.send.count, 2);
    assert.deepEqual(browser.sent, [
      [1600, "mic"],
      [1600, "mic"],
    ]);

    const stages = runner.captureStages(probe, [
      { event: "meeting-audio-received", source: "mic", peak: 1200, at: "t" },
    ]);
    assert.equal(stages.complete, true);
    assert.equal(stages.silent, false);
  } finally {
    browser.close();
  }
});

test("a failed getUserMedia still rejects with its own error, and the probe says why", async () => {
  const denied = Object.assign(new Error("Could not start audio source"), {
    name: "NotReadableError",
  });
  const browser = fakeBrowser({ getUserMedia: async () => Promise.reject(denied) });
  const context = vm.createContext(browser.global);
  vm.runInContext(runner.CAPTURE_PROBE, context);
  try {
    await assert.rejects(
      browser.global.navigator.mediaDevices.getUserMedia({ audio: true }),
      (e) => e === denied
    );
    const probe = JSON.parse(JSON.stringify(browser.global.__oatsE2EProbe));
    const stages = runner.captureStages(probe, []);
    assert.equal(stages.pending, "getUserMedia");
    assert.deepEqual(stages.stages.getUserMedia.errors, [
      { name: "NotReadableError", message: "Could not start audio source" },
    ]);
  } finally {
    browser.close();
  }
});

test("capture stages name the first one that has not arrived", () => {
  const live = { resolvedAt: 40, tracks: [{ readyState: "live" }] };
  const node = (messages, peak) => ({ name: "meeting-pcm-processor", messages, peak, firstAt: 90 });
  const base = {
    gum: [live],
    contexts: [{ state: "running" }],
    modules: [{ resolvedAt: 60 }],
    nodes: [node(3, 900)],
    send: { wrapped: "yes", count: 3, firstAt: 95 },
  };
  const received = [{ event: "meeting-audio-received", source: "mic", peak: 900 }];

  assert.equal(runner.captureStages(null).pending, "getUserMedia");
  assert.equal(
    runner.captureStages({ ...base, gum: [{ at: 1 }] }, received).pending,
    "getUserMedia"
  );
  const hungResume = runner.captureStages(
    { ...base, contexts: [{ state: "suspended" }], resumes: [{ at: 50 }] },
    received
  );
  assert.equal(hungResume.pending, "audioContext");
  assert.equal(hungResume.stages.audioContext.resumesSettled, 0);
  assert.equal(
    runner.captureStages({ ...base, modules: [{ at: 55 }] }, received).pending,
    "worklet"
  );
  assert.equal(
    runner.captureStages({ ...base, nodes: [node(0, 0)] }, received).pending,
    "firstPcm"
  );
  assert.equal(
    runner.captureStages({ ...base, send: { wrapped: "yes", count: 0 } }, received).pending,
    "rendererSend"
  );
  const readOnly = runner.captureStages(
    { ...base, send: { wrapped: "read-only", count: 0 } },
    received
  );
  assert.equal(readOnly.complete, true, "an unobservable send is covered by main's receipt");
  assert.equal(runner.captureStages(base, []).pending, "mainReceive");
  assert.equal(runner.captureStages(base, received).complete, true);
  assert.equal(runner.captureStages({ ...base, nodes: [node(150, 0)] }, received).silent, true);
  assert.equal(runner.captureStages({ ...base, nodes: [node(149, 0)] }, received).silent, false);
});

test("Chromium's fake-device lines are picked out of the app's log", () => {
  const log = [
    "[INFO] whisper-server started successfully",
    "[1:2:ERROR:fake_audio_input_stream.cc] Failed to read /run/assets/clip.wav as input to the fake device.",
    "[DEBUG] Starting qdrant",
  ].join("\n");
  assert.deepEqual(runner.fakeDeviceLines(log), [
    "[1:2:ERROR:fake_audio_input_stream.cc] Failed to read /run/assets/clip.wav as input to the fake device.",
  ]);
});

test("main notes the first recording audio it receives only under the test route", () => {
  const before = nativeE2E.trace.length;
  nativeE2E._setActiveForTests(null);
  nativeE2E.observeMeetingAudio(Buffer.alloc(1600), "mic");
  assert.equal(nativeE2E.trace.length, before, "an ordinary launch notes nothing");

  const runDir = tempDir("oats-native-e2e-audio-");
  const paths = nativeE2E.runPaths(runDir);
  fs.mkdirSync(paths.logs, { recursive: true });
  nativeE2E._setActiveForTests({ paths });
  try {
    const loud = Buffer.alloc(1600);
    loud.writeInt16LE(-2500, 10);
    nativeE2E.observeMeetingAudio(loud, "mic");
    nativeE2E.observeMeetingAudio(new Int16Array(800).buffer, "mic");
    nativeE2E.observeMeetingAudio(new Uint8Array(1600), "system");
    const notes = fs
      .readFileSync(path.join(paths.logs, "native-e2e-trace.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      notes.map((n) => [n.event, n.source, n.bytes, n.peak]),
      [
        ["meeting-audio-received", "mic", 1600, 2500],
        ["meeting-audio-received", "system", 1600, 0],
      ]
    );
  } finally {
    nativeE2E._setActiveForTests(null);
  }
});
