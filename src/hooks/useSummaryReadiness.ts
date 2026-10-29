import { useCallback, useEffect, useRef, useState } from "react";
import { selectResolvedNoteFormatting, useSettingsStore } from "../stores/settingsStore";
import { useModelDownloadFinished } from "../stores/modelDownloadStore";
import { summaryReadiness, type SummaryReadiness } from "../utils/summaryReadiness";

/** Whether the local summary model's file is on disk, or null when unknown. */
export async function localSummaryModelDownloaded(
  mode: string,
  model: string
): Promise<boolean | null> {
  if (mode !== "local" || !model) return null;
  try {
    const result = await window.electronAPI?.modelCheck?.(model);
    return typeof result === "boolean" ? result : null;
  } catch {
    return null;
  }
}

// When a download reaches its end, the file is moved into place a moment after
// the last chunk (helpers/downloadUtils.js), so the check is asked again a few
// times rather than once.
const AFTER_DOWNLOAD_CHECKS_MS = [300, 1500, 5000];

export interface SummaryReadinessState {
  readiness: SummaryReadiness | null;
  /**
   * Whether the answer is known: false only while the model on this Mac is
   * still being looked for, so "not answered yet" is not taken for "could not
   * be told".
   */
  settled: boolean;
}

/**
 * Whether this machine can summarize a conversation right now, and whether
 * that is known yet.
 *
 * Primitive selectors, because `selectResolvedNoteFormatting` builds a fresh
 * object on every call. Re-checked when the window regains focus, and when a
 * download of the model finishes: a model is downloaded by setup or in
 * Settings, not here, and the answer should follow it.
 */
export function useSummaryReadinessState(): SummaryReadinessState {
  const mode = useSettingsStore((state) => selectResolvedNoteFormatting(state).mode);
  const model = useSettingsStore((state) => selectResolvedNoteFormatting(state).model);
  const remoteUrl = useSettingsStore((state) => selectResolvedNoteFormatting(state).remoteUrl);
  const key = `${mode}:${model}`;
  const [checked, setChecked] = useState<{ key: string; downloaded: boolean | null } | null>(null);
  // Only the newest answer counts: an older check that comes back late would
  // put back the "missing" that a finished download has just replaced.
  const asked = useRef(0);

  const recheck = useCallback(async () => {
    const mine = ++asked.current;
    const downloaded = await localSummaryModelDownloaded(mode, model);
    if (mine === asked.current) setChecked({ key, downloaded });
  }, [mode, model, key]);

  useEffect(() => {
    void recheck();
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [recheck]);

  const finished = useModelDownloadFinished(mode === "local" ? model : null);
  useEffect(() => {
    if (!finished) return undefined;
    const timers = AFTER_DOWNLOAD_CHECKS_MS.map((ms) =>
      window.setTimeout(() => void recheck(), ms)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [finished, recheck]);

  const current = checked?.key === key ? checked : null;
  return {
    readiness: summaryReadiness({
      mode,
      model,
      remoteUrl,
      localModelDownloaded: current?.downloaded ?? null,
    }),
    settled: mode !== "local" || !model.trim() || current !== null,
  };
}

/** Whether this machine can summarize a conversation right now (see above). */
export function useSummaryReadiness(): SummaryReadiness | null {
  return useSummaryReadinessState().readiness;
}
