import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Key, Cpu, Network } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { InferenceModeSelector, SettingsRow } from "../ui/SettingsSection";
import type { InferenceModeOption } from "../ui/SettingsSection";
import { Toggle } from "../ui/toggle";
import TranscriptionModelPicker from "../TranscriptionModelPicker";
import SelfHostedPanel from "../SelfHostedPanel";
import type { InferenceMode } from "../../types/electron";

export function MeetingSpeakerDetectionRow() {
  const { t } = useTranslation();
  const speakerDiarizationEnabled = useSettingsStore((s) => s.speakerDiarizationEnabled);
  const setSpeakerDiarizationEnabled = useSettingsStore((s) => s.setSpeakerDiarizationEnabled);

  return (
    <SettingsRow
      label={t("settings.meeting.speakerDetection.title")}
      description={t("settings.meeting.speakerDetection.description")}
    >
      <Toggle checked={speakerDiarizationEnabled} onChange={setSpeakerDiarizationEnabled} />
    </SettingsRow>
  );
}

const noop = () => {};

function ConversationAidePanel() {
  const { t } = useTranslation();
  const {
    conversationAideEnabled,
    setConversationAideEnabled,
    conversationAideOnlineEnabled,
    setConversationAideOnlineEnabled,
    conversationAideInRoomEnabled,
    setConversationAideInRoomEnabled,
    conversationAideModel,
    setConversationAideModel,
    conversationAideConfidence,
    setConversationAideConfidence,
    conversationAideSilenceSeconds,
    setConversationAideSilenceSeconds,
    conversationAideSearchBaseUrl,
    setConversationAideSearchBaseUrl,
  } = useSettingsStore();
  const [models, setModels] = useState<
    Array<{ id: string; name?: string; isDownloaded?: boolean }>
  >([]);

  const refresh = useCallback(() => {
    window.electronAPI
      ?.modelGetAll?.()
      .then((items) => setModels(Array.isArray(items) ? items : []));
  }, []);
  useEffect(refresh, [refresh]);
  const selectedDownloaded = models.some(
    (model) => model.id === conversationAideModel && model.isDownloaded
  );

  return (
    <div className="mt-5 space-y-3 border-t border-border/50 pt-4">
      <div>
        <h4 className="text-sm font-medium">{t("oats.aide.title")}</h4>
        <p className="text-xs text-muted-foreground">{t("oats.aide.intro")}</p>
      </div>
      <SettingsRow
        label={t("oats.aide.enable")}
        description={selectedDownloaded ? t("oats.aide.withModel") : t("oats.aide.withoutModel")}
      >
        {/* Never gated on a downloaded classifier: detection is local pattern
            matching and the local reading is the primary verdict (CLAUDE.md
            question rules 1 and 4). A model is a refinement, not admission. */}
        <Toggle checked={conversationAideEnabled} onChange={setConversationAideEnabled} />
      </SettingsRow>
      <SettingsRow label={t("oats.aide.online")} description={t("oats.aide.onlineHint")}>
        <Toggle
          checked={conversationAideOnlineEnabled}
          onChange={setConversationAideOnlineEnabled}
        />
      </SettingsRow>
      <SettingsRow label={t("oats.aide.inRoom")} description={t("oats.aide.inRoomHint")}>
        <Toggle
          checked={conversationAideInRoomEnabled}
          onChange={setConversationAideInRoomEnabled}
        />
      </SettingsRow>
      <label className="block text-xs text-muted-foreground">
        {t("oats.aide.model")}
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          value={conversationAideModel}
          onChange={(event) => setConversationAideModel(event.target.value)}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name || model.id}
              {model.isDownloaded ? "" : t("oats.aide.notDownloaded")}
            </option>
          ))}
          {models.length === 0 && (
            <option value={conversationAideModel}>{conversationAideModel}</option>
          )}
        </select>
      </label>
      {!selectedDownloaded && conversationAideModel && (
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          onClick={async () => {
            await window.electronAPI?.modelDownload?.(conversationAideModel);
            refresh();
          }}
        >
          {t("oats.aide.download")}
        </button>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-muted-foreground">
          {t("oats.aide.confidence")}
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={conversationAideConfidence}
            onChange={(event) =>
              setConversationAideConfidence(Math.max(0, Math.min(1, Number(event.target.value))))
            }
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("oats.aide.silence")}
          <input
            type="number"
            min="1"
            max="60"
            value={conversationAideSilenceSeconds}
            onChange={(event) => setConversationAideSilenceSeconds(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
          />
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        {t("oats.aide.searchUrl")}
        <input
          type="url"
          value={conversationAideSearchBaseUrl}
          onChange={(event) => setConversationAideSearchBaseUrl(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}

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
    meetingRemoteTranscriptionUrl,
    setMeetingRemoteTranscriptionUrl,
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
    {
      id: "self-hosted",
      label: t("settingsPage.transcription.modes.selfHosted"),
      description: t("settingsPage.transcription.modes.selfHostedDesc"),
      icon: <Network className="w-4 h-4" />,
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
      {meetingTranscriptionMode === "self-hosted" && (
        <>
          <SelfHostedPanel
            service="transcription"
            url={meetingRemoteTranscriptionUrl}
            onUrlChange={setMeetingRemoteTranscriptionUrl}
          />
          <p className="text-xs text-muted-foreground/80 px-1">
            {t("settingsPage.speechToText.selfHostedStreamingNote")}
          </p>
        </>
      )}
      <MeetingSpeakerDetectionRow />
      <ConversationAidePanel />
    </div>
  );
}
