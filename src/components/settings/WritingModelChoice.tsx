import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { ModelChoice, type ModelChoiceRow } from "./ModelChoice";
import { ProviderKey } from "./ProviderKeyField";
import OpenAICompatiblePanel from "../OpenAICompatiblePanel";
import { GpuStatusBadge } from "../ReasoningModelSelector";
import { useDialogs } from "../../hooks/useDialogs";
import { useTinfoilModels } from "../../hooks/useTinfoilModels";
import {
  cancelWritingModel,
  formatGigabytes,
  requestWritingModel,
  useWritingReport,
} from "../../hooks/useWritingModel";
import {
  chooseWritingModel,
  currentDefaultWritingModel,
  forgetWritingChoice,
  selectProcessingMode,
  setResolvedLLMConfig,
  useSettingsStore,
  writingModelFollowsDefault,
} from "../../stores/settingsStore";
import { modelRegistry, REASONING_PROVIDERS } from "../../models/ModelRegistry";
import {
  chooseLocalWritingModel,
  CLOUD_WRITING_MODELS,
  localWritingStatus,
} from "../../helpers/writingTier.mjs";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import { API_ENDPOINTS } from "../../config/constants";
import { getCachedPlatform } from "../../utils/platform";

/** The local model families, best known first, by the names people know them by. */
const LOCAL_FAMILIES: { id: string; name: string }[] = [
  { id: "gemma", name: "Gemma" },
  { id: "qwen", name: "Qwen" },
  { id: "llama", name: "Llama" },
  { id: "mistral", name: "Mistral" },
  { id: "openai-oss", name: "GPT-OSS" },
  { id: "liquidai", name: "Liquid AI" },
];

const CLOUD_PROVIDERS: { id: string; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "gemini", name: "Gemini" },
  { id: "groq", name: "Groq" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "tinfoil", name: "Tinfoil" },
];

/** A server of the person's own, and a custom endpoint: their own panels, no rows. */
const SERVER = "server";
const CUSTOM = "custom";

/**
 * Choosing the writing model yourself, under Advanced. On this Mac: the local
 * models by family, downloaded here; with an API key: each provider's models
 * and its key. A custom endpoint and a server of the person's own stay here,
 * at the end of the pills. The processing choice decides the side; this
 * never moves it, except that a server of the person's own is its own place.
 * Choosing Oats' own default again (Use on a Recommended model, or the
 * button) goes back to following the default.
 */
