import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { cn } from "./lib/utils";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Download, Trash2, Cloud, Lock, X, Zap, Check } from "lucide-react";
import { ProviderIcon } from "./ui/ProviderIcon";
import { ProviderTabs } from "./ui/ProviderTabs";
import ModelCardList from "./ui/ModelCardList";
import { DownloadProgressBar } from "./ui/DownloadProgressBar";
import ApiKeyInput from "./ui/ApiKeyInput";
import { ConfirmDialog } from "./ui/dialog";
import { useDialogs } from "../hooks/useDialogs";
import { useModelDownload, type DownloadProgress } from "../hooks/useModelDownload";
import {
  getTranscriptionProviders,
  getStreamingTranscriptionProviders,
  TranscriptionProviderData,
  WHISPER_MODEL_INFO,
  PARAKEET_MODEL_INFO,
} from "../models/ModelRegistry";
import {
  MODEL_PICKER_COLORS,
  type ColorScheme,
  type ModelPickerStyles,
} from "../utils/modelPickerStyles";
import { useSettingsStore } from "../stores/settingsStore";
import { getRemoteProviderIcon } from "../utils/providerIcons";
import { createExternalLinkHandler } from "../utils/externalLinks";
import { API_ENDPOINTS, normalizeBaseUrl } from "../config/constants";
import { GetApiKeyLink } from "./ui/GetApiKeyLink";
import { getCachedPlatform } from "../utils/platform";
import logger from "../utils/logger";

interface LocalModel {
  model: string;
  size_mb?: number;
  downloaded?: boolean;
}

interface LocalModelCardProps {
  modelId: string;
  name: string;
  description: string;
  size: string;
  actualSizeMb?: number;
  isSelected: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isCancelling: boolean;
  recommended?: boolean;
  provider: string;
  languageLabel?: string;
  onSelect: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCancel: () => void;
  styles: ModelPickerStyles;
}

