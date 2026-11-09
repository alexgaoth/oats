// The native end-to-end test route: an unpackaged Oats that runs entirely
// inside one runner-owned directory, with a mock keychain, a public WAV as its
// microphone and loopback ports from one fixed allocation.
//
// Nothing here runs unless a test asks for it. Any request that is incomplete
// or does not validate ends the process before a path, profile or key of the
// person's own can be touched: there is no fallback to the real profile.
//
// The route is entered from the top of main.js, before dotenv and before any
// manager is required, because several managers fix their paths at require
// time (qdrantManager.js reads os.homedir() when it loads).

const fs = require("fs");
const path = require("path");

const REQUEST_ENV = "OATS_NATIVE_E2E";
const ROOT_ENV = "OATS_NATIVE_E2E_ROOT";
const RUN_DIR_ENV = "OATS_NATIVE_E2E_RUN_DIR";
const TOKEN_ENV = "OATS_NATIVE_E2E_TOKEN";
const REQUEST_NAMES = [REQUEST_ENV, ROOT_ENV, RUN_DIR_ENV, TOKEN_ENV];

const ROOT_BASENAME = "native-e2e";
const MARKER_FILE = "native-e2e-run.json";
const EXIT_REFUSED = 78;

const PORT_FLOOR = 18610;
const PORT_CEILING = 18639;
/** Inclusive [first, last] per service. Disjoint, and inside the floor and ceiling. */
const ALLOCATIONS = Object.freeze({
  qdrant: Object.freeze([18620, 18620]),
  qdrantGrpc: Object.freeze([18621, 18621]),
  whisper: Object.freeze([18622, 18622]),
  whisperCheck: Object.freeze([18623, 18623]),
  llama: Object.freeze([18624, 18627]),
  cdp: Object.freeze([18628, 18628]),
});

const REQUIRED_SWITCHES = Object.freeze([
  "--use-mock-keychain",
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
]);
const FAKE_AUDIO_SWITCH = "--use-file-for-fake-audio-capture=";
const FAKE_AUDIO_SUFFIX = "%noloop";
const DEBUG_PORT_SWITCH = "--remote-debugging-port=";
const REFUSED_SWITCHES = ["--remote-debugging-address", "--inspect", "--user-data-dir"];

/** The only variables the app and its children keep. Values are never logged. */
const ENV_ALLOWLIST = Object.freeze([
  ...REQUEST_NAMES,
  "NODE_ENV",
  "HOME",
  "TMPDIR",
  "CFFIXED_USER_HOME",
  "PATH",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "OATS_LOG_LEVEL",
]);
const SECRET_NAME = /(API_KEY|SECRET|PASSWORD|ACCESS_KEY|_TOKEN|CREDENTIALS?)$/i;

let active = null;
const trace = [];

function isRequested(env = process.env) {
  return REQUEST_NAMES.some((name) => typeof env[name] === "string" && env[name] !== "");
}

function runPaths(runDir) {
  const home = path.join(runDir, "home");
  return Object.freeze({
    appData: path.join(runDir, "appData"),
    userData: path.join(runDir, "userData"),
    sessionData: path.join(runDir, "sessionData"),
    home,
    logs: path.join(runDir, "logs"),
    crashDumps: path.join(runDir, "crash"),
    temp: path.join(runDir, "tmp"),
    downloads: path.join(home, "Downloads"),
    desktop: path.join(home, "Desktop"),
    documents: path.join(home, "Documents"),
    assets: path.join(runDir, "assets"),
  });
}

function isPortAllowed(port) {
  return Object.values(ALLOCATIONS).some(([first, last]) => port >= first && port <= last);
}

function isLoopbackHost(host) {
  const bare = String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return bare === "localhost" || bare === "::1" || /^127\.\d+\.\d+\.\d+$/.test(bare);
}

function defaultPort(protocol) {
  if (protocol === "http:" || protocol === "ws:") return 80;
  if (protocol === "https:" || protocol === "wss:") return 443;
  return null;
}

const LOCAL_SCHEMES = new Set(["file:", "data:", "blob:", "devtools:", "chrome:", "about:"]);

