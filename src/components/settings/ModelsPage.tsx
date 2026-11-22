import * as React from "react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Download, KeyRound, RotateCcw, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";
import { SettingsSection } from "./SettingsKit";
import { ProcessingChoice, WhatIsSent } from "./ProcessingChoice";
import { featureRouteName } from "./featureRouteCopy";
import { KeyCapabilities, ProviderKeyField } from "./ProviderKeyField";
import { SpeechModelChoice } from "./SpeechModelChoice";
import { WritingModelChoice } from "./WritingModelChoice";
import { GpuDeviceSelector } from "./GpuDeviceSelector";
import { QuestionModelSettings } from "./OatsSettingsSections";
import { setFeatureProcessing, setProcessing } from "./processing";
import type { Feature } from "../../helpers/featureRoutes.mjs";
import {
  followRecommendedWhisper,
  forgetWritingChoice,
  localSetupFor,
  roomSpeechPlan,
  selectProcessingMode,
  selectFeatureRoute,
  selectUsableFeatureKey,
  selectWritingKeyProvider,
  selectDictationSettings,
  selectResolvedMeetingTranscription,
  selectResolvedNoteFormatting,
  setRoomSpeechPreference,
  useSettingsStore,
} from "../../stores/settingsStore";
import { useDeviceTierStore } from "../../stores/deviceTierStore";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { requestRoomModel } from "../../hooks/useSpeechUpgrade";
import {
  cancelRoomModelDownload,
  refreshRoomModel,
  ROOM_MODEL_BYTES,
  ROOM_MODEL_NAME,
  useRoomModelStore,
} from "../../stores/roomModelStore";
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
  writingModelName,
} from "../../hooks/useWritingModel";
import {
  getStreamingTranscriptionProviders,
  getLocalModel,
  getProviderDisplayName,
  PARAKEET_MODEL_INFO,
  WHISPER_MODEL_INFO,
} from "../../models/ModelRegistry";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { localUpgradeHint, PARAKEET_ROOM_MODEL } from "../../helpers/localSetup.mjs";
import { LARGE_WRITING_MODEL } from "../../helpers/writingTier.mjs";
import { getCachedPlatform } from "../../utils/platform";

/**
 * Settings › AI models. Processing sets the default. Each feature shows its
 * effective route and can switch routes independently. Model selection stays
 * under Advanced.
 */
export function ModelsPage() {
  const { t } = useTranslation();
  const mode = useSettingsStore((state) => selectProcessingMode(state));
  const { upgrade, roomUpgrade } = useUpgradeHint();
  const titleId = useId();
  return (
    <div className="space-y-6">
      <section aria-labelledby={titleId}>
        <div className="mb-3 px-1">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {t("oats.settings.processing")}
          </h3>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            {t("oats.featureRoutes.defaultDescription")}
          </p>
        </div>
        <ProcessingChoice
          value={mode}
          onChange={setProcessing}
          showDescriptions={false}
          aria-labelledby={titleId}
        />
        <div className="mt-3 flex items-center gap-3 px-1">
          <KeyCapabilities className="min-w-0" />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto shrink-0">
                <KeyRound aria-hidden="true" />
                {t("apiKeyInput.add")}
              </Button>
            </DialogTrigger>
            <DialogContent
              aria-describedby={undefined}
              className="oats-surface motion-reduce:animate-none"
            >
              <DialogTitle>{t("apiKeyInput.add")}</DialogTitle>
              <ProviderKeyField />
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <div>
        <SettingsSection title={t("oats.settings.models.title")} className="mb-3">
          <SpeechFeatureRow feature="conversations" upgrade={upgrade === "speech" && roomUpgrade} />
          <SpeechFeatureRow feature="dictation" upgrade={upgrade === "speech" && !roomUpgrade} />
          <WritingModelRow upgrade={upgrade === "writing"} />
        </SettingsSection>
        <WhatIsSent featureRoutes />
      </div>

      <AdvancedModels />
    </div>
  );
}

