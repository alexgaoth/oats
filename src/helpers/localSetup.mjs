import { chooseSpeechModel, defaultSpeechModel, TURBO_MODEL } from "./speechTier.mjs";
import { bundledWhisperModels } from "./bundledWhisperModels.mjs";
import { isEnglish, resolveWhisperModel } from "./whisperEnglishModel.mjs";
import {
  chooseLocalWritingModel,
  defaultLocalWritingModel,
  LARGE_WRITING_MODEL,
  SMALL_WRITING_MODEL,
} from "./writingTier.mjs";

export const PARAKEET_ROOM_MODEL = "parakeet-ultra-ane";

/**
 * Plan local setup independently of the active cloud models. Bundled Whisper
 * files are the offline floor. Installed lists contain additional usable files.
 * An absent processing choice can resolve defaults, but cannot request files.
 *
 * @param {object} input
 * @param {{ platform?: string, arch?: string, memoryBytes?: number | null,
 *   macosVersion?: string | null, smallClipMs?: number | null,
 *   turboClipMs?: number | null }} [input.device]
 * @param {{ whisper?: readonly string[], writing?: readonly string[],
 *   parakeet?: readonly string[] }} [input.installed]
 * @param {"local" | "providers" | null} [input.processing]
 * @param {boolean} [input.openaiKey]
 * @param {string} [input.language]
 * @param {boolean} [input.parakeetRoomDefault]
 */
export function planLocalSetup({
  device = {},
  installed = {},
  processing = null,
  openaiKey = false,
  language = "en",
  parakeetRoomDefault = false,
} = {}) {
  const { platform, arch, memoryBytes, macosVersion } = device;
  const bundle = bundledWhisperModels(platform, arch);
  const whisperFiles = new Set([
    ...bundle.files.map((file) => file.slice("ggml-".length, -".bin".length)),
    ...(installed.whisper ?? []),
  ]);
  // docs/dictation-accuracy.md: keep the measured Turbo headroom test. Intel
  // keeps Base; Small took 2,377 ms on CPU against 446 ms for Base.
  const whisperChoice = chooseSpeechModel({
    ...device,
    language,
    turboClipMs: whisperFiles.has(TURBO_MODEL) ? device.turboClipMs : null,
  });
  const whisperSetting = defaultSpeechModel({
    choice: whisperChoice,
    bundleModel: bundle.model,
    turboInstalled: whisperFiles.has(TURBO_MODEL),
  });
  const resolveWhisper = (setting) =>
    resolveWhisperModel(setting, language, (model) => whisperFiles.has(model), [bundle.model]);
  const whisperReady = resolveWhisper(whisperSetting);
  const whisperRecommended =
    whisperChoice.model === TURBO_MODEL ? TURBO_MODEL : resolveWhisper(whisperChoice.model);

  // docs/speech-round-2.md: Ultra with 8 s of context gained 15.7 points of
  // content recall over Turbo in steady sound on eight English AMI meetings.
  // Do not generalize this default to unmeasured languages or older Macs.
  const parakeet =
    parakeetRoomDefault === true &&
    platform === "darwin" &&
    arch === "arm64" &&
    Number(macosVersion?.split(".")[0]) >= 14 &&
    isEnglish(language);
  const parakeetReady = parakeet && (installed.parakeet ?? []).includes(PARAKEET_ROOM_MODEL);
  const speech = parakeet
    ? { engine: "parakeet", model: PARAKEET_ROOM_MODEL }
    : { engine: "whisper", model: whisperRecommended };
  const readySpeech = parakeetReady ? speech : { engine: "whisper", model: whisperReady };

  // docs/summaries.md: Gemma averaged 1.71 invented facts vs Qwen's 5.71
  // (24 AMI meetings). Gemma peaks at 6.8 GB, Qwen at 5.6 GB. Keep Qwen
  // working on a larger Mac until Gemma is ready.
  // docs/fast-models.md: faster models for topic checks serve another job;
  // do not use their topic scores to pick the default writer for summaries.
  const recommendedWriting = chooseLocalWritingModel({ memoryBytes });
  const readyWriting = defaultLocalWritingModel({ memoryBytes, installed: installed.writing });
  const hasReadyWriting = (installed.writing ?? []).includes(readyWriting.model);
  const downloads =
    processing === "local"
      ? {
          speech:
            speech.engine !== readySpeech.engine || speech.model !== readySpeech.model
              ? speech
              : null,
          writing:
            recommendedWriting.reason !== "unknown" && !hasReadyWriting
              ? recommendedWriting.model
              : null,
        }
      : { speech: null, writing: null };

  // An Anthropic key does not provide speech. Prepare the local fallback on
  // both key routes, but never auto-download weights in key mode.
  return {
    routes: {
      speech: processing === "providers" && openaiKey ? "providers" : "local",
      writing: processing === "providers" ? "providers" : "local",
    },
    speech,
    readySpeech,
    whisper: { choice: whisperChoice, setting: whisperSetting, installed: whisperReady },
    writing: { recommended: recommendedWriting, choice: readyWriting, installed: hasReadyWriting },
    downloads,
  };
}

/**
 * The one measured upgrade worth showing in Settings. Rank only models we
 * compared. Prefer speech because recognition is the input to every summary.
 *
 * @param {object} input
 * @param {ReturnType<typeof planLocalSetup>} input.plan
 * @param {string | null} [input.activeWhisper] Current local Whisper setting.
 * @param {string | null} [input.activeWriter] Current, installed local writer.
 * @param {string} [input.language]
 * @param {boolean} [input.recording]
 * @returns {"speech" | "writing" | null}
 */
export function localUpgradeHint({
  plan,
  activeWhisper = null,
  activeWriter = null,
  language = "en",
  recording = false,
}) {
  if (recording) return null;
  if (
    plan.whisper.choice.model === TURBO_MODEL &&
    isEnglish(language) &&
    (activeWhisper === "small" || activeWhisper === "small.en")
  ) {
    return "speech";
  }
  if (
    plan.writing.recommended.model === LARGE_WRITING_MODEL &&
    activeWriter === SMALL_WRITING_MODEL
  ) {
    return "writing";
  }
  return null;
}
