import { useEffect, useMemo } from "react";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { useMeetingRecordingStore } from "../stores/meetingRecordingStore";
import {
  localSetupFor,
  roomSpeechPlan,
  selectFeatureRoute,
  useSettingsStore,
  whisperModelFollowsDefault,
} from "../stores/settingsStore";
import { shouldFetchTurbo, shouldLeaveTurbo } from "../helpers/speechTier.mjs";
import { startupSpeechLanguage } from "../helpers/speechLanguage.mjs";
import { setupAllowsDownloads } from "../helpers/localSetupConsent.mjs";
import { leaveTurbo } from "./useSpeechTier";
import {
  cancelRoomModelDownload,
  refreshRoomModel,
  startRoomModelDownload,
  useRoomModelStore,
} from "../stores/roomModelStore";

function workspaceIdle() {
  const { isRecording, isTranscribing } = useMeetingRecordingStore.getState();
  return !isRecording && !isTranscribing && !useDeviceTierStore.getState().tier?.dictationRecording;
}

function roomDownloadAuthorized() {
  return (
    setupAllowsDownloads(localStorage) &&
    selectFeatureRoute(useSettingsStore.getState(), "conversations").downloadAuthorized
  );
}

export function requestRoomModel() {
  void startRoomModelDownload(workspaceIdle, true);
}

/**
 * Ask main for turbo when the rule picks it for this Mac and nothing stands in
 * the way (`shouldFetchTurbo`), and stop its download when speech leaves this
 * Mac (`shouldLeaveTurbo`); the same for Parakeet Ultra in a room. Mounted
 * once at a time: in setup from its "Where Oats thinks" step on
 * (`setupAllowsDownloads`; its "Your models" step shows the downloads), then
 * in the workspace. Main checks the rule again before it fetches anything.
 */
export function useSpeechUpgrade() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const whisperModel = useSettingsStore((state) => state.whisperModel);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const roomAuthorized = useSettingsStore(
    (state) => selectFeatureRoute(state, "conversations").downloadAuthorized
  );
  const dictationAuthorized = useSettingsStore(
    (state) => selectFeatureRoute(state, "dictation").downloadAuthorized
  );
  // Not while a conversation is recorded: the download's notice would compete
  // with the room. It starts when the recording ends.
  const meeting = useMeetingRecordingStore((state) => state.isRecording || state.isTranscribing);
  const recording = meeting || tier?.dictationRecording === true;
  const room = useSettingsStore((state) => Boolean(roomSpeechPlan(state, tier)));
  const { available, installed, declined, failed, progress } = useRoomModelStore();
  // Read on each render: the flag setup's processing step writes is in
  // localStorage, which nothing observes, and the step's next render follows it.
  const setupDone = setupAllowsDownloads(localStorage);

  useEffect(() => {
    if (room && available === null) void refreshRoomModel();
  }, [room, available]);

  useEffect(() => {
    if (!room || meeting) {
      cancelRoomModelDownload(false);
      return;
    }
    if (!roomAuthorized) {
      cancelRoomModelDownload(false, true);
      return;
    }
    if (
      setupDone &&
      !recording &&
      available &&
      !installed &&
      !declined &&
      !failed &&
      progress === null
    ) {
      void startRoomModelDownload(
        () =>
          workspaceIdle() &&
          roomDownloadAuthorized() &&
          Boolean(roomSpeechPlan(useSettingsStore.getState(), useDeviceTierStore.getState().tier))
      );
    }
  }, [
    room,
    roomAuthorized,
    setupDone,
    meeting,
    recording,
    available,
    installed,
    declined,
    failed,
    progress,
  ]);

  const plan = useMemo(() => localSetupFor(tier, language, "local"), [tier, language]);
  const followsDefault = whisperModelFollowsDefault();
  const local = (dictationAuthorized || (roomAuthorized && !room)) && engine === "whisper";
  const fetch = shouldFetchTurbo({
    choice: plan.whisper.choice,
    setupDone,
    // `whisperModel` is in the effect's list for this: a choice made in
    // Settings ends it.
    followsDefault,
    local,
    recording,
    turbo: tier?.turbo ?? {},
  });
  // Read on each snapshot, so a download that main starts after the switch
  // (a start asked for just before it) stops as soon as it shows.
  const leave = shouldLeaveTurbo({
    local,
    followsDefault,
    whisperModel,
    turbo: tier?.turbo ?? {},
  });

  useEffect(() => {
    if (leave) leaveTurbo();
  }, [leave]);

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
