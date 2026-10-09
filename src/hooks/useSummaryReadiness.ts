import { useCallback, useEffect, useState } from "react";
import { selectResolvedNoteFormatting, useSettingsStore } from "../stores/settingsStore";
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

/**
 * Whether this machine can summarize a conversation right now.
 *
 * Primitive selectors, because `selectResolvedNoteFormatting` builds a fresh
 * object on every call. Re-checked when the window regains focus: a model is
 * downloaded in Advanced, not here, and the answer should follow it back.
 */
export function useSummaryReadiness(): SummaryReadiness | null {
  const mode = useSettingsStore((state) => selectResolvedNoteFormatting(state).mode);
  const model = useSettingsStore((state) => selectResolvedNoteFormatting(state).model);
  const remoteUrl = useSettingsStore((state) => selectResolvedNoteFormatting(state).remoteUrl);
  const [downloaded, setDownloaded] = useState<boolean | null>(null);

  const recheck = useCallback(async () => {
    setDownloaded(await localSummaryModelDownloaded(mode, model));
  }, [mode, model]);

  useEffect(() => {
    void recheck();
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [recheck]);

  return summaryReadiness({ mode, model, remoteUrl, localModelDownloaded: downloaded });
}