/** Whether the test run may load a URL: local resources, or an allocated loopback port. */
function isAllowedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (LOCAL_SCHEMES.has(parsed.protocol)) return true;
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) return false;
  const port = parsed.port ? Number(parsed.port) : defaultPort(parsed.protocol);
  return isLoopbackHost(parsed.hostname) && isPortAllowed(port);
}

function originOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : parsed.protocol;
  } catch {
    return "(unparsable)";
  }
}

function ownedDirectory(fsImpl, dir, uid, label, errors) {
  let stat;
  try {
    stat = fsImpl.lstatSync(dir);
  } catch {
    errors.push(`${label} does not exist`);
    return false;
  }
  if (!stat.isDirectory()) {
    errors.push(`${label} is not a directory (symlinks are refused)`);
    return false;
  }
  if (fsImpl.realpathSync(dir) !== dir) errors.push(`${label} is not its own real path`);
  if (uid !== null && stat.uid !== uid) errors.push(`${label} is not owned by this user`);
  return true;
}

/**
 * Check a test request without changing anything.
 *
 * @returns {{ ok: true, config: object } | { ok: false, errors: string[] }}
 */
function validateRequest({
  env = process.env,
  argv = process.argv,
  isPackaged = false,
  platform = process.platform,
  fsImpl = fs,
  uid = typeof process.getuid === "function" ? process.getuid() : null,
} = {}) {
  const errors = [];
  if (env[REQUEST_ENV] !== "1") errors.push(`${REQUEST_ENV} must be 1`);
  if (env.NODE_ENV !== "test") errors.push("NODE_ENV must be test");
  if (isPackaged) errors.push("a packaged app never takes the test route");

  const secretNames = Object.keys(env).filter(
    (name) => name !== TOKEN_ENV && SECRET_NAME.test(name)
  );
  if (secretNames.length) errors.push(`secret-like variables are set: ${secretNames.join(", ")}`);

  const root = env[ROOT_ENV] || "";
  const runDir = env[RUN_DIR_ENV] || "";
  const token = env[TOKEN_ENV] || "";
  if (!/^[0-9a-f]{32,}$/.test(token)) errors.push(`${TOKEN_ENV} must be 32 or more hex digits`);

  const rootShaped =
    path.isAbsolute(root) && path.normalize(root) === root && path.basename(root) === ROOT_BASENAME;
  if (!rootShaped) errors.push(`${ROOT_ENV} must be an absolute path ending in /${ROOT_BASENAME}`);
  const runShaped =
    path.isAbsolute(runDir) && path.normalize(runDir) === runDir && path.dirname(runDir) === root;
  if (!runShaped) errors.push(`${RUN_DIR_ENV} must be a direct child of ${ROOT_ENV}`);

  if (rootShaped) ownedDirectory(fsImpl, root, uid, "the run root", errors);
  if (rootShaped && runShaped && ownedDirectory(fsImpl, runDir, uid, "the run directory", errors)) {
    const mode = fsImpl.statSync(runDir).mode & 0o777;
    if (mode & 0o077) errors.push("the run directory must be private to its owner (0700)");
    try {
      const marker = JSON.parse(fsImpl.readFileSync(path.join(runDir, MARKER_FILE), "utf8"));
      if (marker.version !== 1 || marker.runDir !== runDir || marker.token !== token) {
        errors.push("the run directory's marker does not match this request");
      }
    } catch {
      errors.push(`the run directory has no readable ${MARKER_FILE}`);
    }
  }

  // Chromium and Core Foundation read the home and temp directories before
  // main.js runs, so the launch itself must already point them into the run.
  if (runShaped) {
    const paths = runPaths(runDir);
    if (env.HOME !== paths.home) errors.push("HOME must be the run's home at launch");
    if (env.TMPDIR !== paths.temp) errors.push("TMPDIR must be the run's tmp at launch");
    if (platform === "darwin" && env.CFFIXED_USER_HOME !== paths.home) {
      errors.push("CFFIXED_USER_HOME must be the run's home at launch");
    }
  }

  for (const required of REQUIRED_SWITCHES) {
    if (!argv.includes(required)) errors.push(`${required} is required`);
  }
  for (const refused of REFUSED_SWITCHES) {
    if (argv.some((arg) => arg === refused || arg.startsWith(`${refused}=`))) {
      errors.push(`${refused} is refused on the test route`);
    }
  }
  const debugPorts = argv.filter((arg) => arg.startsWith(DEBUG_PORT_SWITCH));
  if (
    debugPorts.some((arg) => Number(arg.slice(DEBUG_PORT_SWITCH.length)) !== ALLOCATIONS.cdp[0])
  ) {
    errors.push(`the debugging port must be ${ALLOCATIONS.cdp[0]}`);
  }

  const audioArgs = argv.filter((arg) => arg.startsWith(FAKE_AUDIO_SWITCH));
  let audioFile = null;
  if (audioArgs.length !== 1) {
    errors.push(`exactly one ${FAKE_AUDIO_SWITCH}<run>/assets/<clip>.wav${FAKE_AUDIO_SUFFIX}`);
  } else {
    const value = audioArgs[0].slice(FAKE_AUDIO_SWITCH.length);
    audioFile = value.endsWith(FAKE_AUDIO_SUFFIX) ? value.slice(0, -FAKE_AUDIO_SUFFIX.length) : "";
    const inAssets =
      runShaped &&
      audioFile.endsWith(".wav") &&
      path.dirname(audioFile) === path.join(runDir, "assets");
    let isFile = false;
    try {
      isFile = fsImpl.lstatSync(audioFile).isFile() && fsImpl.realpathSync(audioFile) === audioFile;
    } catch {}
    if (!inAssets || !isFile) {
      errors.push(
        `the fake microphone must be a ${FAKE_AUDIO_SUFFIX} WAV file in the run's assets`
      );
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: Object.freeze({
      root,
      runDir,
      audioFile,
      mockKeychain: true,
      paths: runPaths(runDir),
      ports: ALLOCATIONS,
    }),
  };
}

function applyPaths(app, config, env) {
  const { paths } = config;
  for (const dir of Object.values(paths)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of [
    "appData",
    "userData",
    "sessionData",
    "home",
    "logs",
    "crashDumps",
    "temp",
    "downloads",
    "desktop",
    "documents",
  ]) {
    app.setPath(name, paths[name]);
  }
  app.setAppLogsPath?.(paths.logs);
  env.HOME = paths.home;
  env.TMPDIR = paths.temp;
}

function scrubEnvironment(env) {
  const removed = [];
  for (const name of Object.keys(env)) {
    if (!ENV_ALLOWLIST.includes(name)) {
      delete env[name];
      removed.push(name);
    }
  }
  return removed;
}

function note(event, detail = {}) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  trace.push(entry);
  if (!active) return;
  try {
    fs.appendFileSync(
      path.join(active.paths.logs, "native-e2e-trace.jsonl"),
      `${JSON.stringify(entry)}\n`
    );
  } catch {}
}

