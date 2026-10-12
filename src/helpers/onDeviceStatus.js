// What the sidebar's footer reports from the main process, pushed to the
// windows whenever it changes and readable once on mount (push plus pull: a
// window that opens after a push still gets the current state).
//
// - `requests`: what networkLedger.js counted as leaving this machine.
// - `speech`: the model the running whisper-server loaded and the backend it
//   said it loaded on, or null while no local server is up. Nothing here is
//   what Oats asked for; it is what the server reports.

const PUBLISH_DELAY_MS = 250;

/** The footer's view of `WhisperServerManager.getStatus()`. */
function speechState(status) {
  if (!status?.running || status.isRemote || !status.modelName) return null;
  return { model: status.modelName, backend: status.backend ?? null };
}

/**
 * @param {object} options
 * @param {{ snapshot: () => object, subscribe: (fn: () => void) => () => void }} options.ledger
 * @param {import("events").EventEmitter & { getStatus: () => object }} [options.speechServer]
 * @param {(status: object) => void} options.publish sends to every window
 * @param {number} [options.delayMs] a burst of requests is one push, not many
 */
function createOnDeviceStatus({
  ledger,
  speechServer,
  publish,
  delayMs = PUBLISH_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const snapshot = () => {
    const counted = ledger.snapshot();
    return {
      requests: { outbound: counted.outbound, since: counted.since },
      speech: speechState(speechServer?.getStatus?.()),
    };
  };

  let timer = null;
  const schedule = () => {
    if (timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      publish(snapshot());
    }, delayMs);
  };

  const unsubscribe = ledger.subscribe(schedule);
  speechServer?.on?.("status", schedule);

  return {
    snapshot,
    dispose() {
      unsubscribe();
      speechServer?.removeListener?.("status", schedule);
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

module.exports = { createOnDeviceStatus, speechState };
