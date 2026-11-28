const assert = require("node:assert/strict");
const test = require("node:test");

let FEATURES, FEATURE_ROUTES_KEY, resolveFeatureRoute, changeFeatureRoute, pinWritingProvider;
let migrateFeaturePreferences, readFeaturePreferences, availableWritingProvider, processingChoice;
let setRoomsOnThisMac, roomsOnThisMac;

test.before(async () => {
  ({
    FEATURES,
    FEATURE_ROUTES_KEY,
    resolveFeatureRoute,
    changeFeatureRoute,
    pinWritingProvider,
    migrateFeaturePreferences,
    readFeaturePreferences,
    availableWritingProvider,
    processingChoice,
    setRoomsOnThisMac,
    roomsOnThisMac,
  } = await import("../../src/helpers/featureRoutes.mjs"));
});

test("a new cloud writing choice uses a working key and respects a usable pin", () => {
  assert.equal(availableWritingProvider(null, {}), null);
  assert.equal(availableWritingProvider(null, { openai: "ok" }), "openai");
  assert.equal(availableWritingProvider(null, { anthropic: "ok" }), "anthropic");
  assert.equal(availableWritingProvider(null, { openai: "ok", anthropic: "ok" }), "openai");
  assert.equal(
    availableWritingProvider("anthropic", { openai: "ok", anthropic: "ok" }),
    "anthropic"
  );
  for (const refused of ["rejected", "no-access", "unknown"]) {
    assert.equal(
      availableWritingProvider("openai", { openai: refused, anthropic: "ok" }),
      "anthropic"
    );
    assert.equal(availableWritingProvider("openai", { openai: refused }), null);
  }
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

// Alex, 2026-11-22: On this Mac and With an API key put every feature on that
// route, so Settings' "Mixed" card closes.
test("the processing choice puts every feature on its route", () => {
  const initial = changeFeatureRoute(readFeaturePreferences(null), "local");
  const custom = changeFeatureRoute(initial, "providers", "dictation");
  assert.deepEqual(custom.exceptions, { dictation: "providers" });
  assert.equal(processingChoice(custom), "mixed");
  const local = changeFeatureRoute(custom, "local");
  assert.deepEqual(local.exceptions, {});
  assert.equal(processingChoice(local), "local");
  for (const feature of FEATURES) {
    assert.equal(resolveFeatureRoute(local, feature).requested, "local");
    assert.equal(resolveFeatureRoute(local, feature).downloadAuthorized, true);
  }
  const cloud = changeFeatureRoute(custom, "providers");
  assert.deepEqual(cloud.exceptions, {});
  assert.equal(processingChoice(cloud), "providers");
  assert.equal(resolveFeatureRoute(cloud, "conversations").downloadAuthorized, false);
  assert.equal(resolveFeatureRoute(cloud, "dictation").exception, null);
  const back = changeFeatureRoute(changeFeatureRoute(cloud, "local", "writing"), "providers");
  assert.deepEqual(back.exceptions, {});
  assert.equal(resolveFeatureRoute(back, "writing").downloadAuthorized, false);
  assert.deepEqual(custom.exceptions, { dictation: "providers" });
});

test("a feature's route that brings every feature to one route becomes the default", () => {
  let preferences = changeFeatureRoute(readFeaturePreferences(null), "local");
  preferences = changeFeatureRoute(preferences, "providers", "conversations");
  preferences = changeFeatureRoute(preferences, "providers", "dictation");
  assert.deepEqual(preferences.exceptions, { conversations: "providers", dictation: "providers" });
  assert.equal(processingChoice(preferences), "mixed");
  preferences = changeFeatureRoute(preferences, "providers", "writing");
  assert.equal(preferences.defaultRoute, "providers");
  assert.deepEqual(preferences.exceptions, {});
  assert.equal(processingChoice(preferences), "providers");
  for (const feature of FEATURES) {
    assert.equal(resolveFeatureRoute(preferences, feature).downloadAuthorized, false);
  }
  // One feature back on this Mac is a mix again, with consent for it alone.
  preferences = changeFeatureRoute(preferences, "local", "writing");
  assert.deepEqual(preferences.exceptions, { writing: "local" });
  assert.equal(processingChoice(preferences), "mixed");
  for (const feature of FEATURES) {
    assert.equal(
      resolveFeatureRoute(preferences, feature).downloadAuthorized,
      feature === "writing"
    );
  }
  // Stored preferences whose exceptions all agree still show that route.
  assert.equal(
    processingChoice({
      defaultRoute: "local",
      exceptions: { conversations: "providers", dictation: "providers", writing: "providers" },
      consent: {},
      writingProvider: null,
    }),
    "providers"
  );
});

test("choosing the app default on a feature row removes its exception", () => {
  for (const [defaultRoute, other] of [
    ["local", "providers"],
    ["providers", "local"],
  ]) {
    const initial = changeFeatureRoute(readFeaturePreferences(null), defaultRoute);
    const changed = changeFeatureRoute(initial, other, "dictation");
    const restored = changeFeatureRoute(changed, defaultRoute, "dictation");
    assert.deepEqual(restored.exceptions, {});
    assert.equal(resolveFeatureRoute(restored, "dictation").requested, defaultRoute);
  }
});

test("keeping a feature local clears a missing-key exception and remains local when a key arrives", () => {
  const local = changeFeatureRoute(readFeaturePreferences(null), "local");
  const pending = changeFeatureRoute(local, "providers", "dictation");
  assert.equal(resolveFeatureRoute(pending, "dictation").needsKey, true);
  const kept = changeFeatureRoute(pending, null, "dictation");
  assert.deepEqual(kept.exceptions, {});
  assert.equal(resolveFeatureRoute(kept, "dictation", { openai: "ok" }).effective, "local");

  const cloud = changeFeatureRoute(local, "providers");
  const overridden = changeFeatureRoute(cloud, "local", "dictation");
  assert.deepEqual(overridden.exceptions, { dictation: "local" });
  assert.equal(resolveFeatureRoute(overridden, "dictation", { openai: "ok" }).effective, "local");
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
  assert.equal(resolveFeatureRoute(switched, "conversations").exception, null);
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

test("reading old preferences drops redundant exceptions without granting download consent", () => {
  const stored = profile({
    [FEATURE_ROUTES_KEY]: JSON.stringify({
      defaultRoute: "local",
      exceptions: { dictation: "local", conversations: "providers" },
      consent: {},
    }),
  });
  const preferences = readFeaturePreferences(stored);
  assert.deepEqual(preferences.exceptions, { conversations: "providers" });
  assert.equal(resolveFeatureRoute(preferences, "dictation").downloadAuthorized, false);
});

// Alex, 2026-11-27: the API-key route keeps its default (a room streams to
// OpenAI), and a Mac that runs Parakeet Ultra is offered it for rooms. The
// choice is kept only while Conversations ask for the key route.
test("rooms stay on this Mac only by choice, and only while Conversations use a key", () => {
  const key = changeFeatureRoute(readFeaturePreferences(null), "providers");
  assert.equal(roomsOnThisMac(key), false);
  assert.equal("roomsLocal" in key, false);
  const rooms = setRoomsOnThisMac(key, true);
  assert.equal(roomsOnThisMac(rooms), true);
  assert.equal(setRoomsOnThisMac(rooms, true), rooms);
  // It routes nothing else: every feature still asks for the key, and the
  // processing choice still says so.
  for (const feature of FEATURES) {
    assert.equal(resolveFeatureRoute(rooms, feature).requested, "providers");
    assert.equal(resolveFeatureRoute(rooms, feature).downloadAuthorized, false);
  }
  assert.equal(processingChoice(rooms), "providers");
  // Off again, the preferences read as before it.
  assert.deepEqual(setRoomsOnThisMac(rooms, false), key);
  // On this Mac there is nothing to choose: every room is here already.
  const local = changeFeatureRoute(readFeaturePreferences(null), "local");
  assert.equal(setRoomsOnThisMac(local, true), local);
  const conversationsHere = changeFeatureRoute(key, "local", "conversations");
  assert.equal(setRoomsOnThisMac(conversationsHere, true), conversationsHere);
});

test("moving Conversations to this Mac ends rooms on this Mac; other moves keep it", () => {
  const rooms = setRoomsOnThisMac(
    changeFeatureRoute(readFeaturePreferences(null), "providers"),
    true
  );
  for (const feature of ["dictation", "writing"]) {
    assert.equal(roomsOnThisMac(changeFeatureRoute(rooms, "local", feature)), true);
  }
  // The processing choice already on the key changes nothing.
  assert.equal(roomsOnThisMac(changeFeatureRoute(rooms, "providers")), true);
  for (const moved of [
    changeFeatureRoute(rooms, "local", "conversations"),
    changeFeatureRoute(rooms, "local"),
  ]) {
    assert.equal(roomsOnThisMac(moved), false);
    assert.equal("roomsLocal" in moved, false);
    // Back on the key, rooms go with it until chosen again.
    assert.equal(roomsOnThisMac(changeFeatureRoute(moved, "providers")), false);
  }
});

test("rooms on this Mac is read back only as true, and only on the key route", () => {
  const saved = (value) =>
    profile({
      [FEATURE_ROUTES_KEY]: JSON.stringify({
        defaultRoute: "providers",
        exceptions: {},
        consent: {},
        writingProvider: "openai",
        ...value,
      }),
    });
  assert.equal(roomsOnThisMac(readFeaturePreferences(saved({ roomsLocal: true }))), true);
  for (const value of [{}, { roomsLocal: "true" }, { roomsLocal: 1 }, { roomsLocal: false }]) {
    const preferences = readFeaturePreferences(saved(value));
    assert.equal(roomsOnThisMac(preferences), false);
    assert.equal("roomsLocal" in preferences, false);
  }
  const conversationsHere = readFeaturePreferences(
    saved({ roomsLocal: true, exceptions: { conversations: "local" } })
  );
  assert.equal("roomsLocal" in conversationsHere, false);
  assert.deepEqual(conversationsHere.exceptions, { conversations: "local" });
});
