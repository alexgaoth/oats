// A second llama-server for the writing model while a conversation is recorded.
//
// One llama-server holds one model. When the question cards use a classifier
// model of their own, a topic name asked of the writing model in that server
// would unload the classifier and load the writing model, and the next
// question would load the classifier back (topicNaming.mjs
// `namesWhileRecording`). A second server holds the writing model beside the
// classifier instead: from the first name of a recording to the names at
// Finish. It is stopped before the summary, which loads the writing model in
// the default server as before.
//
// It costs the writing model's memory once more, beside the classifier
// (Gemma 4 E4B: 5.6 GB resident, measured on an M5 Pro). So it runs only where the
// writing tier already chooses Gemma (16 GB or more, writingTier.mjs) and on
// Apple silicon, whose GPU uses that memory. A PC's GPU has its own, smaller
// memory, and with --n-gpu-layers 99 two models could fill it.
//
// No check of free memory: on macOS `os.freemem()` counts only pages nobody
// holds, not the cache the system gives back on demand, so it reads a few GB
// on a Mac with plenty to give, and a check on it would turn this off at
// random.
//
// Pure, for test/helpers/writingServer.test.js.

/** The same line as writingTier.mjs MIN_LARGE_WRITING_MEMORY_BYTES (the test pins it). */
const MIN_DEDICATED_WRITING_MEMORY_BYTES = 16 * 1024 ** 3;

const DEFAULT_ROLE = "default";
const WRITING_ROLE = "writing";

/** The writing server's PID file, beside the default server's "llama". */
const WRITING_PID_NAME = "llama-writing";

/**
 * What the renderer asks of the writing server:
 * - "hold": a recording runs; start on the first request, never stop when idle.
 * - "idle": the recording ended; the names at Finish still use it, and it
 *   stops after the usual idle time.
 * - "stop": stop it now (the summary is next) and send everything to the
 *   default server again.
 */
const WRITING_MODES = Object.freeze(["hold", "idle", "stop"]);

/**
 * Whether this computer runs the writing model in a server of its own.
 *
 * @param {{ platform?: string, arch?: string, memoryBytes?: number | null,
 *   binaryAvailable?: boolean }} input
 */
function dedicatedWritingServerSupported({
  platform,
  arch,
  memoryBytes = null,
  binaryAvailable = false,
} = {}) {
  if (platform !== "darwin" || arch !== "arm64") return false;
  if (!binaryAvailable) return false;
  return typeof memoryBytes === "number" && memoryBytes >= MIN_DEDICATED_WRITING_MEMORY_BYTES;
}

/**
 * The server a request goes to.
 *
 * Only a request that asks for the writing server goes there, and only while
 * the renderer holds it or the recording just ended with it running. After
 * the recording, a writing server that is not running is not started again:
 * the classifier is done, and the default server can load the writing model.
 *
 * @param {{ requested?: string | null, mode: "off" | "hold" | "idle",
 *   writingRunning?: boolean }} input
 * @returns {"default" | "writing"}
 */
function serverRoleFor({ requested = null, mode, writingRunning = false }) {
  if (requested !== WRITING_ROLE) return DEFAULT_ROLE;
  if (mode === "hold") return WRITING_ROLE;
  if (mode === "idle" && writingRunning) return WRITING_ROLE;
  return DEFAULT_ROLE;
}

/** The events of an Electron webContents after which its page holds nothing. */
const PAGE_GONE_EVENTS = Object.freeze(["did-navigate", "render-process-gone", "destroyed"]);

/**
 * Which page holds the writing server, so that the hold ends with the page.
 * A reload, a crash or a closed window ends that page's recording, and the
 * page can no longer send "idle", so the hold would last until quit.
 * `release` runs when the page that holds it goes, and not for a page that
 * let go or that another page's hold replaced.
 *
 * @param {() => void} release
 */
function createHoldOwner(release) {
  let holder = null;
  const watched = new WeakSet();
  return {
    /** @param {{ on: (event: string, listener: () => void) => unknown } | null | undefined} page */
    held(page) {
      holder = page ?? null;
      if (!page || watched.has(page)) return;
      watched.add(page);
      for (const name of PAGE_GONE_EVENTS) {
        page.on(name, () => {
          if (holder !== page) return;
          holder = null;
          release();
        });
      }
    },
    letGo() {
      holder = null;
    },
  };
}

module.exports = {
  MIN_DEDICATED_WRITING_MEMORY_BYTES,
  DEFAULT_ROLE,
  WRITING_ROLE,
  WRITING_PID_NAME,
  WRITING_MODES,
  PAGE_GONE_EVENTS,
  createHoldOwner,
  dedicatedWritingServerSupported,
  serverRoleFor,
};
