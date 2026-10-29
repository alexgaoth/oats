const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { WritingModelFetch, LOCAL_MODELS } = require("../../src/helpers/writingModelFetch");
const { DeviceTier } = require("../../src/helpers/deviceTier");

// The main process's half of the writing model's automatic download
// (src/helpers/writingModelFetch.js): what it fetches, what it refuses, how a
// cancel is remembered, and how it reports through the device tier's
// snapshot. A fake stands in for modelManagerBridge.

const GEMMA = "gemma-4-e4b-it-q4_k_m";
const QWEN = "qwen3.5-4b-q4_k_m";

/** A models directory, and a manager that downloads into it as scripted. */
function setup({ installed = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-writing-"));
  const modelsDir = path.join(dir, "models");
  fs.mkdirSync(modelsDir, { recursive: true });
  const write = (id) =>
    fs.writeFileSync(path.join(modelsDir, LOCAL_MODELS.get(id).fileName), Buffer.alloc(1_000_001));
  for (const id of installed) write(id);
  const calls = [];
  let finish = null;
  const manager = {
    activeDownloads: new Map(),
    getModelsDir: () => modelsDir,
    // Each download waits until the test settles it.
    downloadModel(id, onProgress) {
      calls.push(id);
      return new Promise((resolve, reject) => {
        finish = { resolve, reject, id, onProgress };
      });
    },
    cancelDownload(id) {
      const pending = finish;
      if (!pending || pending.id !== id) return false;
      finish = null;
      const error = new Error("Download cancelled by user");
      error.code = "DOWNLOAD_CANCELLED";
      pending.reject(error);
      return true;
    },
  };
  const settle = {
    progress: (received, total) => finish.onProgress(50, received, total),
    succeed: () => {
      write(finish.id);
      finish.resolve(path.join(modelsDir, LOCAL_MODELS.get(finish.id).fileName));
      finish = null;
    },
    fail: (message) => {
      finish.reject(new Error(message));
      finish = null;
    },
  };
  return {
    dir,
    manager,
    calls,
    settle,
    storePath: path.join(dir, "userData", "writing-model.json"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a download starts, reports progress, and ends with the model on disk", async () => {
  const env = setup();
  try {
    const published = [];
    const fetcher = new WritingModelFetch({
      storePath: env.storePath,
      modelManager: env.manager,
      publish: (options) => published.push(options ?? {}),
    });
    assert.deepEqual(fetcher.snapshot().installed, []);
    assert.equal(fetcher.start({ modelId: GEMMA }), true);
    assert.deepEqual(env.calls, [GEMMA]);
    const started = fetcher.snapshot().downloading;
    assert.equal(started.modelId, GEMMA);
    assert.equal(
      started.totalBytes,
      LOCAL_MODELS.get(GEMMA).sizeBytes,
      "the registry's size first"
    );

    env.settle.progress(1_000, 5_000);
    assert.deepEqual(fetcher.snapshot().downloading, {
      modelId: GEMMA,
      receivedBytes: 1_000,
      totalBytes: 5_000,
    });
    assert.ok(
      published.some((options) => options.throttle),
      "progress is published throttled"
    );

    env.settle.succeed();
    await tick();
    const done = fetcher.snapshot();
    assert.equal(done.downloading, null);
    assert.deepEqual(done.installed, [GEMMA]);
    assert.equal(done.failed, null);
  } finally {
    env.cleanup();
  }
});

test("nothing is fetched that is on disk, unknown, already coming, or without a manager", async () => {
  const env = setup({ installed: [QWEN] });
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    assert.equal(fetcher.start({ modelId: QWEN }), false, "on disk");
    assert.equal(fetcher.start({ modelId: "not-a-model" }), false, "not in the registry");
    assert.equal(fetcher.start({ modelId: "whisper-1" }), false, "not a local writing model");
    env.manager.activeDownloads.set(GEMMA, true);
    assert.equal(fetcher.start({ modelId: GEMMA }), false, "Settings is downloading it");
    env.manager.activeDownloads.clear();
    assert.equal(fetcher.start({ modelId: GEMMA }), true);
    assert.equal(fetcher.start({ modelId: "qwen3.5-9b-q4_k_m" }), false, "one download at a time");
    assert.deepEqual(env.calls, [GEMMA]);

    const bare = new WritingModelFetch({ storePath: env.storePath });
    assert.equal(bare.start({ modelId: GEMMA }), false);
    assert.deepEqual(bare.snapshot().installed, []);
  } finally {
    env.cleanup();
  }
});

test("a cancel is a no that is kept, and only the person's own request undoes it", async () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fetcher.start({ modelId: GEMMA });
    assert.equal(fetcher.cancel(), true);
    await tick();
    assert.equal(fetcher.snapshot().downloading, null);
    assert.deepEqual(fetcher.snapshot().declined, [GEMMA]);
    assert.equal(fetcher.snapshot().failed, null, "a cancel is not a failure");

    // After a restart too.
    const later = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    assert.deepEqual(later.snapshot().declined, [GEMMA]);
    assert.equal(later.start({ modelId: GEMMA }), false);
    assert.equal(later.start({ modelId: GEMMA, force: true }), true);
    assert.deepEqual(later.snapshot().declined, []);
    assert.equal(later.cancel(), true);
    await tick();
    assert.equal(later.cancel(), false, "nothing left to cancel");
  } finally {
    env.cleanup();
  }
});

