// The language Oats listens for: English, unless the person chooses another.
//
// `preferredLanguage` defaulted to "auto" until 2026-10-26. A replay of eight
// AMI meetings (alexgaoth/oats#122) measured what that cost in a room: with
// "auto", the multilingual models often heard a far voice as another language
// (Korean, Hindi, Welsh), and `base` with "auto" recovered 62.2% of the words
// against 66.8% for `base.en` with "en". So English is the default (Alex,
// 2026-10-26), the setup screen shows it, and the setup screen and Settings
// both change it. "auto" stays a choice in Settings.
//
// Pure and DOM-free, so the renderer and the tests share it. The main process
// keeps its own copy in `.env` (LOCAL_WHISPER_LANGUAGE) and reads it before any
// window exists; its twin is `EnvironmentManager.getSpeechLanguage`
// (src/helpers/environment.js), and test/helpers/speechLanguage.test.js holds
// the two to the same answers.

/** The default speech language: English, as Whisper names it. */
export const DEFAULT_SPEECH_LANGUAGE = "en";

/** The choice that asks Whisper to detect the language. */
export const AUTO_DETECT = "auto";

/** Where the renderer keeps the speech language (localStorage). */
export const SPEECH_LANGUAGE_KEY = "preferredLanguage";

/** Set once the old default has been moved to English, so it moves once. */
export const SPEECH_LANGUAGE_MIGRATED_KEY = "speechLanguageDefaultMigrated";

/**
 * A stored speech language, or English when nothing usable is stored.
 *
 * @param {unknown} stored
 * @returns {string}
 */
export function resolveSpeechLanguage(stored) {
  if (typeof stored !== "string") return DEFAULT_SPEECH_LANGUAGE;
  const language = stored.trim();
  return language || DEFAULT_SPEECH_LANGUAGE;
}

/**
 * Move an install from the old default to the new one, once.
 *
 * A stored "auto" is the old default, not a choice: it was the default, and
 * almost nobody chose it. So it becomes English. The flag is written in every
 * case, so this runs once per install, and a value set after it, "auto"
 * included, stays.
 *
 * @param {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} storage
 * @returns {boolean} Whether the stored language changed.
 */
export function migrateSpeechLanguageDefault(storage) {
  if (storage.getItem(SPEECH_LANGUAGE_MIGRATED_KEY) === "1") return false;
  const changed = storage.getItem(SPEECH_LANGUAGE_KEY) === AUTO_DETECT;
  if (changed) storage.setItem(SPEECH_LANGUAGE_KEY, DEFAULT_SPEECH_LANGUAGE);
  storage.setItem(SPEECH_LANGUAGE_MIGRATED_KEY, "1");
  return changed;
}

/**
 * The value the main process keeps as LOCAL_WHISPER_LANGUAGE, so that the
 * pre-warm at the next launch loads the model a request will ask for.
 *
 * A request sends the base code ("en" for "en-US") and no language for "auto".
 * Main reads an unset value as the default, English, so detection is written
 * out as "auto" here: unset and "auto" are not the same choice.
 *
 * @param {unknown} preferredLanguage
 * @returns {string}
 */
export function startupSpeechLanguage(preferredLanguage) {
  const language = resolveSpeechLanguage(preferredLanguage);
  if (language === AUTO_DETECT) return AUTO_DETECT;
  return language.split("-")[0];
}
