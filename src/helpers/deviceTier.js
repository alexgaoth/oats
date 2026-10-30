// What this Mac can run, measured once per app version: the chip, the GPU's
// core count, the unified memory, and how long the app's own whisper-server
// takes to read one fixed clip with `small.en`. speechTier.mjs turns these
// into a default speech model; this file measures them, keeps them, and
// fetches turbo when the renderer asks.
//
// - Detection is local and reads no identifier: `sysctl -n
//   machdep.cpu.brand_string` for the chip, the `gpu-core-count` IOKit gives
//   the Apple GPU (`ioreg -rc AGXAccelerator -d 1`, about 25 ms; the slower
//   `system_profiler SPDisplaysDataType -json` only when that has nothing),
//   and `os.totalmem()`.
// - The benchmark: the clip (speechCheck.wav, 5 s of LibriSpeech) read twice
//   on a server that holds `small.en`, VAD on, language "en", as the pre-warm
//   starts it. The faster of the two is kept: the first read on a new server
//   can pay a warm-up. When the app's own server already holds `small.en` and
//   is idle (the pre-warm loads it for an English speaker), the reads go to
//   it. Otherwise a second, short-lived server loads the model and stops
//   after, so a model somebody chose is never unloaded for this.
// - A check that says turbo does not fit is read again, up to twice, 20 s
//   apart, and the fastest counts: another program on the GPU only ever
//   makes a check slower (2 of 10 checks on a busy M5 Pro came back 4 times
//   slow).
// - It waits while a conversation is recorded or the app's server is
//   answering, so it never takes the GPU from a recording.
// - It is kept in userData/device-tier.json with the app version and the
//   device, and runs again after an update or on another Mac.
// - Turbo is downloaded only when the renderer asks (`speech-upgrade-start`),
//   which it does after setup, while the speech setting follows the default
//   (settingsStore.ts). downloadUtils.js fetches it with Electron's `net`, so
//   the sidebar's request count includes it (networkLedger.js). Then its
//   checksum is checked and the clip is read with turbo, and that time
//   replaces the prediction. A cancelled or deleted turbo is remembered:
//   Oats does not fetch it again by itself.
//
// `deviceTier()` returns the same snapshot the renderer gets, for any other
// local model that wants to size itself to this Mac. The writing model does:
// the snapshot carries this Mac's memory, which decides it (writingTier.mjs),
// and the state of its own automatic download (writingModelFetch.js).

const EventEmitter = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const debugLogger = require("./debugLogger");
const WhisperServerManager = require("./whisperServer");
const { createDownloadSignal } = require("./downloadUtils");
const { DEFAULT_WHISPER_VAD_CONFIG } = require("./whisperVadConfig");
const { WritingModelFetch } = require("./writingModelFetch");
const registry = require("../models/modelRegistryData.json");

let speechTierModule = null;
const loadSpeechTier = () => (speechTierModule ??= import("./speechTier.mjs"));

/** The speed check's clip: 16 kHz mono PCM, LibriSpeech test-clean 7127-75946-0024. */
const CLIP_PATH = path.join(__dirname, "speechCheck.wav");
const CLIP_LANGUAGE = "en";
const CLIP_READS = 2;

/** The check's own server listens outside the app server's 8178-8199 (whisperServer.js). */
const CHECK_SERVER_PORTS = [8230, 8239];

const STORE_VERSION = 1;
const TURBO_MODEL = "turbo-q5";
const BENCHMARK_MODEL = "small.en";
const BUSY_POLL_MS = 5000;
const BUSY_GIVE_UP_MS = 10 * 60 * 1000;
const PROGRESS_PUBLISH_MS = 250;
// A check that says turbo does not fit is read again, up to twice, this far
// apart. Another program on the GPU (or Oats' own writing model loading at
// launch) only ever makes a read slower: 2 of 10 checks on a busy M5 Pro
// read the clip in 624 and 727 ms against 156-200 ms for the rest.
const RECHECKS = 2;
const RECHECK_DELAY_MS = 20 * 1000;

