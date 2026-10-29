import { useCallback, useEffect, useState } from "react";
import { selectResolvedNoteFormatting, useSettingsStore } from "../stores/settingsStore";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import { summaryReadiness, type SummaryReadiness } from "../utils/summaryReadiness";
import { writingKeyPresent } from "../utils/writingKeys";

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
  const provider = useSettingsStore((state) => selectResolvedNoteFormatting(state).provider);
  const providerKey = useSettingsStore((state) => writingKeyPresent(state, provider));
  // The local writing models on disk, as main reports them: a download that
  // ends here (Oats' own, or Settings') checks again without a focus change.
  const installed = useDeviceTierStore((state) => (state.tier?.writing?.installed ?? []).join(" "));
  const [downloaded, setDownloaded] = useState<boolean | null>(null);

  const recheck = useCallback(async () => {
    setDownloaded(await localSummaryModelDownloaded(mode, model));
    // `installed` is read for its change, not its value.
  }, [mode, model, installed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void recheck();
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [recheck]);

  return summaryReadiness({
    mode,
    model,
    remoteUrl,
    localModelDownloaded: downloaded,
    providerKey: mode === "providers" ? providerKey : null,
  });
}
