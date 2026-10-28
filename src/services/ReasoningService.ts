import { getModelProvider, getProviderDisplayName } from "../models/ModelRegistry";
import { BaseReasoningService, ReasoningConfig } from "./BaseReasoningService";
import { SecureCache } from "../utils/SecureCache";
import { withRetry, createApiRetryStrategy, httpError } from "../utils/retry";
import { TOKEN_LIMITS } from "../config/constants";
import logger from "../utils/logger";
import { getSettings, isCloudCleanupMode } from "../stores/settingsStore";
import { wrapCleanupTranscript } from "../config/prompts";
import { stripThinkingTags } from "../helpers/stripThinking.js";
import { PROVIDER_REGISTRY, type ProviderContext } from "./ai/inferenceProviders";
import { applyThinkingSuppression } from "./ai/thinkingSuppression";
import { extractApiErrorMessage } from "./ai/apiErrorMessage";
import { clearTinfoilClientCache } from "./ai/tinfoilClient";

// Old Ollama/strict proxies reject the `reasoning` object; drop it and retry once.
async function fetchWithReasoningFieldFallback(
  doFetch: () => Promise<Response>,
  requestBody: Record<string, unknown>,
  logEvent: string
): Promise<Response> {
  let res = await doFetch();
  if (!res.ok && (res.status === 400 || res.status === 422) && requestBody.reasoning) {
    logger.logReasoning(logEvent, { status: res.status });
    delete requestBody.reasoning;
    void res.body?.cancel();
    res = await doFetch();
  }
  return res;
}

class ReasoningService extends BaseReasoningService {
  private apiKeyCache: SecureCache<string>;
  private cacheCleanupStop: (() => void) | undefined;

  private readonly providerContext: ProviderContext;

