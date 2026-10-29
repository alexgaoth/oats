import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { ModelChoice, type ModelChoiceRow } from "./ModelChoice";
import { ProviderKey } from "./ProviderKeyField";
import { WhisperAcceleration } from "./WhisperAcceleration";
import { useDialogs } from "../../hooks/useDialogs";
import { useModelDownload } from "../../hooks/useModelDownload";
import {
  cancelTurbo,
  formatMegabytes,
  requestTurbo,
  useSpeechTier,
} from "../../hooks/useSpeechTier";
import {
  chooseCloudSpeechModel,
  chooseLocalSpeechModel,
  forgetSpeechChoice,
  selectProcessingMode,
  useSettingsStore,
  whisperModelFollowsDefault,
} from "../../stores/settingsStore";
import {
  getStreamingTranscriptionProviders,
  PARAKEET_MODEL_INFO,
  WHISPER_MODEL_INFO,
} from "../../models/ModelRegistry";
import { isEnglish } from "../../helpers/whisperEnglishModel.mjs";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { getCachedPlatform } from "../../utils/platform";

type Listed = { model: string; downloaded: boolean; size_mb?: number };

/** A speech model's size, from its megabytes ("466 MB", "1.5 GB"), in the UI's language. */
function formatSize(megabytes: number | undefined, language: string): string | undefined {
  if (!megabytes) return undefined;
  if (megabytes < 1000) return formatMegabytes(megabytes * 1_000_000, language);
  try {
    return new Intl.NumberFormat(language, {
      style: "unit",
      unit: "gigabyte",
      maximumFractionDigits: 1,
    }).format(megabytes / 1000);
  } catch {
    return `${(megabytes / 1000).toFixed(1)} GB`;
  }
}

/** The cloud speech models a conversation can use: OpenAI's realtime ones. */
const CLOUD_SPEECH = () =>
  getStreamingTranscriptionProviders().find((provider) => provider.id === "openai")?.models ?? [];

/**
 * Choosing the speech model yourself, under Advanced. On this Mac: Whisper's
 * sizes and NVIDIA's Parakeet models, downloaded here. With an API key:
 * OpenAI's realtime models, the only ones a conversation streams to. The
 * processing choice decides which; this never changes where speech runs.
 */
