const assert = require("node:assert/strict");
const test = require("node:test");

let planLocalSetup, localUpgradeHint;
test.before(async () => {
  ({ planLocalSetup, localUpgradeHint } = await import("../../src/helpers/localSetup.mjs"));
});

const GIB = 1024 ** 3;
const GEMMA = "gemma-4-e4b-it-q4_k_m";
const QWEN = "qwen3.5-4b-q4_k_m";
const TURBO = "turbo-q5";
const ULTRA = "parakeet-ultra-ane";
const mac = (gb, options = {}) => ({
  platform: "darwin",
  arch: "arm64",
  macosVersion: "14.0",
  memoryBytes: gb * GIB,
  smallClipMs: 160,
  ...options,
});

for (const os of ["13.6", "14.0", "26.1"]) {
  test(`Intel on macOS ${os} keeps Whisper Base, even with Turbo installed`, () => {
    const plan = planLocalSetup({
      device: mac(16, { arch: "x64", macosVersion: os }),
      installed: { whisper: [TURBO], parakeet: [ULTRA] },
      parakeetRoomDefault: true,
      processing: "local",
    });
    assert.deepEqual(plan.speech, { engine: "whisper", model: "base.en" });
    assert.deepEqual(plan.downloads, { speech: null, writing: GEMMA });
  });

  for (const gb of [8, 16, 24, 32, 48, 64]) {
    test(`Apple Silicon with ${gb} GB on macOS ${os} uses the measured default`, () => {
      const device = mac(gb, { macosVersion: os });
      const fast = planLocalSetup({ device, processing: "local" });
      const slow = planLocalSetup({ device: { ...device, smallClipMs: 250 }, processing: "local" });
      assert.equal(fast.speech.engine, os === "13.6" ? "whisper" : "parakeet");
      assert.equal(fast.speech.model, os === "13.6" ? (gb === 8 ? "small.en" : TURBO) : ULTRA);
      assert.equal(slow.speech.model, os === "13.6" ? "small.en" : ULTRA);
      assert.equal(fast.downloads.writing, gb === 8 ? QWEN : GEMMA);
      assert.equal(fast.readySpeech.model, "small.en", "bundled Whisper is the fallback");
    });
  }
}

test("an installed recommendation needs no download", () => {
  const plan = planLocalSetup({
    device: mac(24),
    installed: { whisper: [TURBO], writing: [GEMMA], parakeet: [ULTRA] },
    processing: "local",
  });
  assert.deepEqual(plan.downloads, { speech: null, writing: null });
  assert.equal(plan.whisper.setting, TURBO);
  assert.equal(plan.writing.choice.model, GEMMA);
});

test("a usable installed writer is kept without an automatic upgrade", () => {
  const plan = planLocalSetup({
    device: mac(24, { smallClipMs: 250 }),
    installed: { writing: [QWEN], parakeet: [ULTRA] },
    processing: "local",
  });
  assert.deepEqual(plan.downloads, { speech: null, writing: null });
  assert.equal(plan.writing.choice.model, QWEN);
  assert.equal(plan.writing.recommended.model, GEMMA);
});

test("a key configures local speech without authorizing downloads", () => {
  for (const openaiKey of [false, true]) {
    const plan = planLocalSetup({
      device: mac(32),
      installed: { whisper: [TURBO] },
      processing: "providers",
      openaiKey,
    });
    assert.equal(plan.routes.speech, openaiKey ? "providers" : "local");
    assert.equal(plan.routes.writing, "providers");
    assert.equal(plan.whisper.setting, TURBO);
    assert.equal(plan.speech.engine, openaiKey ? "whisper" : "parakeet");
    assert.deepEqual(plan.downloads, { speech: null, writing: null });
  }
  assert.deepEqual(planLocalSetup({ device: mac(32) }).downloads, { speech: null, writing: null });
});

test("the actual Turbo check wins and a removed file cannot leave behind a slow result", () => {
  const device = mac(24, { turboClipMs: 1_100 });
  assert.equal(
    planLocalSetup({ device, installed: { whisper: [TURBO] } }).speech.model,
    "small.en"
  );
  assert.equal(planLocalSetup({ device }).speech.model, TURBO);
});

test("language detection retains its speed cost and never uses an English-only file", () => {
  const plan = planLocalSetup({
    device: mac(48),
    language: "auto",
    parakeetRoomDefault: true,
    processing: "local",
  });
  assert.deepEqual(plan.speech, { engine: "whisper", model: "base" });
  assert.equal(plan.downloads.speech, null);
});

test("an installed Parakeet model is ready unless the default is disabled", () => {
  const options = {
    device: mac(8),
    installed: { parakeet: [ULTRA], writing: [QWEN] },
    processing: "local",
  };
  assert.equal(
    planLocalSetup({ ...options, parakeetRoomDefault: false }).readySpeech.model,
    "small.en"
  );
  const plan = planLocalSetup(options);
  assert.equal(plan.readySpeech.model, ULTRA);
  assert.deepEqual(plan.downloads, { speech: null, writing: null });
});

test("a first in-room recording uses bundled Whisper if Parakeet is missing, even with Turbo installed", () => {
  const plan = planLocalSetup({
    device: mac(48),
    installed: { whisper: [TURBO] },
    processing: "local",
  });
  assert.deepEqual(plan.readySpeech, { engine: "whisper", model: "small.en" });
  assert.deepEqual(plan.downloads.speech, { engine: "parakeet", model: ULTRA });
  assert.equal(plan.whisper.setting, TURBO, "dictation keeps its independent model");
});

test("the hint only recommends a measured upgrade this Mac can use", () => {
  const active = { activeWhisper: "small", activeWriter: QWEN };
  const plan = (gb, options) =>
    planLocalSetup({ device: mac(gb, options), installed: { writing: [QWEN] } });
  assert.equal(localUpgradeHint({ plan: plan(8), ...active }), null);
  assert.equal(localUpgradeHint({ plan: plan(16), ...active }), "speech");
  assert.equal(localUpgradeHint({ plan: plan(16, { smallClipMs: 250 }), ...active }), "writing");
  assert.equal(localUpgradeHint({ plan: plan(16), ...active, recording: true }), null);
  assert.equal(
    localUpgradeHint({ plan: plan(16), activeWhisper: TURBO, activeWriter: GEMMA }),
    null
  );
  assert.equal(localUpgradeHint({ plan: plan(16), activeWhisper: "small", language: "de" }), null);
  assert.equal(localUpgradeHint({ plan: plan(16) }), null, "cloud does not need a local upgrade");
});

test("the English room hint recommends Parakeet over Turbo on a supported Mac", () => {
  const plan = planLocalSetup({ device: mac(8), processing: "local" });
  assert.equal(localUpgradeHint({ plan, activeWhisper: TURBO }), "speech");
  assert.equal(localUpgradeHint({ plan, activeWhisper: TURBO, recording: true }), null);
  assert.equal(localUpgradeHint({ plan, activeWhisper: null }), null);
  const unsupported = planLocalSetup({ device: mac(8), processing: "local", language: "fr" });
  assert.equal(localUpgradeHint({ plan: unsupported, activeWhisper: TURBO, language: "fr" }), null);
});
