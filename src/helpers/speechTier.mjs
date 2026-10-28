// Which local speech model keeps up with a live conversation on this Mac.
//
// Every Apple Silicon Mac ships `small.en` (bundledWhisperModels.mjs). On a
// fast enough GPU, `large-v3-turbo` (q5_0, 574 MB) hears more of a room: in
// the AMI replay (docs/dictation-accuracy.md) it recovered 75.2% of a quiet
// room's words against 70.4% for `small.en`, and 47.5% against 40.0% with
// steady sound. It also costs 4.5 times the GPU time. Which Macs have that
// time to spare cannot come from a table of chips, because new chips keep
// coming. So Oats measures: at first launch and after each update, one fixed
// clip goes through the app's own whisper-server with `small.en`
// (deviceTier.js), and turbo's time is predicted from it.
//
// Measured on the reference Mac (Apple M5 Pro, 16-core GPU, 48 GB, Metal,
// 2026-10-28). Room replay of 3 AMI meetings (781 segments), the median time
// of one segment, VAD on:
//
//   model + language        per segment   real-time factor
//   base.en  + en           58 ms         0.013
//   small.en + en           134 ms        0.028
//   turbo q5_0 + en         603 ms        0.118
//   turbo q5_0 + auto       1089 ms       0.206
//
// The rule. A busy meeting closes about 14 segments a minute: one every
// 4.3 s. While a segment is open, the live line reads it again once it holds
// 1 s of speech and then once a beat (1.2 s, partialScheduler.mjs): at 1.0,
// 2.2 and 3.4 s. Then its final reads it once more. That is 4 reads in 4.3 s,
// and the server answers one at a time, so a model keeps up with all of them
// when one read takes at most 4.3 / 4 = 1.07 s. At that speed the server is
// busy for the whole time somebody talks. The choice may use three quarters
// of it (about 800 ms a read), and the last quarter is the margin: for a
// dictation, a hot laptop, the writing model on the same GPU, and the error of
// predicting turbo from `small.en` on another chip.
//
// - Not Apple Silicon (an Intel Mac, Linux): the bundle's model, `base`, which
//   English speakers get as `base.en`. On a CPU, `small.en` already took
//   2,377 ms an utterance.
// - Apple Silicon with less than 16 GB, or not measured yet: `small`.
// - Apple Silicon: turbo when its predicted time for a segment fits the
//   budget, else `small`. The prediction is turbo's reference time scaled by
//   how much slower this Mac read the clip than the reference Mac:
//   603 ms × (this Mac's clip time / the reference's). Once turbo is on disk,
//   its own clip time replaces the prediction. Language detection ("auto")
//   costs turbo a second encoder pass: 1089 / 603 = 1.8 times the time.
//
// On the reference Mac turbo is predicted at 603 ms for English (fits) and
// 1089 ms with "auto" (does not).
//
// The choice is only a default. A model the person chose is never changed:
// the settings store follows this only while nothing is stored
// (settingsStore.ts). Turbo is not bundled: on a Mac that qualifies, Oats
// downloads it after setup, visibly and cancellably, and uses `small.en`
// until it is on disk (deviceTier.js).
//
// Pure and DOM-free: the main process and the renderer share it, and
// test/helpers/speechTier.test.js pins every branch.

import { PARTIAL_DEFAULTS } from "./partialScheduler.mjs";
import { defaultWhisperModel } from "./bundledWhisperModels.mjs";

/** The registry id of `ggml-large-v3-turbo-q5_0.bin` (modelRegistryData.json). */
export const TURBO_MODEL = "turbo-q5";

/** The model whose clip time is the benchmark: every Apple Silicon build ships it. */
export const BENCHMARK_MODEL = "small.en";

/** Measured on the reference Mac. */
export const REFERENCE = Object.freeze({
  mac: "Apple M5 Pro, 16-core GPU, 48 GB",
  /** Median per-segment time in the AMI room replay (ms). */
  segmentMs: Object.freeze({ baseEn: 58, smallEn: 134, turboEn: 603, turboAuto: 1089 }),
  /**
   * The benchmark clip (speechBenchmarkClip.mjs) through the same server,
   * VAD on, language "en": the median of warm requests (ms).
   */
  clipMs: Object.freeze({ smallEn: 170, turboEn: 640 }),
});

