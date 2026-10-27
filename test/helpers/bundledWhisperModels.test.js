const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Arch } = require("app-builder-lib");
const WhisperManager = require("../../src/helpers/whisper");
const { resolveTarget } = require("../../scripts/download-default-whisper-model");
const { verifyBundledWhisperModels } = require("../../scripts/afterPack");
const registry = require("../../src/models/modelRegistryData.json");

let bundledWhisperModels;
let defaultWhisperModel;
let migrateStoredWhisperModel;
let STORED_MODEL_MIGRATION_KEY;
let resolveWhisperModel;

test.before(async () => {
  ({
    bundledWhisperModels,
    defaultWhisperModel,
    migrateStoredWhisperModel,
    STORED_MODEL_MIGRATION_KEY,
  } = await import("../../src/helpers/bundledWhisperModels.mjs"));
  ({ resolveWhisperModel } = await import("../../src/helpers/whisperEnglishModel.mjs"));
});

const TARGETS = [
  ["darwin", "arm64"],
  ["darwin", "x64"],
  ["linux", "x64"],
  ["linux", "arm64"],
  ["win32", "x64"],
];

const tempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const remove = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/** localStorage with only the three calls the migration uses. */
function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("Apple Silicon ships base and small.en, and starts on small", () => {
  assert.deepEqual(bundledWhisperModels("darwin", "arm64"), {
    model: "small",
    files: ["ggml-base.bin", "ggml-small.en.bin"],
  });
});

test("Intel Macs, Linux and Windows keep base and base.en, and start on base", () => {
  for (const [platform, arch] of TARGETS.slice(1)) {
    assert.deepEqual(
      bundledWhisperModels(platform, arch),
      { model: "base", files: ["ggml-base.bin", "ggml-base.en.bin"] },
      `${platform}-${arch}`
    );
  }
  assert.equal(defaultWhisperModel("darwin", "x64"), "base");
  assert.equal(defaultWhisperModel("", ""), "base");
});

test("every build ships multilingual base, for auto-detection and other languages", () => {
  for (const [platform, arch] of TARGETS) {
    assert.ok(bundledWhisperModels(platform, arch).files.includes("ggml-base.bin"));
  }
});

// What ships and what the app asks for cannot disagree: the default model, in
// English and in any other language, resolves to a file in the same bundle.
test("each build's default resolves to a model its own bundle holds", () => {
  const fileOf = (id) => registry.whisperModels[id]?.fileName;
  for (const [platform, arch] of TARGETS) {
    const { model, files } = bundledWhisperModels(platform, arch);
    assert.ok(registry.whisperModels[model], `${model} is in the registry`);
    for (const file of files) {
      assert.ok(
        Object.values(registry.whisperModels).some((info) => info.fileName === file),
        `${file} is a registry model`
      );
    }
    const installed = (id) => files.includes(fileOf(id));
    for (const language of ["en", "en-US", "auto", "de", null]) {
      const resolved = resolveWhisperModel(model, language, installed);
      assert.ok(installed(resolved), `${platform}-${arch} in ${language} resolved ${resolved}`);
    }
    assert.match(resolveWhisperModel(model, "en", installed), /\.en$/, `${platform}-${arch}`);
    assert.equal(resolveWhisperModel(model, "auto", installed), "base", `${platform}-${arch}`);
  }
});

test("the migration forgets a stored base once, on a build whose default is not base", () => {
  const storage = memoryStorage({ whisperModel: "base" });
  assert.equal(migrateStoredWhisperModel(storage, "small"), true);
  assert.equal(storage.getItem("whisperModel"), null);
  assert.equal(storage.getItem(STORED_MODEL_MIGRATION_KEY), "1");

  // Somebody chooses Base after it ran: that choice stays.
  storage.setItem("whisperModel", "base");
  assert.equal(migrateStoredWhisperModel(storage, "small"), false);
  assert.equal(storage.getItem("whisperModel"), "base");
});

test("the migration keeps any other stored model, and runs only once", () => {
  for (const stored of ["tiny", "small", "medium", "turbo", ""]) {
    const storage = memoryStorage({ whisperModel: stored });
    assert.equal(migrateStoredWhisperModel(storage, "small"), false, stored);
    assert.equal(storage.getItem("whisperModel"), stored);
    assert.equal(storage.getItem(STORED_MODEL_MIGRATION_KEY), "1");
  }
  const fresh = memoryStorage();
  assert.equal(migrateStoredWhisperModel(fresh, "small"), false);
  assert.equal(fresh.getItem("whisperModel"), null);
});