test("a failure is reported, and the next request tries again", async () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fetcher.start({ modelId: GEMMA });
    env.settle.fail("Not enough disk space");
    await tick();
    assert.deepEqual(fetcher.snapshot().failed, { modelId: GEMMA, error: "Not enough disk space" });
    assert.deepEqual(fetcher.snapshot().declined, [], "a failure is not a no");
    assert.equal(fetcher.start({ modelId: GEMMA }), true);
    assert.equal(fetcher.snapshot().failed, null);
  } finally {
    env.cleanup();
  }
});

test("deleting a model in Settings is a no; downloading it there undoes the no", () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fetcher.deleted([GEMMA, "not-a-model"]);
    assert.deepEqual(fetcher.snapshot().declined, [GEMMA]);
    assert.equal(fetcher.snapshot().autoDeclined, true);
    fetcher.downloaded(GEMMA);
    assert.deepEqual(fetcher.snapshot().declined, []);
    assert.equal(fetcher.snapshot().autoDeclined, false);
    // Deleting something that is not a writing model changes nothing.
    fetcher.deleted(["turbo-q5"]);
    assert.equal(fetcher.snapshot().autoDeclined, false);
  } finally {
    env.cleanup();
  }
});

test("deleting a writing model stops Oats fetching any by itself, until the person chooses one", () => {
  // Qwen3.5 4B stood in on a 16 GB Mac. Deleting it must not start Gemma 4
  // E4B's 5.4 GB by itself.
  const env = setup({ installed: [QWEN] });
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fs.rmSync(path.join(env.manager.getModelsDir(), LOCAL_MODELS.get(QWEN).fileName));
    fetcher.deleted([QWEN]);
    assert.equal(fetcher.snapshot().autoDeclined, true);
    assert.equal(fetcher.start({ modelId: GEMMA }), false);
    assert.deepEqual(env.calls, []);

    // Kept after a restart.
    const later = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    assert.equal(later.snapshot().autoDeclined, true);
    assert.equal(later.start({ modelId: GEMMA }), false);

    // The person chose a model: Oats may fetch by itself again. The deleted
    // model itself stays a no.
    assert.equal(later.chosen(), true);
    assert.equal(later.chosen(), false, "nothing left to undo");
    assert.equal(later.snapshot().autoDeclined, false);
    assert.deepEqual(later.snapshot().declined, [QWEN]);
    assert.equal(later.start({ modelId: GEMMA }), true);
    assert.deepEqual(env.calls, [GEMMA]);
  } finally {
    env.cleanup();
  }
});

test("pressing Download undoes the automatic no too", () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fetcher.deleted([QWEN]);
    assert.equal(fetcher.start({ modelId: GEMMA, force: true }), true);
    assert.equal(fetcher.snapshot().autoDeclined, false);
    const later = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    assert.equal(later.snapshot().autoDeclined, false, "and it is saved");
  } finally {
    env.cleanup();
  }
});

test("a download the person left behind stops without a no; only their Cancel is a no", async () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    fetcher.start({ modelId: GEMMA });
    // They chose the providers, or another model.
    assert.equal(fetcher.cancel({ decline: false }), true);
    await tick();
    assert.equal(fetcher.snapshot().downloading, null);
    assert.deepEqual(fetcher.snapshot().declined, []);
    assert.equal(fetcher.snapshot().failed, null);
    // So Oats may fetch it by itself again when it is the default.
    assert.equal(fetcher.start({ modelId: GEMMA }), true);

    // The model they chose keeps its own download.
    assert.equal(fetcher.cancel({ decline: false, keep: GEMMA }), false);
    assert.equal(fetcher.snapshot().downloading.modelId, GEMMA);

    // Their Cancel.
    assert.equal(fetcher.cancel(), true);
    await tick();
    assert.deepEqual(fetcher.snapshot().declined, [GEMMA]);
  } finally {
    env.cleanup();
  }
});

