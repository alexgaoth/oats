import { followsDefaultModel } from "./speechTier.mjs";

export const ROOM_SPEECH_PREFERENCE = "roomSpeechPreference";
const MIGRATED = "roomSpeechDefaultMigrated";

/**
 * Older installs shared the dictation model with the room. Keep a model
 * somebody chose. A stored Whisper engine without a model was also written
 * by Use default, so it is not a choice on its own.
 *
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 */
export function migrateRoomSpeechDefault(storage) {
  if (storage.getItem(MIGRATED) === "1") return;
  if (
    storage.getItem(ROOM_SPEECH_PREFERENCE) === null &&
    (storage.getItem("localTranscriptionProvider") === "nvidia" || !followsDefaultModel(storage))
  ) {
    storage.setItem(ROOM_SPEECH_PREFERENCE, "shared");
  }
  storage.setItem(MIGRATED, "1");
}

/** Use the room's recommendation only if no applicable model was chosen. */
export function followsRoomSpeechDefault(preference, engine, followsWhisper) {
  return preference !== "shared" && engine === "whisper" && followsWhisper;
}
