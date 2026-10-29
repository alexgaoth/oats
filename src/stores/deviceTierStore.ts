import { create } from "zustand";
import type { DeviceTierSnapshot } from "../types/electron";

/**
 * What this Mac can run, as the main process measured it (deviceTier.js):
 * pulled once, then pushed whenever it changes. Every window keeps its own
 * copy, because each window's settings store resolves the default speech
 * model from it (settingsStore.ts, speechTier.mjs).
 */
interface DeviceTierState {
  tier: DeviceTierSnapshot | null;
  /**
   * Oats started turbo's download by itself in this window (useSpeechUpgrade),
   * as opposed to the person pressing Download in Settings: the one-time
   * notice says so (SpeechUpgradeNotice).
   */
  autoStarted: boolean;
}

export const useDeviceTierStore = create<DeviceTierState>()(() => ({
  tier: null,
  autoStarted: false,
}));

let started = false;

/** Subscribe to main once per window. Safe to call more than once. */
export function startDeviceTier(): void {
  if (started || typeof window === "undefined") return;
  const api = window.electronAPI;
  if (!api?.getDeviceTier) return;
  started = true;
  let pushed = false;
  api.onDeviceTier?.((tier) => {
    pushed = true;
    useDeviceTierStore.setState({ tier });
  });
  void Promise.resolve(api.getDeviceTier())
    .then((tier) => {
      // A push that arrived first is at least as recent.
      if (tier && !pushed) useDeviceTierStore.setState({ tier });
    })
    .catch(() => {});
}
