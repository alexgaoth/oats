// The writing model's download when Oats starts it by itself: writingTier.mjs
// decides which model and when; this file fetches it, reports its progress,
// and remembers a no.
//
// - The renderer asks (`writing-model-start`): after setup, while the writing
//   setting follows the default on this Mac and no writing model is ready
//   (useWritingModel.ts), or at once when the person chooses "On this Mac" in
//   setup. Main checks again before it fetches anything: a local writing model
//   from the registry that is not on disk, not downloading, and not declined.
//   `force` is the person asking for it (Settings, setup): it undoes a no, and
//   another writing download gives way to it.
// - Never during a recording: a start Oats makes by itself waits in main until
//   the conversation ends (`isBusy`, the signal deviceTier.js waits on).
// - The file comes through modelManagerBridge.downloadModel, the path every
//   local writing model takes, with its disk-space check: downloadUtils.js with
//   Electron's `net`, so the sidebar's request count includes it
//   (networkLedger.js).
// - Only the person's Cancel is a no to a model. It is kept in
//   userData/writing-model.json, and Oats does not fetch that model again by
//   itself. A download the person left behind (they chose another model, or
//   the providers) stops without a no.
// - Deleting a writing model in Settings is a no to it, and to fetching any
//   writing model by itself (`autoDeclined`): deleting Qwen3.5 4B on a large
//   Mac does not start Gemma 4 E4B's 5.4 GB. Choosing a model, or pressing
//   Download, undoes that.
// - It reports through the device tier's snapshot (deviceTier.js, `writing`),
//   which every window gets.

const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");
const registry = require("../models/modelRegistryData.json");

