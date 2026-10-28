const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DeviceTier,
  detectDevice,
  parseGpuCoreCount,
  parseSystemProfilerCores,
  CLIP_PATH,
  TURBO_MODEL,
} = require("../../src/helpers/deviceTier");
const registry = require("../../src/models/modelRegistryData.json");

// The main process's half of the speed check (src/helpers/deviceTier.js):
// what it reads from the Mac, when it reads the clip and on which server,
// what it keeps, and turbo's download, cancel and failure. Fakes stand in
// for whisper-server and the download.

let speechTier;
test.before(async () => {
  speechTier = await import("../../src/helpers/speechTier.mjs");
});

const GIB = 1024 ** 3;
const M5_PRO = {
  platform: "darwin",
  arch: "arm64",
  chip: "Apple M5 Pro",
  gpuCores: 16,
  memoryBytes: 48 * GIB,
};

const IOREG = `+-o AGXAcceleratorG17X  <class AGXAcceleratorG17X, id 0x1000003d1, registered>
    {
      "model" = "Apple M5 Pro"
      "gpu-core-count" = 16
      "AGXParameterBufferMaxSize" = 1006632960
    }`;

const SYSTEM_PROFILER = JSON.stringify({
  SPDisplaysDataType: [{ _name: "Apple M5 Pro", sppci_cores: "16", sppci_model: "Apple M5 Pro" }],
});