/** Run a system tool and return its output, or "" when it fails. */
function runTool(file, args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
        resolve(error ? "" : String(stdout ?? ""))
      );
    } catch {
      resolve("");
    }
  });
}

/** The Apple GPU's core count from `ioreg -rc AGXAccelerator -d 1`. */
function parseGpuCoreCount(text) {
  const match = /"gpu-core-count"\s*=\s*(\d+)/.exec(String(text ?? ""));
  const cores = match ? Number(match[1]) : 0;
  return cores > 0 ? cores : null;
}

/** The GPU's core count from `system_profiler SPDisplaysDataType -json`. */
function parseSystemProfilerCores(text) {
  try {
    for (const gpu of JSON.parse(text)?.SPDisplaysDataType ?? []) {
      const cores = Number.parseInt(gpu?.sppci_cores, 10);
      if (cores > 0) return cores;
    }
  } catch {
    // Not JSON: nothing to read.
  }
  return null;
}

/**
 * The chip, the GPU's core count and the memory. Only reads.
 *
 * @param {{ platform?: string, arch?: string, run?: typeof runTool, totalmem?: () => number }} [options]
 */
async function detectDevice({
  platform = process.platform,
  arch = process.arch,
  run = runTool,
  totalmem = os.totalmem,
} = {}) {
  const device = { platform, arch, chip: null, gpuCores: null, memoryBytes: null };
  try {
    device.memoryBytes = Number(totalmem()) || null;
  } catch {
    device.memoryBytes = null;
  }
  if (platform !== "darwin") return device;
  device.chip = (await run("/usr/sbin/sysctl", ["-n", "machdep.cpu.brand_string"])).trim() || null;
  device.gpuCores = parseGpuCoreCount(
    await run("/usr/sbin/ioreg", ["-rc", "AGXAccelerator", "-d", "1"])
  );
  if (device.gpuCores === null && arch === "arm64") {
    device.gpuCores = parseSystemProfilerCores(
      await run("/usr/sbin/system_profiler", ["SPDisplaysDataType", "-json"], { timeoutMs: 15000 })
    );
  }
  return device;
}

const sameDevice = (a, b) =>
  Boolean(a && b) &&
  ["platform", "arch", "chip", "gpuCores", "memoryBytes"].every((key) => a[key] === b[key]);

/**
 * Whether a stored record still describes this app and this Mac. A new app
 * version can ship a new whisper-server, and a profile can move to a new Mac.
 */
function isCurrent(record, { appVersion, device }) {
  return (
    record?.version === STORE_VERSION &&
    record.appVersion === appVersion &&
    sameDevice(record.device, device)
  );
}

/** The faster of the reads, in ms (rounded to 0.1). */
const fastest = (reads) => Math.round(Math.min(...reads) * 10) / 10;

/** How long one read takes, in ms. */
async function timeRead(read) {
  const started = process.hrtime.bigint();
  await read();
  return Number(process.hrtime.bigint() - started) / 1e6;
}

