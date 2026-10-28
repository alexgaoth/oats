const test = require("node:test");
const assert = require("node:assert/strict");

// The rule that picks the default local speech model from what this Mac
// measured (src/helpers/speechTier.mjs): every branch, the derivation of the
// budget from the busy-meeting numbers, and the rule that a model the person
// chose is never moved.

let tier;
let PARTIAL_DEFAULTS;
let migrateStoredWhisperModel;
let resolveWhisperModel;

test.before(async () => {
  tier = await import("../../src/helpers/speechTier.mjs");
  ({ PARTIAL_DEFAULTS } = await import("../../src/helpers/partialScheduler.mjs"));
  ({ migrateStoredWhisperModel } = await import("../../src/helpers/bundledWhisperModels.mjs"));
  ({ resolveWhisperModel } = await import("../../src/helpers/whisperEnglishModel.mjs"));
});

const GIB = 1024 ** 3;
const APPLE = { platform: "darwin", arch: "arm64", memoryBytes: 48 * GIB };

/** localStorage with the three calls the settings use. */
function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

/** The clip time that predicts `segmentMs` for turbo with English. */
const smallClipFor = (segmentMs) =>
  (segmentMs / tier.REFERENCE.segmentMs.turboEn) * tier.REFERENCE.clipMs.smallEn;

test("the budget comes from a busy meeting and the live line's beat", () => {
  // 14 segments a minute: one every 4.3 s. While one is open the live line
  // reads it at 1.0, 2.2 and 3.4 s, then the final reads it once more.
  assert.equal(tier.BUSY_SEGMENTS_PER_MINUTE, 14);
  assert.equal(PARTIAL_DEFAULTS.minSpeechMs, 1000);
  assert.equal(PARTIAL_DEFAULTS.intervalMs, 1200);
  assert.equal(tier.READS_PER_SEGMENT, 4);
  assert.equal(Math.round(tier.KEEP_UP_MS), 1071);
  assert.equal(tier.HEADROOM, 0.75);
  assert.equal(Math.round(tier.SEGMENT_BUDGET_MS), 804);
  assert.equal(tier.SEGMENT_BUDGET_MS, tier.KEEP_UP_MS * tier.HEADROOM);
});

test("detection costs turbo what the replay measured: 1089 against 603 ms", () => {
  assert.equal(tier.AUTO_DETECT_COST.toFixed(3), (1089 / 603).toFixed(3));
});

test("the reference Mac gets turbo for English and keeps small with detection", () => {
  const smallClipMs = tier.REFERENCE.clipMs.smallEn;
  const english = tier.chooseSpeechModel({ ...APPLE, smallClipMs, language: "en" });
  assert.equal(english.model, "turbo-q5");
  assert.equal(english.reason, "fits");
  assert.equal(Math.round(english.predictedTurboMs), 603);

  const auto = tier.chooseSpeechModel({ ...APPLE, smallClipMs, language: "auto" });
  assert.equal(auto.model, "small");
  assert.equal(auto.reason, "too-slow");
  assert.equal(Math.round(auto.predictedTurboMs), 1089);
});

test("another language than English costs turbo what English does", () => {
  const smallClipMs = tier.REFERENCE.clipMs.smallEn;
  for (const language of ["de", "fr", "ja", "en-GB"]) {
    assert.equal(
      tier.chooseSpeechModel({ ...APPLE, smallClipMs, language }).model,
      "turbo-q5",
      language
    );
  }
});

test("turbo is chosen up to the budget and not past it", () => {
  const at = tier.chooseSpeechModel({
    ...APPLE,
    smallClipMs: smallClipFor(tier.SEGMENT_BUDGET_MS),
  });
  assert.equal(at.model, "turbo-q5");
  const over = tier.chooseSpeechModel({
    ...APPLE,
    smallClipMs: smallClipFor(tier.SEGMENT_BUDGET_MS) * 1.01,
  });
  assert.equal(over.model, "small");
  assert.equal(over.reason, "too-slow");
  assert.ok(over.predictedTurboMs > over.budgetMs);
});

test("a Mac twice as slow as the reference keeps small.en", () => {
  const choice = tier.chooseSpeechModel({ ...APPLE, smallClipMs: 2 * tier.REFERENCE.clipMs.smallEn });
  assert.equal(choice.model, "small");
  assert.equal(Math.round(choice.predictedTurboMs), 1206);
});

test("Intel Macs, Linux and Windows keep the bundle's base, however fast", () => {
  for (const [platform, arch] of [
    ["darwin", "x64"],
    ["linux", "x64"],
    ["linux", "arm64"],
    ["win32", "x64"],
  ]) {
    const choice = tier.chooseSpeechModel({
      platform,
      arch,
      memoryBytes: 64 * GIB,
      smallClipMs: 10,
      turboClipMs: 10,
    });
    assert.deepEqual(
      [choice.model, choice.reason, choice.predictedTurboMs],
      ["base", "not-apple-silicon", null],
      `${platform}-${arch}`
    );
  }
});

