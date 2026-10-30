const test = require("node:test");
const assert = require("node:assert/strict");

// The rule that picks the writing model a setting nobody changed uses
// (src/helpers/writingTier.mjs): the local model this Mac's memory holds, each
// provider's most accurate model for summaries, the rule that a model the
// person chose is never moved, and when Oats fetches the local model by itself.

const registry = require("../../src/models/modelRegistryData.json");

let tier;
test.before(async () => {
  tier = await import("../../src/helpers/writingTier.mjs");
});

const GIB = 1024 ** 3;

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

const localModel = (id) =>
  registry.localProviders.flatMap((provider) => provider.models).find((model) => model.id === id);

test("the two local models are Gemma 4 E4B and Qwen3.5 4B, both in the registry", () => {
  assert.equal(tier.LARGE_WRITING_MODEL, "gemma-4-e4b-it-q4_k_m");
  assert.equal(tier.SMALL_WRITING_MODEL, "qwen3.5-4b-q4_k_m");
  assert.equal(localModel(tier.LARGE_WRITING_MODEL)?.name, "Gemma 4 E4B");
  assert.equal(localModel(tier.SMALL_WRITING_MODEL)?.name, "Qwen3.5 4B");
  // The sizes setup and Settings name.
  assert.equal(localModel(tier.LARGE_WRITING_MODEL).size, "5.4GB");
  assert.equal(localModel(tier.SMALL_WRITING_MODEL).size, "2.7GB");
});

test("16 GB or more gets Gemma 4 E4B; under 16 GB, Qwen3.5 4B", () => {
  const choose = (memoryBytes) => tier.chooseLocalWritingModel({ memoryBytes });
  assert.deepEqual(choose(48 * GIB), { model: tier.LARGE_WRITING_MODEL, reason: "fits" });
  // A 16 GB Mac reports exactly 16 GiB.
  assert.deepEqual(choose(16 * GIB), { model: tier.LARGE_WRITING_MODEL, reason: "fits" });
  assert.deepEqual(choose(16 * GIB - 1), { model: tier.SMALL_WRITING_MODEL, reason: "memory" });
  assert.deepEqual(choose(8 * GIB), { model: tier.SMALL_WRITING_MODEL, reason: "memory" });
});

test("memory not read yet is the small model, and is said to be unknown", () => {
  for (const memoryBytes of [null, undefined, 0, -1, Number.NaN]) {
    assert.deepEqual(tier.chooseLocalWritingModel({ memoryBytes }), {
      model: tier.SMALL_WRITING_MODEL,
      reason: "unknown",
    });
  }
});

test("a small model already on disk stands in until the large one is there", () => {
  const large = 48 * GIB;
  assert.deepEqual(
    tier.defaultLocalWritingModel({ memoryBytes: large, installed: [tier.SMALL_WRITING_MODEL] }),
    { model: tier.SMALL_WRITING_MODEL, reason: "installed" }
  );
  assert.deepEqual(
    tier.defaultLocalWritingModel({
      memoryBytes: large,
      installed: [tier.SMALL_WRITING_MODEL, tier.LARGE_WRITING_MODEL],
    }),
    { model: tier.LARGE_WRITING_MODEL, reason: "fits" }
  );
  assert.deepEqual(tier.defaultLocalWritingModel({ memoryBytes: large, installed: [] }), {
    model: tier.LARGE_WRITING_MODEL,
    reason: "fits",
  });
  // Never the other way round: under 16 GB the large one is too much.
  assert.deepEqual(
    tier.defaultLocalWritingModel({ memoryBytes: 8 * GIB, installed: [tier.LARGE_WRITING_MODEL] }),
    { model: tier.SMALL_WRITING_MODEL, reason: "memory" }
  );
});

test("with API keys: OpenAI's gpt-6.1-sol, Anthropic's Claude Opus 5.5 when it is the only key", () => {
  const providers = (keys) => tier.defaultWritingModel({ mode: "providers", ...keys });
  assert.deepEqual(providers({ openaiKey: true }), {
    provider: "openai",
    model: "gpt-6.1-sol",
    reason: "openai",
  });
  assert.deepEqual(providers({ anthropicKey: true }), {
    provider: "anthropic",
    model: "claude-opus-5-5",
    reason: "anthropic",
  });
  // Both keys: OpenAI, whose key also transcribes a conversation.
  assert.equal(providers({ openaiKey: true, anthropicKey: true }).provider, "openai");
  // No key: OpenAI's, waiting for one.
  assert.deepEqual(providers({}), { provider: "openai", model: "gpt-6.1-sol", reason: "no-key" });
});

