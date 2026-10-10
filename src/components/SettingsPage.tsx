import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  BookOpen,
  CircleCheck,
  CircleX,
  Copy,
  Cpu,
  FolderOpen,
  Info,
  Key,
  Loader2,
  Mic,
  Network,
  RotateCw,
  Shield,
} from "lucide-react";
import MicPermissionWarning from "./ui/MicPermissionWarning";
import MicrophoneSettings from "./ui/MicrophoneSettings";
import PermissionCard from "./ui/PermissionCard";
import PasteToolsInfo from "./ui/PasteToolsInfo";
import NixOsPasteInfo from "./ui/NixOsPasteInfo";
import TranscriptionModelPicker from "./TranscriptionModelPicker";
import SelfHostedPanel from "./SelfHostedPanel";
import {
  ConfirmDialog,
  AlertDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { useSettings } from "../hooks/useSettings";
import { useDialogs } from "../hooks/useDialogs";
import { useWhisper } from "../hooks/useWhisper";
import { usePermissions } from "../hooks/usePermissions";
import { useSystemAudioPermission } from "../hooks/useSystemAudioPermission";
import { useClipboard } from "../hooks/useClipboard";
import { useUpdater } from "../hooks/useUpdater";

import PromptStudio from "./ui/PromptStudio";
import { HotkeyListInput } from "./ui/HotkeyListInput";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useHotkeyModeInfo } from "../hooks/useHotkeyModeInfo";
import { validateHotkeyForSlot } from "../utils/hotkeyValidation";
import { getCachedPlatform } from "../utils/platform";
import { formatHotkeyLabel } from "../utils/hotkeys";
import { ActivationModeSelector } from "./ui/ActivationModeSelector";
import LinuxPttSetupInfo from "./ui/LinuxPttSetupInfo";
import { Toggle } from "./ui/toggle";
import DeveloperSection from "./DeveloperSection";
import InferenceConfigEditor from "./settings/InferenceConfigEditor";
import LanguageSelector from "./ui/LanguageSelector";
import { useToast } from "./ui/useToast";
import { useTheme } from "../hooks/useTheme";
import type { GpuDevice, LocalTranscriptionProvider, InferenceMode } from "../types/electron";
import logger from "../utils/logger";
import { SettingsRow, InferenceModeSelector } from "./ui/SettingsSection";
import { NativeSelect } from "./ui/native-select";
import { SegmentedControl } from "./ui/segmented";
import type { InferenceModeOption } from "./ui/SettingsSection";
import type { SettingsPageId } from "./settings/settingsPages";
import { SettingRow, SettingsSection } from "./settings/SettingsKit";
import { useShallow } from "zustand/react/shallow";
import { selectResolvedLLMConfig } from "../stores/settingsStore";
import {
  getLocalModel,
  getParakeetModelInfo,
  getProviderDisplayName,
  getReasoningModelLabel,
  getTranscriptionProviders,
  getWhisperModelInfo,
} from "../models/ModelRegistry";
import {
  ConversationShortcutRow,
  DictionaryEditor,
  InAppShortcuts,
  ProcessingCard,
  QuestionCardSettings,
  QuestionModelSettings,
  VaultRow,
} from "./settings/OatsSettingsSections";
import { useSettingsLayout } from "./ui/useSettingsLayout";
import { formatBytes } from "../utils/formatBytes";
import { useSettingsStore } from "../stores/settingsStore";
import { canManageSystemAudioInApp } from "../utils/systemAudioAccess";

export type SettingsSectionType = SettingsPageId;

interface SettingsPageProps {
  activeSection?: SettingsSectionType;
  onNavigateToSection?: (section: SettingsSectionType) => void;
  /** When a legacy section ID was used (e.g. `meetings`), land on the matching sub-tab. */
  initialSubTab?: string;
}

const UI_LANGUAGE_OPTIONS: import("./ui/LanguageSelector").LanguageOption[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "pt", label: "Português", flag: "🇵🇹" },
  { value: "it", label: "Italiano", flag: "🇮🇹" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "ja", label: "日本語", flag: "🇯🇵" },
  { value: "zh-CN", label: "简体中文", flag: "🇨🇳" },
  { value: "zh-TW", label: "繁體中文", flag: "🇹🇼" },
];

const noop = () => {};

function SettingsPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs ${className}`}
    >
      {children}
    </div>
  );
}

function SettingsPanelRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCompact } = useSettingsLayout();

  return <div className={`${isCompact ? "px-4 py-3" : "px-5 py-4"} ${className}`}>{children}</div>;
}

function SectionHeader({
  title,
  description,
  note,
}: {
  title: string;
  description?: string;
  note?: string;
}) {
  return (
    <div className="mb-3 px-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
      )}
      {note && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{note}</p>}
    </div>
  );
}

interface TranscriptionSectionProps {
  cloudTranscriptionMode: string;
  setCloudTranscriptionMode: (mode: string) => void;
  useLocalWhisper: boolean;
  setUseLocalWhisper: (value: boolean) => void;
  updateTranscriptionSettings: (settings: { useLocalWhisper: boolean }) => void;
  cloudTranscriptionProvider: string;
  setCloudTranscriptionProvider: (provider: string) => void;
  cloudTranscriptionModel: string;
  setCloudTranscriptionModel: (model: string) => void;
  localTranscriptionProvider: string;
  setLocalTranscriptionProvider: (provider: LocalTranscriptionProvider) => void;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  parakeetModel: string;
  setParakeetModel: (model: string) => void;
  cloudTranscriptionBaseUrl?: string;
  setCloudTranscriptionBaseUrl: (url: string) => void;
  transcriptionMode: InferenceMode;
  setTranscriptionMode: (mode: InferenceMode) => void;
  remoteTranscriptionUrl: string;
  setRemoteTranscriptionUrl: (url: string) => void;
  remoteTranscriptionModel: string;
  setRemoteTranscriptionModel: (model: string) => void;
  /** In the model screen the processing switch decides where speech runs, so
   *  its own local/cloud/self-hosted selector is hidden. */
  hideModeSelector?: boolean;
  /** Offer only cloud models that stream, the ones conversations can use. */
  streamingOnly?: boolean;
  showTranscriptionPreview: boolean;
  setShowTranscriptionPreview: (value: boolean) => void;
  toast: (opts: {
    title: string;
    description: string;
    variant?: "default" | "destructive" | "success";
    duration?: number;
  }) => void;
}

function TranscriptionSection({
  cloudTranscriptionMode,
  setCloudTranscriptionMode,
  useLocalWhisper,
  setUseLocalWhisper,
  updateTranscriptionSettings,
  cloudTranscriptionProvider,
  setCloudTranscriptionProvider,
  cloudTranscriptionModel,
  setCloudTranscriptionModel,
  localTranscriptionProvider,
  setLocalTranscriptionProvider,
  whisperModel,
  setWhisperModel,
  parakeetModel,
  setParakeetModel,
  cloudTranscriptionBaseUrl,
  setCloudTranscriptionBaseUrl,
  transcriptionMode,
  setTranscriptionMode,
  remoteTranscriptionUrl,
  setRemoteTranscriptionUrl,
  remoteTranscriptionModel,
  setRemoteTranscriptionModel,
  hideModeSelector = false,
  streamingOnly = false,
  toast,
}: TranscriptionSectionProps) {
  const { t } = useTranslation();

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
    if (mode === transcriptionMode) return;
    setTranscriptionMode(mode);
    setUseLocalWhisper(mode === "local");
    updateTranscriptionSettings({ useLocalWhisper: mode === "local" });
    setCloudTranscriptionMode("byok");

    const toastKey = {
      providers: "switchedProviders",
      local: "switchedLocal",
      "self-hosted": "switchedSelfHosted",
    }[mode];
    toast({
      title: t(`settingsPage.transcription.toasts.${toastKey}.title`),
      description: t(`settingsPage.transcription.toasts.${toastKey}.description`),
      variant: "success",
      duration: 3000,
    });
  };

  const handleLocalModelSelect = useCallback(
    (modelId: string) => {
      if (localTranscriptionProvider === "nvidia") {
        setParakeetModel(modelId);
      } else {
        setWhisperModel(modelId);
      }
    },
    [localTranscriptionProvider, setParakeetModel, setWhisperModel]
  );

  const renderTranscriptionPicker = (mode?: "cloud" | "local") => (
    <TranscriptionModelPicker
      selectedCloudProvider={cloudTranscriptionProvider}
      onCloudProviderSelect={setCloudTranscriptionProvider}
      selectedCloudModel={cloudTranscriptionModel}
      onCloudModelSelect={setCloudTranscriptionModel}
      selectedLocalModel={localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel}
      onLocalModelSelect={handleLocalModelSelect}
      selectedLocalProvider={localTranscriptionProvider}
      onLocalProviderSelect={setLocalTranscriptionProvider}
      useLocalWhisper={mode === "local" || (!mode && useLocalWhisper)}
      onModeChange={
        mode
          ? noop
          : (isLocal) => {
              setUseLocalWhisper(isLocal);
              updateTranscriptionSettings({ useLocalWhisper: isLocal });
              if (isLocal) setCloudTranscriptionMode("byok");
            }
      }
      mode={mode}
      cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
      setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
      streamingOnly={streamingOnly}
      variant="settings"
    />
  );

  return (
    <div className="space-y-4">
      {!hideModeSelector && (
        <InferenceModeSelector
          modes={transcriptionModes}
          activeMode={transcriptionMode}
          onSelect={handleTranscriptionModeSelect}
        />
      )}

      {transcriptionMode === "providers" && renderTranscriptionPicker("cloud")}
      {transcriptionMode === "local" && renderTranscriptionPicker("local")}

      {transcriptionMode === "self-hosted" && (
        <SelfHostedPanel
          service="transcription"
          url={remoteTranscriptionUrl}
          onUrlChange={setRemoteTranscriptionUrl}
          model={remoteTranscriptionModel}
          onModelChange={setRemoteTranscriptionModel}
        />
      )}

      <GpuDeviceSelector purpose="transcription" />
    </div>
  );
}

interface AiModelsSectionProps {
  useCleanupModel: boolean;
  setUseCleanupModel: (value: boolean) => void;
  toast: (opts: {
    title: string;
    description: string;
    variant?: "default" | "destructive" | "success";
    duration?: number;
  }) => void;
}

const CLEANUP_MODE_TOAST_KEY: Record<InferenceMode, string> = {
  providers: "switchedProviders",
  local: "switchedLocal",
  "self-hosted": "switchedSelfHosted",
};

function AiModelsSection({ useCleanupModel, setUseCleanupModel, toast }: AiModelsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <SettingsPanel>
        <SettingsPanelRow>
          <SettingsRow
            label={t("settingsPage.aiModels.enableTextCleanup")}
            description={t("settingsPage.aiModels.enableTextCleanupDescription")}
          >
            <Toggle checked={useCleanupModel} onChange={setUseCleanupModel} />
          </SettingsRow>
        </SettingsPanelRow>
      </SettingsPanel>
    </div>
  );
}

/**
 * The writing model: one language model for summaries and dictation cleanup
 * (`selectResolvedLLMConfig` resolves summaries from the cleanup scope).
 */
function WritingModelEditor({ toast }: { toast: AiModelsSectionProps["toast"] }) {
  const { t } = useTranslation();
  const handleModeChange = (mode: InferenceMode) => {
    const toastKey = CLEANUP_MODE_TOAST_KEY[mode];
    toast({
      title: t(`settingsPage.aiModels.toasts.${toastKey}.title`),
      description: t(`settingsPage.aiModels.toasts.${toastKey}.description`),
      variant: "success",
      duration: 3000,
    });
  };
  return (
    <div className="space-y-4">
      <InferenceConfigEditor scope="dictationCleanup" onModeChange={handleModeChange} />
      <GpuDeviceSelector purpose="intelligence" />
    </div>
  );
}

function GpuDeviceSelector({ purpose }: { purpose: "transcription" | "intelligence" }) {
  const { t } = useTranslation();
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedUuid, setSelectedUuid] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      window.electronAPI?.listGpus?.() ?? Promise.resolve([]),
      window.electronAPI?.getGpuDeviceIndex?.(purpose) ?? Promise.resolve(""),
    ])
      .then(([gpuList, savedUuid]) => {
        setGpus(gpuList);
        setSelectedUuid(savedUuid || gpuList[0]?.uuid || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [purpose]);

  if (!loaded || gpus.length < 2) return null;

  return (
    <div className="border-t border-border/40 pt-4 mt-4">
      <SectionHeader
        title={t(`settingsPage.${purpose}.gpuDevice.title`)}
        description={t(`settingsPage.${purpose}.gpuDevice.description`)}
      />
      <SettingsPanel>
        <SettingsPanelRow>
          <div className="relative w-full">
            <select
              value={selectedUuid}
              onChange={async (e) => {
                const uuid = e.target.value;
                setSelectedUuid(uuid);
                await window.electronAPI?.setGpuDeviceIndex?.(purpose, uuid);
              }}
              className="w-full appearance-none rounded-md border border-border bg-background px-3 pr-10 py-2 text-sm"
            >
              {gpus.map((gpu) => (
                <option key={gpu.uuid} value={gpu.uuid}>
                  GPU {gpu.index}: {gpu.name} ({Math.round(gpu.vramMb / 1024)}GB)
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </SettingsPanelRow>
      </SettingsPanel>
    </div>
  );
}

export default function SettingsPage({
  activeSection = "general",
  onNavigateToSection,
  initialSubTab,
}: SettingsPageProps) {
  const {
    confirmDialog,
    alertDialog,
    showConfirmDialog,
    showAlertDialog,
    hideConfirmDialog,
    hideAlertDialog,
  } = useDialogs();

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    uiLanguage,
    preferredLanguage,
    cloudTranscriptionProvider,
    cloudTranscriptionModel,
    cloudTranscriptionBaseUrl,
    useCleanupModel,
    dictationKey,
    activationMode,
    setActivationMode,
    preferBuiltInMic,
    selectedMicDeviceId,
    selectedMicDeviceLabel,
    setPreferBuiltInMic,
    setSelectedMicDevice,
    setUseLocalWhisper,
    setUiLanguage,
    setWhisperModel,
    setLocalTranscriptionProvider,
    setParakeetModel,
    setCloudTranscriptionProvider,
    setCloudTranscriptionModel,
    setCloudTranscriptionBaseUrl,
    setDictationKey,
    meetingKey,
    updateTranscriptionSettings,
    updateCleanupSettings,
    cloudTranscriptionMode,
    setCloudTranscriptionMode,
    transcriptionMode,
    setTranscriptionMode,
    remoteTranscriptionUrl,
    setRemoteTranscriptionUrl,
    remoteTranscriptionModel,
    setRemoteTranscriptionModel,
    notificationsEnabled,
    setNotificationsEnabled,
    notifyMeetingDetection,
    setNotifyMeetingDetection,
    notifyCalendarReminders,
    notifyUpdates,
    audioCuesEnabled,
    setAudioCuesEnabled,
    pauseMediaOnDictation,
    setPauseMediaOnDictation,
    showTranscriptionPreview,
    setShowTranscriptionPreview,
    autoPasteEnabled,
    setAutoPasteEnabled,
    keepTranscriptionInClipboard,
    setKeepTranscriptionInClipboard,
    floatingIconAutoHide,
    setFloatingIconAutoHide,
    noteFilesEnabled,
    setNoteFilesEnabled,
    noteFilesPath,
    setNoteFilesPath,
  } = useSettings();

  const uiMode = useSettingsStore((s) => s.uiMode);
  const setUiMode = useSettingsStore((s) => s.setUiMode);
  const chatAgentKey = useSettingsStore((s) => s.chatAgentKey);
  const voiceAgentKey = useSettingsStore((s) => s.voiceAgentKey);
  const searchKey = useSettingsStore((s) => s.searchKey);
  const setSearchKey = useSettingsStore((s) => s.setSearchKey);
  const translationKey = useSettingsStore((s) => s.translationKey);

  const { t } = useTranslation();
  const { toast } = useToast();

  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [isRemovingModels, setIsRemovingModels] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [modelScreen, setModelScreen] = useState<"speech" | "writing" | null>(null);
  const writing = useSettingsStore(
    useShallow((state) => selectResolvedLLMConfig(state, "dictationCleanup"))
  );
  // What each model is called, for its row on the Models page. Where it runs
  // is the processing switch above it, so a local model is just its name.
  const speechModelLabel = (() => {
    if (transcriptionMode === "self-hosted") return t("oats.settings.models.selfHosted");
    if (transcriptionMode === "providers") {
      const provider = getTranscriptionProviders().find(
        (item) => item.id === cloudTranscriptionProvider
      );
      const model = provider?.models.find((item) => item.id === cloudTranscriptionModel);
      return `${model?.name ?? cloudTranscriptionModel} · ${provider?.name ?? cloudTranscriptionProvider}`;
    }
    if (localTranscriptionProvider === "nvidia") {
      const id = parakeetModel || "parakeet-tdt-0.6b-v3";
      return getParakeetModelInfo(id)?.name ?? id;
    }
    const info = getWhisperModelInfo(whisperModel);
    return info ? `Whisper ${info.name}` : whisperModel;
  })();
  const writingModelLabel = (() => {
    if (writing.mode === "self-hosted") return t("oats.settings.models.selfHosted");
    if (!writing.model) return t("oats.settings.models.none");
    if (writing.mode === "local") return getLocalModel(writing.model)?.name ?? writing.model;
    return `${getReasoningModelLabel(writing.model)} · ${getProviderDisplayName(writing.provider)}`;
  })();
  const cachePathHint =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent)
      ? "%USERPROFILE%\\.cache\\oats"
      : "~/.cache/oats";

  const {
    status: updateStatus,
    isInstalling: installInitiated,
    getAppVersion,
    error: updateError,
    clearError: clearUpdateError,
  } = useUpdater();

  const { checkWhisperInstallation } = useWhisper();
  const permissionsHook = usePermissions(showAlertDialog);
  const systemAudio = useSystemAudioPermission();
  useClipboard(showAlertDialog);
  const [audioStorageUsage, setAudioStorageUsage] = useState<{
    fileCount: number;
    totalBytes: number;
  }>({ fileCount: 0, totalBytes: 0 });

  useEffect(() => {
    if (activeSection !== "privacy") return;
    window.electronAPI
      ?.getAudioStorageUsage?.()
      .then((usage: { fileCount: number; totalBytes: number }) => {
        if (usage) setAudioStorageUsage(usage);
      })
      .catch(() => {});
  }, [activeSection]);

  const handleClearAllAudio = async () => {
    if (!window.electronAPI?.deleteAllAudio) return;
    try {
      await window.electronAPI.deleteAllAudio();
      setAudioStorageUsage({ fileCount: 0, totalBytes: 0 });
      toast({ title: t("settingsPage.privacy.clearAllAudio"), variant: "default" });
    } catch {
      // silent fail
    }
  };

  // ydotool status for Wayland paste diagnostics
  const [ydotoolStatus, setYdotoolStatus] = useState<{
    isLinux: boolean;
    isWayland: boolean;
    hasYdotool: boolean;
    hasYdotoold: boolean;
    daemonRunning: boolean;
    hasService: boolean;
    hasUinput: boolean;
    hasUdevRule: boolean;
    hasGroup: boolean;
    allGood: boolean;
    isKde?: boolean;
    hasXclip?: boolean;
    hasXsel?: boolean;
    isNixOS?: boolean;
  } | null>(null);
  const [ydotoolGuideKey, setYdotoolGuideKey] = useState<string | null>(null);

  const refreshYdotoolStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI?.getYdotoolStatus?.();
      if (status) setYdotoolStatus(status);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeSection !== "dictation") return;
    refreshYdotoolStatus();
  }, [activeSection, refreshYdotoolStatus]);

  const { theme, setTheme } = useTheme();

  const installTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { registerHotkey, isRegistering: isHotkeyRegistering } = useHotkeyRegistration({
    onSuccess: (registeredHotkey) => {
      setDictationKey(registeredHotkey);
    },
    showSuccessToast: false,
    showErrorToast: true,
    showAlert: showAlertDialog,
  });

  // Agent hotkey setters resolve to false when main-process registration fails;
  // surface it and return the result so HotkeyListInput rolls the row back.
  const [isAgentHotkeyCommitting, setIsAgentHotkeyCommitting] = useState(false);
  const commitAgentHotkey = useCallback(
    async (setter: (key: string) => Promise<boolean>, key: string) => {
      setIsAgentHotkeyCommitting(true);
      try {
        const ok = await setter(key);
        if (!ok) {
          showAlertDialog({
            title: t("hooks.hotkeyRegistration.titles.notRegistered"),
            description: t("hooks.hotkeyRegistration.errors.failedToRegister"),
          });
        }
        return ok;
      } finally {
        setIsAgentHotkeyCommitting(false);
      }
    },
    [showAlertDialog, t]
  );

  // The conversation shortcut is checked too: it is registered in the main
  // process like the others, and a clash used to go unnoticed here.
  const conversationKey = useSettingsStore((state) => state.conversationKey);
  const validateDictationHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "oats.settings.conversationHotkey": conversationKey,
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
          "settingsPage.general.searchHotkey.title": searchKey,
        },
        t
      ),
    [conversationKey, meetingKey, chatAgentKey, voiceAgentKey, translationKey, searchKey, t]
  );

  const validateSearchHotkey = useCallback(
    (hotkey: string) =>
      validateHotkeyForSlot(
        hotkey,
        {
          "oats.settings.conversationHotkey": conversationKey,
          "settingsPage.general.hotkey.title": dictationKey,
          "settingsPage.general.meetingHotkey.title": meetingKey,
          "agentMode.settings.hotkey": chatAgentKey,
          "settingsPage.general.voiceAgentHotkey.title": voiceAgentKey,
          "settingsPage.general.translationHotkey.title": translationKey,
        },
        t
      ),
    [conversationKey, dictationKey, meetingKey, chatAgentKey, voiceAgentKey, translationKey, t]
  );

  const { isUsingNativeShortcut, isUsingHyprland, hyprlandConfigStatus, supportsPushToTalk } =
    useHotkeyModeInfo("settings");
  const [effectiveDefaultHotkey, setEffectiveDefaultHotkey] = useState<string | null>(null);
  const [linuxPttAvailable, setLinuxPttAvailable] = useState(true);

  const platform = getCachedPlatform();

  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);

  useEffect(() => {
    if (platform === "linux") {
      setAutoStartLoading(false);
      return;
    }
    const loadAutoStart = async () => {
      if (window.electronAPI?.getAutoStartEnabled) {
        try {
          const enabled = await window.electronAPI.getAutoStartEnabled();
          setAutoStartEnabled(enabled);
        } catch (error) {
          logger.error("Failed to get auto-start status", error, "settings");
        }
      }
      setAutoStartLoading(false);
    };
    loadAutoStart();
  }, [platform]);

  useEffect(() => {
    window.electronAPI?.syncNotificationPreferences?.({
      notificationsEnabled,
      notifyMeetingDetection,
      notifyCalendarReminders,
      notifyUpdates,
    });
  }, [notificationsEnabled, notifyMeetingDetection, notifyCalendarReminders, notifyUpdates]);

  const handleAutoStartChange = async (enabled: boolean) => {
    if (window.electronAPI?.setAutoStartEnabled) {
      try {
        setAutoStartLoading(true);
        const result = await window.electronAPI.setAutoStartEnabled(enabled);
        if (result.success) {
          setAutoStartEnabled(enabled);
        }
      } catch (error) {
        logger.error("Failed to set auto-start", error, "settings");
      } finally {
        setAutoStartLoading(false);
      }
    }
  };

  const [noteFilesDefaultPath, setNoteFilesDefaultPath] = useState("");
  const [noteFilesRebuilding, setNoteFilesRebuilding] = useState(false);

  useEffect(() => {
    if (!noteFilesEnabled) return;
    window.electronAPI?.noteFilesGetDefaultPath?.().then((p) => {
      if (p) setNoteFilesDefaultPath(p);
    });
  }, [noteFilesEnabled]);

  const handleNoteFilesToggle = useCallback(
    async (enabled: boolean) => {
      setNoteFilesEnabled(enabled);
      await window.electronAPI?.noteFilesSetEnabled?.(enabled, noteFilesPath || undefined);
    },
    [setNoteFilesEnabled, noteFilesPath]
  );

  const handleNoteFilesChangePath = useCallback(async () => {
    const result = await window.electronAPI?.noteFilesPickFolder?.();
    if (result?.canceled || !result?.path) return;
    setNoteFilesPath(result.path);
    await window.electronAPI?.noteFilesSetPath?.(result.path);
  }, [setNoteFilesPath]);

  const handleNoteFilesRebuild = useCallback(async () => {
    setNoteFilesRebuilding(true);
    try {
      const result = await window.electronAPI?.noteFilesRebuild?.();
      if (result && !result.success) {
        toast({
          title: t("settings.noteFiles.rebuildError.title"),
          description: result.error || t("settings.noteFiles.rebuildError.description"),
          variant: "destructive",
        });
      }
    } finally {
      setNoteFilesRebuilding(false);
    }
  }, [toast, t]);

  useEffect(() => {
    let mounted = true;

    const timer = setTimeout(async () => {
      if (!mounted) return;

      const version = await getAppVersion();
      if (version && mounted) setCurrentVersion(version);

      if (mounted) {
        checkWhisperInstallation();
      }
    }, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [checkWhisperInstallation, getAppVersion]);

  useEffect(() => {
    if (isUsingNativeShortcut && !supportsPushToTalk) {
      setActivationMode("tap");
    }
  }, [isUsingNativeShortcut, supportsPushToTalk, setActivationMode]);

  useEffect(() => {
    const loadEffectiveDefaultHotkey = async () => {
      try {
        const key = await window.electronAPI?.getEffectiveDefaultHotkey?.();
        if (key) setEffectiveDefaultHotkey(key);
      } catch (error) {
        logger.error("Failed to get effective default hotkey", error, "settings");
      }
    };
    loadEffectiveDefaultHotkey();
  }, []);

  useEffect(() => {
    const cleanup = window.electronAPI?.onLinuxPttPermissionDenied?.(() => {
      setLinuxPttAvailable(false);
      toast({
        title: t("settingsPage.general.hotkey.linuxPttPermissionTitle"),
        description: t("settingsPage.general.hotkey.linuxPttPermissionDescription"),
        variant: "destructive",
        duration: 15000,
      });
      setActivationMode("tap");
    });
    return () => cleanup?.();
  }, [toast, t, setActivationMode]);

  useEffect(() => {
    if (updateError) {
      showAlertDialog({
        title: t("settingsPage.general.updates.dialogs.updateError.title"),
        description: t("settingsPage.general.updates.dialogs.updateError.description"),
      });
      clearUpdateError();
    }
  }, [updateError, showAlertDialog, clearUpdateError, t]);

  useEffect(() => {
    if (installInitiated) {
      if (installTimeoutRef.current) {
        clearTimeout(installTimeoutRef.current);
      }
      installTimeoutRef.current = setTimeout(() => {
        showAlertDialog({
          title: t("settingsPage.general.updates.dialogs.almostThere.title"),
          description: t("settingsPage.general.updates.dialogs.almostThere.description"),
        });
      }, 10000);
    } else if (installTimeoutRef.current) {
      clearTimeout(installTimeoutRef.current);
      installTimeoutRef.current = null;
    }

    return () => {
      if (installTimeoutRef.current) {
        clearTimeout(installTimeoutRef.current);
        installTimeoutRef.current = null;
      }
    };
  }, [installInitiated, showAlertDialog, t]);

  const resetAccessibilityPermissions = () => {
    const message = t("settingsPage.permissions.resetAccessibility.description");

    showConfirmDialog({
      title: t("settingsPage.permissions.resetAccessibility.title"),
      description: message,
      onConfirm: () => {
        permissionsHook.requestAccessibilityPermission();
      },
    });
  };

  const handleRemoveModels = useCallback(() => {
    if (isRemovingModels) return;

    showConfirmDialog({
      title: t("settingsPage.developer.removeModels.title"),
      description: t("settingsPage.developer.removeModels.description", { path: cachePathHint }),
      confirmText: t("settingsPage.developer.removeModels.confirmText"),
      variant: "destructive",
      onConfirm: async () => {
        setIsRemovingModels(true);
        try {
          const results = await Promise.allSettled([
            window.electronAPI?.deleteAllWhisperModels?.(),
            window.electronAPI?.deleteAllParakeetModels?.(),
            window.electronAPI?.modelDeleteAll?.(),
          ]);

          const anyFailed = results.some(
            (r) =>
              r.status === "rejected" || (r.status === "fulfilled" && r.value && !r.value.success)
          );

          if (anyFailed) {
            showAlertDialog({
              title: t("settingsPage.developer.removeModels.failedTitle"),
              description: t("settingsPage.developer.removeModels.failedDescription"),
            });
          } else {
            window.dispatchEvent(new Event("oats-models-cleared"));
            showAlertDialog({
              title: t("settingsPage.developer.removeModels.successTitle"),
              description: t("settingsPage.developer.removeModels.successDescription"),
            });
          }
        } catch {
          showAlertDialog({
            title: t("settingsPage.developer.removeModels.failedTitle"),
            description: t("settingsPage.developer.removeModels.failedDescriptionShort"),
          });
        } finally {
          setIsRemovingModels(false);
        }
      },
    });
  }, [isRemovingModels, cachePathHint, showConfirmDialog, showAlertDialog, t]);

  const renderSectionContent = () => {
    switch (activeSection) {
      case "general":
        return (
          <div className="space-y-8">
            {/* Appearance: how Oats looks, including the field behind it (D11:
                a one-click switch, not a setting hidden on the About page). */}
            <div>
              <SectionHeader title={t("settingsPage.general.appearance.title")} />
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.appearance.theme")}
                    description={t("settingsPage.general.appearance.themeDescription")}
                  >
                    <SegmentedControl
                      aria-label={t("settingsPage.general.appearance.theme")}
                      value={theme}
                      onValueChange={(value) => setTheme(value)}
                      options={[
                        { value: "auto", label: t("oats.settings.themeSystem") },
                        { value: "light", label: t("settingsPage.general.appearance.light") },
                        { value: "dark", label: t("settingsPage.general.appearance.dark") },
                      ]}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("oats.settings.fieldBackdrop.label")}
                    description={t("oats.settings.fieldBackdrop.description")}
                  >
                    <Toggle
                      checked={uiMode === "field"}
                      onChange={(on: boolean) => setUiMode(on ? "field" : "work")}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.language.uiLabel")}
                    description={t("settings.language.uiDescription")}
                  >
                    <NativeSelect
                      aria-label={t("settings.language.uiLabel")}
                      value={uiLanguage}
                      onChange={(event) => setUiLanguage(event.target.value)}
                      className="w-48"
                    >
                      {UI_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

            {/* "Start minimized", the panel's start position and "Disable all
                notifications" are gone: macOS already has a switch for an app's
                notifications, and the other two are defaults nobody needs to
                choose. */}
            {platform !== "linux" && (
              <div>
                <SectionHeader title={t("settingsPage.general.startup.title")} />
                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.general.startup.launchAtLogin")}
                      description={t("settingsPage.general.startup.launchAtLoginDescription")}
                    >
                      <Toggle
                        checked={autoStartEnabled}
                        onChange={(checked: boolean) => handleAutoStartChange(checked)}
                        disabled={autoStartLoading}
                      />
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
            )}

            <div>
              <SectionHeader title={t("settingsPage.general.notifications.title")} />
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.notifications.meetingDetection")}
                    description={t(
                      "settingsPage.general.notifications.meetingDetectionDescription"
                    )}
                  >
                    {/* Turning it on also lifts an old "disable all", which no
                        longer has a switch, so nobody is left unable to. */}
                    <Toggle
                      checked={notificationsEnabled && notifyMeetingDetection}
                      onChange={(on: boolean) => {
                        if (on && !notificationsEnabled) setNotificationsEnabled(true);
                        setNotifyMeetingDetection(on);
                      }}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>
          </div>
        );

      case "shortcuts":
        return (
          <div className="space-y-8">
            {isUsingHyprland && hyprlandConfigStatus && !hyprlandConfigStatus.canWrite && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>
                  {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningTitle")}
                </AlertTitle>
                <AlertDescription>
                  {t("settingsPage.general.hotkey.hyprlandConfigWriteWarningDescription", {
                    path: hyprlandConfigStatus.path,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {/* Every shortcut that works from any app, in one card. */}
            <SettingsSection
              title={t("oats.settings.global.title")}
              description={t("oats.settings.global.description")}
            >
              <ConversationShortcutRow />
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {t("oats.settings.global.dictation")}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                      {isUsingHyprland
                        ? t("settingsPage.general.hotkey.hyprlandUnbindDescription")
                        : t("oats.settings.global.dictationHint")}
                    </p>
                  </div>
                  <HotkeyListInput
                    value={dictationKey}
                    onChange={(list) => registerHotkey(list)}
                    validate={validateDictationHotkey}
                    disabled={isHotkeyRegistering}
                    maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
                    required
                    footerEnd={
                      effectiveDefaultHotkey &&
                      dictationKey &&
                      dictationKey !== effectiveDefaultHotkey ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => registerHotkey(effectiveDefaultHotkey)}
                          disabled={isHotkeyRegistering}
                          className="text-muted-foreground"
                        >
                          {t("settingsPage.general.hotkey.resetToDefault", {
                            hotkey: formatHotkeyLabel(effectiveDefaultHotkey),
                          })}
                        </Button>
                      ) : null
                    }
                  />
                </div>
              </div>
              {(!isUsingNativeShortcut || getCachedPlatform() === "linux") && (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {t("oats.settings.global.activation")}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                        {t("oats.settings.global.activationHint")}
                      </p>
                    </div>
                    <ActivationModeSelector value={activationMode} onChange={setActivationMode} />
                  </div>
                  {getCachedPlatform() === "linux" && activationMode === "push" && (
                    <LinuxPttSetupInfo isAvailable={linuxPttAvailable} />
                  )}
                </div>
              )}
              <div className="flex items-start justify-between gap-6 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("oats.settings.global.search")}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                    {t("oats.settings.global.searchHint")}
                  </p>
                </div>
                <HotkeyListInput
                  value={searchKey}
                  onChange={(list) => commitAgentHotkey(setSearchKey, list)}
                  onClear={() => commitAgentHotkey(setSearchKey, "")}
                  validate={validateSearchHotkey}
                  disabled={isAgentHotkeyCommitting}
                  maxHotkeys={isUsingNativeShortcut ? 1 : undefined}
                />
              </div>
            </SettingsSection>

            <InAppShortcuts />
          </div>
        );

      case "recording":
        return (
          <div className="space-y-8">
            {/* Microphone */}
            <div>
              <SectionHeader
                title={t("settingsPage.general.microphone.title")}
                description={t("oats.settings.microphoneDescription")}
              />
              <SettingsPanel>
                <SettingsPanelRow>
                  <MicrophoneSettings
                    preferBuiltInMic={preferBuiltInMic}
                    selectedMicDeviceId={selectedMicDeviceId}
                    selectedMicDeviceLabel={selectedMicDeviceLabel}
                    onPreferBuiltInChange={setPreferBuiltInMic}
                    onDeviceSelect={setSelectedMicDevice}
                  />
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.language.transcriptionLabel")}
                    description={t("settings.language.transcriptionDescription")}
                  >
                    <LanguageSelector
                      value={preferredLanguage}
                      onChange={(value) =>
                        updateTranscriptionSettings({ preferredLanguage: value })
                      }
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

            <QuestionCardSettings />
          </div>
        );

      case "dictation":
        return (
          <div className="space-y-8">
            {/* Clipboard */}
            <div>
              <SectionHeader title={t("settingsPage.general.clipboard.title")} />
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.clipboard.autoPaste")}
                    description={t("settingsPage.general.clipboard.autoPasteDescription")}
                  >
                    <Toggle checked={autoPasteEnabled} onChange={setAutoPasteEnabled} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.clipboard.keepInClipboard")}
                    description={t("settingsPage.general.clipboard.keepInClipboardDescription")}
                  >
                    <Toggle
                      checked={keepTranscriptionInClipboard}
                      onChange={setKeepTranscriptionInClipboard}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

            {/* What happens while you dictate: the button, the live preview and
                the sounds, moved from General and Models. They only ever
                concern dictation. */}
            <div>
              <SectionHeader title={t("oats.settings.dictationButton")} />
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.floatingIcon.autoHide")}
                    description={t("settingsPage.general.floatingIcon.autoHideDescription")}
                  >
                    <Toggle checked={floatingIconAutoHide} onChange={setFloatingIconAutoHide} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.transcription.transcriptionPreview")}
                    description={t("settingsPage.transcription.transcriptionPreviewDescription")}
                  >
                    <Toggle
                      checked={showTranscriptionPreview}
                      onChange={setShowTranscriptionPreview}
                    />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.soundEffects.dictationSounds")}
                    description={t("settingsPage.general.soundEffects.dictationSoundsDescription")}
                  >
                    <Toggle checked={audioCuesEnabled} onChange={setAudioCuesEnabled} />
                  </SettingsRow>
                </SettingsPanelRow>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.general.soundEffects.pauseMedia")}
                    description={t("settingsPage.general.soundEffects.pauseMediaDescription")}
                  >
                    <Toggle checked={pauseMediaOnDictation} onChange={setPauseMediaOnDictation} />
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

            <DictionaryEditor />

            {/* Cleanup: a model tidies a dictation before it is pasted. */}
            <div>
              <SectionHeader
                title={t("oats.settings.cleanup")}
                description={t("oats.settings.cleanupDescription")}
              />
              <AiModelsSection
                useCleanupModel={useCleanupModel}
                setUseCleanupModel={(value) => {
                  updateCleanupSettings({ useCleanupModel: value });
                }}
                toast={toast}
              />
            </div>
            {/* The instructions the cleanup model follows. Most people never
                change them, so they open in a dialog instead of filling the page
                with the whole prompt. Voice-activity tuning is gone from here:
                its default is measured (D13) and nobody needs the switch. */}
            {useCleanupModel && (
              <div>
                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("oats.settings.instructions")}
                      description={t("oats.settings.instructionsDescription")}
                    >
                      <Button variant="outline" size="sm" onClick={() => setPromptsOpen(true)}>
                        {t("oats.settings.editInstructions")}
                      </Button>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>
                <Dialog open={promptsOpen} onOpenChange={setPromptsOpen}>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{t("oats.settings.instructions")}</DialogTitle>
                      <DialogDescription>{t("settingsPage.prompts.description")}</DialogDescription>
                    </DialogHeader>
                    <PromptStudio />
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* Wayland Paste Diagnostics — only on Linux + Wayland */}
            {ydotoolStatus?.isLinux && ydotoolStatus?.isWayland && (
              <div>
                <SectionHeader
                  title={t("settingsPage.general.waylandPaste.title", {
                    defaultValue: "Wayland Paste Setup",
                  })}
                  description={t("settingsPage.general.waylandPaste.description", {
                    defaultValue:
                      "Auto-paste on Wayland requires ydotool. Check the status of each component below.",
                  })}
                />
                {(() => {
                  if (ydotoolStatus.isNixOS) {
                    return (
                      <NixOsPasteInfo status={ydotoolStatus} onRecheck={refreshYdotoolStatus} />
                    );
                  }
                  const checks = [
                    {
                      key: "hasYdotool",
                      label: "ydotool",
                      ok: ydotoolStatus.hasYdotool,
                      desc: t("settingsPage.general.waylandPaste.ydotoolDesc", {
                        defaultValue: "Input automation tool for Wayland",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotool.step1Title", {
                            defaultValue: "Install ydotool",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotool.step1Desc", {
                            defaultValue:
                              "Use your distribution's package manager to install ydotool.",
                          }),
                          cmds: [
                            { label: "Ubuntu / Pop!_OS / Debian", cmd: "sudo apt install ydotool" },
                            { label: "Fedora", cmd: "sudo dnf install ydotool" },
                            { label: "Arch Linux", cmd: "sudo pacman -S ydotool" },
                            { label: "openSUSE", cmd: "sudo zypper install ydotool" },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotool.step2Title", {
                            defaultValue: "Verify installation",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotool.step2Desc", {
                            defaultValue: "Check that ydotool is available in your PATH.",
                          }),
                          cmds: [{ cmd: "which ydotool" }],
                        },
                      ],
                    },
                    {
                      key: "hasYdotoold",
                      label: "ydotoold",
                      ok: ydotoolStatus.hasYdotoold,
                      desc: t("settingsPage.general.waylandPaste.ydotooldDesc", {
                        defaultValue: "Daemon for ydotool (separate package on Ubuntu/Pop!_OS)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.ydotoold.step1Title", {
                            defaultValue: "Install ydotoold",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.ydotoold.step1Desc", {
                            defaultValue:
                              "On Ubuntu and Pop!_OS, ydotoold is a separate package. On Fedora, it's included with ydotool.",
                          }),
                          cmds: [
                            {
                              label: "Ubuntu / Pop!_OS / Debian",
                              cmd: "sudo apt install ydotoold",
                            },
                            { label: "Fedora", cmd: "# Already included in the ydotool package" },
                            { label: "Arch Linux", cmd: "# Included in the ydotool package" },
                          ],
                        },
                      ],
                    },
                    {
                      key: "hasUinput",
                      label: "/dev/uinput",
                      ok: ydotoolStatus.hasUinput,
                      desc: t("settingsPage.general.waylandPaste.uinputDesc", {
                        defaultValue: "Kernel input device access",
                      }),
                      note: !ydotoolStatus.hasUinput
                        ? ydotoolStatus.hasUdevRule
                          ? t("settingsPage.general.waylandPaste.uinputRuleFound", {
                              defaultValue: "Rule present but not active. A reboot should fix it.",
                            })
                          : t("settingsPage.general.waylandPaste.uinputRuleMissing", {
                              defaultValue: "no udev rule found",
                            })
                        : undefined,
                      steps:
                        ydotoolStatus.hasUdevRule && !ydotoolStatus.hasUinput
                          ? [
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.ruleFoundTitle",
                                  {
                                    defaultValue: "udev rule already configured",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.ruleFoundDesc",
                                  {
                                    defaultValue:
                                      "The udev rule for /dev/uinput is already on your system but hasn't taken effect. Try reloading:",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: "sudo udevadm control --reload-rules && sudo udevadm trigger /dev/uinput",
                                  },
                                ],
                              },
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.rebootTitle",
                                  {
                                    defaultValue: "If reloading didn't help, reboot",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.rebootDesc",
                                  {
                                    defaultValue:
                                      "On some distros, udev changes only apply after a full reboot. Restart your computer and come back to re-check.",
                                  }
                                ),
                              },
                            ]
                          : [
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step1Title",
                                  {
                                    defaultValue: "Create a udev rule",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step1Desc",
                                  {
                                    defaultValue:
                                      "This rule grants access to /dev/uinput for users in the input group.",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: 'echo \'KERNEL=="uinput", GROUP="input", MODE="0660", TAG+="uaccess"\' | sudo tee /etc/udev/rules.d/70-uinput.rules',
                                  },
                                ],
                              },
                              {
                                title: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step2Title",
                                  {
                                    defaultValue: "Reload udev rules",
                                  }
                                ),
                                desc: t(
                                  "settingsPage.general.waylandPaste.guide.uinput.step2Desc",
                                  {
                                    defaultValue: "Apply the new rule without rebooting.",
                                  }
                                ),
                                cmds: [
                                  {
                                    cmd: "sudo udevadm control --reload-rules && sudo udevadm trigger /dev/uinput",
                                  },
                                ],
                              },
                            ],
                    },
                    {
                      key: "hasGroup",
                      label: t("settingsPage.general.waylandPaste.inputGroup", {
                        defaultValue: "input group",
                      }),
                      ok: ydotoolStatus.hasGroup,
                      desc: t("settingsPage.general.waylandPaste.inputGroupDesc", {
                        defaultValue: "User must be in the input group (requires re-login)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.group.step1Title", {
                            defaultValue: "Add your user to the input group",
                          }),
                          cmds: [{ cmd: "sudo usermod -aG input $USER" }],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.group.step2Title", {
                            defaultValue: "Log out and back in",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.group.step2Desc", {
                            defaultValue:
                              "Group changes only take effect after a new login session. Log out of your desktop and log back in, then reopen Oats.",
                          }),
                        },
                      ],
                    },
                    {
                      key: "hasService",
                      label: t("settingsPage.general.waylandPaste.service", {
                        defaultValue: "systemd service",
                      }),
                      ok: ydotoolStatus.hasService,
                      desc: t("settingsPage.general.waylandPaste.serviceDesc", {
                        defaultValue: "User service file for auto-starting ydotoold",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step1Title", {
                            defaultValue: "Create the service directory",
                          }),
                          cmds: [{ cmd: "mkdir -p ~/.config/systemd/user" }],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step2Title", {
                            defaultValue: "Create the service file",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.service.step2Desc", {
                            defaultValue:
                              "This creates a user-level systemd service that starts ydotoold automatically when you log in.",
                          }),
                          cmds: [
                            {
                              cmd: `cat > ~/.config/systemd/user/ydotoold.service << 'EOF'
