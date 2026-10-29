import { useEffect, useMemo } from "react";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { useMeetingRecordingStore } from "../stores/meetingRecordingStore";
import {
  currentDefaultWritingModel,
  useSettingsStore,
  writingModelFollowsDefault,
} from "../stores/settingsStore";
import { localWritingStatus, shouldFetchWritingModel } from "../helpers/writingTier.mjs";
import { getCloudModel, getLocalModel, getProviderDisplayName } from "../models/ModelRegistry";
import type { InferenceMode, WritingModelSnapshot } from "../types/electron";
import { writingKeyPresent } from "../utils/writingKeys";

export { writingKeyPresent };

/** A size in gigabytes, as the model list writes it ("5.4 GB"), in the UI's language. */
export function formatGigabytes(bytes: number | null | undefined, language: string): string {
  const gigabytes = Math.round(((bytes ?? 0) / 1024 ** 3) * 10) / 10;
  try {
    return new Intl.NumberFormat(language, {
      style: "unit",
      unit: "gigabyte",
      maximumFractionDigits: 1,
    }).format(gigabytes);
  } catch {
    return `${gigabytes} GB`;
  }
}

const NO_WRITING: WritingModelSnapshot = {
  installed: [],
  declined: [],
  downloading: null,
  failed: null,
};

/** The main process's report of local writing models, or an empty one before it arrives. */
export function useWritingReport(): WritingModelSnapshot {
  return useDeviceTierStore((state) => state.tier?.writing ?? NO_WRITING);
}

/** Fetch a local writing model because the person asked, after a cancel or a failure. */
export function requestWritingModel(modelId: string): void {
  void window.electronAPI?.startWritingModelDownload?.({ modelId, force: true }).catch(() => {});
}

/** The person's Cancel: stop the writing model's download; Oats will not start it again by itself. */
export function cancelWritingModel(): void {
  void window.electronAPI?.cancelWritingModelDownload?.({ decline: true }).catch(() => {});
}

/**
 * The person moved on, to another writing model or to the providers: stop a
 * writing download they left behind, except `keep`'s. Nothing is remembered
 * as a no, so Oats may fetch it by itself again when it is the default.
 */
export function leaveWritingDownload(keep: string | null = null): void {
  void window.electronAPI?.cancelWritingModelDownload?.({ decline: false, keep }).catch(() => {});
}

/**
 * The person chose a writing model (Settings › AI models › Advanced): after a
 * deleted model, Oats may fetch the default by itself again (writingModelFetch.js).
 */
export function writingModelChosen(): void {
  void window.electronAPI?.writingModelChosen?.().catch(() => {});
}

/** A writing model's name, as Settings shows it: "Gemma 4 E4B", "GPT-6.1 Sol". */
export function writingModelName(model: string): string {
  return getLocalModel(model)?.name ?? getCloudModel(model)?.name ?? model;
}

export type WritingStatus =
  | "ready"
  | "downloading"
  | "failed"
  | "declined"
  | "missing"
  | "needs-key"
  | "no-endpoint"
  | "none";

export interface WritingModel {
  mode: InferenceMode;
  provider: string;
  providerName: string;
  model: string;
  name: string;
  followsDefault: boolean;
  /** Why this model, when it follows the default (writingTier.mjs); null for a choice. */
  reason: string | null;
  status: WritingStatus;
  /** The download, while it runs. */
  percent: number;
  receivedBytes: number;
  /** The file's size, for a local model. */
  sizeBytes: number | null;
}

/**
 * The writing model as Settings and setup describe it: which model writes the
 * summaries, why that one, and whether it is ready, downloading or waiting
 * for a key. One place, so the rows, the notice and the preflight agree.
 */
export function useWritingModel(): WritingModel {
  const mode = useSettingsStore((state) => state.cleanupMode);
  const provider = useSettingsStore((state) => state.cleanupProvider);
  const model = useSettingsStore((state) => state.cleanupModel);
  const remoteUrl = useSettingsStore((state) => state.cleanupRemoteUrl);
  const keyPresent = useSettingsStore((state) => writingKeyPresent(state, provider));
  const openaiKey = useSettingsStore((state) => state.openaiApiKey);
  const anthropicKey = useSettingsStore((state) => state.anthropicApiKey);
  const tier = useDeviceTierStore((state) => state.tier);
  const writing = tier?.writing ?? NO_WRITING;
  // Read on every render: whether a model is stored lives in localStorage,
  // which nothing observes, and `model` above re-renders this on a choice.
  const followsDefault = writingModelFollowsDefault();
  const defaults = useMemo(
    () =>
      currentDefaultWritingModel(
        { cleanupMode: mode, openaiApiKey: openaiKey, anthropicApiKey: anthropicKey },
        tier
      ),
    [mode, openaiKey, anthropicKey, tier]
  );

  const local = mode === "local";
  const localModel = local ? getLocalModel(model) : undefined;
  let status: WritingStatus;
  if (mode === "self-hosted") status = remoteUrl.trim() ? "ready" : "no-endpoint";
  else if (!model.trim()) status = "none";
  else if (local) status = localWritingStatus(model, writing);
  else status = keyPresent === false ? "needs-key" : "ready";

  const downloading = local && writing.downloading?.modelId === model ? writing.downloading : null;
  const total = downloading?.totalBytes || localModel?.sizeBytes || 0;
  return {
    mode,
    provider,
    providerName: getProviderDisplayName(provider),
    model,
    name: model ? writingModelName(model) : "",
    followsDefault,
    reason: followsDefault ? (defaults?.reason ?? null) : null,
    status,
    percent:
      downloading && total > 0
        ? Math.min(100, Math.floor((downloading.receivedBytes / total) * 100))
        : 0,
    receivedBytes: downloading?.receivedBytes ?? 0,
    sizeBytes: localModel?.sizeBytes ?? null,
  };
}

/**
 * Ask main for the default local writing model when it should be fetched
 * (`shouldFetchWritingModel`): after setup, while the setting follows the
 * default on this Mac, when no writing model is ready, and never during a
 * recording. Mounted once, in the workspace, which shows only after setup.
 * Main checks again before it fetches anything.
 */
export function useWritingModelDownload(): void {
  const tier = useDeviceTierStore((state) => state.tier);
  const mode = useSettingsStore((state) => state.cleanupMode);
  const model = useSettingsStore((state) => state.cleanupModel);
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  const choice = useMemo(
    () =>
      mode === "local"
        ? currentDefaultWritingModel(
            { cleanupMode: mode, openaiApiKey: "", anthropicApiKey: "" },
            tier
          )
        : null,
    [mode, tier]
  );
  const fetch = shouldFetchWritingModel({
    choice,
    setupDone: localStorage.getItem("onboardingCompleted") === "true",
    // `model` is in the effect's list for this: a choice made in Settings ends it.
    followsDefault: writingModelFollowsDefault(),
    local: mode === "local",
    recording,
    writing: tier?.writing ?? NO_WRITING,
  });
  const modelId = choice?.model ?? "";

  useEffect(() => {
    if (!fetch || !modelId) return;
    void window.electronAPI
      ?.startWritingModelDownload?.({ modelId })
      .then((snapshot) => {
        // Oats started it by itself: the one-time notice says so.
        if (snapshot?.writing?.downloading?.modelId === modelId) {
          useDeviceTierStore.setState({ writingAutoStarted: true });
        }
      })
      .catch(() => {});
  }, [fetch, modelId, model]);
}
