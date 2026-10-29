import { useTranslation } from "react-i18next";
import { setProcessing, type ProcessingMode } from "../settings/processing";
import { formatMegabytes, requestTurbo, useSpeechTier } from "../../hooks/useSpeechTier";
import {
  formatGigabytes,
  requestWritingModel,
  writingModelName,
} from "../../hooks/useWritingModel";
import { localWritingStatus } from "../../helpers/writingTier.mjs";
import { getLocalModel } from "../../models/ModelRegistry";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import {
  currentDefaultWritingModel,
  useSettingsStore,
  writingModelFollowsDefault,
} from "../../stores/settingsStore";

export interface LocalDownloads {
  /** What will be downloaded, named with its size ("Whisper Turbo (574 MB)"). */
  items: string[];
  /** Start them now, in the background. */
  start: (language: string) => void;
}

/**
 * What "On this Mac" downloads when setup goes on: Whisper Turbo where this
 * Mac's GPU keeps up with it (speechTier.mjs) and the writing model its memory
 * holds (writingTier.mjs), each only while its setting follows the default and
 * the model is not on disk. Setup names them with their sizes and starts them
 * when the person continues.
 */
export function useLocalDownloads(): LocalDownloads {
  const { i18n } = useTranslation();
  const speechTier = useSpeechTier();
  const tier = useDeviceTierStore((state) => state.tier);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const turbo =
    engine !== "nvidia" &&
    speechTier.followsDefault &&
    speechTier.turboIsDefault &&
    !speechTier.tier?.turbo?.installed;
  const writing = currentDefaultWritingModel(
    { cleanupMode: "local", openaiApiKey: "", anthropicApiKey: "" },
    tier
  );
  const writingModel =
    writing &&
    writing.reason !== "unknown" &&
    writingModelFollowsDefault() &&
    localWritingStatus(writing.model, tier?.writing ?? {}) !== "ready"
      ? writing.model
      : null;
  const items = [
    ...(turbo ? [`Whisper Turbo (${formatMegabytes(speechTier.sizeBytes, i18n.language)})`] : []),
    ...(writingModel
      ? [
          `${writingModelName(writingModel)} (${formatGigabytes(
            getLocalModel(writingModel)?.sizeBytes,
            i18n.language
          )})`,
        ]
      : []),
  ];
  return {
    items,
    // The person chose them here: started at once, and past an earlier no.
    start: (language: string) => {
      if (turbo) requestTurbo(language);
      if (writingModel) requestWritingModel(writingModel);
    },
  };
}

/** Commit the choice made in setup: the processing, and on this Mac its downloads. */
export function commitProcessing(
  mode: ProcessingMode,
  downloads: LocalDownloads,
  language: string
) {
  setProcessing(mode);
  if (mode === "local") downloads.start(language);
}