  constructor() {
    super();
    this.apiKeyCache = new SecureCache();
    this.cacheCleanupStop = this.apiKeyCache.startAutoCleanup();
    this.providerContext = {
      getApiKey: (provider: string) =>
        this.getApiKey(provider as Parameters<ReasoningService["getApiKey"]>[0]),
      getSystemPrompt: this.getSystemPrompt.bind(this),
      getCustomDictionary: this.getCustomDictionary.bind(this),
      getPreferredLanguage: this.getPreferredLanguage.bind(this),
      getUiLanguage: this.getUiLanguage.bind(this),
      callChatCompletionsApi: this.callChatCompletionsApi.bind(this),
      calculateMaxTokens: this.calculateMaxTokens.bind(this),
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.destroy());
    }
  }

  private isLanCleanupMode(): boolean {
    const settings = getSettings();
    return settings.cleanupMode === "self-hosted" && !!settings.cleanupRemoteUrl;
  }

  private async getApiKey(
    provider: "openai" | "anthropic" | "gemini" | "groq" | "tinfoil" | "custom" | "openrouter"
  ): Promise<string> {
    if (provider === "custom") {
      let customKey = "";
      try {
        customKey = (await window.electronAPI?.getCleanupCustomKey?.()) || "";
      } catch (err) {
        logger.logReasoning("CUSTOM_KEY_IPC_FALLBACK", { error: (err as Error)?.message });
      }
      if (!customKey || !customKey.trim()) {
        customKey = getSettings().cleanupCustomApiKey || "";
      }
      const trimmedKey = customKey.trim();

      logger.logReasoning("CUSTOM_KEY_RETRIEVAL", {
        provider,
        hasKey: !!trimmedKey,
        keyLength: trimmedKey.length,
      });

      return trimmedKey;
    }

    let apiKey = this.apiKeyCache.get(provider);

    logger.logReasoning(`${provider.toUpperCase()}_KEY_RETRIEVAL`, {
      provider,
      fromCache: !!apiKey,
      cacheSize: this.apiKeyCache.size || 0,
    });

    if (!apiKey) {
      try {
        const keyGetters = {
          openai: () => window.electronAPI.getOpenAIKey(),
          anthropic: () => window.electronAPI.getAnthropicKey(),
          gemini: () => window.electronAPI.getGeminiKey(),
          groq: () => window.electronAPI.getGroqKey(),
          openrouter: () => window.electronAPI.getOpenrouterKey(),
          tinfoil: () => window.electronAPI.getTinfoilKey?.(),
        };
        apiKey = (await keyGetters[provider]()) ?? undefined;

        logger.logReasoning(`${provider.toUpperCase()}_KEY_FETCHED`, {
          provider,
          hasKey: !!apiKey,
          keyLength: apiKey?.length || 0,
        });

        if (apiKey) {
          this.apiKeyCache.set(provider, apiKey);
        }
      } catch (error) {
        logger.logReasoning(`${provider.toUpperCase()}_KEY_FETCH_ERROR`, {
          provider,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    }

    if (!apiKey) {
      const displayName = getProviderDisplayName(provider);
      const errorMsg = `${displayName} API key not configured`;
      logger.logReasoning(`${provider.toUpperCase()}_KEY_MISSING`, {
        provider,
        error: errorMsg,
      });
      const error = new Error(errorMsg) as Error & { code: string; provider: string };
      error.code = "API_KEY_MISSING";
      error.provider = displayName;
      throw error;
    }

    return apiKey;
  }

  private async callChatCompletionsApi(
    endpoint: string,
    apiKey: string,
    model: string,
    text: string,
    agentName: string | null,
    config: ReasoningConfig,
    providerName: string
  ): Promise<string> {
    // No systemPrompt override means the default cleanup path: a deterministic
    // transform, so zero temperature and a delimited transcript.
    const isCleanup = !config.systemPrompt;
    const systemPrompt = config.systemPrompt || this.getSystemPrompt(agentName);
    const userPrompt = isCleanup ? wrapCleanupTranscript(text) : text;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const requestBody: any = {
      model,
      messages,
      temperature: config.temperature ?? (isCleanup ? 0 : 0.3),
      max_tokens:
        config.maxTokens ||
        Math.max(
          4096,
          this.calculateMaxTokens(
            text.length,
            TOKEN_LIMITS.MIN_TOKENS,
            TOKEN_LIMITS.MAX_TOKENS,
            TOKEN_LIMITS.TOKEN_MULTIPLIER
          )
        ),
    };

    // gpt-oss defaults to medium reasoning effort; low cuts hidden reasoning
    // tokens (latency) and the tendency to answer the transcript instead of
    // cleaning it. applyThinkingSuppression still wins when thinking is
    // disabled by the user.
    if (isCleanup && model.includes("gpt-oss")) {
      requestBody.reasoning_effort = "low";
    }

    applyThinkingSuppression(requestBody, model, providerName, config, endpoint);

    logger.logReasoning(`${providerName.toUpperCase()}_REQUEST`, {
      endpoint,
      model,
      hasApiKey: !!apiKey,
      requestBody: JSON.stringify(requestBody).substring(0, 200),
    });

    const response = await withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const res = await fetchWithReasoningFieldFallback(
          () =>
            fetch(endpoint, {
              method: "POST",
              headers,
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            }),
          requestBody,
          `${providerName.toUpperCase()}_REASONING_FIELD_RETRY`
        );

        if (!res.ok) {
          const errorText = await res.text();
          let errorData: any = { error: res.statusText };

          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText || res.statusText };
          }

          const errorMessage = extractApiErrorMessage(
            errorData,
            `${providerName} API error: ${res.status}`
          );

          logger.logReasoning(`${providerName.toUpperCase()}_API_ERROR_DETAIL`, {
            status: res.status,
            statusText: res.statusText,
            error: errorData,
            errorMessage,
            fullResponse: errorText.substring(0, 500),
          });
          throw httpError(errorMessage, res.status);
        }

        const jsonResponse = await res.json();

        logger.logReasoning(`${providerName.toUpperCase()}_RAW_RESPONSE`, {
          hasResponse: !!jsonResponse,
          responseKeys: jsonResponse ? Object.keys(jsonResponse) : [],
          hasChoices: !!jsonResponse?.choices,
          choicesLength: jsonResponse?.choices?.length || 0,
          fullResponse: JSON.stringify(jsonResponse).substring(0, 500),
        });

        return jsonResponse;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error("Request timed out after 30s");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, createApiRetryStrategy());

    if (!response.choices || !response.choices[0]) {
      logger.logReasoning(`${providerName.toUpperCase()}_RESPONSE_ERROR`, {
        model,
        response: JSON.stringify(response).substring(0, 500),
        hasChoices: !!response.choices,
        choicesCount: response.choices?.length || 0,
      });
      throw new Error(`Invalid response structure from ${providerName} API`);
    }

    const choice = response.choices[0];
    // Reasoning models leak <think> blocks into non-streamed output; strip them
    // unless the user explicitly enabled thinking (same default as streaming).
    const rawContent = choice.message?.content?.trim() || "";
    const responseText =
      config.disableThinking !== false ? stripThinkingTags(rawContent) : rawContent;

    if (!responseText) {
      logger.logReasoning(`${providerName.toUpperCase()}_EMPTY_RESPONSE`, {
        model,
        finishReason: choice.finish_reason,
        hasMessage: !!choice.message,
        response: JSON.stringify(choice).substring(0, 500),
      });
      throw new Error(`${providerName} returned empty response`);
    }

    logger.logReasoning(`${providerName.toUpperCase()}_RESPONSE`, {
      model,
      responseLength: responseText.length,
      tokensUsed: response.usage?.total_tokens || 0,
      success: true,
    });

    return responseText;
  }

  async processText(
    text: string,
    model: string = "",
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    const trimmedModel = model?.trim?.() || "";
    const isLanCleanup = !!config.lanUrl || this.isLanCleanupMode();
    const providerId = isLanCleanup ? "lan" : config.provider || getModelProvider(trimmedModel);

    if (!trimmedModel && providerId !== "lan") {
      throw new Error("No reasoning model selected");
    }

    logger.logReasoning("PROVIDER_SELECTION", {
      provider: providerId,
      model: trimmedModel,
      agentName,
      isLanCleanup,
      textLength: text.length,
    });

    const handler = PROVIDER_REGISTRY[providerId];
    if (!handler) {
      throw new Error(`Unsupported reasoning provider: ${providerId}`);
    }

    const startTime = Date.now();
    try {
      const result = await handler.call({
        text,
        model: trimmedModel,
        agentName,
        config,
        ctx: this.providerContext,
      });

      logger.logReasoning("PROVIDER_SUCCESS", {
        provider: providerId,
        model: trimmedModel,
        processingTimeMs: Date.now() - startTime,
        resultLength: result.length,
      });

      return result;
    } catch (error) {
      logger.logReasoning("PROVIDER_ERROR", {
        provider: providerId,
        model: trimmedModel,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (isCloudCleanupMode()) {
        logger.logReasoning("API_KEY_CHECK", { cloudCleanupMode: true });
        return true;
      }

      if (this.isLanCleanupMode()) {
        logger.logReasoning("API_KEY_CHECK", { lanCleanup: true });
        return true;
      }

      const settings = getSettings();
      if (settings.cleanupProvider === "custom" && settings.cleanupCloudBaseUrl?.trim()) {
        logger.logReasoning("API_KEY_CHECK", {
          customProvider: true,
          hasCustomEndpoint: true,
        });
        return true;
      }

      const openaiKey = await window.electronAPI?.getOpenAIKey?.();
      const anthropicKey = await window.electronAPI?.getAnthropicKey?.();
      const geminiKey = await window.electronAPI?.getGeminiKey?.();
      const groqKey = await window.electronAPI?.getGroqKey?.();
      const openrouterKey = await window.electronAPI?.getOpenrouterKey?.();
      const tinfoilKey = await window.electronAPI?.getTinfoilKey?.();
      const localAvailable = await window.electronAPI?.checkLocalReasoningAvailable?.();

      logger.logReasoning("API_KEY_CHECK", {
        hasOpenAI: !!openaiKey,
        hasAnthropic: !!anthropicKey,
        hasGemini: !!geminiKey,
        hasGroq: !!groqKey,
        hasOpenrouter: !!openrouterKey,
        hasTinfoil: !!tinfoilKey,
        hasLocal: !!localAvailable,
      });

      return !!(
        openaiKey ||
        anthropicKey ||
        geminiKey ||
        groqKey ||
        openrouterKey ||
        tinfoilKey ||
        localAvailable
      );
    } catch (error) {
      logger.logReasoning("API_KEY_CHECK_ERROR", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        name: (error as Error).name,
      });
      return false;
    }
  }

  clearApiKeyCache(
    provider?:
      "openai" | "anthropic" | "gemini" | "groq" | "mistral" | "tinfoil" | "custom" | "openrouter"
  ): void {
    if (provider) {
      if (provider !== "custom") {
        this.apiKeyCache.delete(provider);
      }
      if (provider === "tinfoil") {
        clearTinfoilClientCache();
      }
      logger.logReasoning("API_KEY_CACHE_CLEARED", { provider });
    } else {
      this.apiKeyCache.clear();
      clearTinfoilClientCache();
      logger.logReasoning("API_KEY_CACHE_CLEARED", { provider: "all" });
    }
  }

  destroy(): void {
    if (this.cacheCleanupStop) {
      this.cacheCleanupStop();
    }
  }
}

export default new ReasoningService();
