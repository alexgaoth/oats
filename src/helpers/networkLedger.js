// Every request this process sent to another computer since launch: the number
// in the sidebar's footer ("0 network requests since launch").
//
// Oats is local-first, and the footer says so with a count rather than a
// promise. A count that misses a path is worse than no count, so this counts at
// the few places every request must pass through, never at call sites:
//
// - Chromium, in every session (`session-created`, so the updater's own
//   partition too): the renderer's fetches, sockets and images, and the main
//   process's `net.request` / `net.fetch`, which carry every model download.
//   Measured on Electron 41: `webRequest.onSendHeaders` fires for each of these,
//   for every redirect hop, and before a connection that then fails.
// - Chromium downloads (`will-download`), which webRequest does not see.
// - Node in the main process: `http`/`https`, and so `ws` and the AWS SDK
//   (`http.client.request.created`), and `fetch` (`undici:request:create`).
// - A link handed to the browser: `shell.openExternal`, wrapped here, and the
//   Linux new-window launch in ipcHandlers.js, which records itself. The
//   browser makes that request, but Oats chose what it carries.
// - The context check's agent, the user's Claude Code run as a child process
//   (contextAgentRunner.js), which records itself: Anthropic's API once per
//   run, and each service it reads from.
//
// Not counted, because none of it reaches another computer: loopback (the local
// whisper, llama and Qdrant servers), unix sockets, and every scheme that is not
// a network request (file://, devtools://, data:, blob:, mailto:).
//
// What cannot pass through these hooks (the sidecars, the ONNX utility process)
// is zero by construction. docs/network-allowlist.md lists each path and how it
// is counted, and test/helpers/networkBoundary.test.js pins the construction.

const HTTP_CHANNEL = "http.client.request.created";
const FETCH_CHANNEL = "undici:request:create";

/** The only schemes that can carry a request off the machine. */
const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

/** Chromium's webRequest filter for the same schemes. */
const WEB_REQUEST_FILTER = { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] };

/** Where Chromium fetches spellcheck dictionaries (Linux and Windows only). */
const SPELLCHECK_DICTIONARY_URL = "https://redirector.gvt1.com/edgedl/chrome/dict/";

/**
 * A host as the WHATWG URL parser writes it, so `127.1`, `0x7f.0.0.1` and
 * `[0:0::1]` compare as the addresses they are. Null when it is not a host.
 */
function canonicalHost(host) {
  let text = String(host ?? "").trim();
  if (!text) return null;
  if (text.includes(":") && !text.startsWith("[")) text = `[${text}]`;
  try {
    return new URL(`http://${text}/`).hostname.replace(/\.$/, "");
  } catch {
    return null;
  }
}

/**
 * Whether a host is this machine: the loopback block (127.0.0.0/8, ::1 and the
 * IPv4-mapped form of 127/8), `localhost` and its subdomains, and the
 * unspecified address, which connects back to this machine and nowhere else.
 */
function isLoopbackHost(host) {
  const name = canonicalHost(host);
  if (!name) return false;
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(name)) return true;
  if (name === "[::1]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(name)) return true;
  return name === "0.0.0.0" || name === "[::]";
}

/**
 * @param {string} host
 * @returns {"outbound" | "local"} An unreadable host is counted: the number may
 *   be too high, never too low.
 */
function classifyHost(host) {
  return isLoopbackHost(host) ? "local" : "outbound";
}

/**
 * @param {string} url
 * @returns {"outbound" | "local" | "not-network"}
 */
function classifyUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    return "outbound";
  }
  if (!NETWORK_PROTOCOLS.has(parsed.protocol)) return "not-network";
  return classifyHost(parsed.hostname);
}

/**
 * A running count, and whoever wants to hear when it changes.
 *
 * `outbound` is what the footer shows. `local` counts the requests the hooks saw
 * and excluded, so a test can prove a hook is wired without leaving the
 * machine. `bySource` says which hook counted what.
 */
