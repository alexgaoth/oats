// Choosing the English-only Whisper model when the speaker is speaking English.
//
// Whisper ships two families: multilingual (`ggml-base.bin`) and English-only
// (`ggml-base.en.bin`). They are the same size and the same speed class, and for
// English the `.en` model is simply better — it spent none of its capacity on the
// other ninety-eight languages. Measured on 40 LibriSpeech test-clean utterances
// with the app's own `whisper-server` arguments:
//
//   ggml-base.bin    --language auto   7.74% WER   1952ms median
//   ggml-base.bin    --language en     7.74% WER   1090ms median
//   ggml-base.en.bin --language en     5.72% WER    875ms median
//
// A quarter of the errors gone and twice the speed, at the same 148MB. The
// registry had no `.en` entries at all, so this was unreachable from the product
// even for somebody who wanted it.
//
// The selection is automatic and invisible, because there is nothing here for a
// person to decide: if you are dictating in English, the English model is better
// on both axes. It is not a mode, and there is no switch for it (§1, and the
// pencil standard's "nothing to remember between uses").
//
// Pure and DOM-free so the fallback order can be pinned rather than trusted.

/** Whisper sizes that have an English-only twin published. */
const HAS_ENGLISH_VARIANT = new Set(["tiny", "base", "small", "medium"]);

/**
 * `auto` is not English.
 *
 * Auto-detection needs the multilingual model — an `.en` build has no language
 * head to detect with. So a user who has never opened Settings keeps the
 * multilingual model and the detection pass, and that is correct rather than a
 * missed optimisation: we do not know what they speak.
 */
export function isEnglish(language) {
  if (typeof language !== "string") return false;
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en";
}

/**
 * The model id to actually load.
 *
 * @param {string} model The user's chosen size, e.g. "base".
 * @param {string|null} language The resolved STT language.
 * @param {(id: string) => boolean} isInstalled Whether a model id is on disk.
 * @returns {string} `model` unchanged, or its `.en` twin when that is both
 *   applicable and present. Never a model that is not there: an upgrade that
 *   fails to load is worse than the model the user already had.
 */
export function resolveWhisperModel(model, language, isInstalled) {
  const id = typeof model === "string" ? model.trim() : "";
  if (!id || id.endsWith(".en")) return id;
  if (!isEnglish(language)) return id;
  if (!HAS_ENGLISH_VARIANT.has(id)) return id;
  const english = `${id}.en`;
  return typeof isInstalled === "function" && isInstalled(english) ? english : id;
}

export { HAS_ENGLISH_VARIANT };
