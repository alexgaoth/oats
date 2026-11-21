const assert = require("node:assert/strict");
const test = require("node:test");

let migrateRoomSpeechDefault, followsRoomSpeechDefault, ROOM_SPEECH_PREFERENCE;
test.before(async () => {
  ({ migrateRoomSpeechDefault, followsRoomSpeechDefault, ROOM_SPEECH_PREFERENCE } =
    await import("../../src/helpers/roomSpeechPreference.mjs"));
});

function profile(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("new installs and legacy default followers can use the room recommendation", () => {
  for (const entries of [
    {},
    { onboardingCompleted: "true", localTranscriptionProvider: "whisper" },
  ]) {
    const store = profile(entries);
    migrateRoomSpeechDefault(store);
    assert.equal(store.getItem(ROOM_SPEECH_PREFERENCE), null);
    assert.equal(followsRoomSpeechDefault("default", "whisper", true), true);
  }
});

test("the one-time migration preserves explicit Whisper and Parakeet choices", () => {
  for (const [engine, key, model] of [
    ["whisper", "whisperModel", "small"],
    ["nvidia", "parakeetModel", "parakeet-tdt-0.6b-v3"],
  ]) {
    const store = profile({ localTranscriptionProvider: engine, [key]: model });
    migrateRoomSpeechDefault(store);
    assert.equal(store.getItem(ROOM_SPEECH_PREFERENCE), "shared");
    assert.equal(store.getItem(key), model);
    store.setItem(ROOM_SPEECH_PREFERENCE, "default");
    migrateRoomSpeechDefault(store);
    assert.equal(store.getItem(ROOM_SPEECH_PREFERENCE), "default");
  }
  assert.equal(followsRoomSpeechDefault("default", "nvidia", true), false);
  assert.equal(followsRoomSpeechDefault("default", "whisper", false), false);
  assert.equal(followsRoomSpeechDefault("shared", "whisper", true), false);
});