export function SpeechModelChoice() {
  const { t, i18n } = useTranslation();
  const processing = useSettingsStore((state) => selectProcessingMode(state));
  const conversationLocal = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const whisperModel = useSettingsStore((state) => state.whisperModel);
  const parakeetModel = useSettingsStore((state) => state.parakeetModel);
  const cloudModel = useSettingsStore((state) => state.cloudTranscriptionModel);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const openaiKey = useSettingsStore((state) => state.openaiApiKey);
  const speechTier = useSpeechTier();
  // With API keys the chooser shows OpenAI, even while speech waits on this
  // Mac for its key; on this Mac (or mixed, where speech is local) the engines.
  const side =
    processing === "providers" || (processing === "mixed" && !conversationLocal)
      ? "providers"
      : "local";
  const providers =
    side === "providers"
      ? [{ id: "openai", name: "OpenAI" }]
      : [
          { id: "whisper", name: "Whisper" },
          { id: "nvidia", name: "NVIDIA Parakeet" },
        ];
  const current = side === "providers" ? "openai" : engine === "nvidia" ? "nvidia" : "whisper";
  const [view, setView] = useState(current);
  useEffect(() => setView(current), [current]);

  const [whisperList, setWhisperList] = useState<Listed[]>([]);
  const [parakeetList, setParakeetList] = useState<Listed[]>([]);
  const loadWhisper = useCallback(async () => {
    try {
      const result = await window.electronAPI?.listWhisperModels?.();
      setWhisperList(result?.success && Array.isArray(result.models) ? result.models : []);
    } catch {
      setWhisperList([]);
    }
  }, []);
  const loadParakeet = useCallback(async () => {
    try {
      const result = await window.electronAPI?.listParakeetModels?.();
      setParakeetList(result?.success && Array.isArray(result.models) ? result.models : []);
    } catch {
      setParakeetList([]);
    }
  }, []);
  useEffect(() => {
    if (side !== "local") return;
    void loadWhisper();
    void loadParakeet();
  }, [side, loadWhisper, loadParakeet, speechTier.tier?.turbo?.installed]);

  const whisper = useModelDownload({ modelType: "whisper", onDownloadComplete: loadWhisper });
  const parakeet = useModelDownload({ modelType: "parakeet", onDownloadComplete: loadParakeet });
  const { confirmDialog, showConfirmDialog, hideConfirmDialog } = useDialogs();

  const english = isEnglish(language);
  const turbo = speechTier.tier?.turbo;
  const rows = useMemo<ModelChoiceRow[]>(() => {
    if (view === "openai") {
      const inUse = conversationLocal ? null : cloudModel;
      return CLOUD_SPEECH().map((model, index) => ({
        id: model.id,
        name: model.name,
        recommended: index === 0,
        state: model.id === inUse ? "in-use" : "ready",
      }));
    }
    if (view === "nvidia") {
      const listed = new Map(parakeetList.map((item) => [item.model, item]));
      return Object.entries(PARAKEET_MODEL_INFO).map(([id, info]) => {
        const downloaded = Boolean(listed.get(id)?.downloaded);
        const inUse = conversationLocal && engine === "nvidia" && parakeetModel === id;
        return {
          id,
          name: info.name,
          size: formatSize(listed.get(id)?.size_mb ?? info.sizeMb, i18n.language),
          note: info.language === "en" ? t("oats.models.englishOnly") : undefined,
          state: parakeet.isDownloadingModel(id)
            ? "downloading"
            : inUse && downloaded
              ? "in-use"
              : downloaded
                ? "ready"
                : "download",
          percent: parakeet.isDownloadingModel(id) ? parakeet.downloadProgress.percentage : 0,
          removable: downloaded,
        };
      });
    }
    // Whisper. The English-only twins are not choices: for an English
    // speaker a size is ready when its twin is, since that is what its
    // requests load (whisperEnglishModel.mjs).
    const listed = new Map(whisperList.map((item) => [item.model, item]));
    return Object.entries(WHISPER_MODEL_INFO)
      .filter(([, info]) => !info.englishOnly)
      .map(([id, info]) => {
        const throughTwin = english && Boolean(listed.get(`${id}.en`)?.downloaded);
        const downloaded =
          Boolean(listed.get(id)?.downloaded) ||
          throughTwin ||
          // The tier's own report knows of Turbo before the list is read again.
          (id === TURBO_MODEL && Boolean(turbo?.installed));
        const inUse = conversationLocal && engine !== "nvidia" && whisperModel === id;
        const turboRow = id === TURBO_MODEL;
        let state: ModelChoiceRow["state"];
        if (turboRow && turbo?.downloading) state = "downloading";
        else if (turboRow && turbo?.checking) state = "checking";
        else if (whisper.isDownloadingModel(id)) state = "downloading";
        else if (inUse && downloaded) state = "in-use";
        else if (downloaded) state = "ready";
        else if (turboRow && turbo?.failed) state = "failed";
        else state = "download";
        return {
          id,
          name: info.name,
          size: formatSize(listed.get(id)?.size_mb ?? info.sizeMb, i18n.language),
          recommended: id === speechTier.choice.model,
          state,
          percent:
            turboRow && turbo?.downloading
              ? speechTier.percent
              : whisper.isDownloadingModel(id)
                ? whisper.downloadProgress.percentage
                : 0,
          removable: downloaded,
        };
      });
  }, [
    view,
    conversationLocal,
    cloudModel,
    parakeetList,
    engine,
    parakeetModel,
    parakeet,
    i18n.language,
    t,
    whisperList,
    english,
    whisperModel,
    turbo,
    whisper,
    speechTier.choice.model,
    speechTier.percent,
  ]);

  const use = (id: string) => {
    if (view === "openai") chooseCloudSpeechModel("openai", id);
    else chooseLocalSpeechModel(view === "nvidia" ? "nvidia" : "whisper", id);
  };

  const download = (id: string) => {
    if (view === "nvidia") {
      void parakeet.downloadModel(id, (done) => chooseLocalSpeechModel("nvidia", done));
      return;
    }
    // Turbo on a Mac that qualifies comes through the tier's own download, so
    // the sidebar and the speech row show it; it becomes the default there.
    if (id === TURBO_MODEL && speechTier.turboIsDefault) {
      requestTurbo(language);
      return;
    }
    void whisper.downloadModel(id, (done) => chooseLocalSpeechModel("whisper", done));
  };

  const cancel = (id: string) => {
    if (id === TURBO_MODEL && turbo?.downloading) cancelTurbo();
    else if (view === "nvidia") void parakeet.cancelDownload();
    else void whisper.cancelDownload();
  };

  const remove = (id: string) => {
    const listed = new Map(whisperList.map((item) => [item.model, item]));
    const target =
      view === "whisper" && !listed.get(id)?.downloaded && listed.get(`${id}.en`)?.downloaded
        ? `${id}.en`
        : id;
    showConfirmDialog({
      title: t("transcription.deleteModel.title"),
      description: t("transcription.deleteModel.description"),
      variant: "destructive",
      onConfirm: () => {
        if (view === "nvidia") void parakeet.deleteModel(target, loadParakeet);
        else void whisper.deleteModel(target, loadWhisper);
      },
    });
  };

  // A choice to go back from: a stored Whisper size, Parakeet, or a cloud
  // model other than OpenAI's most accurate.
  const chosen =
    side === "providers"
      ? cloudModel !== CLOUD_SPEECH()[0]?.id
      : engine === "nvidia" || !whisperModelFollowsDefault();

  // What the chosen provider needs first: OpenAI's key, or on Linux and
  // Windows the GPU build of the speech server.
  const slot =
    view === "openai" ? (
      <>
        <ProviderKey provider="openai" />
        {!openaiKey.trim() && (
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
            {t("oats.models.openaiSpeechNeedsKey")}
          </p>
        )}
      </>
    ) : view === "whisper" && getCachedPlatform() !== "darwin" ? (
      <WhisperAcceleration />
    ) : undefined;

  return (
    <>
      <ModelChoice
        title={t("oats.settings.models.speech")}
        description={t("oats.settings.models.speechDescription")}
        action={
          chosen ? (
            <Button variant="ghost" size="sm" onClick={forgetSpeechChoice}>
              <RotateCcw aria-hidden="true" />
              {t("oats.models.useDefault")}
            </Button>
          ) : undefined
        }
        providers={providers}
        provider={view}
        onProvider={setView}
        rows={rows}
        onUse={use}
        onDownload={download}
        onCancel={cancel}
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
