import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cpu,
  Download,
  KeyRound,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { ProviderKeyField } from "./ProviderKeyField";
import { featureRouteName } from "./featureRouteCopy";
import { setFeatureProcessing, type ProcessingMode } from "./processing";
import type { Feature } from "../../helpers/featureRoutes.mjs";
import { isKeyProvider, keyUsable } from "../../helpers/apiKeys.mjs";
import {
  chooseFeatureKey,
  KEY_PROVIDER_NAMES,
  selectFeatureKey,
  selectKeyOptions,
  selectSavedKeys,
  type KeyOption,
  type SavedKey,
} from "../../stores/apiKeys";
import {
  followRecommendedWhisper,
  forgetWritingChoice,
  roomSpeechPlan,
  selectDictationSettings,
  selectFeatureRoute,
  selectResolvedMeetingTranscription,
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
  getLocalModel,
  getProviderDisplayName,
  getStreamingTranscriptionProviders,
  getTranscriptionProvider,
  PARAKEET_MODEL_INFO,
  WHISPER_MODEL_INFO,
} from "../../models/ModelRegistry";
import { TURBO_MODEL } from "../../helpers/speechTier.mjs";
import { PARAKEET_ROOM_MODEL } from "../../helpers/localSetup.mjs";
import { LARGE_WRITING_MODEL } from "../../helpers/writingTier.mjs";
import { getCachedPlatform } from "../../utils/platform";

/**
 * One row of "Your models", the same in Settings › AI models and in setup's
 * "Your models" step: the feature; under it the model as people say it and
 * where it runs; and on the right its status (Alex, 2026-11-22):
 *
 *   on this Mac, on disk          ✓ Ready (green, the 0.3.0 pill)
 *   on this Mac, downloading      the bar, "34% of 574 MB", Cancel
 *   on this Mac, checking         Checking (Whisper Turbo's test on the GPU)
 *   on this Mac, not on disk      Download, or Try again after a failure
 *   with an API key               ✓ Ready · OpenAI key
 *   with a key the provider refused   Key refused · OpenAI key
 *   with an API key, none saved   Add API key; the row runs on this Mac until then
 *
 * Where it runs is a quiet menu in the second line ("Whisper Turbo · on this
 * Mac ⌄"), so each feature can run somewhere else without a button that
 * competes with the status. Choosing a place there is the feature's own route
 * (`setFeatureProcessing`); when the routes differ, the processing choice
 * above shows Mixed. Speech needs an OpenAI key: with only Anthropic keys
 * saved, a speech row's "With an API key" is off, and the menu says why.
 * Setup shows the same rows with the status only (`menus={false}`).
 */
export function FeatureModelRow({
  feature,
  upgrade = false,
  menus = true,
}: {
  feature: Feature;
  /** This row shows the one measured upgrade the page offers (ModelsPage). */
  upgrade?: boolean;
  /** The place menu and Cancel; setup shows where and the status only. */
  menus?: boolean;
}) {
  return feature === "writing" ? (
    <WritingRow upgrade={upgrade} menus={menus} />
  ) : (
    <SpeechRow feature={feature} upgrade={upgrade} menus={menus} />
  );
}

type KeyProvider = "any" | "openai" | "anthropic";

export type ModelStatus =
  /** `key`: the key it uses on the API-key route, by name; `keyed`: a named key, so its menu. */
  | { kind: "ready"; key?: string; keyed?: boolean }
  | { kind: "refused"; key: string }
  | {
      kind: "downloading";
      percent: number;
      size: string;
      cancel: { label: string; onClick: () => void };
    }
  | { kind: "checking" }
  | { kind: "action"; label: string; retry: boolean; onClick: () => void }
  | { kind: "add-key"; provider: KeyProvider }
  | { kind: "none" };

interface RowModel {
  /** The model as people say it: "Whisper Turbo", "GPT Transcribe". */
  model: string;
  /**
   * Where it runs. "until-key" runs on this Mac until a key is added;
   * "until-works" until its key, which the provider refused, works again.
   */
  place: "local" | "providers" | "until-key" | "until-works";
  /** For "until-key": whose key ("OpenAI"); none when either provider's will do. */
  provider?: string;
  status: ModelStatus;
  /** A line under the row: what a download is for, why a model is offered. */
  note?: string;
  /** The offer the note makes (a measured upgrade, a declined download). */
  offer?: { label: string; icon: typeof Download; onClick: () => void };
}