/** Segments a busy meeting closes in a minute. */
export const BUSY_SEGMENTS_PER_MINUTE = 14;

const SEGMENT_EVERY_MS = 60_000 / BUSY_SEGMENTS_PER_MINUTE;

/**
 * Reads of one busy segment: a partial once it holds `minSpeechMs` of speech,
 * then one a beat while it is open, then its final.
 */
export const READS_PER_SEGMENT =
  Math.floor((SEGMENT_EVERY_MS - PARTIAL_DEFAULTS.minSpeechMs) / PARTIAL_DEFAULTS.intervalMs) +
  1 +
  1;

/** The longest one read can take with the server keeping up with every read. */
export const KEEP_UP_MS = SEGMENT_EVERY_MS / READS_PER_SEGMENT;

/** The share of `KEEP_UP_MS` a default may use; the rest is the margin. */
export const HEADROOM = 0.75;

/** The most a default model may take for one segment (about 800 ms). */
export const SEGMENT_BUDGET_MS = KEEP_UP_MS * HEADROOM;

/** What language detection costs turbo: a second encoder pass. */
export const AUTO_DETECT_COST = REFERENCE.segmentMs.turboAuto / REFERENCE.segmentMs.turboEn;

/** Less memory than this keeps `small`: turbo holds 0.7 GB while it runs. */
export const MIN_TURBO_MEMORY_BYTES = 16 * 1024 ** 3;

const positive = (value) => (typeof value === "number" && value > 0 ? value : null);

/**
 * Turbo's time for one segment on this Mac, in ms, or null with nothing measured.
 *
 * @param {object} input
 * @param {number | null} [input.smallClipMs] This Mac's clip time with `small.en`.
 * @param {number | null} [input.turboClipMs] This Mac's clip time with turbo, once it is on disk.
 * @param {string} [input.language] The speech language setting; "auto" is detection.
 * @returns {number | null}
 */
export function predictTurboSegmentMs({ smallClipMs, turboClipMs, language } = {}) {
  const detection = language === "auto" ? AUTO_DETECT_COST : 1;
  const turbo = positive(turboClipMs);
  if (turbo) return (turbo / REFERENCE.clipMs.turboEn) * REFERENCE.segmentMs.turboEn * detection;
  const small = positive(smallClipMs);
  if (small) return (small / REFERENCE.clipMs.smallEn) * REFERENCE.segmentMs.turboEn * detection;
  return null;
}

/**
 * The default local speech model for this Mac and language.
 *
 * @param {object} input
 * @param {string} input.platform `process.platform`
 * @param {string} input.arch The build's `process.arch`
 * @param {number | null} [input.memoryBytes] Unified memory.
 * @param {number | null} [input.smallClipMs] The benchmark: the clip with `small.en`.
 * @param {number | null} [input.turboClipMs] The clip with turbo, once measured.
 * @param {string} [input.language] The speech language setting.
 * @returns {{
 *   model: string,
 *   reason: "not-apple-silicon" | "not-measured" | "memory" | "fits" | "too-slow",
 *   predictedTurboMs: number | null,
 *   budgetMs: number,
 * }}
 */
export function chooseSpeechModel({
  platform,
  arch,
  memoryBytes = null,
  smallClipMs = null,
  turboClipMs = null,
  language = "en",
} = {}) {
  const bundled = defaultWhisperModel(platform, arch);
  const budgetMs = SEGMENT_BUDGET_MS;
  if (platform !== "darwin" || arch !== "arm64") {
    return { model: bundled, reason: "not-apple-silicon", predictedTurboMs: null, budgetMs };
  }
  const predictedTurboMs = predictTurboSegmentMs({ smallClipMs, turboClipMs, language });
  if (predictedTurboMs === null) {
    return { model: bundled, reason: "not-measured", predictedTurboMs, budgetMs };
  }
  if (positive(memoryBytes) !== null && memoryBytes < MIN_TURBO_MEMORY_BYTES) {
    return { model: bundled, reason: "memory", predictedTurboMs, budgetMs };
  }
  if (predictedTurboMs <= budgetMs) {
    return { model: TURBO_MODEL, reason: "fits", predictedTurboMs, budgetMs };
  }
  return { model: bundled, reason: "too-slow", predictedTurboMs, budgetMs };
}