const STORE_VERSION = 1;
// What modelManagerBridge.js counts as a model file rather than a stub.
const MIN_FILE_SIZE = 1_000_000;
// How often a start that waits for a recording to end looks again.
const BUSY_POLL_MS = 5000;

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
   * @param {() => boolean} [options.isBusy] A conversation is being recorded.
   * @param {(ms: number) => Promise<void>} [options.sleep] For tests.
   */
  constructor({
    storePath,
    modelManager = null,
    publish = () => {},
    isBusy = () => false,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }) {
    this.storePath = storePath;
    this.modelManager = modelManager;
    this.publish = publish;
    this.isBusy = isBusy;
    this.sleep = sleep;
    const stored = this._load();
    this.declined = stored.declined;
    this.autoDeclined = stored.autoDeclined;
    this.download = null; // { modelId, receivedBytes, totalBytes, cancelled, abandoned }
    this.waiting = null; // { modelId }: a start Oats made by itself, until a recording ends
    this.failed = null; // { modelId, error }
  }

  _load() {
    try {
      const record = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      return {
        declined: Array.isArray(record?.declined)
          ? record.declined.filter((id) => typeof id === "string")
          : [],
        autoDeclined: record?.autoDeclined === true,
      };
    } catch {
      return { declined: [], autoDeclined: false };
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const temp = `${this.storePath}.tmp`;
      fs.writeFileSync(
        temp,
        JSON.stringify(
          { version: STORE_VERSION, declined: this.declined, autoDeclined: this.autoDeclined },
          null,
          2
        )
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
      autoDeclined: this.autoDeclined,
      downloading: download
        ? {
            modelId: download.modelId,
            receivedBytes: download.receivedBytes,
            totalBytes: download.totalBytes || LOCAL_MODELS.get(download.modelId)?.sizeBytes || 0,
          }
        : null,
      waiting: this.waiting?.modelId ?? null,
      failed: this.failed ? { ...this.failed } : null,
    };
  }

  /** Why `modelId` is not fetched now; null when it can be. */
  _refusal(modelId, force) {
    if (!LOCAL_MODELS.has(modelId) || !this.modelManager) return "unknown";
    if (this.installed().includes(modelId)) return "installed";
    // Running, or a cancelled one still stopping: the same file.
    if (this.download?.modelId === modelId) return "downloading";
    // The same file downloading for Settings' own Download button.
    if (this.modelManager.activeDownloads?.has?.(modelId)) return "downloading";
    if (force) return null;
    if (this.download || this.waiting) return "busy";
    if (this.autoDeclined || this.declined.includes(modelId)) return "declined";
    return null;
  }

  /**
   * Fetch a local writing model when it is not on disk, nothing is downloading
   * and it was not declined. Returns at once; progress is published. A start
   * Oats makes by itself waits for a recording to end. `force` is the person
   * asking: it undoes their no, and a writing download they left behind stops.
   *
   * @param {{ modelId?: string, force?: boolean }} [options]
   * @returns {boolean} Whether a download started, or waits for a recording to end.
   */
  start({ modelId, force = false } = {}) {
    if (this._refusal(modelId, force)) return false;
    if (force) {
      this._undoNo(modelId);
      this.cancel({ decline: false, keep: modelId });
      if (this.waiting?.modelId === modelId) this.waiting = null;
      this._begin(modelId, true);
      return true;
    }
    if (this.isBusy()) {
      const entry = { modelId };
      this.waiting = entry;
      this.publish();
      debugLogger.info("The writing model waits for the recording to end", { modelId });
      void this._startWhenFree(entry);
      return true;
    }
    this._begin(modelId, false);
    return true;
  }

  async _startWhenFree(entry) {
    while (this.waiting === entry && this.isBusy()) {
      await this.sleep(BUSY_POLL_MS);
    }
    // Cancelled, or another start took its place.
    if (this.waiting !== entry) return;
    this.waiting = null;
    // Asked again: the model may have arrived, or been declined, meanwhile.
    if (this._refusal(entry.modelId, false)) {
      this.publish();
      return;
    }
    this._begin(entry.modelId, false);
  }

  _begin(modelId, force) {
    const download = {
      modelId,
      receivedBytes: 0,
      totalBytes: LOCAL_MODELS.get(modelId)?.sizeBytes || 0,
      cancelled: false,
      abandoned: false,
    };
    this.download = download;
    this.failed = null;
    this.publish();
    debugLogger.info("Fetching the writing model for this Mac", { modelId, force });
    void this._fetch(download);
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
        // The person's Cancel, here or in Settings, is a no: remembered. A
        // download they left behind is not.
        if (!download.abandoned) this._decline(download.modelId);
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

  _decline(modelId) {
    if (this.declined.includes(modelId)) return;
    this.declined = [...this.declined, modelId];
    this._save();
  }

  /** The person asked for a model: their no to it, and to fetching by itself, is undone. */
  _undoNo(modelId) {
    if (!this.declined.includes(modelId) && !this.autoDeclined) return;
    this.declined = this.declined.filter((id) => id !== modelId);
    this.autoDeclined = false;
    this._save();
  }

  /**
   * Stop the writing model's download, or a start waiting for a recording to
   * end. `decline` (the default) is the person's Cancel: Oats does not fetch
   * that model again by itself. Without it nothing is remembered: the person
   * moved to another model or to the providers. `keep` is a model whose
   * download goes on: the one they just chose.
   *
   * @param {{ decline?: boolean, keep?: string | null }} [options]
   * @returns {boolean} Whether anything stopped.
   */
  cancel({ decline = true, keep = null } = {}) {
    let stopped = false;
    if (this.waiting && this.waiting.modelId !== keep) {
      const { modelId } = this.waiting;
      this.waiting = null;
      if (decline) this._decline(modelId);
      stopped = true;
    }
    const download = this.download;
    if (download && !download.cancelled && download.modelId !== keep) {
      download.cancelled = true;
      download.abandoned = !decline;
      try {
        this.modelManager?.cancelDownload?.(download.modelId);
      } catch {
        // Already over.
      }
      stopped = true;
    }
    if (stopped) this.publish();
    return stopped;
  }

  /** The person chose a writing model in Settings: Oats may fetch by itself again. */
  chosen() {
    if (!this.autoDeclined) return false;
    this.autoDeclined = false;
    this._save();
    this.publish();
    return true;
  }

  /**
   * Models were deleted in Settings. Deleting a writing model is a no to it,
   * and to fetching any writing model by itself until the person chooses a
   * model or presses Download.
   */
  deleted(modelIds = []) {
    const local = modelIds.filter((id) => LOCAL_MODELS.has(id));
    if (local.length) {
      this.declined = [...new Set([...this.declined, ...local])];
      this.autoDeclined = true;
      this._save();
    }
    this.publish();
  }

  /** A model arrived through Settings' own Download: that undoes an earlier no. */
  downloaded(modelId) {
    if (LOCAL_MODELS.has(modelId)) this._undoNo(modelId);
    if (this.failed?.modelId === modelId) this.failed = null;
    this.publish();
  }
}

module.exports = { WritingModelFetch, LOCAL_MODELS };
