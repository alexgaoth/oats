import { useEffect, useState } from "react";
import { create } from "zustand";
import { getLocalModel } from "../models/ModelRegistry";
import { DOWNLOAD_QUIET_MS, downloadShown } from "../helpers/summaryQueue.mjs";

// The downloads of the models that run on this Mac, as the model manager
// reports them, so a screen can say how far one has got without starting or
// owning it.
//
// Main sends `model-download-progress` to the window that asked for the
// download (ipcHandlers.js, `model-download`). The writing model is downloaded
// from this window, by setup or by Settings, so one subscription hears every
// download of it, whichever screen started it. The event has no "failed" or
// "cancelled": a download that has said nothing for a while is shown as not
// running (`downloadShown`, helpers/summaryQueue.mjs).

interface ModelDownload {
  percent: number;
  /** When it was last heard from (ms). */
  at: number;
}

interface ModelDownloadState {
  downloads: Record<string, ModelDownload>;
  /** How many times each model's download has reached its end, this session. */
  finished: Record<string, number>;
}

const useModelDownloadStore = create<ModelDownloadState>()(() => ({
  downloads: {},
  finished: {},
}));

let watching = false;

/** Hear the local models' downloads from now on. Safe to call more than once. */
export function watchModelDownloads(): void {
  if (watching || typeof window === "undefined") return;
  const subscribe = window.electronAPI?.onModelDownloadProgress;
  if (typeof subscribe !== "function") return;
  watching = true;
  subscribe((_event: unknown, data: { modelId?: unknown; progress?: unknown } | undefined) => {
    const modelId = typeof data?.modelId === "string" ? data.modelId : "";
    const percent = Number(data?.progress);
    if (!modelId || !Number.isFinite(percent)) return;
    const { downloads, finished } = useModelDownloadStore.getState();
    const previous = downloads[modelId];
    const now = Date.now();
    if (percent >= 100) {
      useModelDownloadStore.setState({
        downloads: { ...downloads, [modelId]: { percent: 100, at: now } },
        finished: { ...finished, [modelId]: (finished[modelId] ?? 0) + 1 },
      });
      return;
    }
    // A screen shows whole percents: a chunk that changes none of them only
    // says the download is alive, at most once a second.
    if (
      previous &&
      previous.percent < 100 &&
      Math.floor(previous.percent) === Math.floor(percent) &&
      now - previous.at < 1000
    ) {
      return;
    }
    useModelDownloadStore.setState({
      downloads: { ...downloads, [modelId]: { percent, at: now } },
    });
  });
}

/**
 * How far a local model's download is, as a whole percent, or null when it is
 * not downloading. Re-read when a quiet download should stop being shown.
 */
export function useModelDownloadPercent(modelId: string | null | undefined): number | null {
  const download = useModelDownloadStore((state) =>
    modelId ? state.downloads[modelId] : undefined
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!download || download.percent >= 100) return undefined;
    const quietAt = download.at + DOWNLOAD_QUIET_MS + 50;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, quietAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [download]);
  return downloadShown(download, { now: Math.max(now, download?.at ?? 0) });
}

/** How many times a model's download has finished this session: a change means "look again". */
export function useModelDownloadFinished(modelId: string | null | undefined): number {
  return useModelDownloadStore((state) => (modelId ? (state.finished[modelId] ?? 0) : 0));
}

/** A local model's name as the model list shows it ("Gemma 4 E4B"), or its id. */
export function localModelName(modelId: string): string {
  return getLocalModel(modelId)?.name || modelId;
}
