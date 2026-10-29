// What the main process's speed check would report (src/helpers/deviceTier.js),
// for the speech model's states in Settings, the sidebar and the setup screen.
//
//   tier=none          not measured yet: the bundle's model, nothing shown
//   tier=fast          an M5 Pro that qualifies, turbo not fetched yet: the
//                      setup screen says it will download; in the workspace
//                      the fetch starts and runs (about 10 s), then the check
//   tier=downloading   turbo at 34%
//   tier=checking      its checksum and its clip
//   tier=ready         on disk and the default
//   tier=declined      the person cancelled it
//   tier=failed        the download failed
//   tier=slow          on disk, but its own clip time does not fit
//   tier=intel         an Intel Mac: base.en, never timed
//
// `chosen=small` stores a model the person chose, which the rule never moves.
// `oatsDemo.tier("downloading")` switches state on a running page.
//
// The writing model on this Mac (src/helpers/writingModelFetch.js), by
// `writing=`:
//
//   writing=ready        the model this Mac's memory holds is on disk (default)
//   writing=none         nothing on disk yet: the workspace fetches it (about 12 s)
//   writing=downloading  at 34%
//   writing=declined     the person cancelled it
//   writing=failed       the download failed
//   writing=small        only Qwen3.5 4B is on disk, from before
//
// `memory=8` makes this an 8 GB Mac, whose model is Qwen3.5 4B; otherwise
// 48 GB and Gemma 4 E4B. `oatsDemo.writing("downloading")` switches state.

import { REFERENCE } from "../../src/helpers/speechTier.mjs";

const GIB = 1024 ** 3;
const TURBO_BYTES = 574_041_195;
const M5_PRO = {
  platform: "darwin",
  arch: "arm64",
  chip: "Apple M5 Pro",
  gpuCores: 16,
  memoryBytes: 48 * GIB,
};
const INTEL = {
  platform: "darwin",
  arch: "x64",
  chip: "Intel(R) Core(TM) i9-9880H CPU @ 2.30GHz",
  gpuCores: null,
  memoryBytes: 16 * GIB,
};

const GEMMA = { id: "gemma-4-e4b-it-q4_k_m", bytes: 5_812_137_984 };
const QWEN = { id: "qwen3.5-4b-q4_k_m", bytes: 2_871_743_520 };

/** The writing model's report (WritingModelSnapshot) for a state. */
function writingReport(state, model, received = 0.34 * model.bytes) {
  return {
    installed: state === "ready" ? [model.id] : state === "small" ? [QWEN.id] : [],
    declined: state === "declined" ? [model.id] : [],
    downloading:
      state === "downloading"
        ? { modelId: model.id, receivedBytes: received, totalBytes: model.bytes }
        : null,
    failed: state === "failed" ? { modelId: model.id, error: "HTTP 503" } : null,
  };
}

function snapshot(
  state,
  received = 0.34 * TURBO_BYTES,
  writing = writingReport("ready", GEMMA),
  memoryBytes = 48 * GIB
) {
  const intel = state === "intel";
  const measured = state !== "none" && !intel;
  return {
    memoryBytes,
    writing,
    device: state === "none" ? null : intel ? INTEL : { ...M5_PRO, memoryBytes },
    // The M5 Pro's own clip times; "slow" is turbo measured 1.7 times slower.
    smallClipMs: measured ? REFERENCE.clipMs.smallEn : null,
    turboClipMs:
      state === "slow"
        ? REFERENCE.clipMs.turboEn * 1.7
        : state === "ready"
          ? REFERENCE.clipMs.turboEn
          : null,
    measuredAt: measured ? "2026-10-28T18:46:40.000Z" : null,
    measuring: false,
    turbo: {
      model: "turbo-q5",
      sizeBytes: TURBO_BYTES,
      installed: state === "ready" || state === "slow",
      declined: state === "declined",
      downloading:
        state === "downloading" ? { receivedBytes: received, totalBytes: TURBO_BYTES } : null,
      checking: state === "checking",
      failed: state === "failed" ? "HTTP 503" : null,
    },
  };
}

