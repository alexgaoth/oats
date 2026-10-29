const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Model downloads in WhisperManager (src/helpers/whisper.js): one download per
// model, whoever asks, and a checksum where the registry gives one. Turbo's
// background download (deviceTier.js) and Settings' own Download button can
// ask for the same file at once; two writers on one `.tmp` file would corrupt
// it. The network is a stand-in: `downloadFile` is replaced before whisper.js
// reads it.

const downloadUtils = require("../../src/helpers/downloadUtils");
const calls = [];
let behaviour = null;
downloadUtils.downloadFile = async (url, destPath, options) => {
  calls.push({ url, destPath });
  return behaviour(url, destPath, options);
};
downloadUtils.checkDiskSpace = async () => ({ ok: true, availableBytes: 1e12 });
downloadUtils.validateFileSize = async () => 1;
const WhisperManager = require("../../src/helpers/whisper");
const registry = require("../../src/models/modelRegistryData.json");

function managerIn() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-download-"));
  const manager = new WhisperManager();
  manager.getModelsDir = () => dir;
  return { manager, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** A download that writes `bytes` once `release()` is called, or fails on abort. */
function heldDownload(bytes) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const run = async (url, destPath, { onProgress, signal }) => {
    // As downloadFile does: an abort that came first ends it at once.
    if (signal?.aborted) throw Object.assign(new Error("Download cancelled"), { isAbort: true });
    onProgress?.(10, 100);
    await Promise.race([
      gate,
      new Promise((_, reject) => {
        signal.onAbort = () =>
          reject(Object.assign(new Error("Download cancelled"), { isAbort: true }));
      }),
    ]);
    fs.writeFileSync(destPath, bytes);
    return destPath;
  };
  return { run, release: () => release() };
}

test.beforeEach(() => {
  calls.length = 0;
});

/** Until the stand-in download has started (whisper.js checks the disk first). */
async function started(count = 1) {
  for (let i = 0; i < 500 && calls.length < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.equal(calls.length, count, "the download started");
}

test("two callers for one model share one download, and both see its progress", async () => {
  const { manager, cleanup } = managerIn();
  try {
    const held = heldDownload("small");
    behaviour = held.run;
    const seen = { first: [], second: [] };
    const first = manager.downloadWhisperModel("small", (p) => seen.first.push(p.type));
    // Settings asks while the first is under way.
    await started();
    const second = manager.downloadWhisperModel("small", (p) => seen.second.push(p.type));
    assert.equal(manager.isDownloading("small"), true);
    held.release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls.length, 1, "one download");
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    assert.ok(seen.first.includes("progress"));
    assert.ok(seen.first.includes("complete") && seen.second.includes("complete"));
    assert.equal(manager.isDownloading("small"), false);
  } finally {
    cleanup();
  }
});

test("a joined caller with its own signal can cancel the shared download", async () => {
  const { manager, cleanup } = managerIn();
  try {
    const held = heldDownload("small");
    behaviour = held.run;
    const first = manager.downloadWhisperModel("small");
    await started();
    const own = downloadUtils.createDownloadSignal();
    const second = manager.downloadWhisperModel("small", null, { download: own });
    own.abort();
    await assert.rejects(first, (error) => error.isAbort === true);
    await assert.rejects(second, (error) => error.isAbort === true);
  } finally {
    cleanup();
  }
});

test("a background download is not Settings' cancel, and Settings' is", async () => {
  const { manager, cleanup } = managerIn();
  try {
    const held = heldDownload("base");
    behaviour = held.run;
    const background = manager.downloadWhisperModel("base", null, {
      download: downloadUtils.createDownloadSignal(),
    });
    await started();
    assert.deepEqual(await manager.cancelDownload(), {
      success: false,
      error: "No active download to cancel",
    });
    held.release();
    assert.equal((await background).success, true);

    // Settings' own download is the one its Cancel stops.
    const held2 = heldDownload("tiny");
    behaviour = held2.run;
    const settings = manager.downloadWhisperModel("tiny");
    await started(2);
    assert.equal((await manager.cancelDownload()).success, true);
    await assert.rejects(settings, (error) => error.isAbort === true);
  } finally {
    cleanup();
  }
});

test("turbo's checksum is checked; a file that does not match is deleted", async () => {
  const { manager, dir, cleanup } = managerIn();
  try {
    const turbo = registry.whisperModels["turbo-q5"];
    const file = path.join(dir, turbo.fileName);

    behaviour = async (url, destPath) => {
      fs.writeFileSync(destPath, "not the model");
      return destPath;
    };
    const types = [];
    await assert.rejects(
      manager.downloadWhisperModel("turbo-q5", (p) => types.push(p.type)),
      (error) => error.code === "ERR_CHECKSUM" && /corrupted/.test(error.message)
    );
    assert.equal(fs.existsSync(file), false, "a bad file is not left to load");
    assert.ok(types.includes("installing"), "the check shows as a step");
    assert.equal(calls[0].url, turbo.downloadUrl);

    // A file whose digest matches is kept. The registry's digest is the real
    // model's, so stand in a digest for these bytes.
    const bytes = Buffer.from("turbo stand-in");
    const saved = turbo.sha256;
    turbo.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    try {
      behaviour = async (url, destPath) => {
        fs.writeFileSync(destPath, bytes);
        return destPath;
      };
      const result = await manager.downloadWhisperModel("turbo-q5");
      assert.equal(result.success, true);
      assert.ok(fs.existsSync(file));
    } finally {
      turbo.sha256 = saved;
    }
  } finally {
    cleanup();
  }
});
