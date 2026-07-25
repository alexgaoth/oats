const CLOUD_CHAT_PROVIDERS = new Set([
  "openai",
  "groq",
  "gemini",
  "anthropic",
  "tinfoil",
  "custom",
  "openrouter",
]);

// Resolve Chat from Chat-owned settings only. In particular, this must never
// consult Dictation Cleanup's mode or endpoint.
export function resolveChatRoute({ provider, lanUrl, customApiKey }) {
  // An explicit self-hosted URL is the caller's declared route — it wins even
  // over a stale provider id left in settings.
  const baseUrl = lanUrl?.trim() || "";
  if (baseUrl) {
    return {
      kind: "self-hosted",
      baseUrl,
      apiKey: customApiKey?.trim() || "",
    };
  }

  if (!CLOUD_CHAT_PROVIDERS.has(provider)) {
    return { kind: "local", baseUrl: "", apiKey: "" };
  }

  return { kind: "provider", baseUrl: "", apiKey: "" };
}
