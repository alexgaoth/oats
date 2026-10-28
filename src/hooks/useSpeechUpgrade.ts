import { useEffect, useMemo } from "react";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { useMeetingRecordingStore } from "../stores/meetingRecordingStore";
import {
  speechChoiceFor,
  useSettingsStore,
  whisperModelFollowsDefault,
} from "../stores/settingsStore";
import { shouldFetchTurbo } from "../helpers/speechTier.mjs";
import { startupSpeechLanguage } from "../helpers/speechLanguage.mjs";

/**
 * Ask main for turbo when the rule picks it for this Mac and nothing stands in
 * the way (`shouldFetchTurbo`). Mounted once, in the workspace, which shows
 * only after setup. Main checks the rule again before it fetches anything.
 */
export function useSpeechUpgrade() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const whisperModel = useSettingsStore((state) => state.whisperModel);
  const meetingLocal = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  // Not while a conversation is recorded: the download's notice would compete
  // with the room. It starts when the recording ends.
  const recording = useMeetingRecordingStore((state) => state.isRecording);

  const choice = useMemo(() => speechChoiceFor(tier, language), [tier, language]);
  const fetch = shouldFetchTurbo({
    choice,
    setupDone: localStorage.getItem("onboardingCompleted") === "true",
    // `whisperModel` is in the effect's list for this: a choice made in
    // Settings ends it.
    followsDefault: whisperModelFollowsDefault(),
    local: meetingLocal && engine === "whisper",
    recording,
    turbo: tier?.turbo ?? {},
  });

  useEffect(() => {
    if (!fetch) return;
    void window.electronAPI
      ?.startSpeechUpgrade?.({ language: startupSpeechLanguage(language) })
      .then((snapshot) => {
        // Oats started it by itself: the one-time notice says so.
        if (snapshot?.turbo?.downloading) useDeviceTierStore.setState({ autoStarted: true });
      })
      .catch(() => {});
  }, [fetch, language, whisperModel]);
}
