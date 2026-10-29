import * as React from "react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Download, KeyRound, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SettingsSection } from "./SettingsKit";
import { ProcessingChoice } from "./ProcessingChoice";
import { ProviderKeyField } from "./ProviderKeyField";
import { SpeechModelChoice } from "./SpeechModelChoice";
import { WritingModelChoice } from "./WritingModelChoice";
import { GpuDeviceSelector } from "./GpuDeviceSelector";
import { QuestionModelSettings } from "./OatsSettingsSections";
import { setProcessing } from "./processing";
import { selectProcessingMode, useSettingsStore } from "../../stores/settingsStore";
import {
  cancelTurbo,
  formatMegabytes,
  requestTurbo,
  useSpeechTier,
} from "../../hooks/useSpeechTier";
import {
  cancelWritingModel,
  formatGigabytes,
  requestWritingModel,
  useWritingModel,
} from "../../hooks/useWritingModel";
import {
  getStreamingTranscriptionProviders,
  PARAKEET_MODEL_INFO,
  WHISPER_MODEL_INFO,
} from "../../models/ModelRegistry";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { getCachedPlatform } from "../../utils/platform";

/**
 * Settings › AI models. The processing choice is the one control that
 * matters, and under it one row per model says which model Oats uses, why,
 * and whether it is ready, downloading, or waiting for a key, with the one
 * action that state has. Choosing models yourself is under Advanced, closed.
 */
