// Which windows may read an API key's secret over IPC (`api-key-secret`,
// `api-key-for-feature`). Only the windows that call a provider themselves:
// the main window (dictation, audioManager.js) and the control panel
// (writing, ReasoningService.ts), and only from their top frame. Not a frame
// inside a page, and not the agent overlay, which runs without the sandbox
// and with web security off, with one exception: its voice input is
// transcribed with Dictation's key (AgentOverlay.tsx, audioManager.js), so it
// may ask main for that one feature's OpenAI key, never for a key by its id.
// test/helpers/keySecretAccess.test.js pins it.

/**
 * @param {{ sender?: any, senderFrame?: any } | null | undefined} event
 * @param {Array<{ webContents?: any, isDestroyed?: () => boolean } | null | undefined>} readers
 */
function mayReadKeySecrets(event, readers) {
  const sender = event?.sender;
  if (!sender || sender.isDestroyed?.()) return false;
  if (event.senderFrame?.parent) return false;
  return readers.some((win) => Boolean(win) && !win.isDestroyed?.() && win.webContents === sender);
}

/**
 * The key a feature's call uses (`api-key-for-feature`): any feature's for
 * the readers; Dictation's OpenAI key alone for the windows that dictate
 * without being one.
 *
 * @param {{ sender?: any, senderFrame?: any } | null | undefined} event
 * @param {unknown} feature
 * @param {unknown} provider
 * @param {Parameters<typeof mayReadKeySecrets>[1]} readers
 * @param {Parameters<typeof mayReadKeySecrets>[1]} dictationReaders
 */
function mayReadFeatureKey(event, feature, provider, readers, dictationReaders) {
  if (mayReadKeySecrets(event, readers)) return true;
  return (
    feature === "dictation" && provider === "openai" && mayReadKeySecrets(event, dictationReaders)
  );
}

module.exports = { mayReadKeySecrets, mayReadFeatureKey };
