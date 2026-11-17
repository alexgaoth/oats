// The agent's line when a reply fails. A missing key is the one failure the
// person can fix, so it is said in their language with where to fix it; any
// other failure keeps the error's own words after the prefix.

/**
 * @param {unknown} error
 * @param {(key: string, options?: Record<string, unknown>) => string} t
 */
export function chatErrorText(error, t) {
  const typed = /** @type {{ code?: string, provider?: string, message?: string } | null} */ (
    error && typeof error === "object" ? error : null
  );
  if (typed?.code === "API_KEY_MISSING" && typed.provider) {
    return t("agentMode.chat.apiKeyMissing", { provider: typed.provider });
  }
  return `${t("agentMode.chat.errorPrefix")}: ${typed?.message ?? String(error)}`;
}