/** A temp dir with the models given, and a WhisperManager stand-in on it. */
function setup({ installed = ["ggml-small.en.bin", "ggml-base.bin"], appServer = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-tier-"));
  for (const file of installed) fs.writeFileSync(path.join(dir, file), "model");
  const modelPath = (id) => path.join(dir, registry.whisperModels[id].fileName);
  const downloads = [];
  const whisperManager = {
    getModelPath: modelPath,
    getVadModelPath: () => "/bundle/ggml-silero-v5.1.2.bin",
    serverManager: {
      inFlight: 0,
      startupPromise: null,
      modelPath: null,
      isIdle() {
        return Boolean(this.modelPath) && this.inFlight === 0;
      },
      reads: 0,
      async transcribePreparedWav() {
        this.reads += 1;
        return { text: "monsieur was the only one" };
      },
      ...appServer,
    },
    // Scripted per test: resolves, rejects or waits for an abort.
    downloadWhisperModel: async (model, progress, options) => {
      downloads.push({ model, options });
      return whisperManager.onDownload(model, progress, options);
    },
    onDownload: async (model) => {
      fs.writeFileSync(modelPath(model), "turbo");
      return { success: true };
    },
  };
  const servers = [];
  const createServer = () => {
    const server = {
      started: null,
      stopped: false,
      reads: 0,
      isAvailable: () => true,
      async start(file, options) {
        server.started = { model: path.basename(file), options };
      },
      stopHealthCheck() {},
      async transcribePreparedWav(wav, options) {
        server.reads += 1;
        server.lastRead = { bytes: wav.length, options };
        return { text: "monsieur was the only one" };
      },
      async stop() {
        server.stopped = true;
      },
    };
    servers.push(server);
    return server;
  };
  return {
    dir,
    modelPath,
    whisperManager,
    servers,
    createServer,
    downloads,
    storePath: path.join(dir, "userData", "device-tier.json"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Until turbo's download and check are over. */
async function settle(tier) {
  for (let i = 0; i < 400 && (tier.download || tier.checking); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Each read takes the next of these, in ms. */
const scripted = (times) => async (read) => {
  await read();
  return times.length > 1 ? times.shift() : times[0];
};

function tierFor(env, options = {}) {
  const published = [];
  const tier = new DeviceTier({
    whisperManager: env.whisperManager,
    storePath: env.storePath,
    appVersion: "0.2.0",
    detect: async () => ({ ...M5_PRO }),
    createServer: env.createServer,
    publish: (snapshot) => published.push(snapshot),
    sleep: async () => {},
    time: scripted([280, 170]),
    ...options,
  });
  return { tier, published };
}

test("the GPU's core count comes from IOKit, or system_profiler when IOKit has none", () => {
  assert.equal(parseGpuCoreCount(IOREG), 16);
  assert.equal(parseGpuCoreCount(""), null);
  assert.equal(parseGpuCoreCount('"gpu-core-count" = 0'), null);
  assert.equal(parseSystemProfilerCores(SYSTEM_PROFILER), 16);
  assert.equal(parseSystemProfilerCores("not json"), null);
  assert.equal(parseSystemProfilerCores(JSON.stringify({ SPDisplaysDataType: [{}] })), null);
});

test("detection reads the chip, the GPU and the memory, and nothing off a Mac", async () => {
  const calls = [];
  const run = async (file, args) => {
    calls.push([path.basename(file), ...args].join(" "));
    if (file.endsWith("sysctl")) return "Apple M5 Pro\n";
    if (file.endsWith("ioreg")) return IOREG;
    return SYSTEM_PROFILER;
  };
  const totalmem = () => 48 * GIB;
  assert.deepEqual(await detectDevice({ platform: "darwin", arch: "arm64", run, totalmem }), M5_PRO);
  assert.deepEqual(calls, [
    "sysctl -n machdep.cpu.brand_string",
    "ioreg -rc AGXAccelerator -d 1",
  ]);

  // IOKit with nothing to say: the slower system_profiler.
  calls.length = 0;
  const quietIoreg = async (file, args) => (file.endsWith("ioreg") ? "" : run(file, args));
  const device = await detectDevice({ platform: "darwin", arch: "arm64", run: quietIoreg, totalmem });
  assert.equal(device.gpuCores, 16);

  calls.length = 0;
  const linux = await detectDevice({ platform: "linux", arch: "x64", run, totalmem });
  assert.deepEqual(linux, {
    platform: "linux",
    arch: "x64",
    chip: null,
    gpuCores: null,
    memoryBytes: 48 * GIB,
  });
  assert.deepEqual(calls, [], "no tool runs off a Mac");
});

test("the clip is 5 s of 16 kHz mono PCM, ready for whisper-server as it is", () => {
  const wav = fs.readFileSync(CLIP_PATH);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1, "PCM");
  assert.equal(wav.readUInt16LE(22), 1, "mono");
  assert.equal(wav.readUInt32LE(24), 16000, "16 kHz");
  assert.equal(wav.readUInt16LE(34), 16, "16-bit");
  const seconds = wav.readUInt32LE(40) / (16000 * 2);
  assert.ok(seconds > 4.5 && seconds < 5.5, `${seconds} s`);
});

test("first launch: the clip is read twice on a server of its own, and the faster read is kept", async () => {
  const env = setup();
  try {
    const { tier, published } = tierFor(env);
    const record = await tier.ensureMeasured();
    assert.equal(env.servers.length, 1, "the app's server held no model: one of its own");
    const [server] = env.servers;
    assert.equal(server.started.model, "ggml-small.en.bin");
    assert.equal(server.started.options.vadEnabled, true, "as the pre-warm starts it");
    assert.equal(server.reads, 2);
    assert.equal(server.lastRead.options.language, "en");
    assert.equal(server.lastRead.bytes, fs.statSync(CLIP_PATH).size);
    assert.equal(server.stopped, true, "and stopped after");
    assert.equal(record.smallClipMs, 170, "the first read pays the warm-up: the faster one");
    assert.deepEqual(record.smallClipReads, [280, 170]);
    assert.deepEqual(record.device, M5_PRO);
    const saved = JSON.parse(fs.readFileSync(env.storePath, "utf8"));
    assert.equal(saved.smallClipMs, 170);
    assert.equal(saved.appVersion, "0.2.0");
    assert.equal(published.at(-1).smallClipMs, 170);
    assert.equal(published.at(-1).measuring, false);
    assert.ok(published.some((snapshot) => snapshot.measuring), "the check is announced");
  } finally {
    env.cleanup();
  }
});

test("after the pre-warm loaded small.en, the reads go to the app's own server", async () => {
  const env = setup();
  env.whisperManager.serverManager.modelPath = env.modelPath("small.en");
  try {
    const { tier } = tierFor(env);
    await tier.ensureMeasured();
    assert.equal(env.servers.length, 0, "no second server");
    assert.equal(env.whisperManager.serverManager.reads, 2);
  } finally {
    env.cleanup();
  }
});

test("a model somebody chose stays loaded: the check brings its own server", async () => {
  const env = setup();
  env.whisperManager.serverManager.modelPath = env.modelPath("base");
  try {
    const { tier } = tierFor(env);
    await tier.ensureMeasured();
    assert.equal(env.servers.length, 1);
    assert.equal(env.whisperManager.serverManager.reads, 0);
    assert.equal(env.whisperManager.serverManager.modelPath, env.modelPath("base"));
  } finally {
    env.cleanup();
  }
});

test("the check waits while a conversation is recorded or the server is answering", async () => {
  const env = setup();
  try {
    let recording = 3;
    const waits = [];
    const { tier } = tierFor(env, {
      isBusy: () => recording-- > 0,
      sleep: async (ms) => waits.push(ms),
    });
    await tier.ensureMeasured();
    assert.equal(waits.length, 3, "it waited three times, then read");
    assert.equal(tier.record.smallClipMs, 170);

    // A recording that does not end in ten minutes: no time this launch,
    // nothing saved, and the next launch tries again.
    const env2 = setup();
    let clock = 0;
    const { tier: busy } = tierFor(env2, {
      isBusy: () => true,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    await busy.ensureMeasured();
    assert.equal(busy.record.smallClipMs, null);
    assert.equal(fs.existsSync(env2.storePath), false);
    env2.cleanup();
  } finally {
    env.cleanup();
  }
});

test("the check runs once per app version and per Mac", async () => {
  const env = setup();
  try {
    await tierFor(env).tier.ensureMeasured();
    assert.equal(env.servers.length, 1);

    // The same version on the same Mac: nothing is read.
    const again = tierFor(env).tier;
    await again.ensureMeasured();
    assert.equal(env.servers.length, 1);
    assert.equal(again.snapshot().smallClipMs, 170);

    // An update: read again.
    await tierFor(env, { appVersion: "0.3.0", time: scripted([150]) }).tier.ensureMeasured();
    assert.equal(env.servers.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(env.storePath, "utf8")).smallClipMs, 150);

    // The profile moved to another Mac: read again.
    const other = tierFor(env, {
      appVersion: "0.3.0",
      detect: async () => ({ ...M5_PRO, chip: "Apple M4", gpuCores: 10, memoryBytes: 16 * GIB }),
      time: scripted([400]),
    }).tier;
    await other.ensureMeasured();
    assert.equal(env.servers.length, 3);
    assert.equal(other.snapshot().smallClipMs, 400);
  } finally {
    env.cleanup();
  }
});

test("after an update, the last time stands until the new check succeeds", async () => {
  const env = setup();
  try {
    await tierFor(env).tier.ensureMeasured();
    const updated = tierFor(env, { appVersion: "0.3.0", isBusy: () => true, now: (() => {
      let clock = 0;
      return () => (clock += 60_000);
    })() }).tier;
    await updated.ensureMeasured();
    assert.equal(updated.snapshot().smallClipMs, 170, "kept from the last version");
    // Not saved under the new version, so the next launch reads again.
    assert.equal(JSON.parse(fs.readFileSync(env.storePath, "utf8")).appVersion, "0.2.0");
  } finally {
    env.cleanup();
  }
});

test("an Intel Mac is detected and kept, and never timed", async () => {
  const env = setup();
  try {
    const { tier } = tierFor(env, {
      detect: async () => ({
        platform: "darwin",
        arch: "x64",
        chip: "Intel(R) Core(TM) i9-9880H CPU @ 2.30GHz",
        gpuCores: null,
        memoryBytes: 16 * GIB,
      }),
    });
    const record = await tier.ensureMeasured();
    assert.equal(env.servers.length, 0);
    assert.equal(record.smallClipMs, null);
    assert.ok(fs.existsSync(env.storePath), "kept, so the next launch does not detect again");
  } finally {
    env.cleanup();
  }
});

test("turbo: downloaded on request, its checksum and clip checked, then ready", async () => {
  const env = setup();
  try {
    let progressSeen = null;
    env.whisperManager.onDownload = async (model, progress) => {
      await new Promise((resolve) => setImmediate(resolve));
      progress({ type: "progress", downloaded_bytes: 287_000_000, total_bytes: 574_041_195 });
      progressSeen = env.tier.snapshot().turbo.downloading;
      progress({ type: "installing", model });
      fs.writeFileSync(env.modelPath(model), "turbo");
      return { success: true };
    };
    const { tier, published } = tierFor(env, { time: scripted([280, 170, 900, 650]) });
    env.tier = tier;
    await tier.ensureMeasured();
    const started = await tier.startUpgrade({ language: "en" });
    assert.ok(started.turbo.downloading, "under way as soon as it is asked for");
    await settle(tier);

    assert.equal(env.downloads.length, 1);
    assert.equal(env.downloads[0].model, TURBO_MODEL);
    assert.ok(env.downloads[0].options.download.abort, "with its own signal, so it can be cancelled");
    assert.deepEqual(progressSeen, { receivedBytes: 287_000_000, totalBytes: 574_041_195 });
    const turboServer = env.servers.at(-1);
    assert.equal(turboServer.started.model, "ggml-large-v3-turbo-q5_0.bin");
    assert.equal(tier.record.turboClipMs, 650);
    const done = published.at(-1);
    assert.deepEqual(
      [done.turbo.installed, done.turbo.downloading, done.turbo.checking, done.turbo.failed],
      [true, null, false, null]
    );
    assert.equal(JSON.parse(fs.readFileSync(env.storePath, "utf8")).turboClipMs, 650);

    // Asked again with turbo on disk: nothing more.
    await tier.startUpgrade({ language: "en" });
    assert.equal(env.downloads.length, 1);
  } finally {
    env.cleanup();
  }
});

test("turbo is not fetched where the rule does not pick it", async () => {
  const env = setup();
  try {
    // Twice as slow as the reference: small.en stays.
    const slow = tierFor(env, { time: scripted([2 * speechTier.REFERENCE.clipMs.smallEn]) }).tier;
    await slow.ensureMeasured();
    await slow.startUpgrade({ language: "en" });
    assert.equal(env.downloads.length, 0);

    // The reference Mac with detection: too slow.
    const env2 = setup();
    const auto = tierFor(env2, { time: scripted([speechTier.REFERENCE.clipMs.smallEn]) }).tier;
    await auto.ensureMeasured();
    await auto.startUpgrade({ language: "auto" });
    assert.equal(env2.downloads.length, 0);
    await auto.startUpgrade({ language: "en" });
    assert.equal(env2.downloads.length, 1, "with English it is");
    env2.cleanup();
  } finally {
    env.cleanup();
  }
});

test("a cancel stops the download, removes the partial file and is remembered", async () => {
  const env = setup();
  try {
    env.whisperManager.onDownload = (model, progress, { download }) =>
      new Promise((resolve, reject) => {
        fs.writeFileSync(`${env.modelPath(model)}.tmp`, "partial");
        progress({ type: "progress", downloaded_bytes: 100, total_bytes: 574_041_195 });
        download.signal.onAbort = () =>
          reject(Object.assign(new Error("Download interrupted by user"), { isAbort: true }));
      });
    const { tier } = tierFor(env);
    await tier.ensureMeasured();
    await tier.startUpgrade({ language: "en" });
    assert.ok(tier.snapshot().turbo.downloading);
    tier.cancelUpgrade();
    await settle(tier);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const snapshot = tier.snapshot();
    assert.equal(snapshot.turbo.declined, true);
    assert.equal(snapshot.turbo.failed, null, "a cancel is not a failure");
    assert.equal(snapshot.turbo.installed, false);
    assert.equal(fs.existsSync(`${env.modelPath(TURBO_MODEL)}.tmp`), false);
    assert.equal(JSON.parse(fs.readFileSync(env.storePath, "utf8")).turboDeclined, true);

    // Not again by itself, not after an update either...
    await tier.startUpgrade({ language: "en" });
    assert.equal(env.downloads.length, 1);
    const updated = tierFor(env, { appVersion: "0.3.0" }).tier;
    await updated.ensureMeasured();
    assert.equal(updated.snapshot().turbo.declined, true);
    // ...only when the person asks for it in Settings.
    env.whisperManager.onDownload = async (model) => {
      fs.writeFileSync(env.modelPath(model), "turbo");
      return { success: true };
    };
    await updated.startUpgrade({ language: "en", force: true });
    assert.equal(env.downloads.length, 2);
  } finally {
    env.cleanup();
  }
});

test("a failed download says so, and is not retried by itself", async () => {
  const env = setup();
  try {
    env.whisperManager.onDownload = async () => {
      throw new Error("HTTP 503");
    };
    const { tier } = tierFor(env);
    await tier.ensureMeasured();
    await tier.startUpgrade({ language: "en" });
    await settle(tier);
    const snapshot = tier.snapshot();
    assert.equal(snapshot.turbo.failed, "HTTP 503");
    assert.equal(snapshot.turbo.declined, false);
    assert.equal(
      speechTier.shouldFetchTurbo({
        choice: { model: TURBO_MODEL },
        setupDone: true,
        followsDefault: true,
        local: true,
        turbo: snapshot.turbo,
      }),
      false
    );
  } finally {
    env.cleanup();
  }
});

test("deleting turbo in Settings is a no to it; downloading it there undoes that", async () => {
  const env = setup({ installed: ["ggml-small.en.bin", "ggml-large-v3-turbo-q5_0.bin"] });
  try {
    const { tier } = tierFor(env);
    await tier.ensureMeasured();
    tier.modelDeleted("medium");
    assert.equal(tier.snapshot().turbo.declined, false, "another model is not turbo");
    tier.modelDeleted(TURBO_MODEL);
    assert.equal(tier.snapshot().turbo.declined, true);
    assert.equal(tier.record.turboClipMs, null);
    tier.modelDownloaded(TURBO_MODEL);
    assert.equal(tier.snapshot().turbo.declined, false);
  } finally {
    env.cleanup();
  }
});

test("turbo on disk from before is timed at the update's check", async () => {
  const env = setup({ installed: ["ggml-small.en.bin", "ggml-large-v3-turbo-q5_0.bin"] });
  try {
    const { tier } = tierFor(env, { time: scripted([280, 170, 900, 640]) });
    await tier.ensureMeasured();
    assert.equal(tier.record.smallClipMs, 170);
    assert.equal(tier.record.turboClipMs, 640);
    assert.deepEqual(
      env.servers.map((server) => server.started.model),
      ["ggml-small.en.bin", "ggml-large-v3-turbo-q5_0.bin"]
    );
  } finally {
    env.cleanup();
  }
});

test("a quit while the check runs stops its server", async () => {
  const env = setup();
  try {
    // The first read waits until the test lets it go; the second does not.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const { tier } = tierFor(env, {
      time: async (read) => {
        reads += 1;
        if (reads === 1) await held;
        await read();
        return 170;
      },
    });
    const measuring = tier.ensureMeasured();
    while (reads === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.ok(tier.checkServer, "the check's own server is up");
    await tier.stopCheckServer();
    assert.equal(env.servers[0].stopped, true);
    assert.equal(tier.checkServer, null);
    release();
    await measuring;
  } finally {
    env.cleanup();
  }
});

test("after the download, the switch waits for a recording to end, however long", async () => {
  const env = setup();
  try {
    let recording = false;
    let polls = 0;
    const { tier } = tierFor(env, {
      isBusy: () => recording,
      // Twelve minutes of polls: past the ten minutes the launch check waits.
      sleep: async () => {
        polls += 1;
        if (polls >= 144) recording = false;
      },
      now: () => polls * 5000,
      time: scripted([280, 170, 900, 650]),
    });
    await tier.ensureMeasured();
    recording = true;
    await tier.startUpgrade({ language: "en" });
    await settle(tier);
    assert.equal(polls, 144, "it waited for the whole recording");
    assert.equal(tier.checking, false);
    assert.equal(tier.record.turboClipMs, 650);
    assert.equal(tier.snapshot().turbo.installed, true);
  } finally {
    env.cleanup();
  }
});

test("main and the rule name the same models", () => {
  const { BENCHMARK_MODEL } = require("../../src/helpers/deviceTier");
  assert.equal(TURBO_MODEL, speechTier.TURBO_MODEL);
  assert.equal(BENCHMARK_MODEL, speechTier.BENCHMARK_MODEL);
  assert.ok(registry.whisperModels[TURBO_MODEL], "turbo is in the registry");
  assert.equal(registry.whisperModels[TURBO_MODEL].fileName, "ggml-large-v3-turbo-q5_0.bin");
});
