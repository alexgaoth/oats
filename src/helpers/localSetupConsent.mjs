export const LOCAL_SETUP_AUTHORIZED = "localSetupAuthorized";
const MIGRATED = "localSetupAuthorizationMigrated";

/**
 * Keep consent from 0.3.0, where the processing choice saved these three
 * modes instead of a separate flag. An Anthropic-only setup also uses local
 * speech, so the local speech switch is not proof of consent.
 *
 * @param {Pick<Storage, "getItem" | "setItem">} storage
 */
export function migrateLocalSetupAuthorization(storage) {
  if (storage.getItem(MIGRATED) === "1") return false;
  const local = ["transcriptionMode", "meetingTranscriptionMode", "cleanupMode"].every(
    (key) => storage.getItem(key) === "local"
  );
  const changed =
    storage.getItem(LOCAL_SETUP_AUTHORIZED) === null &&
    storage.getItem("onboardingCompleted") === "true" &&
    local;
  if (changed) storage.setItem(LOCAL_SETUP_AUTHORIZED, "true");
  storage.setItem(MIGRATED, "1");
  return changed;
}