export function WritingModelChoice() {
  const { t, i18n } = useTranslation();
  const processing = useSettingsStore((state) => selectProcessingMode(state));
  const mode = useSettingsStore((state) => state.cleanupMode);
  const provider = useSettingsStore((state) => state.cleanupProvider);
  const model = useSettingsStore((state) => state.cleanupModel);
  const speechMode = useSettingsStore((state) => state.meetingTranscriptionMode);
  const openaiKey = useSettingsStore((state) => state.openaiApiKey);
  const anthropicKey = useSettingsStore((state) => state.anthropicApiKey);
  const cloudBaseUrl = useSettingsStore((state) => state.cleanupCloudBaseUrl);
  const remoteUrl = useSettingsStore((state) => state.cleanupRemoteUrl);
  const customKey = useSettingsStore((state) => state.cleanupCustomApiKey);
  const openrouterKey = useSettingsStore((state) => state.openrouterApiKey);
  const tier = useDeviceTierStore((state) => state.tier);
  const writing = useWritingReport();

  // The side the processing choice is on. With a server of the person's own
  // the writing scope is "self-hosted", and speech says where the rest runs.
  const side: "local" | "providers" =
    processing === "providers" ||
    (processing === "mixed" && (mode === "self-hosted" ? speechMode : mode) === "providers")
      ? "providers"
      : "local";
  const providers = [
    ...(side === "local"
      ? LOCAL_FAMILIES
      : [...CLOUD_PROVIDERS, { id: CUSTOM, name: t("oats.models.custom") }]),
    { id: SERVER, name: t("oats.models.server") },
  ];
  const familyOf = (id: string) => modelRegistry.getModel(id)?.provider.id ?? "gemma";
  const current =
    mode === "self-hosted"
      ? SERVER
      : side === "local"
        ? familyOf(model)
        : provider === CUSTOM
          ? CUSTOM
          : provider || "openai";
  const [view, setView] = useState(current);
  useEffect(() => setView(current), [current]);
  const tinfoil = useTinfoilModels(view === "tinfoil");

  // The default this side resolves to now, and the model this Mac's memory
  // holds (Recommended), as writingTier.mjs decides them.
  const sideDefault = currentDefaultWritingModel(
    { cleanupMode: side, openaiApiKey: openaiKey, anthropicApiKey: anthropicKey },
    tier
  );
  const preferred = chooseLocalWritingModel({
    memoryBytes: tier?.memoryBytes ?? tier?.device?.memoryBytes ?? null,
  }).model;

  /** Use a model: Oats' default again when it is the default, else a choice. */
  const use = (useProvider: string, id: string) => {
    const store = useSettingsStore.getState();
    if (store.cleanupMode !== side) {
      store.setCleanupMode(side);
      store.setNoteFormattingMode(side);
    }
    if (sideDefault && sideDefault.model === id && sideDefault.provider === useProvider) {
      forgetWritingChoice();
    } else {
      chooseWritingModel(useProvider, id);
    }
  };

  // A model downloaded from here is used once it is on disk, unless it is the
  // default, which the setting then follows by itself.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const id = pending.current;
    if (id && writing.installed.includes(id)) {
      pending.current = null;
      use("local", id);
    }
    // A failed or cancelled download is not used later by surprise.
    if (
      id &&
      !writing.downloading &&
      (writing.failed?.modelId === id || writing.declined.includes(id))
    ) {
      pending.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the report changes
  }, [writing]);

  const rows = useMemo<ModelChoiceRow[]>(() => {
    if (view === SERVER || view === CUSTOM || view === "openrouter") return [];
    if (side === "local") {
      const family = modelRegistry.getProvider(view);
      return (family?.models ?? []).map((item) => {
        const status = localWritingStatus(item.id, writing);
        const inUse = mode === "local" && model === item.id;
        return {
          id: item.id,
          name: item.name,
          size: formatGigabytes(item.sizeBytes, i18n.language),
          recommended: item.id === preferred,
          state:
            status === "downloading"
              ? "downloading"
              : status === "ready"
                ? inUse
                  ? "in-use"
                  : "ready"
                : status === "failed"
                  ? "failed"
                  : "download",
          percent:
            status === "downloading" && writing.downloading?.totalBytes
              ? Math.min(
                  100,
                  Math.floor(
                    (writing.downloading.receivedBytes / writing.downloading.totalBytes) * 100
                  )
                )
              : 0,
          removable: status === "ready",
        };
      });
    }
    const list =
      view === "tinfoil"
        ? tinfoil.models.map((item) => ({ value: item.id, label: item.name }))
        : (REASONING_PROVIDERS[view]?.models ?? []);
    return list.map((item) => ({
      id: item.value,
      name: item.label,
      recommended: item.value === CLOUD_WRITING_MODELS[view as keyof typeof CLOUD_WRITING_MODELS],
      state: mode === "providers" && provider === view && model === item.value ? "in-use" : "ready",
    }));
  }, [view, side, writing, mode, model, provider, preferred, i18n.language, tinfoil.models]);

  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();
  const remove = (id: string) =>
    showConfirmDialog({
      title: t("transcription.deleteModel.title"),
      description: t("transcription.deleteModel.description"),
      variant: "destructive",
      onConfirm: () => void window.electronAPI?.modelDelete?.(id),
    });

  const download = (id: string) => {
    if (!(
      sideDefault?.provider === "local" &&
      sideDefault.model === id &&
      writingModelFollowsDefault()
    )) {
      pending.current = id;
    }
    requestWritingModel(id);
  };

  // What the chosen provider needs first: its key, its endpoint, or its server.
  const slot =
    view === SERVER ? (
      <OpenAICompatiblePanel
        baseUrl={remoteUrl}
        setBaseUrl={(url) => {
          // Entering an address is choosing the server: it takes the writing.
          setResolvedLLMConfig("dictationCleanup", { remoteUrl: url });
          if (url.trim()) {
            const store = useSettingsStore.getState();
            store.setCleanupMode("self-hosted");
            store.setNoteFormattingMode("self-hosted");
          }
        }}
        apiKey={customKey}
        setApiKey={(key) => useSettingsStore.getState().setCleanupCustomApiKey(key)}
        model={mode === "self-hosted" ? model : ""}
        setModel={(next) => setResolvedLLMConfig("dictationCleanup", { model: next })}
        baseUrlPlaceholder="http://192.168.1.126:11434/v1"
        helpExamples={
          <p className="text-xs text-muted-foreground">{t("reasoning.selfHosted.endpointHelp")}</p>
        }
      />
    ) : view === CUSTOM ? (
      <OpenAICompatiblePanel
        baseUrl={cloudBaseUrl}
        setBaseUrl={(url) => useSettingsStore.getState().setCleanupCloudBaseUrl(url)}
        apiKey={customKey}
        setApiKey={(key) => useSettingsStore.getState().setCleanupCustomApiKey(key)}
        model={provider === CUSTOM ? model : ""}
        setModel={(next) => use(CUSTOM, next)}
        defaultBaseUrl={API_ENDPOINTS.OPENAI_BASE}
      />
    ) : view === "openrouter" ? (
      <OpenAICompatiblePanel
        baseUrl={API_ENDPOINTS.OPENROUTER_BASE}
        setBaseUrl={() => {}}
        apiKey={openrouterKey}
        setApiKey={(key) => useSettingsStore.getState().setOpenrouterApiKey(key)}
        model={provider === "openrouter" ? model : ""}
        setModel={(next) => use("openrouter", next)}
        lockedBaseUrl
        apiKeyRequired
        getKeyUrl="https://openrouter.ai/keys"
      />
    ) : side === "providers" ? (
      <ProviderKey provider={view} />
    ) : getCachedPlatform() !== "darwin" ? (
      <GpuStatusBadge />
    ) : undefined;

  const chosen = !writingModelFollowsDefault() || mode === "self-hosted";

  return (
    <>
      <ModelChoice
        title={t("oats.settings.models.writing")}
        description={t("oats.settings.models.writingDescription")}
        action={
          chosen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const store = useSettingsStore.getState();
                if (store.cleanupMode !== side) {
                  store.setCleanupMode(side);
                  store.setNoteFormattingMode(side);
                }
                forgetWritingChoice();
              }}
            >
              <RotateCcw aria-hidden="true" />
              {t("oats.models.useDefault")}
            </Button>
          ) : undefined
        }
        providers={providers}
        provider={view}
        onProvider={setView}
        rows={rows}
        onUse={(id) => use(side === "local" ? "local" : view, id)}
        onDownload={download}
        onCancel={() => cancelWritingModel()}
        onRemove={remove}
      >
        {slot}
      </ModelChoice>
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
    </>
  );
}
