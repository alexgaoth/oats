import { getCleanupSystemPrompt } from "../config/prompts";
import { getSettings } from "../stores/settingsStore";
import { getDictionaryHintWords } from "../utils/snippets";
import { DEFAULT_SPEECH_LANGUAGE } from "../helpers/speechLanguage.mjs";

export interface ReasoningConfig {
  maxTokens?: number;
  temperature?: number;
  contextSize?: number;
  systemPrompt?: string;
  lanUrl?: string;
  baseUrl?: string;
  customApiKey?: string;
  provider?: string;
  disableThinking?: boolean;
  language?: string;
  /** OpenAI only: the reasoning effort ("none" for a fast answer). Unset, the model's default. */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  /** OpenAI only: the answer must be JSON matching this schema (structured output). */
  responseSchema?: { name: string; schema: Record<string, unknown> };
  /** OpenAI-compatible routes: how long one attempt may take. Unset, 30 s. */
  timeoutMs?: number;
  /**
   * Fail instead of returning an answer that was cut off at the output limit, or
   * no answer at all. Without it, OpenAI's route returns the input itself when
   * the answer is empty. The summary at Finish sets it (actionProcessingStore.ts).
   */
  requireComplete?: boolean;
}

export abstract class BaseReasoningService {
  protected isProcessing = false;

  protected getCustomDictionary(): string[] {
    return getDictionaryHintWords(getSettings());
  }

  protected getPreferredLanguage(): string {
    return getSettings().preferredLanguage || DEFAULT_SPEECH_LANGUAGE;
  }

  protected getUiLanguage(): string {
    return getSettings().uiLanguage || "en";
  }

  protected getSystemPrompt(agentName: string | null): string {
    return getCleanupSystemPrompt(
      agentName,
      this.getCustomDictionary(),
      this.getPreferredLanguage(),
      this.getUiLanguage()
    );
  }

  protected calculateMaxTokens(
    textLength: number,
    minTokens = 100,
    maxTokens = 2048,
    multiplier = 2
  ): number {
    return Math.max(minTokens, Math.min(textLength * multiplier, maxTokens));
  }

  abstract isAvailable(): Promise<boolean>;

  abstract processText(
    text: string,
    modelId: string,
    agentName?: string | null,
    config?: ReasoningConfig
  ): Promise<string>;
}
