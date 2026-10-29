// The writing model's download when Oats starts it by itself: writingTier.mjs
// decides which model and when; this file fetches it, reports its progress,
// and remembers a no.
//
// - The renderer asks (`writing-model-start`): after setup, while the writing
//   setting follows the default on this Mac and no writing model is ready
//   (useWritingModel.ts), or at once when the person chooses "On this Mac" in
//   setup. Main checks again before it fetches anything: a local writing model
//   from the registry that is not on disk, not downloading, and not declined.
//   `force` is the person asking for it in Settings, after a cancel or a failure.
// - The file comes through modelManagerBridge.downloadModel, the path every
//   local writing model takes, with its disk-space check: downloadUtils.js with
//   Electron's `net`, so the sidebar's request count includes it
//   (networkLedger.js).
// - A cancel is a no. It is kept in userData/writing-model.json, and Oats
//   does not fetch that model again by itself; deleting it in Settings is a no
//   as well, and downloading it in Settings undoes the no.
// - It reports through the device tier's snapshot (deviceTier.js, `writing`),
//   which every window gets.

const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");
const registry = require("../models/modelRegistryData.json");

const STORE_VERSION = 1;
// What modelManagerBridge.js counts as a model file rather than a stub.
const MIN_FILE_SIZE = 1_000_000;

/** Every local writing model in the registry, by id. */
const LOCAL_MODELS = new Map(
  (registry.localProviders ?? []).flatMap((provider) =>
    (provider.models ?? []).map((model) => [model.id, model])
  )
);

class WritingModelFetch {
  /**
   * @param {object} options
   * @param {string} options.storePath Where the declined models are kept.
   * @param {object | null} [options.modelManager] modelManagerBridge's manager:
   *   `getModelsDir`, `downloadModel`, `cancelDownload`. Without one nothing is
   *   on disk and nothing is fetched (tests of the speed check).
   * @param {(options?: { throttle?: boolean }) => void} [options.publish]
   */
  constructor({ storePath, modelManager = null, publish = () => {} }) {
    this.storePath = storePath;
    this.modelManager = modelManager;
    this.publish = publish;
    this.declined = this._load();
    this.download = null; // { modelId, receivedBytes, totalBytes, cancelled }
    this.failed = null; // { modelId, error }
  }

  _load() {
    try {
      const record = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      return Array.isArray(record?.declined)
        ? record.declined.filter((id) => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const temp = `${this.storePath}.tmp`;
      fs.writeFileSync(
        temp,
        JSON.stringify({ version: STORE_VERSION, declined: this.declined }, null, 2)
      );
      fs.renameSync(temp, this.storePath);
    } catch (error) {
      debugLogger.warn("Could not save the writing model's state", { error: error.message });
    }
  }

  _modelsDir() {
    try {
      return this.modelManager?.getModelsDir?.() ?? null;
    } catch {
      return null;
    }
  }

  /** The local writing models whose files are on disk. */
  installed() {
    const dir = this._modelsDir();
    if (!dir) return [];
    const ids = [];
    for (const [id, model] of LOCAL_MODELS) {
      try {
        if (fs.statSync(path.join(dir, model.fileName)).size > MIN_FILE_SIZE) ids.push(id);
      } catch {
        // Not on disk.
      }
    }
    return ids;
  }

  /** What the renderer reads (types/electron.ts `WritingModelSnapshot`). */
  snapshot() {
    const download = this.download;
    return {
      installed: this.installed(),
      declined: [...this.declined],
      downloading: download
        ? {
            modelId: download.modelId,
            receivedBytes: download.receivedBytes,
            totalBytes: download.totalBytes || LOCAL_MODELS.get(download.modelId)?.sizeBytes || 0,
          }
        : null,
      failed: this.failed ? { ...this.failed } : null,
    };
  }

  /**
   * Fetch a local writing model when it is not on disk, nothing is downloading
   * and it was not declined. Returns at once; progress is published.
   *
   * @param {{ modelId?: string, force?: boolean }} [options]
   * @returns {boolean} Whether a download started.
   */
  start({ modelId, force = false } = {}) {
    const model = LOCAL_MODELS.get(modelId);
    if (!model || !this.modelManager || this.download) return false;
    if (this.installed().includes(modelId)) return false;
    // The same file downloading for Settings' own Download button.
    if (this.modelManager.activeDownloads?.has?.(modelId)) return false;
    if (force && this.declined.includes(modelId)) {
      this.declined = this.declined.filter((id) => id !== modelId);
      this._save();
    }
    if (this.declined.includes(modelId)) return false;

    this.download = {
      modelId,
      receivedBytes: 0,
      totalBytes: model.sizeBytes || 0,
      cancelled: false,
    };
    this.failed = null;
    this.publish();
    debugLogger.info("Fetching the writing model for this Mac", { modelId, force });
    void this._fetch(this.download);
    return true;
  }

  async _fetch(download) {
    try {
      await this.modelManager.downloadModel(
        download.modelId,
        (_percent, receivedBytes, totalBytes) => {
          download.receivedBytes = receivedBytes || 0;
          download.totalBytes = totalBytes || download.totalBytes;
          this.publish({ throttle: true });
        }
      );
    } catch (error) {
      if (download.cancelled || error?.code === "DOWNLOAD_CANCELLED" || error?.isAbort) {
        // Cancelled, here or in Settings: the person said no. Remembered.
        if (!this.declined.includes(download.modelId)) {
          this.declined = [...this.declined, download.modelId];
          this._save();
        }
      } else {
        this.failed = { modelId: download.modelId, error: String(error?.message || error) };
        debugLogger.warn("The writing model did not download", {
          modelId: download.modelId,
          error: this.failed.error,
        });
      }
    } finally {
      if (this.download === download) this.download = null;
      this.publish();
    }
  }

  /** The person cancelled the download: stop it, and do not start it again by itself. */
  cancel() {
    const download = this.download;
    if (!download) return false;
    download.cancelled = true;
    try {
      this.modelManager?.cancelDownload?.(download.modelId);
    } catch {
      // Already over.
    }
    return true;
  }

  /** Models were deleted in Settings. Deleting one is a no to it. */
  deleted(modelIds = []) {
    const fresh = modelIds.filter((id) => LOCAL_MODELS.has(id) && !this.declined.includes(id));
    if (fresh.length) {
      this.declined = [...this.declined, ...fresh];
      this._save();
    }
    this.publish();
  }

  /** A model arrived through Settings' own Download: that undoes an earlier no. */
  downloaded(modelId) {
    if (this.declined.includes(modelId)) {
      this.declined = this.declined.filter((id) => id !== modelId);
      this._save();
    }
    if (this.failed?.modelId === modelId) this.failed = null;
    this.publish();
  }
}

module.exports = { WritingModelFetch, LOCAL_MODELS };