test("pressing Download on another model takes the place of a download in progress, without a no", async () => {
  const env = setup();
  try {
    const fetcher = new WritingModelFetch({ storePath: env.storePath, modelManager: env.manager });
    assert.equal(fetcher.start({ modelId: GEMMA }), true);
    assert.equal(fetcher.start({ modelId: QWEN }), false, "not by itself");
    assert.equal(fetcher.start({ modelId: QWEN, force: true }), true);
    await tick();
    assert.equal(fetcher.snapshot().downloading.modelId, QWEN);
    assert.deepEqual(fetcher.snapshot().declined, []);
    assert.deepEqual(env.calls, [GEMMA, QWEN]);
    env.settle.succeed();
    await tick();
    assert.deepEqual(fetcher.snapshot().installed, [QWEN]);
    assert.equal(fetcher.snapshot().downloading, null);
  } finally {
    env.cleanup();
  }
});

test("a start Oats makes by itself waits for a recording to end; the person's own does not", async () => {
  const env = setup();
  try {
    let busy = true;
    let wake = null;
    let looks = 0;
    const fetcher = new WritingModelFetch({
      storePath: env.storePath,
      modelManager: env.manager,
      isBusy: () => busy,
      sleep: () =>
        new Promise((resolve) => {
          looks += 1;
          wake = resolve;
        }),
    });
    assert.equal(fetcher.start({ modelId: GEMMA }), true);
    assert.equal(fetcher.snapshot().waiting, GEMMA);
    assert.equal(fetcher.snapshot().downloading, null);
    assert.deepEqual(env.calls, []);
    assert.equal(fetcher.start({ modelId: GEMMA }), false, "asked twice, waits once");

    // Still recording at the next look.
    wake();
    await tick();
    assert.deepEqual(env.calls, []);
    assert.equal(looks, 2);

    busy = false;
    wake();
    await tick();
    assert.deepEqual(env.calls, [GEMMA]);
    assert.equal(fetcher.snapshot().waiting, null);
    assert.equal(fetcher.snapshot().downloading.modelId, GEMMA);
    env.settle.succeed();
    await tick();

    // Leaving a waiting start is not a no; the person's Cancel is.
    busy = true;
    const other = "qwen3.5-9b-q4_k_m";
    assert.equal(fetcher.start({ modelId: QWEN }), true);
    assert.equal(fetcher.cancel({ decline: false }), true);
    assert.equal(fetcher.snapshot().waiting, null);
    assert.deepEqual(fetcher.snapshot().declined, []);
    wake();
    await tick();
    assert.deepEqual(env.calls, [GEMMA], "a left start never runs");
    assert.equal(fetcher.start({ modelId: QWEN }), true);
    assert.equal(fetcher.cancel(), true);
    assert.deepEqual(fetcher.snapshot().declined, [QWEN]);

    // The person's own Download goes at once, recording or not.
    assert.equal(fetcher.start({ modelId: other, force: true }), true);
    assert.deepEqual(env.calls, [GEMMA, other]);
  } finally {
    env.cleanup();
  }
});

test("the writing model waits on the device tier's recording signal", () => {
  const env = setup();
  try {
    let recording = true;
    const tier = new DeviceTier({
      whisperManager: { getModelPath: () => path.join(env.dir, "none.bin"), serverManager: null },
      storePath: path.join(env.dir, "userData", "device-tier.json"),
      appVersion: "0.2.0",
      modelManager: env.manager,
      isBusy: () => recording,
      sleep: () => new Promise(() => {}),
    });
    assert.equal(tier.writing.start({ modelId: GEMMA }), true);
    assert.equal(tier.snapshot().writing.waiting, GEMMA);
    assert.deepEqual(env.calls, []);
    recording = false;
    assert.equal(tier.writing.isBusy(), false);
  } finally {
    env.cleanup();
  }
});

test("the device tier's snapshot carries the memory and the writing model's state", () => {
  const env = setup({ installed: [QWEN] });
  try {
    const tier = new DeviceTier({
      whisperManager: { getModelPath: () => path.join(env.dir, "none.bin"), serverManager: null },
      storePath: path.join(env.dir, "userData", "device-tier.json"),
      appVersion: "0.2.0",
      modelManager: env.manager,
      totalmem: () => 16 * 1024 ** 3,
    });
    const snapshot = tier.snapshot();
    // Before the speed check detects the device, the memory is read at once.
    assert.equal(snapshot.device, null);
    assert.equal(snapshot.memoryBytes, 16 * 1024 ** 3);
    assert.deepEqual(snapshot.writing.installed, [QWEN]);
    assert.equal(snapshot.writing.downloading, null);
    // Kept beside the speed check's record.
    assert.equal(tier.writing.storePath, path.join(env.dir, "userData", "writing-model.json"));
    assert.equal(tier.writing.isBusy(), false);
  } finally {
    env.cleanup();
  }
});