function useUpgradeHint() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const whisper = useSettingsStore((state) =>
    selectFeatureRoute(state, "dictation").effective === "local" &&
    state.localTranscriptionProvider === "whisper"
      ? state.whisperModel
      : null
  );
  const { available, installed, progress } = useRoomModelStore();
  const roomEligible = useSettingsStore((state) =>
    Boolean(roomSpeechPlan({ ...state, roomSpeechPreference: "recommended" }, tier))
  );
  const room = available && roomEligible;
  const followingRoom = useSettingsStore((state) => Boolean(roomSpeechPlan(state, tier)));
  const writer = useSettingsStore((state) =>
    selectFeatureRoute(state, "writing").effective === "local"
      ? selectResolvedNoteFormatting(state).model
      : null
  );
  const roomWhisper = useSettingsStore((state) => state.whisperModel);
  const recording = useMeetingRecordingStore((state) => state.isRecording || state.isTranscribing);
  if (tier?.device?.platform !== "darwin") return { upgrade: null, roomUpgrade: false };
  const roomUpgrade = room && !progress && !(installed && followingRoom);
  const upgrade = localUpgradeHint({
    plan: localSetupFor(tier, language, roomUpgrade ? "local" : null),
    language,
    recording,
    activeWhisper: roomUpgrade
      ? roomWhisper
      : tier.turbo.downloading || tier.turbo.checking
        ? null
        : whisper,
    activeWriter: writer && tier.writing?.installed.includes(writer) ? writer : null,
  });
  return { upgrade, roomUpgrade };
}

/** A Whisper size as people say it: "Whisper Small", "Whisper Turbo". */
function whisperName(id: string): string {
  if (id === TURBO_MODEL) return "Whisper Turbo";
  const info = WHISPER_MODEL_INFO[id] ?? WHISPER_MODEL_INFO[id.replace(/\.en$/, "")];
  return info ? `Whisper ${info.name.replace(/ \(.*\)$/, "")}` : id;
}

type RowAction = { label: string; onClick: () => void; icon?: typeof Download };

