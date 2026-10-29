import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { cancelTurbo, useSpeechTier } from "../../hooks/useSpeechTier";
import { cancelWritingModel, useWritingModel } from "../../hooks/useWritingModel";
import { selectResolvedNoteFormatting, useSettingsStore } from "../../stores/settingsStore";
import { useStreamingProvidersStore } from "../../stores/streamingProvidersStore";
import { getProviderDisplayName, getTranscriptionProvider } from "../../models/ModelRegistry";
import { describeOnDevice, destinationOf } from "../../helpers/onDeviceSummary.mjs";
import { getPlatform } from "../../utils/platform";
import type { OnDeviceStatus } from "../../types/electron";

/** What the main process measured: pulled once on mount, then pushed on change. */
function useOnDeviceStatus(): OnDeviceStatus | null {
  const [status, setStatus] = useState<OnDeviceStatus | null>(null);
  useEffect(() => {
    let live = true;
    const off = window.electronAPI?.onOnDeviceStatus?.((next) => {
      if (live) setStatus(next);
    });
    void Promise.resolve(window.electronAPI?.getOnDeviceStatus?.())
      .then((first) => {
        // A push that arrived first is at least as recent.
        if (live && first) setStatus((current) => current ?? first);
      })
      .catch(() => {});
    return () => {
      live = false;
      off?.();
    };
  }, []);
  return status;
}

/**
 * The foot of the sidebar: where speech and writing run, the speech model the
 * local server loaded and on what, and how many requests left this machine
 * since launch. Every line is measured or read from the settings that decide
 * it (onDeviceSummary.mjs); a line with nothing true to say is left out.
 */
export function OnDeviceFooter({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const status = useOnDeviceStatus();

  // A conversation's speech: what meetingRecordingStore reads to record one.
  const conversationLocal = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  // Before the realtime catalog loads, a conversation streams to OpenAI.
  const realtimeName = useStreamingProvidersStore((state) => state.providers?.[0]?.name);
  // Dictation's speech, which counts only while dictation is on.
  const dictationEnabled = useSettingsStore((state) => state.dictationEnabled);
  const dictationLocal = useSettingsStore((state) => state.useLocalWhisper);
  const dictationMode = useSettingsStore((state) => state.transcriptionMode);
  const dictationProvider = useSettingsStore((state) => state.cloudTranscriptionProvider);
  const dictationBaseUrl = useSettingsStore((state) => state.cloudTranscriptionBaseUrl);
  const dictationRemoteUrl = useSettingsStore((state) => state.remoteTranscriptionUrl);
  // The writing model. Field by field: the selector builds a new object per call.
  const writingMode = useSettingsStore((state) => selectResolvedNoteFormatting(state).mode);
  const writingProvider = useSettingsStore((state) => selectResolvedNoteFormatting(state).provider);
  const writingBaseUrl = useSettingsStore(
    (state) => selectResolvedNoteFormatting(state).cloudBaseUrl
  );
  const writingRemoteUrl = useSettingsStore(
    (state) => selectResolvedNoteFormatting(state).remoteUrl
  );

  const summary = useMemo(
    () =>
      describeOnDevice({
        platform: getPlatform(),
        conversation: conversationLocal
          ? { local: true, engine }
          : { local: false, name: realtimeName || "OpenAI" },
        dictation: !dictationEnabled
          ? null
          : dictationLocal
            ? { local: true }
            : destinationOf({
                mode: dictationMode === "self-hosted" ? "self-hosted" : "providers",
                provider: dictationProvider,
                providerName: getTranscriptionProvider(dictationProvider)?.name,
                baseUrl: dictationBaseUrl,
                remoteUrl: dictationRemoteUrl,
              }),
        writing: destinationOf({
          mode: writingMode,
          provider: writingProvider,
          providerName: getProviderDisplayName(writingProvider),
          baseUrl: writingBaseUrl,
          remoteUrl: writingRemoteUrl,
        }),
        server: status?.speech ?? null,
        requests: status?.requests?.outbound,
      }),
    [
      status,
      conversationLocal,
      engine,
      realtimeName,
      dictationEnabled,
      dictationLocal,
      dictationMode,
      dictationProvider,
      dictationBaseUrl,
      dictationRemoteUrl,
      writingMode,
      writingProvider,
      writingBaseUrl,
      writingRemoteUrl,
    ]
  );

  const names = (list: (string | null)[]) => {
    const named = list.map((name) => name ?? t("oats.trust.yourServer"));
    try {
      return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(named);
    } catch {
      return named.join(", ");
    }
  };

  const { place, model, requests } = summary;
  const lines: string[] = [];
  if (place.kind === "here") {
    lines.push(place.device === "mac" ? t("oats.trust.onThisMac") : t("oats.trust.onThisComputer"));
  } else if (place.kind === "both") {
    lines.push(t("oats.trust.speechAndWriting", { names: names(place.names) }));
  } else {
    if (place.speech.length) lines.push(t("oats.trust.speech", { names: names(place.speech) }));
    if (place.writing.length) lines.push(t("oats.trust.writing", { names: names(place.writing) }));
  }
  if (model) {
    lines.push(
      model.backend
        ? t("oats.trust.modelOn", { model: model.name, backend: model.backend })
        : model.name
    );
  }
  if (requests !== null) lines.push(t("oats.trust.requests", { count: requests }));

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 text-xs leading-4 text-muted-foreground tabular-nums",
        className
      )}
    >
      {lines.map((line, index) => (
        <p key={index} className={cn("text-balance break-words", index === 0 && "font-medium")}>
          {line}
        </p>
      ))}
      <SpeechUpgradeLine />
      <WritingDownloadLine />
    </div>
  );
}

/**
 * The writing model's download, beside Turbo's: Oats starts it by itself on
 * this Mac when no writing model is ready (writingTier.mjs), so it is visible
 * wherever the person is, and it can be stopped from here.
 */
function WritingDownloadLine() {
  const { t } = useTranslation();
  const { status, percent, name } = useWritingModel();
  if (status !== "downloading") return null;
  return (
    <div className="mt-1 flex min-h-6 items-center gap-1">
      <p className="min-w-0 flex-1 text-balance break-words">
        {t("oats.writingModel.downloadingShort", { model: name, percent })}
      </p>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("oats.writingModel.cancelDownload", { model: name })}
        title={t("oats.writingModel.cancelDownload", { model: name })}
        onClick={cancelWritingModel}
        className="text-muted-foreground"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Turbo's download, where the request count it adds to is: the one download
 * Oats starts by itself (speechTier.mjs), so it is visible wherever the
 * person is, and it can be stopped from here. While a conversation is
 * recorded the sidebar is aside, so this never competes with the room.
 */
function SpeechUpgradeLine() {
  const { t } = useTranslation();
  const { status, percent } = useSpeechTier();
  if (status !== "downloading" && status !== "checking") return null;
  return (
    <div className="mt-1 flex min-h-6 items-center gap-1">
      <p className="min-w-0 flex-1 text-balance break-words">
        {status === "downloading"
          ? t("oats.speechTier.downloadingShort", { percent })
          : t("oats.speechTier.checking")}
      </p>
      {status === "downloading" && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("oats.speechTier.cancelDownload")}
          title={t("oats.speechTier.cancelDownload")}
          onClick={cancelTurbo}
          className="text-muted-foreground"
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
