import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Key, Cpu } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { InferenceModeSelector } from "../ui/SettingsSection";
import type { InferenceModeOption } from "../ui/SettingsSection";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import type { InferenceMode } from "../../types/electron";

const noop = () => {};

export function MeetingTranscriptionPanel() {
  const { t } = useTranslation();

  const {
    meetingTranscriptionMode,
    setMeetingTranscriptionMode,
    setMeetingUseLocalWhisper,
    meetingWhisperModel,
    setMeetingWhisperModel,
    meetingLocalTranscriptionProvider,
    setMeetingLocalTranscriptionProvider,
    meetingParakeetModel,
    setMeetingParakeetModel,
    meetingCloudTranscriptionProvider,
    setMeetingCloudTranscriptionProvider,
    meetingCloudTranscriptionModel,
    setMeetingCloudTranscriptionModel,
    meetingCloudTranscriptionBaseUrl,
    setMeetingCloudTranscriptionBaseUrl,
    setMeetingCloudTranscriptionMode,
  } = useSettingsStore();

  const transcriptionModes: InferenceModeOption[] = [
    {
      id: "providers",
      label: t("settingsPage.transcription.modes.providers"),
      description: t("settingsPage.transcription.modes.providersDesc"),
      icon: <Key className="w-4 h-4" />,
    },
    {
      id: "local",
      label: t("settingsPage.transcription.modes.local"),
      description: t("settingsPage.transcription.modes.localDesc"),
      icon: <Cpu className="w-4 h-4" />,
    },
  ];

  const handleTranscriptionModeSelect = (mode: InferenceMode) => {
    if (mode === meetingTranscriptionMode) return;
    setMeetingTranscriptionMode(mode);
    setMeetingUseLocalWhisper(mode === "local");
    setMeetingCloudTranscriptionMode("byok");
  };

  const handleLocalTranscriptionModelSelect = useCallback(
    (modelId: string) => {
      if (meetingLocalTranscriptionProvider === "nvidia") {
        setMeetingParakeetModel(modelId);
      } else {
        setMeetingWhisperModel(modelId);
      }
    },
    [meetingLocalTranscriptionProvider, setMeetingParakeetModel, setMeetingWhisperModel]
  );

  const renderTranscriptionPicker = (mode: "cloud" | "local") => (
    <TranscriptionModelPicker
      streamingOnly
      selectedCloudProvider={meetingCloudTranscriptionProvider}
      onCloudProviderSelect={setMeetingCloudTranscriptionProvider}
      selectedCloudModel={meetingCloudTranscriptionModel}
      onCloudModelSelect={setMeetingCloudTranscriptionModel}
      selectedLocalModel={
        meetingLocalTranscriptionProvider === "nvidia" ? meetingParakeetModel : meetingWhisperModel
      }
      onLocalModelSelect={handleLocalTranscriptionModelSelect}
      selectedLocalProvider={meetingLocalTranscriptionProvider}
      onLocalProviderSelect={setMeetingLocalTranscriptionProvider}
      useLocalWhisper={mode === "local"}
      onModeChange={noop}
      mode={mode}
      cloudTranscriptionBaseUrl={meetingCloudTranscriptionBaseUrl}
      setCloudTranscriptionBaseUrl={setMeetingCloudTranscriptionBaseUrl}
      variant="settings"
    />
  );

  return (
    <div className="space-y-3">
      <InferenceModeSelector
        modes={transcriptionModes}
        activeMode={meetingTranscriptionMode}
        onSelect={handleTranscriptionModeSelect}
      />

      {meetingTranscriptionMode === "providers" && renderTranscriptionPicker("cloud")}
      {meetingTranscriptionMode === "local" && renderTranscriptionPicker("local")}
    </div>
  );
}