test("Apple Silicon not measured yet keeps small", () => {
  for (const smallClipMs of [null, undefined, 0, -5, Number.NaN]) {
    const choice = tier.chooseSpeechModel({ ...APPLE, smallClipMs });
    assert.equal(choice.model, "small", String(smallClipMs));
    assert.equal(choice.reason, "not-measured");
  }
  assert.equal(tier.chooseSpeechModel().model, "base", "no input at all is not Apple Silicon");
});

test("under 16 GB keeps small, however fast the GPU", () => {
  const fast = { ...APPLE, smallClipMs: tier.REFERENCE.clipMs.smallEn / 2 };
  assert.equal(tier.chooseSpeechModel({ ...fast, memoryBytes: 8 * GIB }).reason, "memory");
  assert.equal(tier.chooseSpeechModel({ ...fast, memoryBytes: 8 * GIB }).model, "small");
  assert.equal(tier.chooseSpeechModel({ ...fast, memoryBytes: 16 * GIB }).model, "turbo-q5");
  // Memory that could not be read does not hold a fast Mac back.
  assert.equal(tier.chooseSpeechModel({ ...fast, memoryBytes: null }).model, "turbo-q5");
});

test("turbo's own time, once measured, replaces the prediction", () => {
  const smallClipMs = tier.REFERENCE.clipMs.smallEn;
  // Predicted to fit, measured too slow: small.
  const slow = tier.chooseSpeechModel({
    ...APPLE,
    smallClipMs,
    turboClipMs: tier.REFERENCE.clipMs.turboEn * 1.5,
  });
  assert.equal(slow.model, "small");
  assert.equal(Math.round(slow.predictedTurboMs), Math.round(603 * 1.5));
  // Predicted too slow, measured fast enough: turbo.
  const fast = tier.chooseSpeechModel({
    ...APPLE,
    smallClipMs: smallClipMs * 2,
    turboClipMs: tier.REFERENCE.clipMs.turboEn,
  });
  assert.equal(fast.model, "turbo-q5");
  assert.equal(Math.round(fast.predictedTurboMs), 603);
});

test("the default is turbo only once it is on disk", () => {
  const choice = { model: "turbo-q5" };
  assert.equal(tier.defaultSpeechModel({ choice, bundleModel: "small" }), "small");
  assert.equal(
    tier.defaultSpeechModel({ choice, bundleModel: "small", turboInstalled: true }),
    "turbo-q5"
  );
  assert.equal(
    tier.defaultSpeechModel({ choice: { model: "small" }, bundleModel: "small", turboInstalled: true }),
    "small"
  );
  assert.equal(tier.defaultSpeechModel({ choice: { model: "base" }, bundleModel: "base" }), "base");
  assert.equal(tier.defaultSpeechModel({ choice: null, bundleModel: "small" }), "small");
});

test("turbo is fetched after setup, for a default, on this Mac, and never twice", () => {
  const ready = {
    choice: { model: "turbo-q5" },
    setupDone: true,
    followsDefault: true,
    local: true,
    turbo: {},
  };
  assert.equal(tier.shouldFetchTurbo(ready), true);
  const without = (patch) => tier.shouldFetchTurbo({ ...ready, ...patch });
  assert.equal(without({ choice: { model: "small" } }), false, "the Mac does not qualify");
  assert.equal(without({ setupDone: false }), false, "setup is not done");
  assert.equal(without({ followsDefault: false }), false, "the person chose a model");
  assert.equal(without({ local: false }), false, "speech runs elsewhere");
  assert.equal(without({ turbo: { installed: true } }), false, "already on disk");
  assert.equal(without({ turbo: { declined: true } }), false, "cancelled or deleted");
  assert.equal(without({ turbo: { downloading: { receivedBytes: 1 } } }), false, "under way");
  assert.equal(without({ turbo: { checking: true } }), false, "being checked");
  assert.equal(without({ turbo: { failed: "HTTP 503" } }), false, "Settings retries");
});

