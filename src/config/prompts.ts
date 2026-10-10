import { resolvePrompt } from "./prompts/index";

export {
  resolvePrompt,
  getDefaultPromptText,
  appendDictionarySuffix,
  wrapCleanupTranscript,
} from "./prompts/index";
export { PROMPT_KINDS, PROMPT_KIND_LIST, type PromptKind } from "./prompts/registry";
export { detectAgentName } from "./agentDetection";

export function getCleanupSystemPrompt(
  agentName: string | null,
  customDictionary?: string[],
  language?: string,
  uiLanguage?: string
): string {
  return resolvePrompt("cleanup", { agentName, language, customDictionary, uiLanguage });
}

export function getWordBoost(customDictionary?: string[]): string[] {
  if (!customDictionary || customDictionary.length === 0) return [];
  return customDictionary.filter((w) => w.trim());
}
