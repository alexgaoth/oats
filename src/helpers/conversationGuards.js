// Two ways a Mac could end a conversation that nobody chose to end.
//
// Quitting. ⌘Q tore the app down at once, and the conversation lives in the
// panel's renderer: everything since the last checkpoint — up to a twenty-second
// segment still being transcribed — went with it. Quitting now finishes the
// conversation first, through the same Finish path a press of the seed takes,
// and quits once the renderer says the transcript is written. No dialog: a
// conversation happens once, and "quit" from somebody holding one is never a
// request to throw it away.
//
// Sleeping. An in-person conversation is exactly the case where nobody touches
// the laptop for an hour, and macOS idle sleep suspends capture with it. While
// one is recorded, the system is asked not to suspend the app; the display may
// still sleep.
//
// Both are decided here, with Electron passed in, so they can be pinned without
// one.

// Finish waits for main to transcribe what it still holds — up to a 20s segment
// on a slow machine — and then for one database write. Past this, quitting goes
// ahead: the checkpoint has already saved every finalized turn, and a quit that
// never completes is its own kind of broken.
const FINISH_TIMEOUT_MS = 30 * 1000;

/**
 * Hold a quit until a recording conversation has been finished and saved.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isRecording
 * @param {() => Promise<void>} deps.finish  resolves once the renderer reports
 *   the conversation saved; may reject, which is treated like a timeout
 * @param {number} [deps.timeoutMs]
 * @param {(message: string, meta?: object) => void} [deps.log]
 * @returns {() => Promise<"idle" | "finished" | "timed-out" | "failed">}
 */
function createQuitGuard({ isRecording, finish, timeoutMs = FINISH_TIMEOUT_MS, log }) {
  return async function finishBeforeQuit() {
    if (!isRecording()) return "idle";
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve("timed-out"), timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        Promise.resolve()
          .then(finish)
          .then(() => "finished"),
        timeout,
      ]);
      if (outcome !== "finished")
        log?.("Quit went ahead before the conversation was saved", { timeoutMs });
      return outcome;
    } catch (error) {
      log?.("Finishing the conversation before quit failed", { error: error?.message });
      return "failed";
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Keep the system awake for exactly as long as a conversation is recorded.
 *
 * @param {{ start: (type: string) => number, stop: (id: number) => void, isStarted?: (id: number) => boolean }} powerSaveBlocker
 * @returns {{ update: (recording: boolean) => void, release: () => void, isHeld: () => boolean }}
 */
function createSleepGuard(powerSaveBlocker) {
  let id = null;
  const release = () => {
    if (id === null) return;
    try {
      powerSaveBlocker.stop(id);
    } catch {
      // Already gone with the app; nothing to undo.
    }
    id = null;
  };
  return {
    update(recording) {
      if (recording && id === null) {
        // `prevent-app-suspension`, not `prevent-display-sleep`: the screen is
        // free to go dark while people talk, the capture is not free to stop.
        id = powerSaveBlocker.start("prevent-app-suspension");
      } else if (!recording) {
        release();
      }
    },
    release,
    isHeld: () => id !== null,
  };
}

module.exports = { createQuitGuard, createSleepGuard, FINISH_TIMEOUT_MS };
