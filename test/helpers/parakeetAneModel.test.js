const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const downloadUtils = require("../../src/helpers/downloadUtils");
const manifest = require("../../src/models/parakeetAneFiles.json");
const modelData = require("../../src/models/modelRegistryData.json");
const { getModelRuntime, requiredModelFiles } = require("../../src/helpers/parakeetModelInfo");

const MODEL = "parakeet-ultra-ane";

test("the Neural Engine model has its own runtime and no archive", () => {
  assert.equal(getModelRuntime(MODEL), "ane");
  assert.equal(getModelRuntime("parakeet-tdt-0.6b-v3"), "offline");
  assert.deepEqual(requiredModelFiles(MODEL), ["ready"]);
  assert.equal(modelData.parakeetModels[MODEL].downloadUrl, undefined);
});

test("every file comes from a pinned commit, and the size the picker shows is right", () => {
  let bytes = 0;
  for (const bundle of manifest.bundles) {
    assert.match(bundle.repo, /^FluidInference\//);
    assert.match(bundle.revision, /^[0-9a-f]{40}$/);
    for (const file of bundle.files) bytes += file.size;
  }
  assert.equal(Math.round(bytes / 1_000_000), modelData.parakeetModels[MODEL].sizeMb);
});

test("a download fetches each missing file once, and the model counts at the end", async (t) => {
  const seen = [];
  t.mock.method(downloadUtils, "downloadFile", async (url, target) => {
    seen.push(url);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
  });
  t.mock.method(downloadUtils, "checkDiskSpace", async () => ({ ok: true }));
  const ParakeetManager = require("../../src/helpers/parakeet");
  const manager = new ParakeetManager();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oats-ane-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  manager.getModelPath = () => path.join(root, MODEL);
  manager.serverManager.getModelsDir = () => root;

  const already = manifest.bundles[0].files[0].path;
  const held = path.join(root, MODEL, manifest.bundles[0].into, already);
  fs.mkdirSync(path.dirname(held), { recursive: true });
  fs.writeFileSync(held, "");

  const events = [];
  assert.equal(manager.serverManager.isModelDownloaded(MODEL), false);
  const result = await manager.downloadParakeetModel(MODEL, (e) => events.push(e));

  const all = manifest.bundles.reduce((sum, bundle) => sum + bundle.files.length, 0);
  assert.equal(seen.length, all - 1);
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(seen.every((url) => url.startsWith("https://huggingface.co/FluidInference/")));
  assert.equal(result.success, true);
  assert.equal(manager.serverManager.isModelDownloaded(MODEL), true);
  assert.equal(events.at(-1).type, "complete");
  assert.ok(events.some((e) => e.percentage === 100 && e.type === "progress"));
  assert.ok(fs.existsSync(path.join(root, MODEL, "parakeet-ultra", "config.json")));
  assert.ok(
    fs.existsSync(path.join(root, MODEL, "silero-vad-unified-256ms-v6.2.1.mlmodelc", "model.mil"))
  );
});

// --- The first load after the download (warmAneModel).

function warmSetup({ available = true, downloaded = true } = {}) {
  const ParakeetManager = require("../../src/helpers/parakeet");
  const manager = new ParakeetManager();
  const helper = {
    running: false,
    starts: 0,
    stops: 0,
    fail: false,
    hold: null,
    isRunning() {
      return this.running;
    },
    async start() {
      this.starts += 1;
      if (this.hold) await this.hold;
      if (this.fail) throw new Error("did not get ready");
      this.running = true;
    },
    async stop() {
      this.stops += 1;
      this.running = false;
    },
  };
  manager.serverManager = {
    isAvailable: (runtime) => available && runtime === "ane",
    isModelDownloaded: () => downloaded,
    ane: () => helper,
  };
  return { manager, helper };
}

test("after the download, the model loads once while idle, and the helper stops", async () => {
  const { manager, helper } = warmSetup();
  assert.equal(await manager.warmAneModel(MODEL), true);
  assert.equal(helper.starts, 1);
  assert.equal(helper.stops, 1, "the compiled copy stays; the helper does not");
});

test("a recording that starts during the load keeps the helper it joined", async () => {
  const { manager, helper } = warmSetup();
  let recording = false;
  let release;
  helper.hold = new Promise((resolve) => {
    release = resolve;
  });
  const warming = manager.warmAneModel(MODEL, { busy: () => recording });
  recording = true;
  release();
  assert.equal(await warming, true);
  assert.equal(helper.stops, 0);
  assert.equal(helper.running, true);
});

test("nothing loads while recording, for another model, or without the model or helper", async () => {
  const busy = warmSetup();
  assert.equal(await busy.manager.warmAneModel(MODEL, { busy: () => true }), false);
  const other = warmSetup();
  assert.equal(await other.manager.warmAneModel("parakeet-tdt-0.6b-v3"), false);
  const missing = warmSetup({ downloaded: false });
  assert.equal(await missing.manager.warmAneModel(MODEL), false);
  const noHelper = warmSetup({ available: false });
  assert.equal(await noHelper.manager.warmAneModel(MODEL), false);
  for (const { helper } of [busy, other, missing, noHelper]) assert.equal(helper.starts, 0);
});

test("a load that fails leaves the first recording to load it, and a running helper stays", async () => {
  const failing = warmSetup();
  failing.helper.fail = true;
  assert.equal(await failing.manager.warmAneModel(MODEL), false);
  assert.equal(failing.helper.stops, 0);
  const running = warmSetup();
  running.helper.running = true;
  assert.equal(await running.manager.warmAneModel(MODEL), true);
  assert.equal(running.helper.starts, 0);
  assert.equal(running.helper.stops, 0);
});
