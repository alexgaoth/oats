import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "./lib/utils";
import { Shield } from "lucide-react";
import { AlertDialog, ConfirmDialog } from "./ui/dialog";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useDialogs } from "../hooks/useDialogs";
import { usePermissions } from "../hooks/usePermissions";
import { useClipboard } from "../hooks/useClipboard";
import { useSettings } from "../hooks/useSettings";
import { useSettingsStore } from "../stores/settingsStore";
import { setAgentName as saveAgentName } from "../utils/agentName";
import { getDefaultHotkey, parseHotkeyList, serializeHotkeyList } from "../utils/hotkeys";
import { useHotkeyModeInfo } from "../hooks/useHotkeyModeInfo";
import logger from "../utils/logger";
import { ACCESSIBILITY_SKIPPED_KEY, areRequiredPermissionsMet } from "../utils/permissions";

const MAX_STEP_INDEX = 2;

interface OnboardingFlowProps {
  onComplete: (options?: { openSettings?: boolean }) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();

  const [currentStep, setCurrentStep, removeCurrentStep] = useLocalStorage(
    "onboardingCurrentStep",
    0,
    {
      serialize: String,
      deserialize: (value) => {
        const parsed = parseInt(value, 10);
        // Clamp to valid range to handle users upgrading from older versions
        // with different step counts. The steps array is dynamic, so a second
        // effect below clamps against the actual flow length.
        if (isNaN(parsed) || parsed < 0) return 0;
        return Math.min(parsed, MAX_STEP_INDEX);
      },
    }
  );
  const [accessibilitySkipped, setAccessibilitySkipped] = useLocalStorage(
    ACCESSIBILITY_SKIPPED_KEY,
    false,
    {
      serialize: String,
      deserialize: (value) => value === "true",
    }
  );

  const {
    useLocalWhisper,
    whisperModel,
    localTranscriptionProvider,
    parakeetModel,
    cloudTranscriptionProvider,
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    tinfoilApiKey,
    dictationKey,
    setActivationMode,
    setDictationKey,
    updateTranscriptionSettings,
  } = useSettings();

  // Onboarding edits only the primary dictation hotkey; extra bindings are
  // preserved via withExtraDictationHotkeys.
  const [hotkey, setHotkey] = useState(
    () => parseHotkeyList(dictationKey)[0] || getDefaultHotkey()
  );
  const [agentName, setAgentName] = useState("Oats");
  const [isModelDownloaded, setIsModelDownloaded] = useState(false);
  const { isUsingNativeShortcut, supportsPushToTalk } = useHotkeyModeInfo("onboarding");
  const { alertDialog, confirmDialog, showAlertDialog, hideAlertDialog, hideConfirmDialog } =
    useDialogs();

  // Replace the primary dictation hotkey while keeping additional bindings intact.
  const withExtraDictationHotkeys = useCallback(
    (primary: string) => serializeHotkeyList([primary, ...parseHotkeyList(dictationKey).slice(1)]),
    [dictationKey]
  );

  const permissionsHook = usePermissions(showAlertDialog);
  useClipboard(showAlertDialog); // Initialize clipboard hook for permission checks

  useEffect(() => {
    if (permissionsHook.accessibilityPermissionGranted && accessibilitySkipped) {
      setAccessibilitySkipped(false);
    }
  }, [
    permissionsHook.accessibilityPermissionGranted,
    accessibilitySkipped,
    setAccessibilitySkipped,
  ]);

  // One step, because exactly one thing genuinely blocks a first conversation:
  // permission to use the microphone. The dictation shortcut moved out (it
  // configures a feature that is not one of Oats' three surfaces, and the
  // conversation shortcut now ships with a working default), and the
  // congratulations screen went with it. Show the product; they will work it out.
  const steps = useMemo(() => {
    return [{ id: "permissions", title: t("onboarding.steps.permissions"), icon: Shield }];
  }, [t]);

  const currentStepId = steps[currentStep]?.id;

  // The steps array can shrink (e.g. meeting step removed after deselecting
  // meetings on the way back) — keep the index in range.
  useEffect(() => {
    if (currentStep > steps.length - 1) {
      setCurrentStep(steps.length - 1);
    }
  }, [currentStep, steps.length, setCurrentStep]);

  useEffect(() => {
    if (isUsingNativeShortcut && !supportsPushToTalk) {
      setActivationMode("tap");
    }
  }, [isUsingNativeShortcut, supportsPushToTalk, setActivationMode]);