class DeviceTier extends EventEmitter {
  /**
   * @param {object} options
   * @param {object} options.whisperManager WhisperManager: model paths, the
   *   app's server, downloads.
   * @param {string} options.storePath Where the record is kept.
   * @param {string} options.appVersion
   * @param {() => boolean} [options.isBusy] A conversation is being recorded.
   * @param {(snapshot: object) => void} [options.publish] Sends to every window.
   * @param {Function} [options.detect] detectDevice, for tests.
   * @param {() => object} [options.createServer] A second whisper-server, for tests.
   * @param {string} [options.clipPath]
   * @param {(read: () => Promise<unknown>) => Promise<number>} [options.time] Times one read, for tests.
   * @param {object | null} [options.modelManager] modelManagerBridge's manager, for the
   *   writing model's download (writingModelFetch.js).
   * @param {string} [options.writingStorePath] Where the writing model's state is kept.
   * @param {() => number} [options.totalmem] os.totalmem, for tests.
   */
  constructor({
    whisperManager,
    storePath,
    appVersion,
    isBusy = () => false,
    publish = () => {},
    detect = detectDevice,
    createServer = () =>
      new WhisperServerManager({ pidName: "whisper-check", ports: CHECK_SERVER_PORTS }),
    clipPath = CLIP_PATH,
    time = timeRead,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    modelManager = null,
    writingStorePath = null,
    totalmem = os.totalmem,
  }) {
    super();
    this.whisperManager = whisperManager;
    this.storePath = storePath;
    this.appVersion = appVersion;
    this.isBusy = isBusy;
    this.publishTo = publish;
    this.detect = detect;
    this.createServer = createServer;
    this.clipPath = clipPath;
    this.time = time;
    this.sleep = sleep;
    this.now = now;
    this.record = this._load();
    this.measuring = false;
    this.measured = null;
    this.download = null; // { abort, receivedBytes, totalBytes }
    this.checking = false;
    this.failed = null;
    this.checkServer = null; // the check's own whisper-server while it runs
    this._publishTimer = null;
    this.totalmem = totalmem;
    // The writing model's automatic download, reported in this snapshot. It
    // waits for a recording to end on the same signal as the clip check.
    this.writing = new WritingModelFetch({
      storePath: writingStorePath ?? path.join(path.dirname(storePath), "writing-model.json"),
      modelManager,
      publish: (options) => this.publish(options),
      isBusy: () => {
        try {
          return this.isBusy() === true;
        } catch {
          return false;
        }
      },
      sleep: (ms) => this.sleep(ms),
    });
  }

