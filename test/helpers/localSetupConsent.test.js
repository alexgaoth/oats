const assert = require("node:assert/strict");
const test = require("node:test");

let migrateLocalSetupAuthorization, LOCAL_SETUP_AUTHORIZED;
let setupAllowsDownloads, SETUP_PROCESSING_DONE;

test.before(async () => {
  ({
    migrateLocalSetupAuthorization,
    LOCAL_SETUP_AUTHORIZED,
    setupAllowsDownloads,
    SETUP_PROCESSING_DONE,
  } = await import("../../src/helpers/localSetupConsent.mjs"));
});

function profile(mode, complete = true) {
  const data = new Map([
    ["onboardingCompleted", String(complete)],
    ["transcriptionMode", mode],
    ["meetingTranscriptionMode", mode],
    ["cleanupMode", mode],
    // With only Anthropic, 0.3.0 stored local speech even in providers mode.
    ["meetingUseLocalWhisper", "true"],
  ]);
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("0.3.0 local setup keeps download authorization, but a key setup does not gain it", () => {
  const local = profile("local");
  assert.equal(migrateLocalSetupAuthorization(local), true);
  assert.equal(local.getItem(LOCAL_SETUP_AUTHORIZED), "true");

  const providers = profile("providers");
  assert.equal(migrateLocalSetupAuthorization(providers), false);
  assert.equal(providers.getItem(LOCAL_SETUP_AUTHORIZED), null);
});

test("the migration does not authorize unfinished or mixed setup, or run twice", () => {
  const unfinished = profile("local", false);
  assert.equal(migrateLocalSetupAuthorization(unfinished), false);
  unfinished.setItem("onboardingCompleted", "true");
  assert.equal(migrateLocalSetupAuthorization(unfinished), false);
  assert.equal(unfinished.getItem(LOCAL_SETUP_AUTHORIZED), null);

  const mixed = profile("local");
  mixed.setItem("cleanupMode", "providers");
  assert.equal(migrateLocalSetupAuthorization(mixed), false);
  assert.equal(mixed.getItem(LOCAL_SETUP_AUTHORIZED), null);

  const explicit = profile("local");
  explicit.setItem(LOCAL_SETUP_AUTHORIZED, "false");
  assert.equal(migrateLocalSetupAuthorization(explicit), false);
  assert.equal(explicit.getItem(LOCAL_SETUP_AUTHORIZED), "false");
});

// Alex, 2026-11-22: setup's "Where Oats thinks" names the downloads, so its
// Continue lets them start, and "Your models" shows them coming.
test("downloads may start once setup's processing step is continued, or setup is done", () => {
  const fresh = profile("local", false);
  assert.equal(setupAllowsDownloads(fresh), false);
  fresh.setItem(SETUP_PROCESSING_DONE, "true");
  assert.equal(setupAllowsDownloads(fresh), true);
  assert.equal(setupAllowsDownloads(profile("local", true)), true);
  assert.equal(setupAllowsDownloads(null), false);
});
