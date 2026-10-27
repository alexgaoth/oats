// Which Whisper models ship inside Oats, and which model a new install starts on.
//
// One table for every place that has to agree. The build downloads these files
// (scripts/download-default-whisper-model.js) and refuses to pack an app that
// holds any other set (scripts/afterPack.js). The app installs what it finds in
// its bundle (whisper.js) and starts a new install on the size the bundle
// serves (settingsStore.ts, whisper.js). A model id names a size, such as
// "small"; an English speaker gets its `.en` twin when that is installed, and
// anybody else falls back to multilingual `base` (whisperEnglishModel.mjs).
//
// Apple Silicon ships `small.en` for English instead of `base.en`. Eight AMI
// meetings replayed through the app's room path, every model given the same
// segments, on an M5 Pro with Metal (alexgaoth/oats#122):
//
//   model      size     quiet room            steady sound          per segment
//                       recovered, WER        recovered, WER
//   base.en    148 MB   66.8%, 34.9%          34.9%, 66.3%          58 ms
//   small.en   488 MB   70.4%, 30.9%          40.0%, 61.0%          134 ms
//
// `small.en` invents no more text in silence than `base.en` (25 segments
// against 24 in 4 hours), and for dictation it scores 3.95% WER against 5.09%
// (LibriSpeech, n = 200, #19). Intel Macs and Linux keep `base.en`: the numbers
// above are Metal's, and on a CPU `small.en` took 2,377 ms an utterance against
// 446 ms (docs/dictation-accuracy.md), too slow to keep up with a room.
//
// Multilingual `base` ships everywhere. Auto-detection and every language other
// than English need it, and they keep the model they had.

/** What a build ships when its target is not listed below. */
const STANDARD = Object.freeze({
  model: "base",
  files: Object.freeze(["ggml-base.bin", "ggml-base.en.bin"]),
});

/** Targets that ship another set, keyed `${platform}-${arch}` as Node names them. */
const BY_TARGET = Object.freeze({
  "darwin-arm64": Object.freeze({
    model: "small",
    files: Object.freeze(["ggml-base.bin", "ggml-small.en.bin"]),
  }),
});

/**
 * The speech models a build for this target ships, and the model id a new
 * install on it starts on.
 *
 * @param {string} platform The target's `process.platform`: "darwin", "linux", "win32".
 * @param {string} arch The target's `process.arch`: "arm64", "x64". For the
 *   running app this is the build's arch, so an Intel build under Rosetta is "x64".
 * @returns {{ model: string, files: readonly string[] }}
 */
export function bundledWhisperModels(platform, arch) {
  return BY_TARGET[`${platform}-${arch}`] ?? STANDARD;
}

/**
 * The model id a new install starts on: "small" on Apple Silicon, whose bundle
 * serves it to English speakers as `small.en`, and "base" everywhere else.
 *
 * @param {string} platform
 * @param {string} arch
 * @returns {string}
 */
export function defaultWhisperModel(platform, arch) {
  return bundledWhisperModels(platform, arch).model;
}

/** Set once the move below has run, so a "base" chosen after it is kept. */
export const STORED_MODEL_MIGRATION_KEY = "_whisperModelDefaultMigrated";

/**
 * One time, on a build whose default is not "base": forget a stored "base", so
 * the setting follows the default again.
 *
 * The app has written "base" when nobody chose it. The speech model picker
 * saves the first installed model, usually Base, when the selected one is
 * missing: after the selected model is deleted, or when its file is gone.
 * Until 2026-07-25 onboarding had a step with the same picker, where the
 * recommended Base was the model to download. A stored value cannot say
 * whether a person chose it, so each stored "base" moves to the new default
 * once. A person who chooses Base again keeps it.
 *
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined} storage
 * @param {string} defaultModel This build's `defaultWhisperModel`.
 * @returns {boolean} Whether a stored "base" was removed.
 */
export function migrateStoredWhisperModel(storage, defaultModel) {
  if (!storage || !defaultModel || defaultModel === "base") return false;
  if (storage.getItem(STORED_MODEL_MIGRATION_KEY) === "1") return false;
  const removed = storage.getItem("whisperModel") === "base";
  if (removed) storage.removeItem("whisperModel");
  storage.setItem(STORED_MODEL_MIGRATION_KEY, "1");
  return removed;
}
