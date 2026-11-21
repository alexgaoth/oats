const assert = require("node:assert/strict");
const test = require("node:test");

let FEATURES, FEATURE_ROUTES_KEY, resolveFeatureRoute, changeFeatureRoute, pinWritingProvider;
let migrateFeaturePreferences, readFeaturePreferences;

test.before(async () => {
  ({
    FEATURES,
    FEATURE_ROUTES_KEY,
    resolveFeatureRoute,
    changeFeatureRoute,
    pinWritingProvider,
    migrateFeaturePreferences,
    readFeaturePreferences,
  } = await import("../../src/helpers/featureRoutes.mjs"));
});

function profile(settings = {}) {
  const data = new Map(Object.entries(settings));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("each feature resolves only its own exception or the default and its own provider's key", () => {
  const choices = [null, "local", "providers"];
  const statuses = [undefined, "ok", "limited", "legacy", "rejected", "no-access", "unknown"];
  for (const defaultRoute of ["local", "providers"]) {
    for (const conversations of choices) {
      for (const dictation of choices) {
        for (const writing of choices) {
          for (const writingProvider of ["openai", "anthropic"]) {
            for (const openai of statuses) {
              for (const anthropic of statuses) {
                const exceptions = { conversations, dictation, writing };
                const consent = { conversations: true, dictation: true, writing: true };
                const preferences = { defaultRoute, exceptions, consent, writingProvider };
                const keys = { openai, anthropic };
                for (const feature of FEATURES) {
                  const requested = exceptions[feature] || defaultRoute;
                  const provider = feature === "writing" ? writingProvider : "openai";
                  const needsKey =
                    requested === "providers" &&
                    !["ok", "limited", "legacy"].includes(keys[provider]);
                  assert.deepEqual(resolveFeatureRoute(preferences, feature, keys), {
                    exception: exceptions[feature],
                    requested,
                    effective: needsKey ? "local" : requested,
                    provider: requested === "providers" ? provider : null,
                    needsKey,
                    downloadAuthorized: requested === "local",
                  });
                }
              }
            }
          }
        }
      }
    }
  }
});

test("changing the app default keeps explicit exceptions, even when they match the new default", () => {
  const initial = changeFeatureRoute(readFeaturePreferences(null), "local");
  const custom = changeFeatureRoute(initial, "providers", "dictation");
  const cloud = changeFeatureRoute(custom, "providers");
  assert.deepEqual(cloud.exceptions, { dictation: "providers" });
  assert.equal(resolveFeatureRoute(cloud, "conversations").downloadAuthorized, false);
  assert.equal(resolveFeatureRoute(cloud, "dictation").exception, "providers");
  const back = changeFeatureRoute(cloud, "local");
  assert.equal(resolveFeatureRoute(back, "dictation").downloadAuthorized, false);
  assert.equal(resolveFeatureRoute(back, "writing").downloadAuthorized, true);
  const reset = changeFeatureRoute(back, null, "dictation");
  assert.deepEqual(reset.exceptions, {});
  assert.equal(resolveFeatureRoute(reset, "dictation").downloadAuthorized, true);
  assert.deepEqual(initial.exceptions, {});
});

test("a local exception authorizes only that feature, and a failed cloud key never authorizes downloads", () => {
  const initial = changeFeatureRoute(readFeaturePreferences(null), "providers");
  for (const feature of FEATURES) {
    const local = changeFeatureRoute(initial, "local", feature);
    for (const name of FEATURES) {
      assert.equal(resolveFeatureRoute(local, name).downloadAuthorized, name === feature);
    }
  }
  const local = changeFeatureRoute(initial, "local", "conversations");
  const switched = changeFeatureRoute(local, "local");
  assert.equal(resolveFeatureRoute(switched, "conversations").exception, "local");
  assert.equal(resolveFeatureRoute(switched, "conversations").downloadAuthorized, true);
});

test("adding a different key cannot replace the pinned writing provider", () => {
  const cloud = changeFeatureRoute(readFeaturePreferences(null), "providers");
  const pinned = pinWritingProvider(cloud, { anthropic: true });
  assert.equal(pinned.writingProvider, "anthropic");
  assert.equal(resolveFeatureRoute(pinned, "writing", { anthropic: "ok" }).effective, "providers");
  const after = pinWritingProvider(pinned, { openai: true });
  assert.equal(after, pinned);
  assert.deepEqual(resolveFeatureRoute(after, "writing", { openai: "ok" }), {
    exception: null,
    requested: "providers",
    effective: "local",
    provider: "anthropic",
    needsKey: true,
    downloadAuthorized: false,
  });
});

test("0.3.x local consent migrates once, and key or unfinished profiles never gain it", () => {
  for (const [mode, completed, expected] of [
    ["local", "true", true],
    ["local", "false", false],
    ["providers", "true", false],
  ]) {
    const old = profile({
      onboardingCompleted: completed,
      meetingTranscriptionMode: mode,
      transcriptionMode: mode,
      cleanupMode: mode,
      meetingUseLocalWhisper: "true",
    });
    migrateFeaturePreferences(old);
    const preferences = readFeaturePreferences(old);
    assert.equal(preferences.defaultRoute, mode);
    assert.deepEqual(preferences.exceptions, {});
    for (const feature of FEATURES) {
      assert.equal(resolveFeatureRoute(preferences, feature).downloadAuthorized, expected);
    }
    const snapshot = old.getItem(FEATURE_ROUTES_KEY);
    old.setItem("cleanupMode", "local");
    migrateFeaturePreferences(old);
    assert.equal(old.getItem(FEATURE_ROUTES_KEY), snapshot);
  }
});

test("migration preserves a mixed profile's cloud choices and an explicit lack of consent", () => {
  const old = profile({
    onboardingCompleted: "true",
    localSetupAuthorized: "false",
    meetingTranscriptionMode: "local",
    transcriptionMode: "providers",
    cleanupMode: "providers",
    cleanupProvider: "anthropic",
  });
  migrateFeaturePreferences(old);
  assert.deepEqual(readFeaturePreferences(old), {
    defaultRoute: "local",
    exceptions: { dictation: "providers", writing: "providers" },
    consent: {},
    writingProvider: "anthropic",
  });
});

test("invalid persisted route data does not enable cloud routing or downloads", () => {
  const stored = profile({ [FEATURE_ROUTES_KEY]: "{", cleanupMode: "providers" });
  assert.deepEqual(readFeaturePreferences(stored), readFeaturePreferences(null));
});