function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === "object") {
    return { host: first.host ?? first.hostname, port: first.port, path: first.path };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { path: first };
  return { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
}

/**
 * Refuse every outbound Node connection but an allocated loopback port.
 * Every Node client (http, https, tls, ws, fetch) connects through
 * net.Socket.prototype.connect, so one wrapper sees them all.
 */
function guardNodeSockets(netModule = require("net")) {
  const proto = netModule.Socket.prototype;
  const original = proto.connect;
  proto.connect = function guardedConnect(...args) {
    const target = connectTarget(args);
    if (target.path) return original.apply(this, args);
    const host = target.host || "localhost";
    const port = Number(target.port);
    if (isLoopbackHost(host) && isPortAllowed(port)) return original.apply(this, args);
    note("blocked-node-connection", { host: String(host), port });
    const error = new Error(`native E2E: outbound connection to ${host}:${port} refused`);
    error.code = "EOATSNATIVEE2E";
    process.nextTick(() => this.destroy(error));
    return this;
  };
  return () => {
    proto.connect = original;
  };
}

function guardSession(target, hooked) {
  if (!target || hooked.has(target)) return;
  hooked.add(target);
  target.webRequest?.onBeforeRequest?.((details, callback) => {
    const allowed = isAllowedUrl(details?.url);
    if (!allowed) note("blocked-chromium-request", { origin: originOf(details?.url) });
    callback({ cancel: !allowed });
  });
}

/** Block Chromium requests, links to the browser and Node sockets that leave the allocation. */
function installEgressGuard({ app, session, shell, netModule } = {}) {
  const hooked = new WeakSet();
  const hookSession = (target) => guardSession(target, hooked);
  app?.on?.("session-created", hookSession);
  Promise.resolve(app?.whenReady?.())
    .then(() => hookSession(session?.defaultSession))
    .catch(() => {});
  if (shell) {
    shell.openExternal = function blockedOpenExternal(url) {
      note("blocked-open-external", { origin: originOf(url) });
      return Promise.reject(new Error("native E2E: opening a link is refused"));
    };
  }
  return guardNodeSockets(netModule);
}

/** Global shortcuts reach every application on the Mac; the test run registers none. */
function suppressGlobalShortcuts(globalShortcut) {
  if (!globalShortcut) return;
  globalShortcut.register = function suppressedRegister(accelerator) {
    note("suppressed", { step: "global-shortcut", accelerator: String(accelerator) });
    return false;
  };
  globalShortcut.registerAll = function suppressedRegisterAll() {
    note("suppressed", { step: "global-shortcut" });
  };
}

/**
 * Enter the test route when one is requested. Returns null for an ordinary
 * launch and leaves everything as it was. An invalid request exits the process.
 */
function bootstrap({
  app,
  session,
  shell,
  globalShortcut,
  netModule,
  env = process.env,
  argv = process.argv,
  exit = (code) => process.exit(code),
  log = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  if (!isRequested(env)) return null;
  const result = validateRequest({ env, argv, isPackaged: Boolean(app?.isPackaged) });
  if (!result.ok) {
    log(`[native-e2e] refused, nothing was started: ${result.errors.join("; ")}`);
    exit(EXIT_REFUSED);
    return null;
  }
  const config = result.config;
  applyPaths(app, config, env);
  const removed = scrubEnvironment(env);
  active = config;
  installEgressGuard({ app, session, shell, netModule });
  suppressGlobalShortcuts(globalShortcut);
  // The runner ends the app with SIGTERM; it takes the same before-quit path
  // as Cmd+Q, so a recording is finished and every sidecar is stopped.
  process.once("SIGTERM", () => {
    note("sigterm-quit", { pid: process.pid });
    app?.quit?.();
  });
  note("bootstrap", {
    pid: process.pid,
    paths: config.paths,
    keptEnvironment: Object.keys(env).sort(),
    removedEnvironment: removed.sort(),
    switches: argv.filter((arg) => arg.startsWith("--")),
    ports: ALLOCATIONS,
  });
  return config;
}

function isActive() {
  return active !== null;
}

function activeConfig() {
  return active;
}

/** The allocated range under the test route; the caller's own range otherwise. */
function portRange(service, fallback) {
  if (!active) return fallback;
  const range = ALLOCATIONS[service];
  if (!range) throw new Error(`native E2E: no port allocation for ${service}`);
  return [range[0], range[1]];
}

/** True, and noted, when the test route skips a startup step unrelated to recording. */
function suppresses(step) {
  if (!active) return false;
  note("suppressed", { step });
  return true;
}

function _setActiveForTests(config) {
  active = config;
}

module.exports = {
  ALLOCATIONS,
  ENV_ALLOWLIST,
  EXIT_REFUSED,
  FAKE_AUDIO_SWITCH,
  FAKE_AUDIO_SUFFIX,
  MARKER_FILE,
  PORT_CEILING,
  PORT_FLOOR,
  REQUEST_ENV,
  REQUIRED_SWITCHES,
  ROOT_BASENAME,
  ROOT_ENV,
  RUN_DIR_ENV,
  TOKEN_ENV,
  activeConfig,
  bootstrap,
  installEgressGuard,
  isActive,
  isAllowedUrl,
  isLoopbackHost,
  isPortAllowed,
  isRequested,
  note,
  portRange,
  runPaths,
  suppresses,
  trace,
  validateRequest,
  _setActiveForTests,
};
