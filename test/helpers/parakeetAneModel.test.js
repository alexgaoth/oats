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
