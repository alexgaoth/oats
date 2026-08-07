import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../components/ui/useToast";
import { useUpdater } from "./useUpdater";
import { useSettingsStore } from "../stores/settingsStore";
import { fetchProviders as fetchStreamingProviders } from "../stores/streamingProvidersStore";
import { initializeNotes } from "../stores/noteStore";
import { getCachedPlatform } from "../utils/platform";
import { isAccessibilitySkipped } from "../utils/permissions";

// Application-level side effects for the control panel window.
//
// These used to live inside `ControlPanel.tsx`, which had become a 910-line
// component whose render was entirely unreachable — everything below its
// unconditional `return <OatsWorkspace />` was dead, including the mount that
// drives microphone monitoring. A handful of its effects were still load-bearing
// though, so they live here rather than being lost with the file.
//
// Anything that only fed the old multi-view shell (transcription history
// loading, GPU-acceleration banners, note-navigation into the legacy notes view)
// was deliberately not carried over. Oats has three surfaces; none of them
// render those.

const platform = getCachedPlatform();

export interface AppBootstrap {
  /** True when the user has just returned from the pre-Gizmo bundle ID. */
  showPostMigration: boolean;
  dismissPostMigration: () => Promise<void>;
}

/**
 * @param onShowSettings Called when something outside the renderer asks for the
 *   Settings surface — the tray, the app menu, or a missing-accessibility event.
 *   Previously these set state on a modal that no longer rendered, so the tray's
 *   Settings item and Cmd+, both silently did nothing.
 */
export function useAppBootstrap(onShowSettings: () => void): AppBootstrap {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { status: updateStatus, isDownloading, error: updateError } = useUpdater();

  const [showPostMigration, setShowPostMigration] = useState(false);
  const updateReadyToastShown = useRef(false);
  const updateErrorToastShown = useRef<unknown>(null);

  // Keep the callback in a ref so IPC subscriptions below never resubscribe.
  const showSettingsRef = useRef(onShowSettings);
  useEffect(() => {
    showSettingsRef.current = onShowSettings;
  }, [onShowSettings]);

  // Note files: re-arm the watcher without forcing a rebuild on every launch.
  useEffect(() => {
    const { noteFilesEnabled, noteFilesPath } = useSettingsStore.getState();
    if (!noteFilesEnabled) return;
    window.electronAPI?.noteFilesSetEnabled?.(true, noteFilesPath || undefined, {
      skipRebuild: true,
    });
  }, []);

  useEffect(() => {
    fetchStreamingProviders();
  }, []);

  // The conversation list is app state, not Intelligence's state.
  //
  // It used to be loaded only by `IntelligenceViews` on mount, which meant the
  // Conversation surface — which reads the same list to decide whether pressing
  // record should *resume* the conversation you were just having rather than
  // start a new one — saw an empty list on every fresh launch. Resuming silently
  // never happened until you had visited Intelligence at least once, which is
  // exactly the sort of invisible mode the product is supposed to not have.
  useEffect(() => {
    void initializeNotes("meeting", 100);
  }, []);

  // The conversation hotkey is the one slot with a default, so the main
  // process is its source of truth — localStorage is empty on a fresh install
  // and would otherwise show the shortcut as unset while it is in fact live.
  useEffect(() => {
    void window.electronAPI?.getConversationKey?.().then((key) => {
      if (key) useSettingsStore.setState({ conversationKey: key });
    });
  }, []);

  useEffect(() => {
    if (platform !== "darwin") return;
    window.electronAPI?.getPostMigrationState?.().then((state) => {
      if (state?.justMigrated) setShowPostMigration(true);
    });
  }, []);

  const dismissPostMigration = useCallback(async () => {
    await window.electronAPI?.markBundleMigrated?.();
    setShowPostMigration(false);
  }, []);

  // Update lifecycle toasts.
  useEffect(() => {
    if (updateStatus?.updateDownloaded && !isDownloading) {
      if (!updateReadyToastShown.current) {
        updateReadyToastShown.current = true;
        toast({
          title: t("controlPanel.update.readyTitle"),
          description: t("controlPanel.update.readyDescription"),
          variant: "success",
        });
      }
    } else {
      updateReadyToastShown.current = false;
    }
  }, [updateStatus?.updateDownloaded, isDownloading, toast, t]);

  useEffect(() => {
    if (updateError && updateError !== updateErrorToastShown.current) {
      updateErrorToastShown.current = updateError;
      toast({
        title: t("controlPanel.update.problemTitle"),
        description: t("controlPanel.update.problemDescription"),
        variant: "destructive",
      });
    }
    if (!updateError) updateErrorToastShown.current = null;
  }, [updateError, toast, t]);

  // The tray and the app menu both ask for Settings over IPC.
  useEffect(() => {
    const cleanup = window.electronAPI?.onShowSettings?.(() => {
      showSettingsRef.current();
    });
    return () => cleanup?.();
  }, []);

  // macOS accessibility permission went missing — say so, and land the user on
  // the surface where it can be fixed.
  useEffect(() => {
    const cleanup = window.electronAPI?.onAccessibilityMissing?.(async () => {
      if (isAccessibilitySkipped()) return;
      const migration = await window.electronAPI?.getPostMigrationState?.();
      if (migration?.justMigrated) return;
      showSettingsRef.current();
      toast({
        title: t("controlPanel.accessibilityMissing.title"),
        description: t("controlPanel.accessibilityMissing.description"),
        duration: 10000,
      });
    });
    return () => cleanup?.();
  }, [toast, t]);

  return { showPostMigration, dismissPostMigration };
}
