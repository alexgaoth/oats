// Whether dictation is on, and what being off removes.
//
// Dictation types what you say into any app: a floating button, a global key,
// and a paste that needs macOS Accessibility. It is a second feature beside the
// conversation recorder, so on macOS it starts off and is turned on in
// Settings › General › Advanced. Windows and Linux keep it on, as they always
// had it.
//
// Pure and DOM-free so it can be pinned, and so the renderer and the main
// process cannot disagree about what an unset value means. The main process
// reads its own copy from `.env` before any window exists; its twin is
// `EnvironmentManager.getDictationEnabled` (src/helpers/environment.js), and
// test/helpers/dictationOptIn.test.js holds the two to the same answers.

/** Off on macOS, on everywhere else. */
export function defaultDictationEnabled(platform) {
  return platform !== "darwin";
}

/**
 * Read a stored value.
 *
 * Only an explicit choice overrides the platform default. Anything else (unset
 * on an install that never chose, a value an older build never wrote, a hand
 * edit) resolves to the default rather than to a state nobody picked.
 */
export function resolveDictationEnabled(stored, platform) {
  if (stored === true || stored === "true") return true;
  if (stored === false || stored === "false") return false;
  return defaultDictationEnabled(platform);
}

/** The Settings pages that exist only while dictation is on. */
export const DICTATION_SETTINGS_PAGES = ["dictation"];

/** Whether the Settings sidebar lists `pageId`. */
export function isSettingsPageShown(pageId, dictationEnabled) {
  return Boolean(dictationEnabled) || !DICTATION_SETTINGS_PAGES.includes(pageId);
}

/**
 * Whether Accessibility is worth showing at all.
 *
 * macOS needs it for one thing: pasting a dictation into another app. With
 * dictation off nothing is pasted, so nothing asks for it. Even with dictation
 * on it is not required, because a missing grant falls back to the clipboard
 * (`areRequiredPermissionsMet`, #394).
 */
export function needsAccessibility(platform, dictationEnabled) {
  return platform === "darwin" && Boolean(dictationEnabled);
}
