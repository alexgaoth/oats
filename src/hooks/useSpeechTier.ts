import { useEffect, useMemo } from "react";
import { useDeviceTierStore } from "../stores/deviceTierStore";
import {
  speechChoiceFor,
  useSettingsStore,
  whisperModelFollowsDefault,
} from "../stores/settingsStore";
import { shouldFetchTurbo, turboStatus, TURBO_MODEL } from "../helpers/speechTier.mjs";
import { startupSpeechLanguage } from "../helpers/speechLanguage.mjs";

/** A size in megabytes, as the model list writes it ("574 MB"), in the UI's language. */
export function formatMegabytes(bytes: number | null, language: string): string {
  const megabytes = Math.round((bytes ?? 0) / 1_000_000);
  try {
    return new Intl.NumberFormat(language, {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 0,
    }).format(megabytes);
  } catch {
    return `${megabytes} MB`;
  }
}

/** Fetch turbo because the person asked for it, after a cancel or a failure. */
export function requestTurbo(language: string): void {
  void window.electronAPI
    ?.startSpeechUpgrade?.({ language: startupSpeechLanguage(language), force: true })
    .catch(() => {});
}

/** Stop turbo's download; Oats will not start it again by itself. */
export function cancelTurbo(): void {
  void window.electronAPI?.cancelSpeechUpgrade?.().catch(() => {});
}

/**
 * This Mac's speech tier, for the surfaces that show it: the choice the rule
 * made (speechTier.mjs), whether the setting follows it, and what turbo is
 * doing ("downloading", "checking", "ready", "failed", "declined", "slow",
 * "detection").
 */
export function useSpeechTier() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  // Subscribed so that a choice made in Settings renders again: whether the
  // setting follows the default is in localStorage, which nothing observes,
  // so it is read on every render.
  useSettingsStore((state) => state.whisperModel);
  const followsDefault = whisperModelFollowsDefault();
  const choice = useMemo(() => speechChoiceFor(tier, language), [tier, language]);
  const englishChoice = useMemo(() => speechChoiceFor(tier, "en"), [tier]);
  const turbo = tier?.turbo ?? null;
  const status = turboStatus({ choice, followsDefault, turbo: turbo ?? {}, englishChoice });
  const downloading = turbo?.downloading ?? null;
  const total = downloading?.totalBytes || turbo?.sizeBytes || 0;
  const percent =
    downloading && total > 0
      ? Math.min(100, Math.floor((downloading.receivedBytes / total) * 100))
      : 0;
  return {
    tier,
    choice,
    followsDefault,
    status,
    percent,
    sizeBytes: turbo?.sizeBytes ?? null,
    turboIsDefault: choice.model === TURBO_MODEL,
  };
}

/**
 * Ask main for turbo when the rule picks it for this Mac and nothing stands in
 * the way (`shouldFetchTurbo`). Mounted once, in the workspace, which shows
 * only after setup. Main checks the rule again before it fetches anything.
 */
export function useSpeechUpgrade() {
  const tier = useDeviceTierStore((state) => state.tier);
  const language = useSettingsStore((state) => state.preferredLanguage);
  const whisperModel = useSettingsStore((state) => state.whisperModel);
  const meetingLocal = useSettingsStore((state) => state.meetingUseLocalWhisper);
  const engine = useSettingsStore((state) => state.localTranscriptionProvider);

  const choice = useMemo(() => speechChoiceFor(tier, language), [tier, language]);
  const fetch = shouldFetchTurbo({
    choice,
    setupDone: localStorage.getItem("onboardingCompleted") === "true",
    // `whisperModel` is in the effect's list for this: a choice made in
    // Settings ends it.
    followsDefault: whisperModelFollowsDefault(),
    local: meetingLocal && engine === "whisper",
    turbo: tier?.turbo ?? {},
  });

  useEffect(() => {
    if (!fetch) return;
    void window.electronAPI
      ?.startSpeechUpgrade?.({ language: startupSpeechLanguage(language) })
      .catch(() => {});
  }, [fetch, language, whisperModel]);
}