test("each cloud default is in the registry, first in its provider's list", () => {
  for (const [provider, model] of Object.entries(tier.CLOUD_WRITING_MODELS)) {
    const list = registry.cloudProviders.find((item) => item.id === provider).models;
    assert.equal(list[0].id, model, `${model} is first for ${provider}`);
  }
});

test("on this Mac the default is a local model; a server of the person's own has none", () => {
  const local = tier.defaultWritingModel({ mode: "local", memoryBytes: 32 * GIB });
  assert.equal(local.provider, "local");
  assert.ok(localModel(local.model), "a model from the local registry");
  assert.equal(tier.defaultWritingModel({ mode: "self-hosted" }), null);
});

test("a stored model is a choice; nothing stored, or nothing at all, follows the default", () => {
  assert.equal(tier.followsDefaultWritingModel(null), true);
  assert.equal(tier.followsDefaultWritingModel(memoryStorage()), true);
  assert.equal(tier.followsDefaultWritingModel(memoryStorage({ cleanupModel: "" })), true);
  assert.equal(tier.followsDefaultWritingModel(memoryStorage({ cleanupModel: "  " })), true);
  assert.equal(
    tier.followsDefaultWritingModel(memoryStorage({ cleanupModel: "qwen3.5-9b-q4_k_m" })),
    false
  );
});

test("the defaults earlier versions stored by themselves are forgotten once; choices stay", () => {
  const migrate = (entries) => {
    const storage = memoryStorage(entries);
    const forgot = tier.migrateStoredWritingModel(storage);
    return { forgot, storage };
  };
  // The switch to "On this Mac" stored Qwen3.5 4B under "local".
  let run = migrate({
    cleanupMode: "local",
    cleanupProvider: "local",
    cleanupModel: "qwen3.5-4b-q4_k_m",
  });
  assert.equal(run.forgot, true);
  assert.equal(run.storage.getItem("cleanupModel"), null);
  assert.equal(run.storage.getItem("cleanupProvider"), null);
  assert.equal(run.storage.getItem(tier.WRITING_MIGRATION_KEY), "1");
  // The same model picked in the old picker was stored under its family.
  run = migrate({
    cleanupMode: "local",
    cleanupProvider: "qwen",
    cleanupModel: "qwen3.5-4b-q4_k_m",
  });
  assert.equal(run.forgot, false);
  assert.equal(run.storage.getItem("cleanupModel"), "qwen3.5-4b-q4_k_m");
  // The switch to the providers stored gpt-5.6-terra under OpenAI through
  // 0.1.0, and gpt-6.1-sol after #144.
  for (const model of ["gpt-5.6-terra", "gpt-6.1-sol"]) {
    run = migrate({ cleanupMode: "providers", cleanupProvider: "openai", cleanupModel: model });
    assert.equal(run.forgot, true, model);
    assert.equal(run.storage.getItem("cleanupModel"), null);
  }
  // Choices are kept as they are, also a provider's first model, which 0.1.0's
  // editor stored when the person picked that provider.
  for (const entries of [
    { cleanupMode: "providers", cleanupProvider: "openai", cleanupModel: "gpt-5.6-sol" },
    { cleanupMode: "providers", cleanupProvider: "anthropic", cleanupModel: "claude-fable-5" },
    { cleanupMode: "providers", cleanupProvider: "anthropic", cleanupModel: "claude-opus-5-5" },
    { cleanupMode: "providers", cleanupProvider: "custom", cleanupModel: "gpt-5.6-terra" },
    { cleanupMode: "local", cleanupProvider: "local", cleanupModel: "qwen3.5-9b-q4_k_m" },
  ]) {
    assert.equal(migrate(entries).forgot, false, JSON.stringify(entries));
  }
  // The empty model the old screen stored is no choice either.
  run = migrate({ cleanupMode: "local", cleanupProvider: "gemma", cleanupModel: "" });
  assert.equal(run.forgot, true);
  // Once only.
  run = migrate({
    cleanupMode: "local",
    cleanupProvider: "local",
    cleanupModel: "qwen3.5-4b-q4_k_m",
    [tier.WRITING_MIGRATION_KEY]: "1",
  });
  assert.equal(run.forgot, false);
  assert.equal(run.storage.getItem("cleanupModel"), "qwen3.5-4b-q4_k_m");
});

