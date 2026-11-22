// Provider overrides for note-formatting ReasoningService.processText calls.
// Self-hosted must forward remoteUrl as lanUrl — without it, processText
// guesses the provider from the model and can silently hit a cloud API.
// With a provider, the request is Writing's, and goes out on the key chosen
// for Writing (`keyFeature`, stores/apiKeys.ts): the summary, the title, the
// topic names, the group, the links and the context check all come here.
export function buildNoteFormattingOverrides(noteFormatting, isCloudMode, customApiKey) {
  if (isCloudMode) {
    return {
      provider: "legacy", // TODO(stage4): dead hosted-cloud reference
      baseUrl: undefined,
      customApiKey: undefined,
      lanUrl: undefined,
    };
  }

  const mode = noteFormatting?.mode;

  if (mode === "self-hosted") {
    return {
      provider: undefined,
      baseUrl: undefined,
      customApiKey: customApiKey || undefined,
      lanUrl: noteFormatting?.remoteUrl || undefined,
    };
  }

  const provider = mode === "providers" ? noteFormatting?.provider || undefined : undefined;
  const isCustom = provider === "custom";
  return {
    provider,
    baseUrl: isCustom ? noteFormatting?.cloudBaseUrl || undefined : undefined,
    customApiKey: isCustom ? customApiKey || undefined : undefined,
    lanUrl: undefined,
    ...(mode === "providers" && { keyFeature: /** @type {const} */ ("writing") }),
  };
}