function FeatureRow({
  feature,
  model,
  note,
  action,
  progress,
}: {
  feature: Feature;
  model: string;
  note?: string;
  action?: RowAction;
  progress?: { percent: number; label: string };
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const routeButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const mac = getCachedPlatform() === "darwin";
  const { effective, requested, exception, needsKey, provider } = useSettingsStore(
    useShallow((state) => selectFeatureRoute(state, feature))
  );
  const writingProvider = useSettingsStore((state) => state.featurePreferences.writingProvider);
  const canUseCloud = useSettingsStore((state) =>
    feature === "writing"
      ? Boolean(selectWritingKeyProvider(state))
      : selectUsableFeatureKey(state, "openai")
  );
  const missingKey = exception === "providers" && needsKey;
  const showSwitch = effective === "providers" || (requested === "local" && canUseCloud);
  const name = featureRouteName(t, feature);
  const other = requested === "local" ? "providers" : "local";
  const switchLabel = t(
    other === "providers"
      ? "oats.featureRoutes.useKey"
      : mac
        ? "oats.featureRoutes.useMac"
        : "oats.featureRoutes.useComputer"
  );
  const keyProvider = feature === "writing" && !writingProvider ? "any" : provider;
  const addKeyLabel = t("apiKeyInput.add");
  const keepLocalLabel = t(
    mac ? "oats.featureRoutes.keepOnMac" : "oats.featureRoutes.keepOnComputer"
  );
  const place = missingKey
    ? t(mac ? "oats.featureRoutes.untilKeyOnMac" : "oats.featureRoutes.untilKeyOnComputer", {
        model,
        provider:
          keyProvider === "any"
            ? t("oats.featureRoutes.writingKeyProviders")
            : getProviderDisplayName(provider ?? ""),
      })
    : effective === "providers"
      ? t("oats.featureRoutes.withKey", { model })
      : t(mac ? "oats.featureRoutes.onMac" : "oats.featureRoutes.onComputer", { model });
  const Icon = action?.icon;
  return (
    <section aria-labelledby={titleId} className="px-5 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4
            id={titleId}
            ref={title}
            tabIndex={-1}
            className="text-sm font-medium text-foreground"
          >
            {name}
          </h4>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground" aria-live="polite">
            {place}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {missingKey && keyProvider && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label={`${name}: ${addKeyLabel}`}>
                  <KeyRound aria-hidden="true" />
                  {addKeyLabel}
                </Button>
              </DialogTrigger>
              <DialogContent
                aria-describedby={undefined}
                className="oats-surface motion-reduce:animate-none"
                onCloseAutoFocus={(event) => {
                  // After a successful save the Add button no longer exists.
                  if (routeButton.current?.getAttribute("data-route-action") === "switch") {
                    event.preventDefault();
                    routeButton.current.focus();
                  }
                }}
              >
                <DialogTitle>{addKeyLabel}</DialogTitle>
                <ProviderKeyField provider={keyProvider} forFeature={feature} />
              </DialogContent>
            </Dialog>
          )}
          {(missingKey || showSwitch) && (
            <Button
              ref={routeButton}
              variant={missingKey ? "ghost" : "outline"}
              size="sm"
              data-route-action={missingKey ? "keep-local" : "switch"}
              aria-label={`${name}: ${missingKey ? keepLocalLabel : switchLabel}`}
              onClick={() => {
                if (missingKey && !canUseCloud) title.current?.focus();
                setFeatureProcessing(feature, missingKey ? "local" : other);
              }}
            >
              {missingKey ? keepLocalLabel : switchLabel}
            </Button>
          )}
        </div>
      </div>
      {!missingKey && (
        <>
          {note && <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{note}</p>}
          {progress && (
            <div className="mt-2">
              <div
                role="progressbar"
                aria-label={progress.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{progress.label}</p>
            </div>
          )}
          {action && (
            <Button variant="ghost" size="sm" className="mt-1" onClick={action.onClick}>
              {Icon && <Icon aria-hidden="true" />}
              {action.label}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function SpeechFeatureRow({
  feature,
  upgrade,
}: {
  feature: "conversations" | "dictation";
  upgrade: boolean;
}) {
  const { t, i18n } = useTranslation();
  const local = useSettingsStore(
    (state) => selectFeatureRoute(state, feature).effective === "local"
  );
  const { engine, whisperModel, parakeetModel, cloudModel, language } = useSettingsStore(
    useShallow((state) => ({
      engine: state.localTranscriptionProvider,
      whisperModel: state.whisperModel,
      parakeetModel: state.parakeetModel,
      cloudModel:
        feature === "conversations"
          ? selectResolvedMeetingTranscription(state).cloudTranscriptionModel
          : selectDictationSettings(state).cloudTranscriptionModel,
      language: state.preferredLanguage,
    }))
  );
  const tier = useSpeechTier();
  const room = useRoomModelStore();
  const recording = useMeetingRecordingStore((state) => state.isTranscribing || state.isRecording);
  const roomModel = useSettingsStore((state) =>
    feature === "conversations"
      ? roomSpeechPlan(state, tier.tier, room.installed)?.readySpeech.model
      : undefined
  );
  const roomEligible = useSettingsStore(
    (state) =>
      feature === "conversations" &&
      Boolean(roomSpeechPlan({ ...state, roomSpeechPreference: "recommended" }, tier.tier))
  );
  React.useEffect(() => {
    if (roomEligible) void refreshRoomModel();
  }, [roomEligible]);

  if (!local) {
    const models =
      getStreamingTranscriptionProviders().find((item) => item.id === "openai")?.models ?? [];
    const model =
      feature === "conversations"
        ? (models.find((item) => item.id === cloudModel)?.id ?? "gpt-transcribe")
        : cloudModel;
    return <FeatureRow feature={feature} model={`OpenAI ${model}`} />;
  }

  const model =
    roomModel === PARAKEET_ROOM_MODEL
      ? ROOM_MODEL_NAME
      : engine === "nvidia"
        ? (PARAKEET_MODEL_INFO[parakeetModel]?.name ?? "Parakeet")
        : whisperName(roomModel || whisperModel);
  let note: string | undefined;
  let action: RowAction | undefined;
  let progress: React.ComponentProps<typeof FeatureRow>["progress"];
  if (roomEligible && room.available && roomModel !== PARAKEET_ROOM_MODEL && !recording) {
    const size = formatMegabytes(ROOM_MODEL_BYTES, i18n.language);
    if (room.progress !== null) {
      progress = { percent: room.progress, label: t("oats.models.upgrade.size", { size }) };
      action = { label: t("common.cancel"), onClick: () => cancelRoomModelDownload(), icon: X };
    } else if (upgrade || room.failed || room.declined) {
      note = upgradeDetail(t, "parakeet", ROOM_MODEL_NAME, room.installed ? null : size);
      action = {
        label: t(
          room.installed
            ? "oats.models.use"
            : room.failed
              ? "oats.speechTier.retry"
              : "common.download"
        ),
        icon: room.failed ? RotateCcw : Download,
        onClick: () => {
          setRoomSpeechPreference("recommended");
          if (!room.installed) requestRoomModel();
        },
      };
    }
  } else if (feature === "dictation" && !recording && engine === "whisper") {
    const size = formatMegabytes(tier.sizeBytes, i18n.language);
    if (tier.status === "downloading") {
      progress = {
        percent: tier.percent,
        label: t("oats.speechTier.progress", { percent: tier.percent, size }),
      };
      action = { label: t("common.cancel"), onClick: cancelTurbo, icon: X };
    } else if (tier.status === "checking") {
      note = t("oats.speechTier.checkingDetail");
    } else if (upgrade || tier.status === "failed" || tier.status === "declined") {
      const installed = tier.tier?.turbo.installed === true;
      note = upgradeDetail(t, "speech", whisperName(TURBO_MODEL), installed ? null : size);
      action = {
        label: t(
          installed
            ? "oats.models.use"
            : tier.status === "failed"
              ? "oats.speechTier.retry"
              : "common.download"
        ),
        icon: Download,
        onClick: () => {
          followRecommendedWhisper();
          if (!installed) requestTurbo(language);
        },
      };
    }
  }
  return (
    <FeatureRow feature={feature} model={model} note={note} action={action} progress={progress} />
  );
}

function WritingModelRow({ upgrade }: { upgrade: boolean }) {
  const { t, i18n } = useTranslation();
  const writing = useWritingModel();
  const report = useDeviceTierStore((state) => state.tier?.writing);
  if (writing.mode === "providers") {
    return <FeatureRow feature="writing" model={`${writing.providerName} ${writing.name}`} />;
  }
  const target = upgrade ? LARGE_WRITING_MODEL : writing.model;
  const name = writingModelName(target);
  const size = formatGigabytes(getLocalModel(target)?.sizeBytes, i18n.language);
  const download = report?.downloading?.modelId === target ? report.downloading : null;
  const installed = report?.installed.includes(target) === true;
  const failed = report?.failed?.modelId === target;
  let note: string | undefined;
  let action: RowAction | undefined;
  let progress: React.ComponentProps<typeof FeatureRow>["progress"];
  if (download) {
    const percent =
      download.totalBytes > 0
        ? Math.min(100, Math.floor((download.receivedBytes / download.totalBytes) * 100))
        : 0;
    progress = { percent, label: t("oats.writingModel.progress", { percent, size }) };
    action = { label: t("common.cancel"), onClick: cancelWritingModel, icon: X };
  } else if (upgrade || (!installed && target)) {
    note = upgrade
      ? upgradeDetail(t, "writing", name, installed ? null : size)
      : t(failed ? "oats.writingModel.failed" : "oats.writingModel.missing", { size });
    action = {
      label: t(
        installed ? "oats.models.use" : failed ? "oats.speechTier.retry" : "common.download"
      ),
      icon: failed ? RotateCcw : Download,
      onClick: () => {
        if (upgrade) forgetWritingChoice();
        if (!installed) requestWritingModel(target);
      },
    };
  }
  return (
    <FeatureRow
      feature="writing"
      model={writing.status === "ready" ? writing.name : t("oats.models.noModel")}
      note={note}
      action={action}
      progress={progress}
    />
  );
}

/** AMI replay (docs/dictation-accuracy.md) and AMI summary eval (docs/summaries.md). */
function upgradeDetail(
  t: ReturnType<typeof useTranslation>["t"],
  kind: "speech" | "parakeet" | "writing",
  model: string,
  size: string | null
) {
  const gain = t(`oats.models.upgrade.${kind}`, { model });
  return size ? `${gain} ${t("oats.models.upgrade.size", { size })}` : gain;
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
