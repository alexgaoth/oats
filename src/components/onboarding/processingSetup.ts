import { useTranslation } from "react-i18next";
import { formatMegabytes } from "../../hooks/useSpeechTier";
import { formatGigabytes, writingModelName } from "../../hooks/useWritingModel";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { getLocalModel } from "../../models/ModelRegistry";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import {
  localSetupFor,
  useSettingsStore,
  whisperModelFollowsDefault,
  writingModelFollowsDefault,
} from "../../stores/settingsStore";

export interface LocalDownloads {
  /** What will be downloaded, named with its size ("Whisper Turbo (574 MB)"). */
  items: string[];
  checking: boolean;
}

/**
 * What "On this Mac" downloads when setup goes on: Whisper Turbo where this
 * Mac's GPU keeps up with it (speechTier.mjs) and the writing model its memory
 * holds (writingTier.mjs), each only while its setting follows the default and
 * the plan needs a file. Setup names them with their sizes. The workspace
 * starts them after setup, when no conversation is recording.
 */
export function useLocalDownloads(): LocalDownloads {
  const { i18n } = useTranslation();
  const tier = useDeviceTierStore((state) => state.tier);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const plan = localSetupFor(tier, language, "local");
  const turbo =
    engine !== "nvidia" &&
    whisperModelFollowsDefault() &&
    plan.downloads.speech?.model === TURBO_MODEL &&
    tier?.turbo &&
    !tier.turbo.declined &&
    !tier.turbo.failed;
  const writingModel =
    writingModelFollowsDefault() && !tier?.writing?.autoDeclined ? plan.downloads.writing : null;
  const writingDownloads =
    writingModel &&
    !tier?.writing?.declined.includes(writingModel) &&
    tier?.writing?.failed?.modelId !== writingModel;
  const items = [
    ...(turbo && tier?.turbo.sizeBytes
      ? [`Whisper Turbo (${formatMegabytes(tier.turbo.sizeBytes, i18n.language)})`]
      : []),
    ...(writingModel && writingDownloads
      ? [
          `${writingModelName(writingModel)} (${formatGigabytes(
            getLocalModel(writingModel)?.sizeBytes,
            i18n.language
          )})`,
        ]
      : []),
  ];
  return { items, checking: !tier || tier.measuring };
}