test("what Settings and the sidebar say about turbo", () => {
  const turboChoice = { model: "turbo-q5", reason: "fits" };
  const status = (choice, followsDefault, turbo) =>
    tier.turboStatus({ choice, followsDefault, turbo });
  assert.equal(status(turboChoice, true, { downloading: { receivedBytes: 1 } }), "downloading");
  // A download or a check shows whatever the setting is, so it can be stopped.
  assert.equal(status(turboChoice, false, { downloading: { receivedBytes: 1 } }), "downloading");
  assert.equal(status(turboChoice, true, { checking: true }), "checking");
  assert.equal(status(turboChoice, true, { installed: true }), "ready");
  assert.equal(status(turboChoice, true, { failed: "HTTP 503" }), "failed");
  assert.equal(status(turboChoice, true, { declined: true }), "declined");
  assert.equal(status(turboChoice, true, {}), null, "about to start");
  assert.equal(status(turboChoice, false, { installed: true }), null, "a chosen model");
  const slow = { model: "small", reason: "too-slow" };
  assert.equal(status(slow, true, { installed: true }), "slow");
  assert.equal(status(slow, true, {}), null);
  assert.equal(status({ model: "small", reason: "memory" }, true, { installed: true }), null);
  assert.equal(status({ model: "base", reason: "not-apple-silicon" }, true, {}), null);
});

test("a stored model is the person's choice and is kept; nothing stored follows the default", () => {
  const empty = memoryStorage();
  assert.equal(tier.followsDefaultModel(empty), true);
  assert.equal(tier.settingWhisperModel(empty, "small"), "small");
  assert.equal(tier.settingWhisperModel(empty, "turbo-q5"), "turbo-q5");

  for (const chosen of ["small", "base", "medium", "turbo", "turbo-q5"]) {
    const storage = memoryStorage({ whisperModel: chosen });
    assert.equal(tier.followsDefaultModel(storage), false, chosen);
    assert.equal(tier.settingWhisperModel(storage, "turbo-q5"), chosen, chosen);
    assert.equal(tier.settingWhisperModel(storage, "small"), chosen, chosen);
  }
  // No storage at all (the main process, tests): the default.
  assert.equal(tier.followsDefaultModel(null), true);
  assert.equal(tier.settingWhisperModel(null, "small"), "small");
});

test("the migration: an install on the old default moves to turbo once it is ready", () => {
  const smallClipMs = tier.REFERENCE.clipMs.smallEn;
  const choice = tier.chooseSpeechModel({ ...APPLE, smallClipMs, language: "en" });
  const now = (storage, turboInstalled) =>
    tier.settingWhisperModel(
      storage,
      tier.defaultSpeechModel({ choice, bundleModel: "small", turboInstalled })
    );

  // A new install, or one that never chose: small.en until turbo is on disk.
  const fresh = memoryStorage();
  assert.equal(now(fresh, false), "small");
  assert.equal(now(fresh, true), "turbo-q5");
  assert.equal(fresh.values.size, 0, "nothing is written: the setting keeps following");

  // A "base" from before 2026-10-26, which the picker saved by itself, goes
  // once (bundledWhisperModels.mjs), so that install follows the default too.
  const old = memoryStorage({ whisperModel: "base" });
  migrateStoredWhisperModel(old, "small");
  assert.equal(now(old, true), "turbo-q5");

  // A "base" chosen after that migration stays.
  const chosen = memoryStorage({ whisperModel: "base", _whisperModelDefaultMigrated: "1" });
  migrateStoredWhisperModel(chosen, "small");
  assert.equal(now(chosen, true), "base");

  // So does "small" chosen in the picker, on a Mac that qualifies.
  assert.equal(now(memoryStorage({ whisperModel: "small" }), true), "small");
});

test("turbo that is not on disk loads small.en for English, base for other languages", () => {
  const installed = new Set(["small.en", "base"]);
  const isInstalled = (id) => installed.has(id);
  assert.equal(resolveWhisperModel("turbo-q5", "en", isInstalled, ["small"]), "small.en");
  assert.equal(resolveWhisperModel("turbo-q5", "de", isInstalled, ["small"]), "base");
  assert.equal(resolveWhisperModel("turbo-q5", null, isInstalled, ["small"]), "base");
  installed.add("turbo-q5");
  assert.equal(resolveWhisperModel("turbo-q5", "en", isInstalled, ["small"]), "turbo-q5");
  assert.equal(resolveWhisperModel("turbo-q5", "de", isInstalled, ["small"]), "turbo-q5");
  // Without the fallback the ladder ends at base, as it always did.
  installed.delete("turbo-q5");
  assert.equal(resolveWhisperModel("turbo-q5", "en", isInstalled), "base");
});

test("this Mac's GPU against the reference, for the next local model", () => {
  assert.equal(tier.gpuSpeed(tier.REFERENCE.clipMs.smallEn), 1);
  assert.equal(tier.gpuSpeed(tier.REFERENCE.clipMs.smallEn * 2), 0.5);
  assert.equal(tier.gpuSpeed(null), null);
  assert.equal(tier.gpuSpeed(0), null);
});