  // Update wizard UI when backend falls back to a different hotkey.
  // Only update local state — don't persist to localStorage so the app
  // retries the preferred key on next launch.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onHotkeyFallbackUsed?.((data: { fallback: string }) => {
      if (data?.fallback) {
        setHotkey(data.fallback);
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const modelToCheck = localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel;
    if (!useLocalWhisper || !modelToCheck) {
      setIsModelDownloaded(false);
      return;
    }

    const checkStatus = async () => {
      try {
        const result =
          localTranscriptionProvider === "nvidia"
            ? await window.electronAPI?.checkParakeetModelStatus(modelToCheck)
            : await window.electronAPI?.checkModelStatus(modelToCheck);
        setIsModelDownloaded(result?.downloaded ?? false);
      } catch (error) {
        logger.error("Failed to check model status", { error }, "onboarding");
        setIsModelDownloaded(false);
      }
    };

    checkStatus();
  }, [useLocalWhisper, whisperModel, parakeetModel, localTranscriptionProvider]);

  /**
   * Try to register the dictation shortcut, and **never block first run on it**.
   *
   * This used to return false on failure and `saveSettings` returned early, so
   * `onboardingCompleted` was never written: a user whose shortcut could not be
   * registered could not enter the product at all. There is no skip, no back
   * and no "continue anyway" on this screen, so that is a dead end — over a
   * *dictation* shortcut, which is not one of the three surfaces and which this
   * flow no longer even asks about. `hotkeyManager.updateHotkey` returns
   * `success: false` on a slot conflict and on GNOME, Hyprland and KDE
   * registration failure, all of which CLAUDE.md documents as fragile.
   *
   * The failure is still reported — quietly, and after the user is inside,
   * where Settings can fix it. Losing a shortcut is an inconvenience; being
   * unable to reach a conversation recorder you have already granted the
   * microphone to is not.
   */
  const tryRegisterHotkey = useCallback(async () => {
    if (!window.electronAPI?.updateHotkey) return;
    try {
      const result = await window.electronAPI.updateHotkey(withExtraDictationHotkeys(hotkey));
      if (result && !result.success) {
        logger.info(
          "Dictation hotkey not registered during onboarding; continuing",
          { message: result.message },
          "onboarding"
        );
      }
    } catch (error) {
      logger.error("Failed to register onboarding hotkey", { error }, "onboarding");
    }
  }, [hotkey, withExtraDictationHotkeys]);

  const saveSettings = useCallback(async () => {
    await tryRegisterHotkey();
    setDictationKey(withExtraDictationHotkeys(hotkey));
    saveAgentName(agentName);

    localStorage.setItem("onboardingCompleted", "true");

    // Fresh install: write the bundle-migration sentinel so the
    // PostMigrationOnboarding modal doesn't fire on next launch.
    // Migrating users skip onboarding entirely (their flag carries over
    // via productName-keyed userData), so they never reach this code.
    void window.electronAPI?.markBundleMigrated?.();

    // Cloud mode defaults to BYOK — there is no hosted cloud path.
    if (!useLocalWhisper) {
      updateTranscriptionSettings({ cloudTranscriptionMode: "byok" });
    }

    try {
      await window.electronAPI?.saveAllKeysToEnv?.();
    } catch (error) {
      logger.error("Failed to persist API keys", { error }, "onboarding");
    }

    return true;
  }, [
    hotkey,
    withExtraDictationHotkeys,
    agentName,
    setDictationKey,
    tryRegisterHotkey,
    useLocalWhisper,
    updateTranscriptionSettings,
  ]);

  // Focus moves to the only remaining action the moment permission lands, so
  // the keyboard is where the user needs it without hunting.
  const doneRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (permissionsHook.micPermissionGranted) doneRef.current?.focus();
  }, [permissionsHook.micPermissionGranted]);

  const [isFinishing, setIsFinishing] = useState(false);
  const openSettingsOnCompleteRef = useRef(false);

  const finishOnboarding = useCallback(
    async (openSettings = false) => {
      openSettingsOnCompleteRef.current = openSettings;
      setIsFinishing(true);
      try {
        const saved = await saveSettings();
        if (!saved) {
          return;
        }
        removeCurrentStep();
        onComplete({ openSettings });
      } finally {
        setIsFinishing(false);
      }
    },
    [saveSettings, removeCurrentStep, onComplete]
  );

  const renderStep = () => {
    switch (currentStepId) {
      case "permissions": {
        const platform = permissionsHook.pasteToolsInfo?.platform;
        const isMacOS = platform === "darwin";

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-[2rem] font-medium leading-[1.15] tracking-[-0.03em] text-foreground">
                {t("onboarding.permissions.title")}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                {isMacOS
                  ? t("onboarding.permissions.requiredForApp")
                  : t("onboarding.permissions.microphoneRequired")}
              </p>
            </div>

            {/* The microphone, and nothing else.
            
                `PermissionsSection` is the inherited permissions UI — a bordered
                card, a gold-tinted icon tile, a pill badge and a solid-gold
                "ultra-premium with subtle depth" CTA. Measured on this screen it
                spent 0.285% of the window on saturated gold, more than double
                what the product spends on its own live-recording mark, on the
                first screen anybody ever sees. It stays where it belongs
                (`PostMigrationOnboarding`, which walks back through three
                permissions); first run states the one thing that actually
                blocks a conversation, in the ledger's own voice.
            
                Ink, not gold: the accent is reserved for the live pulse and the
                selected thing, and a permission request is neither. */}
            <div className="border-t border-border/60 pt-5">
              <p className="text-sm text-foreground">
                {t("onboarding.permissions.microphoneTitle")}
              </p>
              <p className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground">
                {t("onboarding.permissions.microphoneDescription")}
              </p>
              {/* Granting used to unmount the focused button and replace it with
                  static text while "Done" silently became enabled: focus fell
                  to the body and nothing was spoken, so a blind first-run user
                  heard nothing and had to hunt for the way forward. */}
              <p aria-live="polite" role="status" className="sr-only">
                {permissionsHook.micPermissionGranted
                  ? t("onboarding.permissions.microphoneGranted")
                  : ""}
              </p>
              <div className="mt-4 flex items-center gap-5">
                {permissionsHook.micPermissionGranted ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {t("onboarding.permissions.microphoneReady")}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void permissionsHook.requestMicPermission()}
                    className="rounded-sm text-sm text-foreground underline underline-offset-4 transition-opacity [transition-duration:var(--motion-instant)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {t("onboarding.permissions.grant")}
                  </button>
                )}
                {/* Only once the browser prompt cannot help any more. */}
                {permissionsHook.micPermissionError && (
                  <button
                    type="button"
                    onClick={() => void permissionsHook.openMicPrivacySettings()}
                    className="rounded-sm text-xs text-muted-foreground underline underline-offset-4 transition-colors [transition-duration:var(--motion-instant)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("onboarding.permissions.openSystemSettings")}
                  </button>
                )}
              </div>
              {permissionsHook.micPermissionError && (
                <p className="mt-3 max-w-md text-xs leading-5 text-foreground">
                  {permissionsHook.micPermissionError}
                </p>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStepId) {
      case "usecase":
        return true; // Selection is optional — Next doubles as skip
      case "setup":
        // Setup - check if configuration is complete
        if (useLocalWhisper) {
          const modelToCheck =
            localTranscriptionProvider === "nvidia" ? parakeetModel : whisperModel;
          return modelToCheck !== "" && isModelDownloaded;
        } else {
          // For cloud mode, check if appropriate API key is set
          if (cloudTranscriptionProvider === "openai") {
            return openaiApiKey.trim().length > 0;
          } else if (cloudTranscriptionProvider === "groq") {
            return groqApiKey.trim().length > 0;
          } else if (cloudTranscriptionProvider === "xai") {
            return xaiApiKey.trim().length > 0;
          } else if (cloudTranscriptionProvider === "mistral") {
            return mistralApiKey.trim().length > 0;
          } else if (cloudTranscriptionProvider === "tinfoil") {
            return tinfoilApiKey.trim().length > 0;
          } else if (cloudTranscriptionProvider === "custom") {
            // Custom can work without API key for local endpoints
            return true;
          }
          return openaiApiKey.trim().length > 0; // Default to OpenAI
        }
      case "permissions":
        return areRequiredPermissionsMet(permissionsHook.micPermissionGranted);
      default:
        return false;
    }
  };

  return (
    // First run, in the same system as the workspace.
    //
    // This used to be a wizard chassis — title bar, step progress, a rounded
    // card, and a footer of pill buttons — around a flow that has had exactly
    // one step since the dictation and congratulations steps were removed. It
    // announced itself as a different product from the three surfaces behind
    // it, on the first screen anybody sees. There is one thing to do here, so
    // there is one column, one heading, and one action.
    <div
      className="oats-surface flex h-screen flex-col bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        onConfirm={confirmDialog.onConfirm}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      {/* The window is frameless, so the drag band is the only way to move it —
          and it carries the wordmark, exactly as the workspace's does. */}
      <div
        className="relative z-20 flex h-9 shrink-0 items-center px-5"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span
          aria-hidden="true"
          className="select-none font-mono text-[13px] tracking-[-0.01em] text-foreground"
        >
          oats
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center overflow-y-auto px-8">
        <div className="mx-auto w-full max-w-xl pb-10">{renderStep()}</div>
      </div>

      <div className="shrink-0 px-8 pb-8">
        <div className="mx-auto w-full max-w-xl">
          <button
            ref={doneRef}
            type="button"
            onClick={() => void finishOnboarding()}
            disabled={!canProceed() || isFinishing}
            className={cn(
              "rounded-sm text-sm transition-colors [transition-duration:var(--motion-instant)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              canProceed() && !isFinishing
                ? "text-foreground hover:opacity-80"
                : "cursor-not-allowed text-muted-foreground"
            )}
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