test("a local model's state comes from main's report", () => {
  const id = tier.LARGE_WRITING_MODEL;
  assert.equal(tier.localWritingStatus(id, {}), "missing");
  assert.equal(tier.localWritingStatus(id, { installed: [id] }), "ready");
  assert.equal(tier.localWritingStatus(id, { downloading: { modelId: id } }), "downloading");
  assert.equal(tier.localWritingStatus(id, { failed: { modelId: id } }), "failed");
  assert.equal(tier.localWritingStatus(id, { declined: [id] }), "declined");
  // After a deleted writing model, none is fetched by itself.
  assert.equal(tier.localWritingStatus(id, { autoDeclined: true }), "declined");
  assert.equal(tier.localWritingStatus(id, { autoDeclined: true, installed: [id] }), "ready");
  // Another model's download or failure says nothing of this one.
  assert.equal(
    tier.localWritingStatus(id, {
      downloading: { modelId: "other" },
      failed: { modelId: "other" },
    }),
    "missing"
  );
});

test("Oats fetches the local model only after setup, following the default, when none is ready", () => {
  const choice = { model: tier.LARGE_WRITING_MODEL, reason: "fits" };
  const base = { choice, setupDone: true, followsDefault: true, local: true, writing: {} };
  assert.equal(tier.shouldFetchWritingModel(base), true);
  for (const [field, value] of [
    ["setupDone", false],
    ["followsDefault", false],
    ["local", false],
    ["recording", true],
  ]) {
    assert.equal(tier.shouldFetchWritingModel({ ...base, [field]: value }), false, field);
  }
  // Not before this Mac's memory is known, or the small model would be fetched for a large Mac.
  assert.equal(
    tier.shouldFetchWritingModel({
      ...base,
      choice: { model: tier.SMALL_WRITING_MODEL, reason: "unknown" },
    }),
    false
  );
  for (const writing of [
    { installed: [choice.model] },
    { declined: [choice.model] },
    // Removing Qwen3.5 4B does not start Gemma 4 E4B.
    { autoDeclined: true },
    { failed: { modelId: choice.model } },
    { downloading: { modelId: choice.model } },
    { downloading: { modelId: "another-model" } },
  ]) {
    assert.equal(
      tier.shouldFetchWritingModel({ ...base, writing }),
      false,
      JSON.stringify(writing)
    );
  }
  // The small model standing in is ready: nothing is fetched by itself.
  assert.equal(
    tier.shouldFetchWritingModel({
      ...base,
      choice: { model: tier.SMALL_WRITING_MODEL, reason: "installed" },
      writing: { installed: [tier.SMALL_WRITING_MODEL] },
    }),
    false
  );
});

test("the processing switch keeps the writing choice of the side the writing is on", () => {
  const fable = { cleanupProvider: "anthropic", cleanupModel: "claude-fable-5" };
  const qwen9 = { cleanupProvider: "qwen", cleanupModel: "qwen3.5-9b-q4_k_m" };
  // "Mixed": a cloud writing model chosen, speech on this Mac. To the providers:
  // the choice stays.
  let run = tier.switchWritingSide({
    memory: { local: qwen9, providers: null },
    writingMode: "providers",
    stored: fable,
    target: "providers",
  });
  assert.deepEqual(run.restore, fable);
  assert.deepEqual(run.memory, { local: qwen9, providers: fable });
  // To this Mac: remembered for the way back, and this Mac's own choice returns.
  run = tier.switchWritingSide({
    memory: { local: qwen9, providers: null },
    writingMode: "providers",
    stored: fable,
    target: "local",
  });
  assert.deepEqual(run.restore, qwen9);
  assert.deepEqual(run.memory.providers, fable);
  // A setting that follows the default is remembered as following it.
  run = tier.switchWritingSide({
    memory: { local: qwen9, providers: fable },
    writingMode: "local",
    stored: null,
    target: "providers",
  });
  assert.equal(run.memory.local, null);
  assert.deepEqual(run.restore, fable);
  // A server of the person's own is on neither side.
  run = tier.switchWritingSide({
    memory: { local: qwen9, providers: fable },
    writingMode: "self-hosted",
    stored: { cleanupProvider: "", cleanupModel: "llama3" },
    target: "local",
  });
  assert.deepEqual(run.memory, { local: qwen9, providers: fable });
  assert.deepEqual(run.restore, qwen9);
  // Nothing remembered: follow the default.
  run = tier.switchWritingSide({
    memory: {},
    writingMode: "local",
    stored: null,
    target: "providers",
  });
  assert.equal(run.restore, null);
});

test("the notice shows once, and only for a download Oats started by itself", () => {
  const show = (input) => tier.shouldShowWritingNotice(input);
  assert.equal(show({ noticed: false, autoStarted: true, downloading: true }), true);
  assert.equal(show({ noticed: true, autoStarted: true, downloading: true }), false);
  assert.equal(show({ noticed: false, autoStarted: false, downloading: true }), false);
  assert.equal(show({ noticed: false, autoStarted: true, downloading: false }), false);
});