  _load() {
    try {
      const record = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      return record && typeof record === "object" ? record : null;
    } catch {
      return null;
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const temp = `${this.storePath}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.record, null, 2));
      fs.renameSync(temp, this.storePath);
    } catch (error) {
      debugLogger.warn("Could not save the device tier", { error: error.message });
    }
  }

  _turboPath() {
    try {
      return this.whisperManager.getModelPath(TURBO_MODEL);
    } catch {
      return null;
    }
  }

  turboInstalled() {
    const file = this._turboPath();
    return Boolean(file && fs.existsSync(file));
  }

  /** What the renderer reads (types/electron.ts `DeviceTierSnapshot`). */
  snapshot() {
    const record = this.record ?? {};
    const expected = registry.whisperModels[TURBO_MODEL]?.expectedSizeBytes ?? null;
    return {
      device: record.device ?? null,
      // Read at once, before the speed check detects the device: the writing
      // model is chosen by it (writingTier.mjs), and setup names that model.
      memoryBytes: record.device?.memoryBytes ?? this._memoryBytes(),
      smallClipMs: record.smallClipMs ?? null,
      turboClipMs: record.turboClipMs ?? null,
      measuredAt: record.measuredAt ?? null,
      measuring: this.measuring,
      turbo: {
        model: TURBO_MODEL,
        sizeBytes: expected,
        installed: this.turboInstalled(),
        declined: record.turboDeclined === true,
        downloading: this.download
          ? {
              receivedBytes: this.download.receivedBytes,
              totalBytes: this.download.totalBytes || expected,
            }
          : null,
        checking: this.checking,
        failed: this.failed,
      },
      writing: this.writing.snapshot(),
    };
  }

  _memoryBytes() {
    try {
      return Number(this.totalmem()) || null;
    } catch {
      return null;
    }
  }

  /** Push the snapshot now, or, for download progress, at most every 250 ms. */
  publish({ throttle = false } = {}) {
    if (throttle) {
      if (this._publishTimer) return;
      this._publishTimer = setTimeout(() => {
        this._publishTimer = null;
        this.publish();
      }, PROGRESS_PUBLISH_MS);
      return;
    }
    if (this._publishTimer) {
      clearTimeout(this._publishTimer);
      this._publishTimer = null;
    }
    const snapshot = this.snapshot();
    this.emit("change", snapshot);
    try {
      this.publishTo(snapshot);
    } catch {
      // A window that is gone.
    }
  }

  /**
   * Wait until no conversation is recorded and the app's server is free, at
   * most `limitMs`. False when it gave up.
   */
  async _waitUntilFree(limitMs = BUSY_GIVE_UP_MS) {
    const started = this.now();
    const busy = () => {
      try {
        const appServer = this.whisperManager.serverManager;
        return Boolean(this.isBusy() || appServer?.inFlight > 0 || appServer?.startupPromise);
      } catch {
        return false;
      }
    };
    while (busy()) {
      if (this.now() - started > limitMs) return false;
      await this.sleep(BUSY_POLL_MS);
    }
    return true;
  }

  /**
   * Read the clip with a model: on the app's server when it holds that model
   * and is idle, otherwise on a server of its own that is stopped after.
   *
   * @param {string} modelId
   * @param {{ waitMs?: number }} [options] How long to wait for a recording to end.
   * @returns {Promise<{ ms: number, reads: number[], server: "app" | "own" } | null>}
   */
  async measureClip(modelId, { waitMs = BUSY_GIVE_UP_MS } = {}) {
    let modelPath;
    try {
      modelPath = this.whisperManager.getModelPath(modelId);
    } catch {
      return null;
    }
    if (!fs.existsSync(modelPath) || !fs.existsSync(this.clipPath)) return null;
    if (!(await this._waitUntilFree(waitMs))) return null;

    const wav = fs.readFileSync(this.clipPath);
    const appServer = this.whisperManager.serverManager;
    const reuse = Boolean(appServer?.isIdle?.() && appServer.modelPath === modelPath);
    const server = reuse ? appServer : this.createServer();
    if (!reuse && !server?.isAvailable?.()) return null;
    if (!reuse) this.checkServer = server;
    try {
      if (!reuse) {
        // As the pre-warm starts the app's server (getPrewarmStartOptions):
        // VAD on with the shipped config, on the GPU Metal gives it.
        await server.start(modelPath, {
          useCuda: false,
          useVulkan: false,
          vadEnabled: true,
          vadModelPath: this.whisperManager.getVadModelPath?.() ?? null,
          vadConfig: { ...DEFAULT_WHISPER_VAD_CONFIG },
        });
        server.stopHealthCheck?.();
      }
      const reads = [];
      for (let read = 0; read < CLIP_READS; read += 1) {
        reads.push(
          await this.time(() => server.transcribePreparedWav(wav, { language: CLIP_LANGUAGE }))
        );
      }
      return { ms: fastest(reads), reads, server: reuse ? "app" : "own" };
    } catch (error) {
      debugLogger.warn("Speed check failed", { model: modelId, error: error.message });
      return null;
    } finally {
      if (!reuse) {
        await server.stop().catch(() => {});
        if (this.checkServer === server) this.checkServer = null;
      }
    }
  }

  /** Stop the check's own server if one is up (the app is quitting). */
  async stopCheckServer() {
    const server = this.checkServer;
    this.checkServer = null;
    if (server) await server.stop().catch(() => {});
  }

  /**
   * Read the clip, and again while the result says turbo does not fit, at
   * most `RECHECKS` more times: the fastest check is this Mac's. Contention
   * makes a check slower and never faster, so a slow result is the one worth
   * doubting, and a fast one stands.
   *
   * @param {string} modelId
   * @param {(ms: number) => boolean} fits Whether this time keeps turbo in.
   * @param {{ waitMs?: number }} [options]
   */
  async _measureFastest(modelId, fits, options) {
    let best = await this.measureClip(modelId, options);
    const checks = best ? [best.ms] : [];
    for (let again = 0; again < RECHECKS && best && !fits(best.ms); again += 1) {
      await this.sleep(RECHECK_DELAY_MS);
      const next = await this.measureClip(modelId, options);
      if (!next) break;
      checks.push(next.ms);
      if (next.ms < best.ms) best = next;
    }
    return best ? { ...best, checks } : null;
  }

  /**
   * At launch, after the pre-warm: detect this Mac, and read the clip with
   * `small.en` when the stored record is from another version or another
   * Mac. Only Apple Silicon is timed: elsewhere the bundle's model stays.
   */
  async ensureMeasured() {
    if (this.measured) return this.measured;
    this.measured = (async () => {
      const device = await this.detect();
      if (isCurrent(this.record, { appVersion: this.appVersion, device })) return this.record;

      // After an update on the same Mac, the last times stand until new ones
      // are read, so a check that cannot run (a recording that lasts) does
      // not take turbo away. Another Mac starts from nothing.
      const previous = this.record ?? {};
      const sameMac = sameDevice(previous.device, device);
      const kept = (key) => (sameMac ? (previous[key] ?? null) : null);
      this.record = {
        version: STORE_VERSION,
        appVersion: this.appVersion,
        device,
        smallClipMs: kept("smallClipMs"),
        smallClipReads: kept("smallClipReads"),
        smallClipChecks: kept("smallClipChecks"),
        turboClipMs: kept("turboClipMs"),
        measuredAt: kept("measuredAt"),
        // A cancelled download stays cancelled, after an update and on a new Mac.
        turboDeclined: previous.turboDeclined === true,
      };
      const timed = device.platform === "darwin" && device.arch === "arm64";
      let fresh = false;
      if (timed) {
        this.measuring = true;
        this.publish();
        try {
          const { predictTurboSegmentMs, SEGMENT_BUDGET_MS } = await loadSpeechTier();
          const small = await this._measureFastest(
            BENCHMARK_MODEL,
            (ms) => predictTurboSegmentMs({ smallClipMs: ms }) <= SEGMENT_BUDGET_MS
          );
          if (small) {
            fresh = true;
            this.record.smallClipMs = small.ms;
            this.record.smallClipReads = small.reads;
            this.record.smallClipChecks = small.checks;
            this.record.measuredAt = new Date(this.now()).toISOString();
          }
          // Turbo is on disk from before: time it too, with this version's server.
          if (small && this.turboInstalled()) {
            const turbo = await this._measureFastest(
              TURBO_MODEL,
              (ms) => predictTurboSegmentMs({ turboClipMs: ms }) <= SEGMENT_BUDGET_MS
            );
            this.record.turboClipMs = turbo ? turbo.ms : null;
          }
        } finally {
          this.measuring = false;
        }
      }
      // Saved once there is something new; otherwise the next launch tries again.
      if (fresh || !timed) this._save();
      debugLogger.info("Device tier", {
        chip: device.chip,
        gpuCores: device.gpuCores,
        memoryGb: device.memoryBytes ? Math.round(device.memoryBytes / 1024 ** 3) : null,
        smallClipMs: this.record.smallClipMs,
        turboClipMs: this.record.turboClipMs,
      });
      this.publish();
      return this.record;
    })();
    try {
      return await this.measured;
    } catch (error) {
      debugLogger.warn("Device tier failed", { error: error.message });
      this.measured = null;
      return this.record;
    }
  }

  /**
   * Fetch turbo, when this Mac qualifies for it in this language and it is
   * not on disk, not downloading and not declined. `force` is the person
   * asking for it in Settings, after a cancel or a failure.
   *
   * @param {{ language?: string, force?: boolean }} [options]
   */
  async startUpgrade({ language = "en", force = false } = {}) {
    if (this.measured) await this.measured;
    const record = this.record;
    if (!record?.device || this.download || this.checking || this.turboInstalled()) {
      return this.snapshot();
    }
    if (force) {
      record.turboDeclined = false;
      this._save();
    }
    if (record.turboDeclined) return this.snapshot();
    const { chooseSpeechModel } = await loadSpeechTier();
    const choice = chooseSpeechModel({
      platform: record.device.platform,
      arch: record.device.arch,
      memoryBytes: record.device.memoryBytes,
      smallClipMs: record.smallClipMs,
      turboClipMs: record.turboClipMs,
      language,
    });
    if (choice.model !== TURBO_MODEL) return this.snapshot();

    const signal = createDownloadSignal();
    this.download = { abort: signal.abort, receivedBytes: 0, totalBytes: 0, cancelled: false };
    this.failed = null;
    this.publish();
    debugLogger.info("Fetching Whisper turbo for this Mac", {
      predictedTurboMs: Math.round(choice.predictedTurboMs),
      budgetMs: Math.round(choice.budgetMs),
    });
    void this._fetchTurbo(signal);
    return this.snapshot();
  }

  async _fetchTurbo(signal) {
    const download = this.download;
    try {
      await this.whisperManager.downloadWhisperModel(
        TURBO_MODEL,
        (progress) => {
          if (progress?.type === "progress") {
            download.receivedBytes = progress.downloaded_bytes || 0;
            download.totalBytes = progress.total_bytes || 0;
            this.publish({ throttle: true });
          } else if (progress?.type === "installing") {
            // The checksum, then the clip: one step for the person.
            this.download = null;
            this.checking = true;
            this.publish();
          }
        },
        { download: signal }
      );
      this.download = null;
      this.checking = true;
      this.publish();
      // However long a recording lasts: the default changes only after it,
      // so a conversation never switches models halfway.
      const { predictTurboSegmentMs, SEGMENT_BUDGET_MS } = await loadSpeechTier();
      const turbo = await this._measureFastest(
        TURBO_MODEL,
        (ms) => predictTurboSegmentMs({ turboClipMs: ms }) <= SEGMENT_BUDGET_MS,
        { waitMs: Infinity }
      );
      if (turbo && this.record) {
        this.record.turboClipMs = turbo.ms;
        this._save();
      }
    } catch (error) {
      if (error?.isAbort || download.cancelled) {
        // Cancelled: the person said no. Remembered, and the partial file goes.
        if (this.record) {
          this.record.turboDeclined = true;
          this._save();
        }
        const file = this._turboPath();
        if (file) fs.rm(`${file}.tmp`, { force: true }, () => {});
      } else {
        this.failed = String(error?.message || error);
        debugLogger.warn("Whisper turbo did not download", { error: this.failed });
      }
    } finally {
      this.download = null;
      this.checking = false;
      this.publish();
    }
  }

  /** The person cancelled the download: stop it, and do not start it again by itself. */
  cancelUpgrade() {
    if (this.download) {
      this.download.cancelled = true;
      this.download.abort();
    } else if (this.record) {
      this.record.turboDeclined = true;
      this._save();
      this.publish();
    }
    return this.snapshot();
  }

  /** A model was deleted in Settings. Deleting turbo is a no to it. */
  modelDeleted(modelId) {
    if (modelId !== TURBO_MODEL || !this.record) return;
    this.record.turboDeclined = true;
    this.record.turboClipMs = null;
    this._save();
    this.publish();
  }

  /**
   * Turbo arrived through Settings' own Download, which also chooses it: that
   * undoes an earlier no. Its clip is timed at the next update's check.
   */
  modelDownloaded(modelId) {
    if (modelId !== TURBO_MODEL || !this.record || this.download || this.checking) return;
    if (this.record.turboDeclined) {
      this.record.turboDeclined = false;
      this._save();
    }
    this.publish();
  }
}

let instance = null;

/** Create the app's one instance (ipcHandlers.js). */
function initDeviceTier(options) {
  instance = new DeviceTier(options);
  return instance;
}

/**
 * This Mac as measured: the device, the clip times, and the state of turbo.
 * Null before the app created its instance.
 */
function deviceTier() {
  return instance ? instance.snapshot() : null;
}

module.exports = {
  DeviceTier,
  initDeviceTier,
  deviceTier,
  detectDevice,
  parseGpuCoreCount,
  parseSystemProfilerCores,
  isCurrent,
  CLIP_PATH,
  TURBO_MODEL,
  BENCHMARK_MODEL,
  STORE_VERSION,
};
