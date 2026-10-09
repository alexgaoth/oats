import React, { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import App from "./App.jsx";
import MeetingNotificationOverlay from "./components/MeetingNotificationOverlay.tsx";
import TranscriptionPreviewOverlay from "./components/TranscriptionPreviewOverlay.tsx";
import UpdateNotificationOverlay from "./components/UpdateNotificationOverlay.tsx";
import { useTheme } from "./hooks/useTheme";
import { OatsMark } from "./components/shell/OatsMark";

const OatsWorkspace = React.lazy(() => import("./components/OatsWorkspace.tsx"));
const OnboardingFlow = React.lazy(() => import("./components/OnboardingFlow.tsx"));
const AgentOverlay = React.lazy(() => import("./components/AgentOverlay.tsx"));

export default function AppRouter() {
  useTheme();
  const params = window.location.search;

  if (params.includes("meeting-notification=true")) {
    return <MeetingNotificationOverlay />;
  }

  if (params.includes("update-notification=true")) {
    return <UpdateNotificationOverlay />;
  }

  if (params.includes("transcription-preview=true")) {
    return <TranscriptionPreviewOverlay />;
  }

  return <MainApp />;
}

function MainApp() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isAgentPanel = window.location.search.includes("agent=true");
  const isControlPanel =
    !isAgentPanel &&
    (window.location.pathname.includes("control") || window.location.search.includes("panel=true"));
  const isDictationPanel = !isControlPanel && !isAgentPanel;

  useEffect(() => {
    if (isAgentPanel) {
      import("./components/AgentOverlay.tsx").catch(() => {});
    } else if (isControlPanel) {
      import("./components/OatsWorkspace.tsx").catch(() => {});

      if (!localStorage.getItem("onboardingCompleted")) {
        import("./components/OnboardingFlow.tsx").catch(() => {});
      }
    }
  }, [isAgentPanel, isControlPanel]);

  useEffect(() => {
    const resolved = localStorage.getItem("onboardingCompleted") === "true";

    if (isControlPanel && !resolved) {
      setShowOnboarding(true);
    }

    if (isDictationPanel && !resolved) {
      // Keep the floating oat hidden during onboarding; it comes back when
      // onboarding completes (handleOnboardingComplete).
      window.electronAPI?.hideWindow?.();
    }

    setIsLoading(false);
  }, [isControlPanel, isDictationPanel]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem("onboardingCompleted", "true");
    // The oat was hidden "until the activation step", a step onboarding no
    // longer has — so a new user's whole first session ran without it, while
    // every later launch shows it. It appears as onboarding ends instead.
    void window.electronAPI?.showDictationPanel?.();
  };

  if (isAgentPanel) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <AgentOverlay />
      </Suspense>
    );
  }

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (isControlPanel && showOnboarding) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  return isControlPanel ? (
    <Suspense fallback={<LoadingFallback />}>
      <OatsWorkspace />
    </Suspense>
  ) : (
    <App />
  );
}

function LoadingFallback({ message }) {
  const { t } = useTranslation();
  const fallbackMessage = message || t("common.loading");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-[scale-in_300ms_ease-out]">
        <OatsMark className="size-12" />
        {fallbackMessage && <p className="text-[13px] text-muted-foreground">{fallbackMessage}</p>}
      </div>
    </div>
  );
}