function LocalModelCard({
  modelId,
  name,
  description,
  size,
  actualSizeMb,
  isSelected,
  isDownloaded,
  isDownloading,
  isCancelling,
  recommended,
  provider,
  languageLabel,
  onSelect,
  onDelete,
  onDownload,
  onCancel,
  styles: cardStyles,
}: LocalModelCardProps) {
  const { t } = useTranslation();
  const handleClick = () => {
    if (isDownloaded && !isSelected) {
      onSelect();
    }
  };

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      aria-disabled={!isDownloaded || undefined}
      tabIndex={isDownloaded ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && isDownloaded) {
          event.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors",
        "focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        isSelected ? "bg-primary/[0.06]" : isDownloaded ? "cursor-pointer hover:bg-muted/50" : ""
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          isSelected ? "border-primary bg-primary" : "border-input",
          !isDownloaded && "opacity-40"
        )}
      >
        {isSelected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
      </span>
      <ProviderIcon provider={provider} className="size-4 shrink-0" />
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
      <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
        {actualSizeMb ? `${actualSizeMb}MB` : size}
      </span>
      {recommended && (
        <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-brand-ink">
          {t("common.recommended")}
        </span>
      )}
      {languageLabel && (
        <span className="shrink-0 text-[13px] text-muted-foreground">{languageLabel}</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {isDownloaded ? (
          <>
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <Check aria-hidden="true" className="size-3.5 text-success" />
              {t("models.downloaded")}
            </span>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              size="icon-sm"
              variant="ghost"
              aria-label={t("models.delete", { model: name })}
              className="size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </Button>
          </>
        ) : isDownloading ? (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            disabled={isCancelling}
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
          >
            <X aria-hidden="true" />
            {isCancelling ? "…" : t("common.cancel")}
          </Button>
        ) : (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden="true" />
            {t("common.download")}
          </Button>
        )}
      </div>
    </div>
  );
}

interface TranscriptionModelPickerProps {
  selectedCloudProvider: string;
  onCloudProviderSelect: (providerId: string) => void;
  selectedCloudModel: string;
  onCloudModelSelect: (modelId: string) => void;
  selectedLocalModel: string;
  onLocalModelSelect: (modelId: string) => void;
  selectedLocalProvider?: string;
  onLocalProviderSelect?: (providerId: string) => void;
  useLocalWhisper: boolean;
  onModeChange: (useLocal: boolean) => void;
  cloudTranscriptionBaseUrl?: string;
  setCloudTranscriptionBaseUrl?: (url: string) => void;
  className?: string;
  variant?: "onboarding" | "settings";
  mode?: "cloud" | "local";
  streamingOnly?: boolean;
}

const CLOUD_PROVIDER_TABS = [
  { id: "openai", name: "OpenAI" },
  { id: "groq", name: "Groq" },
  { id: "xai", name: "xAI" },
  { id: "mistral", name: "Mistral" },
  { id: "tinfoil", name: "Tinfoil" },
  { id: "custom", name: "Custom" },
];

interface ProviderCredentialField {
  key: "openaiApiKey" | "groqApiKey" | "xaiApiKey" | "mistralApiKey" | "tinfoilApiKey";
  input: "secret" | "text" | "select";
  labelKey?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

const PROVIDER_CREDENTIALS: Record<
  string,
  { consoleUrl: string; fields: ProviderCredentialField[] }
> = {
  openai: {
    consoleUrl: "https://platform.openai.com/api-keys",
    fields: [{ key: "openaiApiKey", input: "secret" }],
  },
  groq: {
    consoleUrl: "https://console.groq.com/keys",
    fields: [{ key: "groqApiKey", input: "secret" }],
  },
  xai: {
    consoleUrl: "https://console.x.ai",
    fields: [{ key: "xaiApiKey", input: "secret" }],
  },
  mistral: {
    consoleUrl: "https://console.mistral.ai/api-keys",
    fields: [{ key: "mistralApiKey", input: "secret" }],
  },
  tinfoil: {
    consoleUrl: "https://tinfoil.sh/inference?utm_source=referral&utm_campaign=oats",
    fields: [{ key: "tinfoilApiKey", input: "secret" }],
  },
};

const VALID_CLOUD_PROVIDER_IDS = CLOUD_PROVIDER_TABS.map((p) => p.id);

const TINFOIL_AUDIO_DOCS_URL = "https://docs.tinfoil.sh/models/audio";

const LOCAL_PROVIDER_TABS: Array<{ id: string; name: string; disabled?: boolean }> = [
  { id: "whisper", name: "OpenAI" },
  { id: "nvidia", name: "NVIDIA" },
];

interface ModeToggleProps {
  useLocalWhisper: boolean;
  onModeChange: (useLocal: boolean) => void;
}

function ModeToggle({ useLocalWhisper, onModeChange }: ModeToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="relative flex p-0.5 rounded-lg bg-surface-1/80 backdrop-blur-xl dark:bg-surface-1 border border-border/60 dark:border-white/8 shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark)">
      <div
        className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md bg-card border border-border/60 dark:border-border-subtle shadow-(--shadow-metallic-light) dark:shadow-(--shadow-metallic-dark) transition-transform duration-200 ease-out ${
          useLocalWhisper ? "translate-x-[calc(100%)]" : "translate-x-0"
        }`}
      />
      <button
        onClick={() => onModeChange(false)}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-colors duration-150 ${
          !useLocalWhisper ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Cloud className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t("common.cloud")}</span>
      </button>
      <button
        onClick={() => onModeChange(true)}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md transition-colors duration-150 ${
          useLocalWhisper ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Lock className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">{t("common.local")}</span>
      </button>
    </div>
  );
}

export default function TranscriptionModelPicker({
  selectedCloudProvider,
  onCloudProviderSelect,
  selectedCloudModel,
  onCloudModelSelect,
  selectedLocalModel,
  onLocalModelSelect,
  selectedLocalProvider = "whisper",
  onLocalProviderSelect,
  useLocalWhisper,
  onModeChange,
  cloudTranscriptionBaseUrl = "",
  setCloudTranscriptionBaseUrl,
  className = "",
  variant = "settings",
  mode,
  streamingOnly = false,
}: TranscriptionModelPickerProps) {
  const { t } = useTranslation();
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const setGroqApiKey = useSettingsStore((s) => s.setGroqApiKey);
  const xaiApiKey = useSettingsStore((s) => s.xaiApiKey);
  const setXaiApiKey = useSettingsStore((s) => s.setXaiApiKey);
  const mistralApiKey = useSettingsStore((s) => s.mistralApiKey);
  const setMistralApiKey = useSettingsStore((s) => s.setMistralApiKey);
  const tinfoilApiKey = useSettingsStore((s) => s.tinfoilApiKey);
  const setTinfoilApiKey = useSettingsStore((s) => s.setTinfoilApiKey);
  const customTranscriptionApiKey = useSettingsStore((s) => s.customTranscriptionApiKey);
  const setCustomTranscriptionApiKey = useSettingsStore((s) => s.setCustomTranscriptionApiKey);
  const effectiveLocal = mode === "local" ? true : mode === "cloud" ? false : useLocalWhisper;
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [parakeetModels, setParakeetModels] = useState<LocalModel[]>([]);
  const [internalLocalProvider, setInternalLocalProvider] = useState(selectedLocalProvider);
  const hasLoadedRef = useRef(false);
  const hasLoadedParakeetRef = useRef(false);
  const [gpuBackend, setGpuBackend] = useState<"cuda" | "vulkan" | null>(null);
  const [gpuDownloaded, setGpuDownloaded] = useState(false);
  const [gpuDownloading, setGpuDownloading] = useState(false);
  const [gpuProgress, setGpuProgress] = useState<DownloadProgress>({
    downloadedBytes: 0,
    totalBytes: 0,
    percentage: 0,
  });
  const [gpuDismissed, setGpuDismissed] = useState(false);

  useEffect(() => {
    if (selectedLocalProvider !== internalLocalProvider) {
      setInternalLocalProvider(selectedLocalProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync prop→state: only re-run when the prop changes
  }, [selectedLocalProvider]);
  const isLoadingRef = useRef(false);
  const isLoadingParakeetRef = useRef(false);
  const loadLocalModelsRef = useRef<(() => Promise<void>) | null>(null);
  const loadParakeetModelsRef = useRef<(() => Promise<void>) | null>(null);
  const ensureValidCloudSelectionRef = useRef<(() => void) | null>(null);
  const selectedLocalModelRef = useRef(selectedLocalModel);
  const onLocalModelSelectRef = useRef(onLocalModelSelect);

  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();
  const colorScheme: ColorScheme = variant === "settings" ? "purple" : "blue";
  const styles = useMemo(() => MODEL_PICKER_COLORS[colorScheme], [colorScheme]);
  const cloudProviders = useMemo(
    () => (streamingOnly ? getStreamingTranscriptionProviders() : getTranscriptionProviders()),
    [streamingOnly]
  );
  const cloudProviderTabs = useMemo(() => {
    const visibleIds = new Set([...cloudProviders.map((p) => p.id), "custom"]);
    return CLOUD_PROVIDER_TABS.filter((p) => visibleIds.has(p.id)).map((provider) =>
      provider.id === "custom" ? { ...provider, name: t("transcription.customProvider") } : provider
    );
  }, [cloudProviders, t]);

  useEffect(() => {
    selectedLocalModelRef.current = selectedLocalModel;
  }, [selectedLocalModel]);
  useEffect(() => {
    onLocalModelSelectRef.current = onLocalModelSelect;
  }, [onLocalModelSelect]);

  const validateAndSelectModel = useCallback((loadedModels: LocalModel[]) => {
    const current = selectedLocalModelRef.current;
    if (!current) return;

    const downloaded = loadedModels.filter((m) => m.downloaded);
    const isCurrentDownloaded = loadedModels.find((m) => m.model === current)?.downloaded;

    if (!isCurrentDownloaded && downloaded.length > 0) {
      onLocalModelSelectRef.current(downloaded[0].model);
    } else if (!isCurrentDownloaded && downloaded.length === 0) {
      onLocalModelSelectRef.current("");
    }
  }, []);

  const loadLocalModels = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const result = await window.electronAPI?.listWhisperModels();
      if (result?.success) {
        setLocalModels(result.models);
        validateAndSelectModel(result.models);
      }
    } catch (error) {
      logger.error("Failed to load models", { error }, "models");
      setLocalModels([]);
    } finally {
      isLoadingRef.current = false;
    }
  }, [validateAndSelectModel]);

  const loadParakeetModels = useCallback(async () => {
    if (isLoadingParakeetRef.current) return;
    isLoadingParakeetRef.current = true;

    try {
      const result = await window.electronAPI?.listParakeetModels();
      if (result?.success) {
        setParakeetModels(result.models);
      }
    } catch (error) {
      logger.error("Failed to load Parakeet models", { error }, "models");
      setParakeetModels([]);
    } finally {
      isLoadingParakeetRef.current = false;
    }
  }, []);

  const ensureValidCloudSelection = useCallback(() => {
    const isValidProvider = VALID_CLOUD_PROVIDER_IDS.includes(selectedCloudProvider);

    if (!isValidProvider) {
      const knownProviderUrls = cloudProviders.map((p) => p.baseUrl);
      const hasCustomUrl =
        cloudTranscriptionBaseUrl &&
        cloudTranscriptionBaseUrl.trim() !== "" &&
        cloudTranscriptionBaseUrl !== API_ENDPOINTS.TRANSCRIPTION_BASE &&
        !knownProviderUrls.includes(cloudTranscriptionBaseUrl);

      if (hasCustomUrl) {
        onCloudProviderSelect("custom");
      } else {
        const firstProvider = cloudProviders[0];
        if (firstProvider) {
          onCloudProviderSelect(firstProvider.id);
          if (firstProvider.models?.length) {
            onCloudModelSelect(firstProvider.models[0].id);
          }
        }
      }
    } else if (selectedCloudProvider !== "custom" && !selectedCloudModel) {
      const provider = cloudProviders.find((p) => p.id === selectedCloudProvider);
      if (provider?.models?.length) {
        onCloudModelSelect(provider.models[0].id);
      }
    }
  }, [
    cloudProviders,
    cloudTranscriptionBaseUrl,
    selectedCloudProvider,
    selectedCloudModel,
    onCloudProviderSelect,
    onCloudModelSelect,
  ]);

  useEffect(() => {
    loadLocalModelsRef.current = loadLocalModels;
  }, [loadLocalModels]);
  useEffect(() => {
    loadParakeetModelsRef.current = loadParakeetModels;
  }, [loadParakeetModels]);
  useEffect(() => {
    ensureValidCloudSelectionRef.current = ensureValidCloudSelection;
  }, [ensureValidCloudSelection]);

  useEffect(() => {
    if (!effectiveLocal) return;

    if (internalLocalProvider === "whisper" && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadLocalModelsRef.current?.();
    } else if (internalLocalProvider === "nvidia" && !hasLoadedParakeetRef.current) {
      hasLoadedParakeetRef.current = true;
      loadParakeetModelsRef.current?.();
    }
  }, [effectiveLocal, internalLocalProvider]);

  useEffect(() => {
    if (effectiveLocal) return;

    hasLoadedRef.current = false;
    hasLoadedParakeetRef.current = false;
    ensureValidCloudSelectionRef.current?.();
  }, [effectiveLocal]);

  useEffect(() => {
    const handleModelsCleared = () => {
      loadLocalModels();
      loadParakeetModels();
    };
    window.addEventListener("oats-models-cleared", handleModelsCleared);
    return () => window.removeEventListener("oats-models-cleared", handleModelsCleared);
  }, [loadLocalModels, loadParakeetModels]);

  useEffect(() => {
    if (!effectiveLocal || internalLocalProvider !== "whisper") return;
    if (getCachedPlatform() === "darwin") return;
    const detect = async () => {
      try {
        const cuda = await window.electronAPI?.getCudaWhisperStatus?.();
        if (cuda?.gpuInfo.hasNvidiaGpu) {
          setGpuBackend("cuda");
          setGpuDownloaded(cuda.downloaded);
          return;
        }
        const vulkan = await window.electronAPI?.getVulkanWhisperStatus?.();
        if (vulkan?.vulkan.available) {
          setGpuBackend("vulkan");
          setGpuDownloaded(vulkan.downloaded);
        }
      } catch {}
    };
    detect();
  }, [effectiveLocal, internalLocalProvider]);

  useEffect(() => {
    if (!gpuDownloading || !gpuBackend) return;
    const subscribe =
      gpuBackend === "cuda"
        ? window.electronAPI?.onCudaDownloadProgress
        : window.electronAPI?.onVulkanWhisperDownloadProgress;
    return subscribe?.((data) => setGpuProgress(data));
  }, [gpuDownloading, gpuBackend]);

  const handleGpuDownload = async () => {
    setGpuDownloading(true);
    try {
      const result =
        gpuBackend === "cuda"
          ? await window.electronAPI?.downloadCudaWhisperBinary?.()
          : await window.electronAPI?.downloadVulkanWhisperBinary?.();
      if (result?.success) setGpuDownloaded(true);
    } finally {
      setGpuDownloading(false);
    }
  };

  const handleGpuDelete = async () => {
    const result =
      gpuBackend === "cuda"
        ? await window.electronAPI?.deleteCudaWhisperBinary?.()
        : await window.electronAPI?.deleteVulkanWhisperBinary?.();
    if (result?.success) setGpuDownloaded(false);
  };

  const handleGpuCancel = async () => {
    if (gpuBackend === "cuda") await window.electronAPI?.cancelCudaWhisperDownload?.();
    else await window.electronAPI?.cancelVulkanWhisperDownload?.();
    setGpuDownloading(false);
  };

  const {
    downloadingModel,
    downloadProgress,
    downloadModel,
    deleteModel,
    isDownloadingModel,
    isInstalling,
    cancelDownload,
    isCancelling,
  } = useModelDownload({
    modelType: "whisper",
    onDownloadComplete: loadLocalModels,
  });

  const {
    downloadingModel: downloadingParakeetModel,
    downloadProgress: parakeetDownloadProgress,
    downloadModel: downloadParakeetModel,
    deleteModel: deleteParakeetModel,
    isDownloadingModel: isDownloadingParakeetModel,
    isInstalling: isInstallingParakeet,
    cancelDownload: cancelParakeetDownload,
    isCancelling: isCancellingParakeet,
  } = useModelDownload({
    modelType: "parakeet",
    onDownloadComplete: loadParakeetModels,
  });

  const handleModeChange = useCallback(
    (isLocal: boolean) => {
      onModeChange(isLocal);
      if (!isLocal) ensureValidCloudSelection();
    },
    [onModeChange, ensureValidCloudSelection]
  );

  const handleCloudProviderChange = useCallback(
    (providerId: string) => {
      onCloudProviderSelect(providerId);
      const provider = cloudProviders.find((p) => p.id === providerId);

      if (providerId === "custom") {
        onCloudModelSelect("whisper-1");
        return;
      }

      if (provider) {
        setCloudTranscriptionBaseUrl?.(provider.baseUrl);
        if (provider.models?.length) {
          onCloudModelSelect(provider.models[0].id);
        }
      }
    },
    [cloudProviders, onCloudProviderSelect, onCloudModelSelect, setCloudTranscriptionBaseUrl]
  );

  const handleLocalProviderChange = useCallback(
    (providerId: string) => {
      const tab = LOCAL_PROVIDER_TABS.find((t) => t.id === providerId);
      if (tab?.disabled) return;
      setInternalLocalProvider(providerId);
      onLocalProviderSelect?.(providerId);
    },
    [onLocalProviderSelect]
  );

  const handleWhisperModelSelect = useCallback(
    (modelId: string) => {
      onLocalProviderSelect?.("whisper");
      setInternalLocalProvider("whisper");
      onLocalModelSelect(modelId);
    },
    [onLocalModelSelect, onLocalProviderSelect]
  );

  const handleParakeetModelSelect = useCallback(
    (modelId: string) => {
      onLocalProviderSelect?.("nvidia");
      setInternalLocalProvider("nvidia");
      onLocalModelSelect(modelId);
    },
    [onLocalModelSelect, onLocalProviderSelect]
  );

  const handleBaseUrlBlur = useCallback(() => {
    if (!setCloudTranscriptionBaseUrl || selectedCloudProvider !== "custom") return;

    const trimmed = (cloudTranscriptionBaseUrl || "").trim();
    if (!trimmed) return;

    const normalized = normalizeBaseUrl(trimmed);

    if (normalized && normalized !== cloudTranscriptionBaseUrl) {
      setCloudTranscriptionBaseUrl(normalized);
    }
    if (normalized) {
      for (const provider of cloudProviders) {
        const providerNormalized = normalizeBaseUrl(provider.baseUrl);
        if (normalized === providerNormalized) {
          onCloudProviderSelect(provider.id);
          onCloudModelSelect("whisper-1");
          break;
        }
      }
    }
  }, [
    cloudTranscriptionBaseUrl,
    selectedCloudProvider,
    setCloudTranscriptionBaseUrl,
    onCloudProviderSelect,
    onCloudModelSelect,
    cloudProviders,
  ]);

  const handleDelete = useCallback(
    (modelId: string) => {
      showConfirmDialog({
        title: t("transcription.deleteModel.title"),
        description: t("transcription.deleteModel.description"),
        onConfirm: async () => {
          await deleteModel(modelId, async () => {
            const result = await window.electronAPI?.listWhisperModels();
            if (result?.success) {
              setLocalModels(result.models);
              validateAndSelectModel(result.models);
            }
          });
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, deleteModel, validateAndSelectModel, t]
  );

  const currentCloudProvider = useMemo<TranscriptionProviderData | undefined>(
    () => cloudProviders.find((p) => p.id === selectedCloudProvider),
    [cloudProviders, selectedCloudProvider]
  );

  const providerCredentials =
    PROVIDER_CREDENTIALS[selectedCloudProvider] ?? PROVIDER_CREDENTIALS.openai;
  const credentialValues: Record<ProviderCredentialField["key"], string> = {
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    tinfoilApiKey,
  };
  const credentialSetters: Record<ProviderCredentialField["key"], (value: string) => void> = {
    openaiApiKey: setOpenaiApiKey,
    groqApiKey: setGroqApiKey,
    xaiApiKey: setXaiApiKey,
    mistralApiKey: setMistralApiKey,
    tinfoilApiKey: setTinfoilApiKey,
  };

  const cloudModelOptions = useMemo(() => {
    if (!currentCloudProvider) return [];
    const { icon, invertInDark } = getRemoteProviderIcon(selectedCloudProvider);
    return currentCloudProvider.models.map((m) => ({
      value: m.id,
      label: m.name,
      description: m.descriptionKey
        ? t(m.descriptionKey, { defaultValue: m.description })
        : m.description,
      icon,
      invertInDark,
    }));
  }, [currentCloudProvider, selectedCloudProvider, t]);

  const progressDisplay = useMemo(() => {
    if (!effectiveLocal) return null;

    if (downloadingModel && internalLocalProvider === "whisper") {
      const modelInfo = WHISPER_MODEL_INFO[downloadingModel];
      return (
        <DownloadProgressBar
          modelName={modelInfo?.name || downloadingModel}
          progress={downloadProgress}
          isInstalling={isInstalling}
        />
      );
    }

    if (downloadingParakeetModel && internalLocalProvider === "nvidia") {
      const modelInfo = PARAKEET_MODEL_INFO[downloadingParakeetModel];
      return (
        <DownloadProgressBar
          modelName={modelInfo?.name || downloadingParakeetModel}
          progress={parakeetDownloadProgress}
          isInstalling={isInstallingParakeet}
        />
      );
    }

    return null;
  }, [
    downloadingModel,
    downloadProgress,
    isInstalling,
    downloadingParakeetModel,
    parakeetDownloadProgress,
    isInstallingParakeet,
    effectiveLocal,
    internalLocalProvider,
  ]);

  const renderLocalModels = () => {
    // The English-only twins are not offered as choices.
    //
    // `base.en` is not a different quality tier — it is the same tier with the
    // other ninety-eight languages removed, and for an English speaker it is
    // strictly better on both accuracy and speed. There is nothing to weigh, so
    // `helpers/whisperEnglishModel.mjs` selects it automatically when the
    // configured language is English. Listing it would double this list with a
    // decision nobody should have to make.
    const isOffered = (modelId: string) => !WHISPER_MODEL_INFO[modelId]?.englishOnly;
    const modelsToRender =
      localModels.length === 0
        ? Object.entries(WHISPER_MODEL_INFO)
            .filter(([modelId]) => isOffered(modelId))
            .map(([modelId, info]) => ({
              model: modelId,
              downloaded: false,
              size_mb: info.sizeMb,
            }))
        : localModels.filter((model) => isOffered(model.model));

    return (
      <div
        role="radiogroup"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {modelsToRender.map((model) => {
          const modelId = model.model;
          const info = WHISPER_MODEL_INFO[modelId] ?? {
            name: modelId,
            description: t("transcription.fallback.whisperModelDescription"),
            size: t("common.unknown"),
            recommended: false,
          };

          return (
            <LocalModelCard
              key={modelId}
              modelId={modelId}
              name={info.name}
              description={info.description}
              size={info.size}
              actualSizeMb={model.size_mb}
              isSelected={modelId === selectedLocalModel}
              isDownloaded={model.downloaded ?? false}
              isDownloading={isDownloadingModel(modelId)}
              isCancelling={isCancelling}
              recommended={info.recommended}
              provider="whisper"
              onSelect={() => handleWhisperModelSelect(modelId)}
              onDelete={() => handleDelete(modelId)}
              onDownload={() =>
                downloadModel(modelId, (downloadedId) => {
                  setLocalModels((prev) =>
                    prev.map((m) => (m.model === downloadedId ? { ...m, downloaded: true } : m))
                  );
                  handleWhisperModelSelect(downloadedId);
                })
              }
              onCancel={cancelDownload}
              styles={styles}
            />
          );
        })}
      </div>
    );
  };

  const handleParakeetDelete = useCallback(
    (modelId: string) => {
      showConfirmDialog({
        title: t("transcription.deleteModel.title"),
        description: t("transcription.deleteModel.description"),
        onConfirm: async () => {
          await deleteParakeetModel(modelId, async () => {
            const result = await window.electronAPI?.listParakeetModels();
            if (result?.success) {
              setParakeetModels(result.models);
            }
          });
        },
        variant: "destructive",
      });
    },
    [showConfirmDialog, deleteParakeetModel, t]
  );

  const renderParakeetModels = () => {
    const modelsToRender =
      parakeetModels.length === 0
        ? Object.entries(PARAKEET_MODEL_INFO).map(([modelId, info]) => ({
            model: modelId,
            downloaded: false,
            size_mb: info.sizeMb,
          }))
        : parakeetModels;

    return (
      <div
        role="radiogroup"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs"
      >
        {modelsToRender.map((model) => {
          const modelId = model.model;
          const info = PARAKEET_MODEL_INFO[modelId] ?? {
            name: modelId,
            description: t("transcription.fallback.parakeetModelDescription"),
            size: t("common.unknown"),
            language: "en",
            recommended: false,
          };

          return (
            <LocalModelCard
              key={modelId}
              modelId={modelId}
              name={info.name}
              description={info.description}
              size={info.size}
              actualSizeMb={model.size_mb}
              isSelected={modelId === selectedLocalModel}
              isDownloaded={model.downloaded ?? false}
              isDownloading={isDownloadingParakeetModel(modelId)}
              isCancelling={isCancellingParakeet}
              recommended={info.recommended}
              provider="nvidia"
              onSelect={() => handleParakeetModelSelect(modelId)}
              onDelete={() => handleParakeetDelete(modelId)}
              onDownload={() =>
                downloadParakeetModel(modelId, (downloadedId) => {
                  setParakeetModels((prev) =>
                    prev.map((m) => (m.model === downloadedId ? { ...m, downloaded: true } : m))
                  );
                  handleParakeetModelSelect(downloadedId);
                })
              }
              onCancel={cancelParakeetDownload}
              styles={styles}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {!mode && <ModeToggle useLocalWhisper={effectiveLocal} onModeChange={handleModeChange} />}

      {!effectiveLocal ? (
        <>
          <ProviderTabs
            providers={cloudProviderTabs}
            selectedId={selectedCloudProvider}
            onSelect={handleCloudProviderChange}
            colorScheme="purple"
            wrap
          />

          <div>
            {selectedCloudProvider === "custom" ? (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {t("transcription.endpointUrl")}
                  </label>
                  <Input
                    value={cloudTranscriptionBaseUrl}
                    onChange={(e) => setCloudTranscriptionBaseUrl?.(e.target.value)}
                    onBlur={handleBaseUrlBlur}
                    placeholder="https://your-api.example.com/v1"
                    className="h-8 text-sm"
                  />
                </div>

                <ApiKeyInput
                  apiKey={customTranscriptionApiKey}
                  setApiKey={setCustomTranscriptionApiKey}
                  label={t("transcription.apiKeyOptional")}
                  helpText=""
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-foreground">
                    {t("common.model")}
                  </label>
                  <Input
                    value={selectedCloudModel}
                    onChange={(e) => onCloudModelSelect(e.target.value)}
                    placeholder="whisper-1"
                    className="h-8 text-sm"
                  />
                </div>

                {/azure\.com/i.test(cloudTranscriptionBaseUrl || "") && (
                  <p className="text-xs text-muted-foreground">{t("transcription.azureHint")}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {providerCredentials.fields.map((field, index) => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground">
                        {field.labelKey ? t(field.labelKey) : t("common.apiKey")}
                      </label>
                      {index === 0 && (
                        <GetApiKeyLink
                          url={providerCredentials.consoleUrl}
                          labelKey="transcription.getKey"
                          className="text-xs text-brand-ink/70 hover:text-brand-ink transition-colors cursor-pointer"
                        />
                      )}
                    </div>
                    {field.input === "secret" ? (
                      <ApiKeyInput
                        apiKey={credentialValues[field.key]}
                        setApiKey={credentialSetters[field.key]}
                        label=""
                        helpText=""
                      />
                    ) : field.input === "select" ? (
                      <Select
                        value={credentialValues[field.key]}
                        onValueChange={credentialSetters[field.key]}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={credentialValues[field.key]}
                        onChange={(e) => credentialSetters[field.key](e.target.value)}
                        placeholder={field.placeholder}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{t("common.model")}</label>
                  <ModelCardList
                    models={cloudModelOptions}
                    selectedModel={selectedCloudModel}
                    onModelSelect={onCloudModelSelect}
                    colorScheme="purple"
                  />
                  {selectedCloudProvider === "tinfoil" && (
                    <p className="text-xs text-muted-foreground/70">
                      {t("transcription.tinfoil.transportNote")}{" "}
                      <a
                        href={TINFOIL_AUDIO_DOCS_URL}
                        onClick={createExternalLinkHandler(TINFOIL_AUDIO_DOCS_URL)}
                        className="text-brand-ink/70 hover:text-brand-ink transition-colors"
                      >
                        {t("transcription.tinfoil.docsLink")}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <ProviderTabs
            providers={LOCAL_PROVIDER_TABS}
            selectedId={internalLocalProvider}
            onSelect={handleLocalProviderChange}
            colorScheme="purple"
          />

          {progressDisplay}

          {gpuDownloading && internalLocalProvider === "whisper" && (
            <div>
              <DownloadProgressBar modelName={t("models.progress.gpu")} progress={gpuProgress} />
              <div className="px-2.5 pb-1 flex justify-end">
                <button
                  onClick={handleGpuCancel}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("gpu.cancel")}
                </button>
              </div>
            </div>
          )}

          {internalLocalProvider === "whisper" &&
            !gpuDismissed &&
            !gpuDownloading &&
            gpuBackend && (
              <div className="rounded-md border border-border bg-surface-1 p-2.5">
                {gpuDownloaded ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Check size={13} className="text-success" />
                      <span className="text-xs font-medium text-foreground">{t("gpu.active")}</span>
                    </div>
                    <Button
                      onClick={handleGpuDelete}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t("gpu.remove")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <Zap size={13} className="text-brand-ink shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {t("gpu.transcriptionBanner")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Button
                          onClick={handleGpuDownload}
                          size="sm"
                          variant="default"
                          className="h-6 px-2.5 text-xs"
                        >
                          {t("gpu.enableButton")}
                        </Button>
                        <button
                          onClick={() => setGpuDismissed(true)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t("gpu.dismiss")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          <div>
            {internalLocalProvider === "whisper" && renderLocalModels()}
            {internalLocalProvider === "nvidia" && renderParakeetModels()}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />
    </div>
  );
}