// An Intel profile moved to an Apple Silicon Mac is migrated there, on the
// first launch of the arm64 build, because Intel never set the marker.
test("where the default is base, the migration does nothing and sets no marker", () => {
  const storage = memoryStorage({ whisperModel: "base" });
  assert.equal(migrateStoredWhisperModel(storage, "base"), false);
  assert.equal(storage.getItem("whisperModel"), "base");
  assert.equal(storage.getItem(STORED_MODEL_MIGRATION_KEY), null);
  assert.equal(migrateStoredWhisperModel(null, "small"), false);
});

test("the build's target: --arch, then TARGET_ARCH, then this machine", () => {
  const host = { platform: "darwin", arch: "arm64" };
  assert.deepEqual(resolveTarget({ argv: [], env: {}, ...host }), {
    platform: "darwin",
    arch: "arm64",
    explicit: false,
  });
  assert.equal(resolveTarget({ argv: [], env: { TARGET_ARCH: "x64" }, ...host }).arch, "x64");
  assert.equal(
    resolveTarget({ argv: ["--arch", "arm64"], env: { TARGET_ARCH: "x64" }, ...host }).arch,
    "arm64"
  );
  const linux = resolveTarget({ argv: ["--platform", "linux"], env: {}, ...host });
  assert.equal(linux.platform, "linux");
  assert.equal(
    resolveTarget({ argv: [], env: { TARGET_PLATFORM: "linux" }, ...host }).platform,
    "linux"
  );
});

// The runner's own arch is not the target's when a job builds the other one.
test("in CI a macOS build without an explicit arch fails", () => {
  for (const env of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }]) {
    assert.throws(
      () => resolveTarget({ argv: [], env, platform: "darwin", arch: "arm64" }),
      /must name its arch/
    );
  }
  const named = resolveTarget({
    argv: [],
    env: { CI: "true", TARGET_ARCH: "x64" },
    platform: "darwin",
    arch: "arm64",
  });
  assert.equal(named.arch, "x64");
  // Linux ships the same models on every arch, so the runner's arch is enough.
  assert.equal(
    resolveTarget({ argv: [], env: { CI: "true" }, platform: "linux", arch: "x64" }).arch,
    "x64"
  );
});

function managerFor(modelsDir) {
  const manager = new WhisperManager();
  manager.getModelsDir = () => modelsDir;
  return manager;
}

test("first launch installs every bundled model that is present, small.en included", async () => {
  const bundle = tempDir("oats-bundle-");
  const models = tempDir("oats-models-");
  try {
    fs.writeFileSync(path.join(bundle, "ggml-base.bin"), "base");
    fs.writeFileSync(path.join(bundle, "ggml-small.en.bin"), "small.en");
    fs.writeFileSync(path.join(bundle, "ggml-unknown.bin"), "not a registry model");
    const installed = await managerFor(models).ensureBundledDefaultModel([bundle]);
    assert.deepEqual(installed.sort(), ["ggml-base.bin", "ggml-small.en.bin"]);
    assert.equal(fs.readFileSync(path.join(models, "ggml-small.en.bin"), "utf8"), "small.en");
    assert.equal(fs.existsSync(path.join(models, "ggml-unknown.bin")), false);
  } finally {
    remove(bundle);
    remove(models);
  }
});

test("an installed model is never overwritten, and one from an earlier bundle stays", async () => {
  const bundle = tempDir("oats-bundle-");
  const models = tempDir("oats-models-");
  try {
    fs.writeFileSync(path.join(bundle, "ggml-base.bin"), "new base");
    fs.writeFileSync(path.join(bundle, "ggml-small.en.bin"), "small.en");
    fs.writeFileSync(path.join(models, "ggml-base.bin"), "old base");
    fs.writeFileSync(path.join(models, "ggml-base.en.bin"), "base.en from an earlier version");
    const installed = await managerFor(models).ensureBundledDefaultModel([bundle]);
    assert.deepEqual(installed, ["ggml-small.en.bin"]);
    assert.equal(fs.readFileSync(path.join(models, "ggml-base.bin"), "utf8"), "old base");
    assert.ok(fs.existsSync(path.join(models, "ggml-base.en.bin")));
    assert.deepEqual(await managerFor(models).ensureBundledDefaultModel([bundle]), []);
  } finally {
    remove(bundle);
    remove(models);
  }
});