/**
 * @param {{ state?: string | null, writing?: string | null, memory?: string | null,
 *   emit: (name: string, payload: unknown) => void }} options
 */
export function createFakeDeviceTier({ state: initial, writing: initialWriting, memory, emit }) {
  let state = initial || "ready";
  const memoryBytes = (Number(memory) > 0 ? Number(memory) : 48) * GIB;
  const writingModel = memoryBytes >= 16 * GIB ? GEMMA : QWEN;
  let writingState = initialWriting || "ready";
  let writing = writingReport(writingState, writingModel);
  let current = snapshot(state, undefined, writing, memoryBytes);
  let timer = null;
  let writingTimer = null;

  const publish = (next) => {
    current = next;
    emit("onDeviceTier", current);
  };
  const set = (next) => {
    clearInterval(timer);
    timer = null;
    state = next;
    publish(snapshot(next, undefined, writing, memoryBytes));
  };
  const setWriting = (next, received) => {
    if (received === undefined) {
      clearInterval(writingTimer);
      writingTimer = null;
    }
    writingState = next;
    writing = writingReport(next, writingModel, received);
    publish({ ...current, writing });
  };
  // The writing model's download, as main runs it: about 12 s, then on disk.
  const runWriting = () => {
    let received = 0;
    setWriting("downloading", received);
    writingTimer = setInterval(() => {
      received = Math.min(writingModel.bytes, received + writingModel.bytes / 48);
      if (received < writingModel.bytes) {
        setWriting("downloading", received);
        return;
      }
      setWriting("ready");
    }, 250);
  };

  // A fetch the workspace asked for: progress, the check, then ready.
  const run = () => {
    let received = 0;
    state = "downloading";
    publish(snapshot("downloading", received, writing, memoryBytes));
    timer = setInterval(() => {
      received = Math.min(TURBO_BYTES, received + TURBO_BYTES / 40);
      if (received < TURBO_BYTES) {
        publish(snapshot("downloading", received, writing, memoryBytes));
        return;
      }
      clearInterval(timer);
      timer = null;
      set("checking");
      setTimeout(() => state === "checking" && set("ready"), 1500);
    }, 250);
  };

  return {
    getArch: () => (state === "intel" ? "x64" : "arm64"),
    getDeviceTier: async () => current,
    startWritingModelDownload: async ({ modelId, force = false } = {}) => {
      const startable =
        writingState === "none" ||
        writingState === "small" ||
        (force && (writingState === "declined" || writingState === "failed"));
      if (modelId === writingModel.id && startable && !writingTimer) runWriting();
      return current;
    },
    cancelWritingModelDownload: async () => {
      if (writingState === "downloading") setWriting("declined");
      return current;
    },
    /** The speech models on disk, as `list-whisper-models` would say. */
    whisperModels: () => [
      { model: "base", downloaded: true },
      { model: "small.en", downloaded: state !== "intel" },
      { model: "base.en", downloaded: state === "intel" },
      { model: "turbo-q5", downloaded: Boolean(current.turbo?.installed) },
    ],
    /** The local writing models on disk, as `model-get-all` would say. */
    writingInstalled: () => [...writing.installed],
    /** A local writing model was deleted in Settings: a no to it. */
    writingDeleted: (modelId) => {
      if (writing.installed.includes(modelId))
        setWriting(modelId === writingModel.id ? "declined" : writingState);
    },
    /** Switch the writing model's state on a running page (`oatsDemo.writing`). */
    setWriting: (next) => setWriting(next),
    startSpeechUpgrade: async ({ force = false } = {}) => {
      if (state === "fast" || (force && (state === "declined" || state === "failed"))) run();
      return current;
    },
    cancelSpeechUpgrade: async () => {
      if (state === "downloading") set("declined");
      return current;
    },
    /** Switch state on a running page (the harness's `oatsDemo.tier`). */
    set,
  };
}