/** Where the renderer keeps a speech model the person chose (localStorage). */
export const WHISPER_MODEL_KEY = "whisperModel";

/**
 * Whether the speech setting follows the default: nothing is stored. The
 * model picker stores a model only when somebody picks one, so a stored
 * value is a choice, and a choice is never moved by this rule. (Before
 * 2026-10-26 it also stored "base" by itself; migrateStoredWhisperModel in
 * bundledWhisperModels.mjs removed that once.)
 *
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {boolean}
 */
export function followsDefaultModel(storage) {
  return !storage || storage.getItem(WHISPER_MODEL_KEY) === null;
}

/**
 * The speech model the settings hold: the person's choice when there is one,
 * otherwise the default as it is now (`defaultSpeechModel`).
 *
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @param {string} defaultModel
 * @returns {string}
 */
export function settingWhisperModel(storage, defaultModel) {
  return storage?.getItem(WHISPER_MODEL_KEY) ?? defaultModel;
}

/**
 * The model a setting that follows the default resolves to now: the chosen
 * model once it is on disk, the bundle's until then.
 *
 * @param {{ choice: { model: string }, bundleModel: string, turboInstalled?: boolean }} input
 * @returns {string}
 */
export function defaultSpeechModel({ choice, bundleModel, turboInstalled = false }) {
  if (choice?.model === TURBO_MODEL && !turboInstalled) return bundleModel;
  return choice?.model || bundleModel;
}

/**
 * Whether to fetch turbo now. Only after setup, only while the setting follows
 * the default and the speech runs on this Mac with Whisper, and not after a
 * failure (Settings retries) or after the person cancelled or deleted it.
 *
 * @param {object} input
 * @param {{ model: string }} input.choice
 * @param {boolean} input.setupDone
 * @param {boolean} input.followsDefault
 * @param {boolean} input.local Speech runs on this Mac with Whisper.
 * @param {{ installed?: boolean, declined?: boolean, downloading?: unknown,
 *   checking?: boolean, failed?: unknown }} input.turbo
 * @returns {boolean}
 */
export function shouldFetchTurbo({ choice, setupDone, followsDefault, local, turbo = {} }) {
  return (
    choice?.model === TURBO_MODEL &&
    setupDone === true &&
    followsDefault === true &&
    local === true &&
    !turbo.installed &&
    !turbo.declined &&
    !turbo.downloading &&
    !turbo.checking &&
    !turbo.failed
  );
}

/**
 * What Settings and the sidebar say about turbo, or null for nothing.
 *
 * - "downloading", "checking": whatever the setting, while it happens.
 * - "ready": turbo is the default and on disk.
 * - "failed", "declined": turbo is the default, and it did not download, or
 *   the person cancelled or deleted it.
 * - "slow": turbo is on disk, but its own time on this Mac does not fit.
 *
 * @param {object} input
 * @param {{ model: string, reason?: string }} input.choice
 * @param {boolean} input.followsDefault
 * @param {{ installed?: boolean, declined?: boolean, downloading?: unknown,
 *   checking?: boolean, failed?: unknown }} input.turbo
 * @returns {"downloading" | "checking" | "ready" | "failed" | "declined" | "slow" | null}
 */
export function turboStatus({ choice, followsDefault, turbo = {} }) {
  if (turbo.downloading) return "downloading";
  if (turbo.checking) return "checking";
  if (!followsDefault) return null;
  if (choice?.model === TURBO_MODEL) {
    if (turbo.installed) return "ready";
    if (turbo.failed) return "failed";
    if (turbo.declined) return "declined";
    return null;
  }
  if (turbo.installed && choice?.reason === "too-slow") return "slow";
  return null;
}

/**
 * This Mac's GPU against the reference Mac's, for other local models (the
 * writing model next): 1 is the M5 Pro's 16-core GPU, 0.5 half as fast.
 * Null with nothing measured.
 *
 * @param {number | null} smallClipMs
 * @returns {number | null}
 */
export function gpuSpeed(smallClipMs) {
  const small = positive(smallClipMs);
  return small ? REFERENCE.clipMs.smallEn / small : null;
}