export function ModelsPage() {
  const { t } = useTranslation();
  const mode = useSettingsStore((state) => selectProcessingMode(state));
  const titleId = useId();
  return (
    <div className="space-y-8">
      <section aria-labelledby={titleId}>
        <div className="mb-3 px-1">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {t("oats.settings.processing")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {t("oats.settings.processingDescription")}
          </p>
        </div>
        <ProcessingChoice
          value={mode}
          onChange={setProcessing}
          aria-labelledby={titleId}
          details={{ providers: <WhatIsSent /> }}
        />
        {mode === "mixed" && (
          <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
            {t("oats.settings.processingMixed")}
          </p>
        )}
      </section>

      <SettingsSection
        title={t("oats.settings.models.title")}
        description={t("oats.settings.models.description")}
      >
        <SpeechModelRow />
        <WritingModelRow />
      </SettingsSection>

      <AdvancedModels />
    </div>
  );
}

/**
 * What goes to the provider with an API key, said where that choice is made,
 * closed until somebody asks: the audio with an OpenAI key, and what the
 * writing model reads (docs/network-allowlist.md).
 */
function WhatIsSent() {
  const { t } = useTranslation();
  return (
    <details className="group px-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
        />
        {t("oats.models.whatIsSent")}
      </summary>
      <div className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
        <p>{t("oats.models.speechSent")}</p>
        <p>{t("oats.settings.models.writingScreen")}</p>
      </div>
    </details>
  );
}

type RowState =
  | { kind: "ready" }
  | { kind: "checking"; detail: string }
  | {
      kind: "downloading";
      percent: number;
      detail: string;
      cancelLabel: string;
      onCancel: () => void;
    }
  | { kind: "action"; label: string; icon: "download" | "retry" | "key"; onClick: () => void }
  | { kind: "warning"; label: string };

/** One model's row: what it is and why, and its state on the right. */
function ModelStatusRow({
  label,
  line,
  note,
  state,
  children,
}: {
  label: string;
  line: React.ReactNode;
  note?: React.ReactNode;
  state: RowState;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{line}</p>
          {note && <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.kind === "ready" && (
            <Badge variant="success">
              <Check aria-hidden="true" />
              {t("oats.models.ready")}
            </Badge>
          )}
          {state.kind === "checking" && (
            <Badge variant="secondary">
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              {t("oats.models.checking")}
            </Badge>
          )}
          {state.kind === "warning" && <Badge variant="warning">{state.label}</Badge>}
          {state.kind === "downloading" && (
            <>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {t("oats.models.percent", { percent: state.percent })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={state.onCancel}
                aria-label={state.cancelLabel}
              >
                <X aria-hidden="true" />
                {t("common.cancel")}
              </Button>
            </>
          )}
          {state.kind === "action" && (
            <Button variant="outline" size="sm" onClick={state.onClick}>
              {state.icon === "download" && <Download aria-hidden="true" />}
              {state.icon === "retry" && <RotateCcw aria-hidden="true" />}
              {state.icon === "key" && <KeyRound aria-hidden="true" />}
              {state.label}
            </Button>
          )}
        </div>
      </div>
      {state.kind === "downloading" && (
        <>
          <span
            role="progressbar"
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.percent}
            className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${state.percent}%` }}
            />
          </span>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{state.detail}</p>
        </>
      )}
      {state.kind === "checking" && (
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{state.detail}</p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** A Whisper size as people say it: "Whisper Small", "Whisper Turbo". */
function whisperName(id: string): string {
  if (id === TURBO_MODEL) return "Whisper Turbo";
  const info = WHISPER_MODEL_INFO[id] ?? WHISPER_MODEL_INFO[id.replace(/\.en$/, "")];
  return info ? `Whisper ${info.name.replace(/ \(.*\)$/, "")}` : id;
}

/**
 * The speech model: Whisper sized to this Mac's GPU (speechTier.mjs), a model
 * somebody chose, or with an API key OpenAI's realtime model, the only one a
 * conversation streams to. Without an OpenAI key it stays on this Mac, and
 * the row says so and offers the key in place.
 */
function SpeechModelRow() {
  const { t, i18n } = useTranslation();
  const processing = useSettingsStore((state) => selectProcessingMode(state));
  const local = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);
  const whisperModel = useSettingsStore((state) => state.whisperModel);
  const parakeetModel = useSettingsStore((state) => state.parakeetModel);
  const cloudModel = useSettingsStore((state) => state.cloudTranscriptionModel);
  const openaiKey = useSettingsStore((state) => state.openaiApiKey);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const tier = useSpeechTier();
  const mac = getCachedPlatform() === "darwin";
  const [keyOpen, setKeyOpen] = useState(false);
  const label = t("oats.settings.models.speech");

  if (!local) {
    const models =
      getStreamingTranscriptionProviders().find((item) => item.id === "openai")?.models ?? [];
    const inUse = models.find((item) => item.id === cloudModel) ?? models[0];
    const name = inUse?.name ?? cloudModel;
    return (
      <ModelStatusRow
        label={label}
        line={
          inUse?.id === models[0]?.id
            ? t("oats.models.why.openaiSpeech", { model: name })
            : t("oats.models.why.chosen", { model: name })
        }
        state={
          openaiKey.trim()
            ? { kind: "ready" }
            : { kind: "warning", label: t("oats.models.needsKey") }
        }
      >
        {!openaiKey.trim() && <ProviderKeyField provider="openai" />}
      </ModelStatusRow>
    );
  }

  const name =
    engine === "nvidia"
      ? (PARAKEET_MODEL_INFO[parakeetModel]?.name ?? parakeetModel)
      : whisperName(whisperModel);
  const withoutOpenAI = processing === "providers";
  const chosen = engine === "nvidia" || !tier.followsDefault;
  const size = formatMegabytes(tier.sizeBytes, i18n.language);

  // Why this model, in one line.
  let line: string;
  let note: string | undefined;
  let state: RowState = { kind: "ready" };
  if (withoutOpenAI) {
    line = t("oats.models.why.noOpenAI", { model: name });
  } else if (chosen) {
    line = t("oats.models.why.chosen", { model: name });
  } else if (
    tier.turboIsDefault &&
    !tier.tier?.turbo?.installed &&
    tier.status !== "downloading" &&
    tier.status !== "checking"
  ) {
    // Turbo is this Mac's model and is not on disk: Oats uses the model it
    // came with, and after a failure or a no the row offers Turbo again.
    line = t("oats.models.why.cameWith", { model: name });
    if (tier.status === "failed") {
      note = t("oats.models.why.turboFailed");
      state = {
        kind: "action",
        label: t("oats.speechTier.retry"),
        icon: "retry",
        onClick: () => requestTurbo(language),
      };
    } else if (tier.status === "declined") {
      note = t("oats.models.why.turboDeclined", { size });
      state = {
        kind: "action",
        label: t("common.download"),
        icon: "download",
        onClick: () => requestTurbo(language),
      };
    }
  } else {
    // This Mac's model: Turbo while it downloads or once it is here, else the
    // size its GPU keeps up with.
    const model = tier.turboIsDefault ? whisperName(TURBO_MODEL) : name;
    line = mac
      ? t("oats.models.why.chosenMac", { model })
      : t("oats.models.why.chosenComputer", { model });
    if (tier.status === "slow") note = t("oats.speechTier.slowDetail");
    if (tier.status === "detection") note = t("oats.speechTier.detectionDetail");
  }
  if (tier.status === "downloading") {
    state = {
      kind: "downloading",
      percent: tier.percent,
      detail: t("oats.speechTier.progress", { percent: tier.percent, size }),
      cancelLabel: t("oats.speechTier.cancelDownload"),
      onCancel: cancelTurbo,
    };
  } else if (tier.status === "checking") {
    state = { kind: "checking", detail: t("oats.speechTier.checkingDetail") };
  } else if (withoutOpenAI && !keyOpen) {
    state = {
      kind: "action",
      label: t("oats.models.addKey"),
      icon: "key",
      onClick: () => setKeyOpen(true),
    };
  }

  return (
    <ModelStatusRow label={label} line={line} note={note} state={state}>
      {withoutOpenAI && keyOpen && <ProviderKeyField provider="openai" autoFocus />}
    </ModelStatusRow>
  );
}

/**
 * The writing model: on this Mac the model its memory holds (writingTier.mjs),
 * downloaded by itself when none is ready; with an API key the provider's
 * most accurate model for summaries, and the key field in place when there is
 * no key; or a model somebody chose.
 */
function WritingModelRow() {
  const { t, i18n } = useTranslation();
  const writing = useWritingModel();
  const mac = getCachedPlatform() === "darwin";
  // The key field stays once a key is saved in it, so what the provider said
  // of that key is there to read after the row turns ready.
  const [keySaved, setKeySaved] = useState(false);
  const keyShown = writing.status === "needs-key" || keySaved;
  const label = t("oats.settings.models.writing");
  const size = formatGigabytes(writing.sizeBytes, i18n.language);

  let line: string;
  if (writing.mode === "self-hosted") {
    line =
      writing.status === "no-endpoint"
        ? t("oats.models.why.serverMissing")
        : t("oats.models.why.server");
  } else if (writing.reason === "no-key") {
    line = t("oats.models.why.noKey");
  } else if (!writing.followsDefault) {
    line =
      writing.mode === "providers"
        ? t("oats.models.why.chosenWith", { model: writing.name, provider: writing.providerName })
        : t("oats.models.why.chosen", { model: writing.name });
  } else if (writing.reason === "openai" || writing.reason === "anthropic") {
    line = t(`oats.models.why.${writing.reason}`, { model: writing.name });
  } else if (writing.reason === "installed") {
    line = t("oats.models.why.installed", { model: writing.name });
  } else {
    line = mac
      ? t("oats.models.why.chosenMac", { model: writing.name })
      : t("oats.models.why.chosenComputer", { model: writing.name });
  }

  let note: string | undefined;
  let state: RowState = { kind: "ready" };
  switch (writing.status) {
    case "downloading":
      state = {
        kind: "downloading",
        percent: writing.percent,
        detail: t("oats.writingModel.progress", { percent: writing.percent, size }),
        cancelLabel: t("oats.writingModel.cancelDownload", { model: writing.name }),
        onCancel: cancelWritingModel,
      };
      break;
    case "missing":
    case "declined":
      note =
        writing.status === "declined"
          ? t("oats.writingModel.declined", { size })
          : t("oats.writingModel.missing", { size });
      state = {
        kind: "action",
        label: t("common.download"),
        icon: "download",
        onClick: () => requestWritingModel(writing.model),
      };
      break;
    case "failed":
      note = t("oats.writingModel.failed");
      state = {
        kind: "action",
        label: t("oats.speechTier.retry"),
        icon: "retry",
        onClick: () => requestWritingModel(writing.model),
      };
      break;
    case "needs-key":
      state = { kind: "warning", label: t("oats.models.needsKey") };
      break;
    case "no-endpoint":
      note = t("oats.models.why.serverHint");
      state = { kind: "warning", label: t("oats.models.noAddress") };
      break;
    case "none":
      state = { kind: "warning", label: t("oats.models.noModel") };
      break;
  }

  return (
    <ModelStatusRow label={label} line={line} note={note} state={state}>
      {keyShown && writing.mode === "providers" && (
        <ProviderKeyField
          provider={writing.followsDefault ? "any" : writing.provider}
          onSaved={() => setKeySaved(true)}
        />
      )}
    </ModelStatusRow>
  );
}

/**
 * Choosing models yourself: closed by default, at the bottom. The same
 * chooser for speech and writing (ModelChoice), the question cards' optional
 * classifier, and on a computer with two GPUs which one each model uses.
 */
function AdvancedModels() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-left shadow-xs outline-none",
          "transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-90"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {t("oats.models.advanced")}
          </span>
          <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
            {t("oats.models.advancedDescription")}
          </span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="mt-6 space-y-8">
          <SpeechModelChoice />
          <WritingModelChoice />
          <QuestionModelSettings />
          <GpuDeviceSelector purpose="transcription" />
          <GpuDeviceSelector purpose="intelligence" />
        </div>
      )}
    </section>
  );
}
