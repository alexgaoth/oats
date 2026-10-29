import reasoningService, { type KeyStatus } from "../services/ReasoningService";
import { CLOUD_WRITING_MODELS } from "../helpers/writingTier.mjs";

export type { KeyStatus };

/** The two providers whose key one field takes (setup, Settings › AI models). */
export type KeyProvider = "openai" | "anthropic";

/**
 * Whose key this is, by its prefix: Anthropic's start with `sk-ant-`, and
 * OpenAI's with `sk-` (`sk-proj-`, `sk-svcacct-` and the older bare `sk-`).
 * Null for anything else. So one field takes either key, and a key pasted
 * into the wrong place is caught before it is saved.
 */
export function detectKeyProvider(key: string): KeyProvider | null {
  const value = key.trim();
  if (/^sk-ant-[\w-]{8,}$/.test(value)) return "anthropic";
  if (/^sk-[\w-]{8,}$/.test(value)) return "openai";
  return null;
}

/**
 * Ask the provider about a key before it is saved, with the request the app
 * already makes to check a model (`GET /models/{id}`, no tokens, no
 * conversation text), for the model Oats would write with.
 */
export function checkKey(provider: KeyProvider, key: string): Promise<KeyStatus> {
  const model = CLOUD_WRITING_MODELS[provider];
  return provider === "openai"
    ? reasoningService.openAiKeyStatus(model, key)
    : reasoningService.anthropicKeyStatus(model, key);
}