/** A Whisper size as people say it: "Whisper Small", "Whisper Turbo". */
function whisperName(id: string): string {
  if (id === TURBO_MODEL) return "Whisper Turbo";
  const info = WHISPER_MODEL_INFO[id] ?? WHISPER_MODEL_INFO[id.replace(/\.en$/, "")];
  return info ? `Whisper ${info.name.replace(/ \(.*\)$/, "")}` : id;
}

/** An OpenAI speech model as people say it: "GPT Transcribe". */
function cloudSpeechName(id: string): string {
  return getTranscriptionProvider("openai")?.models.find((model) => model.id === id)?.name ?? id;
}

/**
 * The status of a feature on the API-key route: Ready with its key, by name,
 * or the key refused; with no key at all, Add API key (for `provider`).
 */
function keyStatus(key: SavedKey | null, provider: KeyProvider): ModelStatus {
  if (!key) return { kind: "add-key", provider };
  return keyUsable(key.status)
    ? { kind: "ready", key: key.name, keyed: true }
    : { kind: "refused", key: key.name };
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

function SpeechRow({
  feature,
  upgrade,
  menus,
}: {
  feature: "conversations" | "dictation";
  upgrade: boolean;
  menus: boolean;
}) {
  const { t, i18n } = useTranslation();
  const route = useSettingsStore(useShallow((state) => selectFeatureRoute(state, feature)));
  const { engine, whisperModel, parakeetModel, cloudModel, language, key } = useSettingsStore(
    useShallow((state) => ({
      engine: state.localTranscriptionProvider,
      whisperModel: state.whisperModel,
      parakeetModel: state.parakeetModel,
      cloudModel:
        feature === "conversations"
          ? selectResolvedMeetingTranscription(state).cloudTranscriptionModel
          : selectDictationSettings(state).cloudTranscriptionModel,
      language: state.preferredLanguage,
      key: selectFeatureKey(state, feature),
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
  useEffect(() => {
    if (roomEligible) void refreshRoomModel();
  }, [roomEligible]);

  let row: RowModel;
  const localName =
    roomModel === PARAKEET_ROOM_MODEL
      ? ROOM_MODEL_NAME
      : engine === "nvidia"
        ? (PARAKEET_MODEL_INFO[parakeetModel]?.name ?? "Parakeet")
        : whisperName(roomModel || whisperModel);
  if (route.effective === "providers") {
    // A conversation streams, so it takes OpenAI's realtime default when the
    // chosen model cannot (meetingRecordingStore).
    const streaming =
      getStreamingTranscriptionProviders().find((item) => item.id === "openai")?.models ?? [];
    const id =
      feature === "conversations"
        ? (streaming.find((item) => item.id === cloudModel)?.id ?? "gpt-transcribe")
        : cloudModel;
    row = { model: cloudSpeechName(id), place: "providers", status: keyStatus(key, "openai") };
  } else if (route.needsKey) {
    row = {
      model: localName,
      place: key ? "until-works" : "until-key",
      provider: "OpenAI",
      status: keyStatus(key, "openai"),
    };
  } else {
    row = { model: localName, place: "local", status: { kind: "ready" } };
    // Parakeet Ultra, this Mac's model for rooms, while it comes, or offered.
    const parakeet = roomEligible && room.available && roomModel !== PARAKEET_ROOM_MODEL;
    const whisper = engine === "whisper" && !(roomEligible && room.available);
    if (parakeet && !recording) {
      const size = formatMegabytes(ROOM_MODEL_BYTES, i18n.language);
      if (room.progress !== null) {
        row.model = ROOM_MODEL_NAME;
        row.status = {
          kind: "downloading",
          percent: Math.round(room.progress),
          size,
          cancel: {
            label: t("oats.models.cancelModel", { model: ROOM_MODEL_NAME }),
            onClick: () => cancelRoomModelDownload(),
          },
        };
      } else if (upgrade || room.failed || room.declined) {
        row.note = upgradeDetail(t, "parakeet", ROOM_MODEL_NAME, room.installed ? null : size);
        row.offer = {
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
    } else if (whisper && !recording) {
      // Whisper Turbo, this Mac's model when its GPU keeps up (speechTier.mjs):
      // both speech rows use it, so both show it coming. The offer after a
      // cancel or a failure is made once, on Dictation's row.
      const size = formatMegabytes(tier.sizeBytes, i18n.language);
      if (tier.status === "downloading") {
        row.model = whisperName(TURBO_MODEL);
        row.status = {
          kind: "downloading",
          percent: tier.percent,
          size,
          cancel: { label: t("oats.speechTier.cancelDownload"), onClick: cancelTurbo },
        };
      } else if (tier.status === "checking") {
        row.model = whisperName(TURBO_MODEL);
        row.status = { kind: "checking" };
        row.note = t("oats.speechTier.checkingDetail");
      } else if (
        feature === "dictation" &&
        (upgrade || tier.status === "failed" || tier.status === "declined")
      ) {
        const installed = tier.tier?.turbo.installed === true;
        row.note = upgradeDetail(t, "speech", whisperName(TURBO_MODEL), installed ? null : size);
        row.offer = {
          label: t(
            installed
              ? "oats.models.use"
              : tier.status === "failed"
                ? "oats.speechTier.retry"
                : "common.download"
          ),
          icon: tier.status === "failed" ? RotateCcw : Download,
          onClick: () => {
            followRecommendedWhisper();
            if (!installed) requestTurbo(language);
          },
        };
      }
    }
  }
  return <ModelRow feature={feature} row={row} menus={menus} />;
}

function WritingRow({ upgrade, menus }: { upgrade: boolean; menus: boolean }) {
  const { t, i18n } = useTranslation();
  const writing = useWritingModel();
  const report = useDeviceTierStore((state) => state.tier?.writing);
  const route = useSettingsStore(useShallow((state) => selectFeatureRoute(state, "writing")));
  const pinned = useSettingsStore((state) => state.featurePreferences.writingProvider);
  const key = useSettingsStore((state) => selectFeatureKey(state, "writing"));

  let row: RowModel;
  if (route.effective === "providers") {
    row = {
      model: writing.name,
      place: "providers",
      // A provider whose keys have no names (Gemini, Groq) has no key menu.
      status:
        key || isKeyProvider(route.provider)
          ? keyStatus(key, "any")
          : {
              kind: "ready",
              key: t("oats.models.providerKey", { provider: writing.providerName }),
            },
    };
  } else if (route.needsKey) {
    const provider = route.provider ?? "openai";
    row = {
      model: writing.status === "ready" ? writing.name : t("oats.models.noModel"),
      place: key ? "until-works" : "until-key",
      // Writing takes either provider's key until one is chosen: "a key".
      provider: !pinned || !isKeyProvider(provider) ? undefined : getProviderDisplayName(provider),
      // Writing takes either provider's key, so a key added here may be either.
      status: keyStatus(key, "any"),
    };
  } else {
    const target = upgrade ? LARGE_WRITING_MODEL : writing.model;
    const size = formatGigabytes(getLocalModel(target)?.sizeBytes, i18n.language);
    const download = report?.downloading?.modelId === target ? report.downloading : null;
    const installed = report?.installed.includes(target) === true;
    const failed = report?.failed?.modelId === target;
    row = {
      model: writing.status === "ready" ? writing.name : writingModelName(target),
      place: "local",
      status: { kind: "ready" },
    };
    if (download) {
      row.model = writingModelName(target);
      row.status = {
        kind: "downloading",
        percent:
          download.totalBytes > 0
            ? Math.min(100, Math.floor((download.receivedBytes / download.totalBytes) * 100))
            : 0,
        size,
        cancel: {
          label: t("oats.writingModel.cancelDownload", { model: writingModelName(target) }),
          onClick: cancelWritingModel,
        },
      };
    } else if (upgrade) {
      // The model in use is ready; the larger one is offered under it.
      row.note = upgradeDetail(t, "writing", writingModelName(target), installed ? null : size);
      row.offer = {
        label: t(installed ? "oats.models.use" : "common.download"),
        icon: Download,
        onClick: () => {
          forgetWritingChoice();
          if (!installed) requestWritingModel(target);
        },
      };
    } else if (!target) {
      row.model = t("oats.models.noModel");
      row.status = { kind: "none" };
    } else if (!installed) {
      row.note = failed
        ? t("oats.writingModel.failed")
        : writing.status === "declined"
          ? t("oats.writingModel.declined", { size })
          : t("oats.writingModel.missing", { size });
      row.status = {
        kind: "action",
        label: t(failed ? "oats.speechTier.retry" : "common.download"),
        retry: failed,
        onClick: () => requestWritingModel(target),
      };
    }
  }
  return <ModelRow feature="writing" row={row} menus={menus} />;
}

function ModelRow({ feature, row, menus }: { feature: Feature; row: RowModel; menus: boolean }) {
  const { t } = useTranslation();
  const titleId = useId();
  const placeButton = useRef<HTMLButtonElement>(null);
  const mac = getCachedPlatform() === "darwin";
  const name = featureRouteName(t, feature);
  const placeText =
    row.place === "providers"
      ? t("oats.featureRoutes.placeKey")
      : row.place === "until-key" && row.provider
        ? t(
            mac
              ? "oats.featureRoutes.placeUntilKeyMac"
              : "oats.featureRoutes.placeUntilKeyComputer",
            { provider: row.provider }
          )
        : row.place === "until-key"
          ? t(
              mac
                ? "oats.featureRoutes.placeUntilAnyKeyMac"
                : "oats.featureRoutes.placeUntilAnyKeyComputer"
            )
          : row.place === "until-works"
            ? t(
                mac
                  ? "oats.featureRoutes.placeUntilWorksMac"
                  : "oats.featureRoutes.placeUntilWorksComputer"
              )
            : t(mac ? "oats.featureRoutes.placeMac" : "oats.featureRoutes.placeComputer");
  const Offer = row.offer?.icon;
  return (
    <section aria-labelledby={titleId} data-feature-row={feature} className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4
            id={titleId}
            tabIndex={-1}
            className="text-sm font-medium text-foreground outline-none"
          >
            {name}
          </h4>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            <span data-row-model>{row.model}</span>
            <span aria-hidden="true"> · </span>
            {menus ? (
              <PlaceMenu feature={feature} name={name} text={placeText} buttonRef={placeButton} />
            ) : (
              <span data-row-place>{placeText}</span>
            )}
          </p>
        </div>
        <div data-row-status className="flex shrink-0 items-center gap-2">
          <StatusView
            status={row.status}
            model={row.model}
            feature={feature}
            name={name}
            menus={menus}
            focusAfterKey={() => placeButton.current?.focus()}
          />
        </div>
      </div>
      {row.note && (
        <p data-row-note className="mt-1 text-[13px] leading-5 text-muted-foreground">
          {row.note}
        </p>
      )}
      {row.offer && menus && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={row.offer.onClick}>
          {Offer && <Offer aria-hidden="true" />}
          {row.offer.label}
        </Button>
      )}
    </section>
  );
}

/**
 * Where a feature runs, as a quiet menu in the row's second line: On this Mac
 * or With an API key, the current one checked. Speech needs an OpenAI key, so
 * with only Anthropic keys saved a speech row cannot move to a key, and the
 * menu says why under the item. With no key at all it can: the row then
 * offers Add API key.
 */
function PlaceMenu({
  feature,
  name,
  text,
  buttonRef,
}: {
  feature: Feature;
  name: string;
  text: string;
  buttonRef: React.Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const mac = getCachedPlatform() === "darwin";
  const requested = useSettingsStore((state) => selectFeatureRoute(state, feature).requested);
  const noSpeechKey = useSettingsStore((state) => {
    if (feature === "writing") return false;
    const keys = selectSavedKeys(state);
    return (
      !keys.some((key) => key.provider === "openai") &&
      keys.some((key) => key.provider === "anthropic")
    );
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          data-row-place
          aria-label={t("oats.featureRoutes.placeLabel", { feature: name, place: text })}
          className={cn(
            "-mx-1 inline-flex cursor-pointer items-center gap-0.5 rounded-sm px-1 text-left text-[13px] leading-5 text-muted-foreground outline-none",
            "transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          {text}
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="oats-surface max-w-72">
        <DropdownMenuRadioGroup
          value={requested}
          onValueChange={(value) => {
            if (value !== requested) setFeatureProcessing(feature, value as ProcessingMode);
          }}
        >
          <DropdownMenuRadioItem value="local">
            <Cpu aria-hidden="true" className="text-muted-foreground" />
            {t(mac ? "oats.settings.processingLocal" : "oats.settings.processingLocalComputer")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="providers"
            disabled={noSpeechKey && requested !== "providers"}
            aria-describedby={noSpeechKey ? reasonId : undefined}
          >
            <KeyRound aria-hidden="true" className="text-muted-foreground" />
            {t("oats.settings.processingProviders")}
          </DropdownMenuRadioItem>
          {noSpeechKey && (
            <p
              id={reasonId}
              data-place-reason
              className="pb-1.5 pl-8 pr-2 text-xs leading-4 text-muted-foreground"
            >
              {t("oats.featureRoutes.speechNeedsOpenAI")}
            </p>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusView({
  status,
  model,
  feature,
  name,
  menus,
  focusAfterKey,
}: {
  status: ModelStatus;
  model: string;
  feature: Feature;
  name: string;
  /** Settings: Cancel beside a download and the key menu. Setup shows the status only. */
  menus: boolean;
  focusAfterKey: () => void;
}) {
  const { t } = useTranslation();
  // What a screen reader hears when the state changes: once per state, never
  // per percent.
  const said =
    status.kind === "ready"
      ? status.key
        ? t("oats.models.readyWithKey", { key: status.key })
        : t("oats.models.ready")
      : status.kind === "downloading"
        ? t("oats.models.downloadingModel", { model })
        : status.kind === "refused"
          ? t("oats.models.keyRefused", { key: status.key })
          : status.kind === "checking"
            ? t("oats.models.checking")
            : "";
  return (
    <>
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
      {status.kind === "ready" &&
        (menus && status.keyed ? (
          <KeyMenu feature={feature} name={name} tone="success" onDone={focusAfterKey}>
            <Check aria-hidden="true" />
            {t("oats.models.readyWithKey", { key: status.key })}
          </KeyMenu>
        ) : (
          <Badge variant="success" data-status="ready">
            <Check aria-hidden="true" />
            {status.key
              ? t("oats.models.readyWithKey", { key: status.key })
              : t("oats.models.ready")}
          </Badge>
        ))}
      {status.kind === "refused" &&
        (menus ? (
          <KeyMenu feature={feature} name={name} tone="warning" onDone={focusAfterKey}>
            <AlertTriangle aria-hidden="true" />
            {t("oats.models.keyRefused", { key: status.key })}
          </KeyMenu>
        ) : (
          <Badge variant="warning" data-status="refused">
            <AlertTriangle aria-hidden="true" />
            {t("oats.models.keyRefused", { key: status.key })}
          </Badge>
        ))}
      {status.kind === "checking" && (
        <Badge variant="secondary" data-status="checking">
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          {t("oats.models.checking")}
        </Badge>
      )}
      {status.kind === "none" && (
        <Badge variant="secondary" data-status="none">
          {t("oats.models.noModel")}
        </Badge>
      )}
      {status.kind === "downloading" && (
        <>
          <div data-status="downloading" className="w-32">
            <div
              role="progressbar"
              aria-label={t("oats.models.downloadingModel", { model })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={status.percent}
              aria-valuetext={t("oats.models.progress", {
                percent: status.percent,
                size: status.size,
              })}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${status.percent}%` }}
              />
            </div>
            <p className="mt-1 text-xs leading-4 tabular-nums text-muted-foreground">
              {t("oats.models.progress", { percent: status.percent, size: status.size })}
            </p>
          </div>
          {menus && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={status.cancel.label}
              onClick={status.cancel.onClick}
            >
              <X aria-hidden="true" />
              {t("common.cancel")}
            </Button>
          )}
        </>
      )}
      {status.kind === "action" && (
        <Button variant="outline" size="sm" onClick={status.onClick} data-status="action">
          {status.retry ? <RotateCcw aria-hidden="true" /> : <Download aria-hidden="true" />}
          {status.label}
        </Button>
      )}
      {status.kind === "add-key" && (
        <AddKey provider={status.provider} feature={feature} name={name} onDone={focusAfterKey} />
      )}
    </>
  );
}

/**
 * The key a feature uses, as the green pill it shows ("✓ Ready · OpenAI key 1
 * ⌄"), or the warning one when the provider refused it; pressing it opens the
 * key menu (Alex, 2026-11-22). The menu lists every saved key with its
 * provider and last four characters, the current one checked; a key that
 * cannot serve the feature (an Anthropic key for speech, a refused key) is
 * there but off, with the reason under it. Add API key… adds a key for this
 * feature, which then uses it.
 */
function KeyMenu({
  feature,
  name,
  tone,
  onDone,
  children,
}: {
  feature: Feature;
  name: string;
  tone: "success" | "warning";
  onDone: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);
  const options = useSettingsStore((state) => selectKeyOptions(state, feature));
  const current = useSettingsStore((state) => selectFeatureKey(state, feature)?.id ?? "");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={trigger}
            type="button"
            data-status={tone === "success" ? "ready" : "refused"}
            data-key-pill
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium outline-none",
              "transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:size-3",
              tone === "success"
                ? "bg-success/10 text-success hover:bg-success/15 data-[state=open]:bg-success/15 dark:bg-success/15 dark:hover:bg-success/20"
                : "bg-warning/10 text-warning hover:bg-warning/15 data-[state=open]:bg-warning/15 dark:bg-warning/15 dark:hover:bg-warning/20"
            )}
          >
            {children}
            <ChevronDown aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="oats-surface w-72">
          <DropdownMenuLabel>{t("oats.keys.keyFor", { feature: name })}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={(id) => {
              if (id !== current) chooseFeatureKey(feature, id);
            }}
          >
            {options.map((option) => (
              <KeyOptionItem key={option.id} option={option} current={option.id === current} />
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelectAfterClose={() => setAdding(true)} data-add-key>
            <Plus aria-hidden="true" />
            {t("oats.keys.addEllipsis")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddKeyDialog
        open={adding}
        onOpenChange={setAdding}
        provider={feature === "writing" ? "any" : "openai"}
        feature={feature}
        onClosed={() => (trigger.current ? trigger.current.focus() : onDone())}
      />
    </>
  );
}

/** One saved key in a feature's key menu: its name, its provider and last four, why it is off. */
function KeyOptionItem({ option, current }: { option: KeyOption; current: boolean }) {
  const { t } = useTranslation();
  const reasonId = useId();
  const reason =
    option.reason === "no-speech"
      ? t("oats.keys.reasonNoSpeech")
      : option.reason === "refused"
        ? t("oats.keys.reasonRefused", { provider: KEY_PROVIDER_NAMES[option.provider] })
        : null;
  return (
    <>
      <DropdownMenuRadioItem
        value={option.id}
        disabled={!option.usable && !current}
        aria-describedby={reason ? reasonId : undefined}
        data-key-option={option.name}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{option.name}</span>
          <span className="block text-xs text-muted-foreground">
            {KEY_PROVIDER_NAMES[option.provider]}{" "}
            <span className="font-mono tabular-nums">••••{option.tail}</span>
          </span>
        </span>
      </DropdownMenuRadioItem>
      {reason && (
        <p
          id={reasonId}
          data-key-reason
          className="pb-1.5 pl-8 pr-2 text-xs leading-4 text-muted-foreground"
        >
          {reason}
        </p>
      )}
    </>
  );
}

/** Add API key, in place, for a feature with no key: the new key is chosen for it. */
function AddKey({
  provider,
  feature,
  name,
  onDone,
}: {
  provider: KeyProvider;
  feature: Feature;
  name: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("apiKeyInput.add");
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`${name}: ${label}`}
        data-status="add-key"
        onClick={() => setOpen(true)}
      >
        <KeyRound aria-hidden="true" />
        {label}
      </Button>
      {/* Once the key is saved the row is Ready, and this button is gone. */}
      <AddKeyDialog
        open={open}
        onOpenChange={setOpen}
        provider={provider}
        feature={feature}
        onClosed={onDone}
      />
    </>
  );
}

/** The key field in a dialog, for one feature (`forFeature`): the key it adds is that feature's. */
function AddKeyDialog({
  open,
  onOpenChange,
  provider,
  feature,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: KeyProvider;
  feature: Feature;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="oats-surface motion-reduce:animate-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <DialogTitle>{t("apiKeyInput.add")}</DialogTitle>
        <ProviderKeyField provider={provider} forFeature={feature} autoFocus />
      </DialogContent>
    </Dialog>
  );
}
