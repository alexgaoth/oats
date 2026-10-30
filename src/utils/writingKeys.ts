import type { SettingsState } from "../stores/settingsStore";

/** The key each writing provider needs, by the settings field that holds it. */
export const PROVIDER_KEYS: Record<string, keyof SettingsState> = {
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
  gemini: "geminiApiKey",
  groq: "groqApiKey",
  tinfoil: "tinfoilApiKey",
  openrouter: "openrouterApiKey",
};

/**
 * Whether a writing provider has the key it needs: true or false for a
 * provider that needs one, null for one that does not (a custom endpoint,
 * which may run without a key). Kept apart from the hooks so the stores that
 * check summary readiness can use it without importing them.
 */
export function writingKeyPresent(state: SettingsState, provider: string): boolean | null {
  const field = PROVIDER_KEYS[provider];
  if (!field) return null;
  return Boolean(String(state[field] ?? "").trim());
}
