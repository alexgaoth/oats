// Which windows may read an API key's secret over IPC (`api-key-secret`,
// `api-key-for-feature`). Only the windows that call a provider themselves:
// the main window (dictation, audioManager.js) and the control panel
// (writing, ReasoningService.ts), and only from their top frame. Not the
// agent overlay, which runs without the sandbox and with web security off,
// and not a frame inside a page. test/helpers/keySecretAccess.test.js pins it.

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

module.exports = { mayReadKeySecrets };
