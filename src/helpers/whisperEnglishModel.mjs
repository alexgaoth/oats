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
// The configured size need not be on disk. Apple Silicon starts new installs on
// "small" and ships `small.en` but not multilingual `small`
// (bundledWhisperModels.mjs). So the resolver never returns an `.en` model for a
// language that is not English, never returns a model that is not installed,
// and otherwise falls back to `base`, which every build ships (for English,
// `base.en` first where it is installed).
//
// Pure and DOM-free so the fallback order can be pinned rather than trusted.

/** Whisper sizes that have an English-only twin published. */
const HAS_ENGLISH_VARIANT = new Set(["tiny", "base", "small", "medium"]);

/** Multilingual and in every build's bundle: the model of last resort. */
const FALLBACK_MODEL = "base";

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
 * The model id to actually load: the first of these that is installed.
 *
 * - English: `<size>.en`, then the size, then `base.en`, then `base`.
 * - Any other language, and auto-detection: the multilingual size, then
 *   `base`. An `.en` id stands for its multilingual twin here, because an
 *   English-only model can neither transcribe another language nor detect one.
 *
 * When none of them is installed the answer is `base`, so the error names the
 * model every build ships. An upgrade that fails to load is worse than the
 * model the user already had, and so is a model that is not there.
 *
 * @param {string} model The configured size, e.g. "small". An `.en` id is read
 *   as its size.
 * @param {string|null} language The resolved STT language.
 * @param {(id: string) => boolean} isInstalled Whether a model id is on disk.
 * @returns {string} The model to load. With no `isInstalled` there is nothing
 *   to check, so `model` comes back unchanged, and empty input comes back empty.
 */
export function resolveWhisperModel(model, language, isInstalled) {
  const id = typeof model === "string" ? model.trim() : "";
  if (!id || typeof isInstalled !== "function") return id;
  const installed = (candidate) => {
    try {
      return Boolean(isInstalled(candidate));
    } catch {
      return false;
    }
  };
  const english = isEnglish(language);
  const ladder = (size) =>
    english && HAS_ENGLISH_VARIANT.has(size) ? [`${size}.en`, size] : [size];
  const size = id.endsWith(".en") ? id.slice(0, -".en".length) : id;
  return [...ladder(size), ...ladder(FALLBACK_MODEL)].find(installed) ?? FALLBACK_MODEL;
}

export { HAS_ENGLISH_VARIANT };
