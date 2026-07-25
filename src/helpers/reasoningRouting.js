// Map a reasoning cloud routing to the InferenceMode its Settings tab selects on.
// Mirrors deriveTranscriptionMode (byok custom → self-hosted, other cloud → providers).
export function deriveReasoningMode(cloudMode, provider) {
  if (cloudMode === "byok") {
    return provider === "custom" ? "self-hosted" : "providers";
  }
  return "local";
}

// Fan a cleanup config out to all five LLM scopes; the four non-cleanup scopes
// mirror only cloud routing plus the derived mode (each tab selects on its mode).
export function buildReasoningScopePatches(settings, mode) {
  const dictationCleanup = { ...settings, cleanupMode: mode };
  // The four non-cleanup scopes mirror only the cloud routing fields that are set.
  const routing = {
    ...(settings.cleanupProvider !== undefined ? { provider: settings.cleanupProvider } : {}),
    ...(settings.cleanupModel !== undefined ? { model: settings.cleanupModel } : {}),
    ...(settings.cleanupCloudMode !== undefined ? { cloudMode: settings.cleanupCloudMode } : {}),
  };
  return {
    dictationCleanup,
    noteFormatting: { mode, ...routing },
    dictationAgent: { mode, ...routing },
    chatIntelligence: { mode, ...routing },
    dictationTranslation: { mode, ...routing },
  };
}
