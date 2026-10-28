const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/reasoningRouting.js");

test("byok cloud provider maps to the providers mode", async () => {
  const { deriveReasoningMode } = await load();
  assert.equal(deriveReasoningMode("byok", "openai"), "providers");
});

test("byok custom provider maps to the self-hosted mode", async () => {
  const { deriveReasoningMode } = await load();
  assert.equal(deriveReasoningMode("byok", "custom"), "self-hosted");
});

test("local mode maps to local", async () => {
  const { deriveReasoningMode } = await load();
  assert.equal(deriveReasoningMode("local", "openai"), "local");
});

test("fan-out routes provider, model and mode to all four scopes", async () => {
  const { buildReasoningScopePatches } = await load();
  const patches = buildReasoningScopePatches(
    {
      useCleanupModel: true,
      cleanupProvider: "openai",
      cleanupModel: "gpt-4o-mini",
      cleanupCloudMode: "byok",
    },
    "providers"
  );
  const { dictationCleanup, noteFormatting, dictationAgent, dictationTranslation } = patches;

  assert.deepEqual(Object.keys(patches).sort(), [
    "dictationAgent",
    "dictationCleanup",
    "dictationTranslation",
    "noteFormatting",
  ]);
  assert.equal(dictationCleanup.cleanupProvider, "openai");
  assert.equal(dictationCleanup.cleanupModel, "gpt-4o-mini");
  assert.equal(dictationCleanup.cleanupMode, "providers");

  for (const scope of [noteFormatting, dictationAgent, dictationTranslation]) {
    assert.equal(scope.provider, "openai");
    assert.equal(scope.model, "gpt-4o-mini");
    assert.equal(scope.cloudMode, "byok");
    assert.equal(scope.mode, "providers");
  }
});

test("fan-out with partial settings only mirrors the provided routing fields", async () => {
  const { buildReasoningScopePatches } = await load();
  const { dictationCleanup, noteFormatting, dictationAgent, dictationTranslation } =
    buildReasoningScopePatches({ useCleanupModel: true }, "local");

  assert.equal(dictationCleanup.useCleanupModel, true);
  assert.equal(dictationCleanup.cleanupMode, "local");
  assert.equal("cleanupProvider" in dictationCleanup, false);

  for (const scope of [noteFormatting, dictationAgent, dictationTranslation]) {
    assert.equal(scope.mode, "local");
    assert.equal("provider" in scope, false);
    assert.equal("model" in scope, false);
    assert.equal("cloudMode" in scope, false);
  }
});
