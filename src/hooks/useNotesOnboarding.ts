import { useState, useCallback } from "react";
import { useSettingsStore, selectIsCloudCleanupMode } from "../stores/settingsStore";

interface UseNotesOnboardingReturn {
  isComplete: boolean;
  isProUser: boolean;
  isProLoading: boolean;
  isLLMConfigured: boolean;
  complete: () => void;
}

export function useNotesOnboarding(): UseNotesOnboardingReturn {
  // There is no paid tier anymore — cloud access is BYOK-only.
  const isProUser = false;
  const isProLoading = false;
  const useCleanupModel = useSettingsStore((s) => s.useCleanupModel);
  const effectiveModel = useSettingsStore((s) => s.cleanupModel);
  const isCloudCleanup = useSettingsStore(selectIsCloudCleanupMode);

  const [isComplete, setIsComplete] = useState(
    () => localStorage.getItem("notesOnboardingComplete") === "true"
  );

  const isLLMConfigured = isCloudCleanup || (useCleanupModel && !!effectiveModel);

  const complete = useCallback(() => {
    localStorage.setItem("notesOnboardingComplete", "true");
    setIsComplete(true);
  }, []);

  return { isComplete, isProUser, isProLoading, isLLMConfigured, complete };
}