[Unit]
Description=ydotoold - ydotool daemon
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStart=/usr/bin/ydotoold
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=graphical-session.target
EOF`,
                            },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.service.step3Title", {
                            defaultValue: "Reload and enable",
                          }),
                          cmds: [
                            {
                              cmd: "systemctl --user daemon-reload && systemctl --user enable ydotoold",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      key: "daemonRunning",
                      label: t("settingsPage.general.waylandPaste.daemon", {
                        defaultValue: "ydotoold daemon",
                      }),
                      ok: ydotoolStatus.daemonRunning,
                      desc: t("settingsPage.general.waylandPaste.daemonDesc", {
                        defaultValue: "Background service must be running",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.daemon.step1Title", {
                            defaultValue: "Start the daemon",
                          }),
                          desc: t("settingsPage.general.waylandPaste.guide.daemon.step1Desc", {
                            defaultValue: "Start ydotoold and enable it so it runs on every login.",
                          }),
                          cmds: [
                            {
                              cmd: "systemctl --user enable ydotoold && systemctl --user start ydotoold",
                            },
                            {
                              label: "Arch Linux (service is named ydotool.service)",
                              cmd: "systemctl --user enable --now ydotool.service",
                            },
                          ],
                        },
                        {
                          title: t("settingsPage.general.waylandPaste.guide.daemon.step2Title", {
                            defaultValue: "Verify it's running",
                          }),
                          cmds: [
                            { cmd: "systemctl --user status ydotoold" },
                            {
                              label: "Arch Linux",
                              cmd: "systemctl --user status ydotool.service",
                            },
                          ],
                        },
                      ],
                    },
                  ];

                  if (ydotoolStatus.isKde) {
                    checks.push({
                      key: "hasXclip",
                      label: "xclip",
                      ok: ydotoolStatus.hasXclip || ydotoolStatus.hasXsel || false,
                      desc: t("settingsPage.general.waylandPaste.xclipDesc", {
                        defaultValue: "Clipboard tool for KDE Wayland paste (xclip or xsel)",
                      }),
                      steps: [
                        {
                          title: t("settingsPage.general.waylandPaste.guide.xclip.step1Title", {
                            defaultValue: "Install xclip",
                          }),
                          cmds: [
                            { cmd: "sudo dnf install xclip  # Fedora" },
                            { cmd: "sudo apt install xclip  # Debian/Ubuntu" },
                          ],
                        },
                      ],
                    });
                  }

                  const allOk = checks.every((c) => c.ok);
                  const activeGuide = checks.find((c) => c.key === ydotoolGuideKey);

                  return (
                    <>
                      {allOk ? (
                        <SettingsPanel>
                          <SettingsPanelRow>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CircleCheck className="h-4 w-4 text-emerald-500" />
                                <span className="text-sm">
                                  {t("settingsPage.general.waylandPaste.allGoodDesc", {
                                    defaultValue: "Auto-paste is ready to go.",
                                  })}
                                </span>
                              </div>
                              <button
                                onClick={refreshYdotoolStatus}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </SettingsPanelRow>
                        </SettingsPanel>
                      ) : (
                        <>
                          <div className="rounded-xl border border-border overflow-hidden">
                            <div className="divide-y divide-border">
                              {checks.map((item) => (
                                <div key={item.key} className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {item.ok ? (
                                      <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                                    ) : (
                                      <CircleX className="h-4 w-4 shrink-0 text-red-500" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium">{item.label}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {item.desc}
                                      </span>
                                      {item.note && (
                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                          {item.note}
                                        </p>
                                      )}
                                    </div>
                                    {!item.ok && (
                                      <button
                                        onClick={() => setYdotoolGuideKey(item.key)}
                                        className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors text-foreground"
                                      >
                                        <BookOpen className="w-3 h-3" />
                                        {t("settingsPage.general.waylandPaste.guide.open", {
                                          defaultValue: "Guide",
                                        })}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={refreshYdotoolStatus}
                            className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <RotateCw className="w-3 h-3" />
                            {t("settingsPage.general.waylandPaste.recheck", {
                              defaultValue: "Re-check",
                            })}
                          </button>
                        </>
                      )}

                      {/* Step-by-step guide dialog */}
                      <Dialog
                        open={!!activeGuide}
                        onOpenChange={(open) => !open && setYdotoolGuideKey(null)}
                      >
                        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                          {activeGuide && (
                            <>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4" />
                                  {activeGuide.label}
                                </DialogTitle>
                                <DialogDescription>{activeGuide.desc}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-5 mt-2">
                                {activeGuide.steps.map((step, i) => (
                                  <div key={i}>
                                    <div className="flex items-start gap-3">
                                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                                        {i + 1}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium">{step.title}</p>
                                        {step.desc && (
                                          <p className="text-xs text-muted-foreground mt-0.5">
                                            {step.desc}
                                          </p>
                                        )}
                                        {step.cmds && step.cmds.length > 0 && (
                                          <div className="mt-2 space-y-2">
                                            {step.cmds.map((c, j) => (
                                              <div key={j}>
                                                {c.label && (
                                                  <p className="text-[11px] text-muted-foreground mb-1">
                                                    {c.label}
                                                  </p>
                                                )}
                                                <div className="flex items-start gap-1.5">
                                                  <pre className="flex-1 text-[11px] bg-muted/60 rounded-md px-3 py-2 font-mono whitespace-pre-wrap break-all select-all overflow-x-auto">
                                                    {c.cmd}
                                                  </pre>
                                                  <button
                                                    onClick={() =>
                                                      navigator.clipboard.writeText(c.cmd)
                                                    }
                                                    className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                                    title={t(
                                                      "settingsPage.general.waylandPaste.copy",
                                                      { defaultValue: "Copy" }
                                                    )}
                                                  >
                                                    <Copy className="w-3.5 h-3.5" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </DialogContent>
                      </Dialog>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );

      case "models":
        return (
          <div className="space-y-8">
            <ProcessingCard />

            {/* Two models, each behind its own screen. The lists of every
                model Oats can run are useful once, when choosing; on the page
                they were three long lists, two of them the same. */}
            <SettingsSection
              title={t("oats.settings.models.title")}
              description={t("oats.settings.models.description")}
            >
              <SettingRow
                label={t("oats.settings.models.speech")}
                description={t("oats.settings.models.speechDescription")}
              >
                <span className="max-w-48 truncate text-[13px] text-muted-foreground">
                  {speechModelLabel}
                </span>
                <Button variant="outline" size="sm" onClick={() => setModelScreen("speech")}>
                  {t("oats.settings.models.choose")}
                </Button>
              </SettingRow>
              <SettingRow
                label={t("oats.settings.models.writing")}
                description={t("oats.settings.models.writingDescription")}
              >
                <span className="max-w-48 truncate text-[13px] text-muted-foreground">
                  {writingModelLabel}
                </span>
                <Button variant="outline" size="sm" onClick={() => setModelScreen("writing")}>
                  {t("oats.settings.models.choose")}
                </Button>
              </SettingRow>
            </SettingsSection>

            <Dialog
              open={modelScreen === "speech"}
              onOpenChange={(open) => setModelScreen(open ? "speech" : null)}
            >
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("oats.settings.models.speechTitle")}</DialogTitle>
                  <DialogDescription>{t("oats.settings.models.speechScreen")}</DialogDescription>
                </DialogHeader>
                <TranscriptionSection
                  cloudTranscriptionMode={cloudTranscriptionMode}
                  setCloudTranscriptionMode={setCloudTranscriptionMode}
                  useLocalWhisper={useLocalWhisper}
                  setUseLocalWhisper={setUseLocalWhisper}
                  updateTranscriptionSettings={updateTranscriptionSettings}
                  cloudTranscriptionProvider={cloudTranscriptionProvider}
                  setCloudTranscriptionProvider={setCloudTranscriptionProvider}
                  cloudTranscriptionModel={cloudTranscriptionModel}
                  setCloudTranscriptionModel={setCloudTranscriptionModel}
                  localTranscriptionProvider={localTranscriptionProvider}
                  setLocalTranscriptionProvider={setLocalTranscriptionProvider}
                  whisperModel={whisperModel}
                  setWhisperModel={setWhisperModel}
                  parakeetModel={parakeetModel}
                  setParakeetModel={setParakeetModel}
                  cloudTranscriptionBaseUrl={cloudTranscriptionBaseUrl}
                  setCloudTranscriptionBaseUrl={setCloudTranscriptionBaseUrl}
                  transcriptionMode={transcriptionMode}
                  setTranscriptionMode={setTranscriptionMode}
                  remoteTranscriptionUrl={remoteTranscriptionUrl}
                  setRemoteTranscriptionUrl={setRemoteTranscriptionUrl}
                  remoteTranscriptionModel={remoteTranscriptionModel}
                  setRemoteTranscriptionModel={setRemoteTranscriptionModel}
                  showTranscriptionPreview={showTranscriptionPreview}
                  setShowTranscriptionPreview={setShowTranscriptionPreview}
                  hideModeSelector
                  streamingOnly
                  toast={toast}
                />
              </DialogContent>
            </Dialog>

            <Dialog
              open={modelScreen === "writing"}
              onOpenChange={(open) => setModelScreen(open ? "writing" : null)}
            >
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("oats.settings.models.writingTitle")}</DialogTitle>
                  <DialogDescription>{t("oats.settings.models.writingScreen")}</DialogDescription>
                </DialogHeader>
                <WritingModelEditor toast={toast} />
                <QuestionModelSettings />
              </DialogContent>
            </Dialog>
          </div>
        );

      case "connections":
        return (
          <div className="space-y-8">
            <SettingsSection
              title={t("oats.settings.connections.vaultTitle")}
              description={t("oats.settings.connections.vaultDescription")}
            >
              <VaultRow />
            </SettingsSection>

            {/* Save Notes as Files */}
            <div>
              <SectionHeader
                title={t("oats.settings.connections.filesTitle")}
                description={t("oats.settings.connections.filesDescription")}
              />
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settings.noteFiles.title")}
                    description={t("settings.noteFiles.description")}
                  >
                    <Toggle checked={noteFilesEnabled} onChange={handleNoteFilesToggle} />
                  </SettingsRow>
                </SettingsPanelRow>
                {noteFilesEnabled && (
                  <>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settings.noteFiles.path")}
                        description={noteFilesPath || noteFilesDefaultPath || "..."}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleNoteFilesChangePath}
                        >
                          {t("settings.noteFiles.changePath")}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settings.noteFiles.rebuild")}
                        description={t("settings.noteFiles.rebuildDescription")}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={noteFilesRebuilding}
                          onClick={handleNoteFilesRebuild}
                        >
                          {noteFilesRebuilding ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("settings.noteFiles.rebuild")
                          )}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                  </>
                )}
              </SettingsPanel>
            </div>
          </div>
        );

      case "privacy":
        return (
          <div className="space-y-8">
            {/* Permissions */}
            <div>
              <SectionHeader
                title={t("settingsPage.permissions.title")}
                description={t("settingsPage.permissions.description")}
              />

              <div className="space-y-3">
                <PermissionCard
                  icon={Mic}
                  title={t("settingsPage.permissions.microphoneTitle")}
                  description={t("settingsPage.permissions.microphoneDescription")}
                  granted={permissionsHook.micPermissionGranted}
                  onRequest={permissionsHook.requestMicPermission}
                  buttonText={t("settingsPage.permissions.grantAccess")}
                />

                {(platform === "darwin" || canManageSystemAudioInApp(systemAudio)) && (
                  <>
                    {platform === "darwin" && (
                      <PermissionCard
                        icon={Shield}
                        title={t("settingsPage.permissions.accessibilityTitle")}
                        description={t("settingsPage.permissions.accessibilityDescription")}
                        granted={permissionsHook.accessibilityPermissionGranted}
                        onRequest={permissionsHook.requestAccessibilityPermission}
                        buttonText={t("settingsPage.permissions.grantAccess")}
                      />
                    )}
                  </>
                )}
              </div>

              {!permissionsHook.micPermissionGranted && permissionsHook.micPermissionError && (
                <MicPermissionWarning
                  error={permissionsHook.micPermissionError}
                  onOpenSoundSettings={permissionsHook.openSoundInputSettings}
                  onOpenPrivacySettings={permissionsHook.openMicPrivacySettings}
                />
              )}

              {platform === "linux" &&
                permissionsHook.pasteToolsInfo &&
                !permissionsHook.pasteToolsInfo.available && (
                  <PasteToolsInfo
                    pasteToolsInfo={permissionsHook.pasteToolsInfo}
                    isChecking={permissionsHook.isCheckingPasteTools}
                    onCheck={permissionsHook.checkPasteToolsAvailability}
                  />
                )}

              {platform === "darwin" && (
                <div className="mt-8">
                  <SectionHeader title={t("settingsPage.permissions.troubleshootingTitle")} />
                  <SettingsPanel>
                    <SettingsPanelRow>
                      <SettingsRow
                        label={t("settingsPage.permissions.resetAccessibility.label")}
                        description={t(
                          "settingsPage.permissions.resetAccessibility.rowDescription"
                        )}
                      >
                        <Button onClick={resetAccessibilityPermissions} variant="outline" size="sm">
                          {t("settingsPage.permissions.troubleshoot")}
                        </Button>
                      </SettingsRow>
                    </SettingsPanelRow>
                  </SettingsPanel>
                </div>
              )}
            </div>

            {/* Audio Retention */}
            <div>
              <SectionHeader
                title={t("oats.settings.dictationAudio")}
                description={t("oats.settings.dictationAudioDescription")}
              />

              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow
                    label={t("settingsPage.privacy.audioStorageUsage")}
                    description={
                      audioStorageUsage.fileCount > 0
                        ? t("settingsPage.privacy.audioStorageFiles", {
                            count: audioStorageUsage.fileCount,
                            size: formatBytes(audioStorageUsage.totalBytes),
                          })
                        : t("settingsPage.privacy.audioStorageEmpty")
                    }
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={audioStorageUsage.fileCount === 0}
                      onClick={handleClearAllAudio}
                    >
                      {t("settingsPage.privacy.clearAllAudio")}
                    </Button>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>
          </div>
        );

      case "about":
        return (
          <div className="space-y-8">
            {/* Version. Updates are off until there is a release feed (D7), so
                nothing here claims "latest" or offers a check that cannot find
                anything. */}
            <div>
              <SettingsPanel>
                <SettingsPanelRow>
                  <SettingsRow label={t("settingsPage.general.updates.currentVersion")}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {currentVersion || t("settingsPage.general.updates.versionPlaceholder")}
                      </span>
                      {updateStatus.isDevelopment && (
                        <Badge variant="warning">
                          {t("settingsPage.general.updates.badges.dev")}
                        </Badge>
                      )}
                    </div>
                  </SettingsRow>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>

            {/* Developer Tools */}
            <div>
              <DeveloperSection />
            </div>

            {/* Data Management */}
            <div>
              <SectionHeader
                title={t("settingsPage.developer.dataManagementTitle")}
                description={t("settingsPage.developer.dataManagementDescription")}
              />

              <div className="space-y-4">
                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.developer.modelCache")}
                      description={cachePathHint}
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.electronAPI?.openWhisperModelsFolder?.()}
                        >
                          <FolderOpen aria-hidden="true" />
                          {t("settingsPage.developer.open")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={handleRemoveModels}
                          disabled={isRemovingModels}
                        >
                          {isRemovingModels
                            ? t("settingsPage.developer.removing")
                            : t("settingsPage.developer.clearCache")}
                        </Button>
                      </div>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>

                <SettingsPanel>
                  <SettingsPanelRow>
                    <SettingsRow
                      label={t("settingsPage.developer.resetAppData")}
                      description={t("settingsPage.developer.resetAppDataDescription")}
                    >
                      <Button
                        onClick={() => {
                          showConfirmDialog({
                            title: t("settingsPage.developer.resetAll.title"),
                            description: t("settingsPage.developer.resetAll.description"),
                            onConfirm: async () => {
                              try {
                                await window.electronAPI?.cleanupApp();
                                showAlertDialog({
                                  title: t("settingsPage.developer.resetAll.successTitle"),
                                  description: t(
                                    "settingsPage.developer.resetAll.successDescription"
                                  ),
                                });
                                setTimeout(() => {
                                  window.location.reload();
                                }, 1000);
                              } catch {
                                showAlertDialog({
                                  title: t("settingsPage.developer.resetAll.failedTitle"),
                                  description: t(
                                    "settingsPage.developer.resetAll.failedDescription"
                                  ),
                                });
                              }
                            },
                            variant: "destructive",
                            confirmText: t("settingsPage.developer.resetAll.confirmText"),
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive"
                      >
                        {t("common.reset")}
                      </Button>
                    </SettingsRow>
                  </SettingsPanelRow>
                </SettingsPanel>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      {renderSectionContent()}
    </>
  );
}
