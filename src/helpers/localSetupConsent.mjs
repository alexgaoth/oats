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

/** Setup's "Where Oats thinks" was continued: its downloads may start. */
export const SETUP_PROCESSING_DONE = "setupProcessingDone";

/**
 * Whether Oats may fetch a model by itself yet: once setup is done, or once
 * setup's "Where Oats thinks" step is continued (Alex, 2026-11-22). That step
 * names the models and their sizes, so its Continue is the consent, and the
 * step after it, "Your models", shows them coming. Each feature still needs
 * its own consent (`downloadAuthorized`, featureRoutes.mjs).
 *
 * @param {Pick<Storage, "getItem"> | null} storage
 */
export function setupAllowsDownloads(storage) {
  return (
    storage?.getItem("onboardingCompleted") === "true" ||
    storage?.getItem(SETUP_PROCESSING_DONE) === "true"
  );
}
