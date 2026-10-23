// Runs tasks one at a time, in the order they arrive, and lets a task wait
// only so long for its turn.
//
// For the local writing model (localReasoningBridge.js): llama-server holds one
// model and answers one request, and the bridge used to refuse a second one
// outright ("Already processing a request"). That was harmless while the only
// caller was dictation cleanup. With the question classifier, the context
// check and the summary all using the model around a recording, two of them
// meet often enough that refusing one meant a card left at its local verdict,
// a check that never came, or a summary that failed at Finish. Now the later
// one waits its turn.
//
// A task that has waited `maxWaitMs` gives up with the old error, and so does
// one that arrives while `maxWaiting` are already waiting: a queue that only
// grows means something is stuck, and saying so is better than piling up.

const BUSY = "Already processing a request";

/**
 * @param {{ maxWaitMs?: number, maxWaiting?: number }} [options]
 */
function createOneAtATime({ maxWaitMs = 45000, maxWaiting = 4 } = {}) {
  let tail = Promise.resolve();
  let waiting = 0;
  let running = false;

  /**
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  async function run(task) {
    if (running && waiting >= maxWaiting) throw new Error(BUSY);
    let release;
    const mine = new Promise((resolve) => {
      release = resolve;
    });
    const before = tail;
    // The next task waits for this one's release as well as for everything
    // before it, so a task that gives up early never lets the one behind it
    // overtake a task still running.
    tail = before.then(() => mine);

    waiting += 1;
    let timer;
    try {
      await Promise.race([
        before,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(BUSY)), maxWaitMs);
        }),
      ]);
    } catch (error) {
      release();
      throw error;
    } finally {
      clearTimeout(timer);
      waiting -= 1;
    }

    running = true;
    try {
      return await task();
    } finally {
      running = false;
      release();
    }
  }

  return {
    run,
    get waiting() {
      return waiting;
    },
    get running() {
      return running;
    },
  };
}

module.exports = { createOneAtATime, BUSY };
