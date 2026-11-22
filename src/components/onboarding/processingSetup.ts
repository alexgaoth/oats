import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatMegabytes } from "../../hooks/useSpeechTier";
import { formatGigabytes, writingModelName } from "../../hooks/useWritingModel";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { startupSpeechLanguage } from "../../helpers/speechLanguage.mjs";
import { getLocalModel } from "../../models/ModelRegistry";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import {
  clearRoomModelDecline,
  refreshRoomModel,
  ROOM_MODEL_BYTES,
  ROOM_MODEL_NAME,
  useRoomModelStore,
} from "../../stores/roomModelStore";
import { followsRoomSpeechDefault } from "../../helpers/roomSpeechPreference.mjs";
import {
  localSetupFor,
  useSettingsStore,
  whisperModelFollowsDefault,
  writingModelFollowsDefault,
} from "../../stores/settingsStore";

export interface LocalDownloads {
  /** What will be downloaded, named with its size ("Whisper Turbo (574 MB)"). */
  items: string[];
  /** The speech models among them: what speech on this Mac downloads alone. */
  speech: string[];
  checking: boolean;
}

/**
 * What "On this Mac" downloads when setup goes on: Parakeet Ultra for rooms
 * where this Mac runs it (localSetup.mjs), Whisper Turbo where its GPU keeps up
 * (speechTier.mjs; Dictation uses it, also beside Parakeet), and the writing
 * model its memory holds (writingTier.mjs), each only while its setting follows
 * the default and the plan needs a file. Setup names them with their sizes,
 * and the speech ones alone when only an Anthropic key is given. They start
 * when the step is continued (OnboardingFlow mounts the workspace's download
 * hooks), and setup's "Your models" shows them coming.
 */
export function useLocalDownloads(): LocalDownloads {
  const { i18n } = useTranslation();
  const tier = useDeviceTierStore((state) => state.tier);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const preference = useSettingsStore((state) => state.roomSpeechPreference);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const plan = localSetupFor(tier, language, "local");
  const available = useRoomModelStore((state) => state.available);
  const installed = useRoomModelStore((state) => state.installed);
  const room =
    plan.speech.engine === "parakeet" &&
    followsRoomSpeechDefault(preference, engine, whisperModelFollowsDefault());
  useEffect(() => {
    if (room && available === null) void refreshRoomModel();
  }, [room, available]);
  // Dictation fetches Turbo by itself (useSpeechUpgrade), also where rooms use
  // Parakeet Ultra, so it is named whenever it would come.
  const turbo =
    engine !== "nvidia" &&
    whisperModelFollowsDefault() &&
    plan.whisper.choice.model === TURBO_MODEL &&
    !tier?.turbo.installed &&
    !tier?.turbo.failed;
  const writingModel = writingModelFollowsDefault() ? plan.downloads.writing : null;
  const speech = [
    ...(room && available && !installed
      ? [`${ROOM_MODEL_NAME} (${formatMegabytes(ROOM_MODEL_BYTES, i18n.language)})`]
      : []),
    ...(turbo && tier?.turbo.sizeBytes
      ? [`Whisper Turbo (${formatMegabytes(tier.turbo.sizeBytes, i18n.language)})`]
      : []),
  ];
  const items = [
    ...speech,
    ...(writingModel && tier?.writing?.failed?.modelId !== writingModel
      ? [
          `${writingModelName(writingModel)} (${formatGigabytes(
            getLocalModel(writingModel)?.sizeBytes,
            i18n.language
          )})`,
        ]
      : []),
  ];
  return { items, speech, checking: !tier || (room ? available === null : tier.measuring) };
}

/** The setup press replaces earlier declines, without starting downloads. */
export async function prepareLocalSetup() {
  const state = useSettingsStore.getState();
  const room =
    localSetupFor(useDeviceTierStore.getState().tier, state.preferredLanguage, "local").speech
      .engine === "parakeet" &&
    followsRoomSpeechDefault(
      state.roomSpeechPreference,
      state.localTranscriptionProvider,
      whisperModelFollowsDefault()
    );
  if (room) clearRoomModelDecline();
  await window.electronAPI?.prepareLocalSetup?.({
    language: startupSpeechLanguage(state.preferredLanguage),
    speech: !room && state.localTranscriptionProvider === "whisper" && whisperModelFollowsDefault(),
    writing: writingModelFollowsDefault(),
  });
}