test("no bundle is not an error: a source checkout has none", async () => {
  const models = tempDir("oats-models-");
  try {
    const missing = path.join(models, "no-such-bundle");
    assert.deepEqual(await managerFor(models).ensureBundledDefaultModel([missing]), []);
  } finally {
    remove(models);
  }
});

function packedApp(platform, files) {
  const out = tempDir("oats-pack-");
  const resources =
    platform === "darwin"
      ? path.join(out, "Oats.app", "Contents", "Resources")
      : path.join(out, "resources");
  const modelsDir = path.join(resources, "bin", "whisper-models");
  fs.mkdirSync(modelsDir, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(modelsDir, file), "");
  return out;
}

const packContext = (platform, arch, appOutDir) => ({
  electronPlatformName: platform,
  arch,
  appOutDir,
  packager: { appInfo: { productFilename: "Oats" } },
});

test("packing passes when the app holds exactly its target's models", async () => {
  for (const [platform, arch, files] of [
    ["darwin", Arch.arm64, ["ggml-base.bin", "ggml-small.en.bin"]],
    ["darwin", Arch.x64, ["ggml-base.bin", "ggml-base.en.bin"]],
    ["linux", Arch.x64, ["ggml-base.bin", "ggml-base.en.bin"]],
  ]) {
    const out = packedApp(platform, files);
    try {
      await verifyBundledWhisperModels(packContext(platform, arch, out));
    } finally {
      remove(out);
    }
  }
});

// The cross-build that would ship the wrong model: an x64 app packed from the
// arm64 Mac's downloads, and the other way round.
test("packing fails on the other arch's models, on an extra one, or on none", async () => {
  for (const [arch, files] of [
    [Arch.x64, ["ggml-base.bin", "ggml-small.en.bin"]],
    [Arch.arm64, ["ggml-base.bin", "ggml-base.en.bin"]],
    [Arch.arm64, ["ggml-base.bin", "ggml-base.en.bin", "ggml-small.en.bin"]],
    [Arch.arm64, []],
  ]) {
    const out = packedApp("darwin", files);
    try {
      await assert.rejects(
        verifyBundledWhisperModels(packContext("darwin", arch, out)),
        /TARGET_ARCH=(x64|arm64) npm run download:default-whisper-model/
      );
    } finally {
      remove(out);
    }
  }
});

test("a request with no model loads this build's default", async () => {
  const models = tempDir("oats-models-");
  try {
    for (const file of [
      "ggml-base.bin",
      "ggml-base.en.bin",
      "ggml-small.bin",
      "ggml-small.en.bin",
    ]) {
      fs.writeFileSync(path.join(models, file), "");
    }
    const manager = managerFor(models);
    const expected = defaultWhisperModel(process.platform, process.arch);
    assert.equal(await manager.resolveRequestModel(undefined, "en"), `${expected}.en`);
    assert.equal(await manager.resolveRequestModel("", "de"), expected);
  } finally {
    remove(models);
  }
});

test("Apple Silicon's pre-warm loads small.en for English and base for anything else", async () => {
  for (const [language, warmed] of [
    ["en", "ggml-small.en.bin"],
    ["de", "ggml-base.bin"],
    [null, "ggml-base.bin"],
  ]) {
    const models = tempDir("oats-models-");
    try {
      fs.writeFileSync(path.join(models, "ggml-base.bin"), "");
      fs.writeFileSync(path.join(models, "ggml-small.en.bin"), "");
      const manager = managerFor(models);
      manager.getVadModelPath = () => null;
      manager.ensureBundledDefaultModel = async () => [];
      manager.logDependencyStatus = async () => {};
      const starts = [];
      manager.serverManager = {
        isAvailable: () => true,
        start: async (modelPath) => starts.push(path.basename(modelPath)),
        ready: true,
        port: 8178,
      };
      await manager.initializeAtStartup({
        localTranscriptionProvider: "whisper",
        whisperModel: "small",
        language,
      });
      assert.deepEqual(starts, [warmed], String(language));
    } finally {
      remove(models);
    }
  }
});