function createNetworkLedger({ now = Date.now } = {}) {
  const since = now();
  let outbound = 0;
  let local = 0;
  const bySource = {};
  const listeners = new Set();

  const snapshot = () => ({ outbound, local, bySource: { ...bySource }, since });

  const count = (source, kind) => {
    if (kind === "local") local += 1;
    if (kind !== "outbound") return false;
    outbound += 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // A listener that throws must not stop the count or the request.
      }
    }
    return true;
  };

  return {
    snapshot,
    /** @returns {boolean} whether it was counted as leaving the machine */
    recordUrl: (source, url) => count(source, classifyUrl(url)),
    /** @returns {boolean} whether it was counted as leaving the machine */
    recordHost: (source, host, { socketPath } = {}) =>
      count(source, socketPath ? "local" : classifyHost(host)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The origin of an undici request: a string, or a URL object. */
function fetchOrigin(request) {
  const origin = request?.origin;
  return origin == null ? "" : String(origin);
}

/**
 * Wire a ledger to every hook. Call it before anything can open a connection:
 * the top of main.js, before `app` is ready.
 *
 * Takes Electron's modules as arguments so tests can pass fakes; the module
 * itself never requires electron.
 *
 * @returns {{ hookSession: (session: object) => void, uninstall: () => void }}
 */
function installNetworkLedger(
  ledger,
  { app, shell, session, diagnosticsChannel = require("node:diagnostics_channel") } = {}
) {
  const hooked = new WeakSet();
  const hookSession = (target) => {
    if (!target || hooked.has(target)) return;
    hooked.add(target);
    // One listener per event per session is all webRequest keeps, so this
    // event must stay ours: networkBoundary.test.js fails if anything else
    // registers onSendHeaders. It observes and never blocks a request.
    target.webRequest?.onSendHeaders?.(WEB_REQUEST_FILTER, (details) => {
      ledger.recordUrl("chromium", details?.url);
    });
    target.on?.("will-download", (_event, item) => {
      ledger.recordUrl("download", item?.getURL?.());
    });
    target.on?.("spellcheck-dictionary-download-begin", () => {
      ledger.recordUrl("spellcheck", SPELLCHECK_DICTIONARY_URL);
    });
  };

  app?.on?.("session-created", hookSession);
  // The default session is created lazily, after this runs; this covers an
  // install that happens later than intended.
  Promise.resolve(app?.whenReady?.())
    .then(() => {
      if (app) hookSession(session?.defaultSession);
    })
    .catch(() => {});

  const onHttp = (message) => {
    const request = message?.request;
    ledger.recordHost("node-http", request?.host, { socketPath: request?.socketPath });
  };
  const onFetch = (message) => ledger.recordUrl("node-fetch", fetchOrigin(message?.request));
  diagnosticsChannel.subscribe(HTTP_CHANNEL, onHttp);
  diagnosticsChannel.subscribe(FETCH_CHANNEL, onFetch);

  let restoreShell = () => {};
  if (shell && typeof shell.openExternal === "function") {
    const original = shell.openExternal;
    shell.openExternal = function openExternal(url, options) {
      ledger.recordUrl("browser", url);
      return original.call(this, url, options);
    };
    restoreShell = () => {
      shell.openExternal = original;
    };
  }

  return {
    hookSession,
    uninstall() {
      app?.removeListener?.("session-created", hookSession);
      diagnosticsChannel.unsubscribe(HTTP_CHANNEL, onHttp);
      diagnosticsChannel.unsubscribe(FETCH_CHANNEL, onFetch);
      restoreShell();
    },
  };
}

let ledger = null;

/** The process's ledger, created on first use. */
function getNetworkLedger() {
  ledger ??= createNetworkLedger();
  return ledger;
}

/** Install the process's ledger. main.js calls this once, first. */
function install(electron) {
  return installNetworkLedger(getNetworkLedger(), electron);
}

module.exports = {
  FETCH_CHANNEL,
  HTTP_CHANNEL,
  SPELLCHECK_DICTIONARY_URL,
  WEB_REQUEST_FILTER,
  classifyHost,
  classifyUrl,
  createNetworkLedger,
  getNetworkLedger,
  install,
  installNetworkLedger,
  isLoopbackHost,
};
