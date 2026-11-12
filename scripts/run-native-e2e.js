#!/usr/bin/env node
// Runs the real Oats app natively inside one runner-owned directory, through
// the test route in src/helpers/nativeE2E.js: a mock keychain, a public WAV as
// Chromium's fake microphone, owned copies of the public models, and loopback
// ports from one fixed allocation, all under a sandbox-exec outbound policy
// that the app and every child inherit.
//
//   node scripts/run-native-e2e.js check --root DIR --wav FILE --models DIR [--bin DIR]
//   node scripts/run-native-e2e.js smoke --root DIR --wav FILE --models DIR [--bin DIR]
//          [--words DIR] [--start S] [--seconds S] [--chromium-sandbox on|off]
//   node scripts/run-native-e2e.js stop RUN_DIR
//
// `check` makes a run directory and proves the prerequisites: the ports are
// free, the assets are owned copies, and the outbound policy denies what it
// must while loopback still works. `smoke` does that, then records the clip
// through the visible Start recording button, presses Stop, waits for the
// conversation to be saved, quits, opens the app again on the same directory
// and reads the conversation back. Every process it starts is recorded in
// RUN_DIR/pids.json; `stop` ends those exact processes and nothing else.
//
// `--chromium-sandbox off` launches Electron with --no-sandbox, still inside
// the outer outbound policy. Chromium's own sandbox cannot start inside a
// sandbox-exec policy. That policy limits network egress only, not files or
// processes, so such a run says nothing about the shipped app's sandbox.
//
// The renderer must be built first (`npm run build:renderer`): the app loads
// src/dist.
//
// Before Start, `smoke` finishes onboarding the way setup does (including the
// bundle-migration sentinel), keeps every console call, page exception and
// browser log entry in RUN_DIR/logs/cdp-events-<launch>.jsonl, and installs a
// page probe that only observes the capture path. After Start it waits a
// bounded time for each capture stage in turn: getUserMedia, a running
// AudioContext, the worklet, the first PCM, the renderer's send, main's
// receipt. A stage that does not arrive ends the run early (exit 8); a Start
// button still covered by a dialog ends it before recording (exit 9).

const { spawn, execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { setTimeout: sleep } = require("timers/promises");
const nativeE2E = require("../src/helpers/nativeE2E");

const REPO = path.resolve(__dirname, "..");
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const CDP_PORT = nativeE2E.ALLOCATIONS.cdp[0];
const ALLOCATED_PORTS = Object.values(nativeE2E.ALLOCATIONS).flatMap(([first, last]) =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i)
);
const WHISPER_MODELS = ["ggml-small.en.bin", "ggml-small.bin"];
/** Desktop-integration helpers the test run must not have: input, paste, media keys, taps. */
const EXCLUDED_BIN = /^(\.?macos-|\.?MediaRemoteAdapter|\.swift-module-cache)/;
const REQUIRED_BIN = ["whisper-server-darwin-arm64", "whisper-vad"];
const QUIT_TIMEOUT_MS = 45000;
/** From the press of Start to main receiving audio; setup takes about a second. */
const CAPTURE_SETUP_MS = 20000;
/** This many PCM chunks (800 samples at 24 kHz, about 5 s) all at zero is a silent source. */
const SILENT_CHUNKS = 150;
const EXIT_CAPTURE_STALLED = 8;
const EXIT_START_COVERED = 9;

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`${arg} needs a value`);
      options[arg.slice(2)] = value;
      i++;
    } else {
      options._.push(arg);
    }
  }
  return { command, options };
}

function log(line) {
  process.stdout.write(`[native-e2e] ${line}\n`);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function realFile(file, label) {
  if (!file || !path.isAbsolute(file)) fail(`${label} must be an absolute path`);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) fail(`${label} must be a regular file: ${file}`);
  return fs.realpathSync(file);
}

function realDir(dir, label) {
  if (!dir || !path.isAbsolute(dir)) fail(`${label} must be an absolute path`);
  const stat = fs.statSync(dir, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) fail(`${label} must be a directory: ${dir}`);
  return fs.realpathSync(dir);
}

/** An APFS clone: a separate file that shares blocks until either side is written. */
function cloneInto(source, target) {
  const result = spawnSync("/bin/cp", ["-Rc", source, target], { encoding: "utf8" });
  if (result.status !== 0) fail(`could not copy ${source}: ${result.stderr.trim()}`);
}

// ---------------------------------------------------------------- run directory

function makeRunDir(rootArg) {
  if (!rootArg || !path.isAbsolute(rootArg) || path.basename(rootArg) !== nativeE2E.ROOT_BASENAME) {
    fail(`--root must be an absolute path ending in /${nativeE2E.ROOT_BASENAME}`);
  }
  fs.mkdirSync(rootArg, { recursive: true, mode: 0o700 });
  const root = fs.realpathSync(rootArg);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  const runDir = path.join(root, `${stamp}-${crypto.randomBytes(3).toString("hex")}`);
  fs.mkdirSync(runDir, { mode: 0o700 });
  fs.chmodSync(runDir, 0o700);
  const token = crypto.randomBytes(16).toString("hex");
  const paths = nativeE2E.runPaths(runDir);
  for (const dir of [paths.home, paths.temp, paths.logs, paths.assets]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeJson(path.join(runDir, nativeE2E.MARKER_FILE), { version: 1, runDir, token });
  return { root, runDir, token, paths };
}

function readRun(runDir) {
  const marker = JSON.parse(fs.readFileSync(path.join(runDir, nativeE2E.MARKER_FILE), "utf8"));
  return {
    root: path.dirname(runDir),
    runDir,
    token: marker.token,
    paths: nativeE2E.runPaths(runDir),
  };
}

// ---------------------------------------------------------------- assets

function readWavLayout(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    fail("the clip is not a RIFF WAVE file");
  }
  let offset = 12;
  let format = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        byteRate: buffer.readUInt32LE(offset + 16),
        blockAlign: buffer.readUInt16LE(offset + 20),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === "data") {
      if (!format) fail("the clip has no fmt chunk before its data");
      return {
        format,
        dataOffset: offset + 8,
        dataSize: Math.min(size, buffer.length - offset - 8),
      };
    }
    offset += 8 + size + (size % 2);
  }
  return fail("the clip has no data chunk");
}

/** Cut [start, start + seconds) out of a PCM WAV into a new owned file. */
function sliceWav(source, target, startSeconds, seconds) {
  const buffer = fs.readFileSync(source);
  const { format, dataOffset, dataSize } = readWavLayout(buffer);
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) fail("the clip must be 16-bit PCM");
  const align = format.blockAlign;
  const from = Math.floor((startSeconds * format.byteRate) / align) * align;
  const length = Math.floor((seconds * format.byteRate) / align) * align;
  if (from + length > dataSize) fail("the clip is shorter than --start plus --seconds");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(format.channels, 22);
  header.writeUInt32LE(format.sampleRate, 24);
  header.writeUInt32LE(format.byteRate, 28);
  header.writeUInt16LE(align, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(length, 40);
  const pcm = buffer.subarray(dataOffset + from, dataOffset + from + length);
  fs.writeFileSync(target, Buffer.concat([header, pcm]), { mode: 0o600 });
  return { sampleRate: format.sampleRate, channels: format.channels, bytes: 44 + length };
}

/** The public binaries the app resolves from resources/bin, cloned in once per worktree. */
function ensureBinaries(binArg) {
  const target = path.join(REPO, "resources", "bin");
  const present = REQUIRED_BIN.every((name) => fs.existsSync(path.join(target, name)));
  if (present) return { target, copied: [] };
  if (!binArg) fail(`resources/bin lacks ${REQUIRED_BIN.join(", ")}; pass --bin with a built copy`);
  const source = realDir(binArg, "--bin");
  if (source === fs.realpathSync(path.dirname(target))) fail("--bin is this worktree");
  fs.mkdirSync(target, { recursive: true });
  const copied = [];
  for (const name of fs.readdirSync(source)) {
    if (EXCLUDED_BIN.test(name)) continue;
    if (fs.existsSync(path.join(target, name))) continue;
    cloneInto(path.join(source, name), path.join(target, name));
    copied.push(name);
  }
  return { target, copied };
}

function prepareAssets(run, options) {
  const wav = realFile(options.wav, "--wav");
  const modelsDir = realDir(options.models, "--models");
  if (wav.startsWith(`${run.root}${path.sep}`) || modelsDir.startsWith(`${run.root}${path.sep}`)) {
    fail("asset sources must be outside the run root");
  }
  const start = Number(options.start ?? 300);
  const seconds = Number(options.seconds ?? 40);
  if (!(start >= 0) || !(seconds >= 5 && seconds <= 600))
    fail("--start or --seconds is out of range");

  const meeting = path
    .basename(wav)
    .split(".")[0]
    .replace(/[^A-Za-z0-9_-]/g, "");
  const clip = path.join(run.paths.assets, `${meeting}-${start}s-${seconds}s.wav`);
  const clipFormat = sliceWav(wav, clip, start, seconds);

  const modelTarget = path.join(run.paths.home, ".cache", "oats", "whisper-models");
  fs.mkdirSync(modelTarget, { recursive: true, mode: 0o700 });
  const models = [];
  for (const name of WHISPER_MODELS) {
    const source = realFile(path.join(modelsDir, name), `--models/${name}`);
    const copy = path.join(modelTarget, name);
    cloneInto(source, copy);
    const copyStat = fs.lstatSync(copy);
    if (!copyStat.isFile() || copyStat.size !== fs.statSync(source).size)
      fail(`${name} copy differs`);
    models.push({ name, bytes: copyStat.size });
  }
  const binaries = ensureBinaries(options.bin);
  const manifest = {
    clip: { source: wav, file: clip, start, seconds, sha256: sha256(clip), ...clipFormat },
    models: { source: modelsDir, target: modelTarget, files: models },
    binaries,
  };
  writeJson(path.join(run.runDir, "assets.json"), manifest);
  return manifest;
}

// ---------------------------------------------------------------- ports

function listeningOn(ports) {
  const result = spawnSync(
    "/usr/sbin/lsof",
    ["-nP", `-iTCP:${Math.min(...ports)}-${Math.max(...ports)}`, "-sTCP:LISTEN", "-Fpn"],
    { encoding: "utf8" }
  );
  if (result.status !== 0 && result.status !== 1) fail(`lsof failed: ${result.stderr.trim()}`);
  return result.stdout
    .split("\n")
    .filter((line) => line.startsWith("n"))
    .map((line) => Number(line.split(":").pop()))
    .filter((port) => ports.includes(port));
}

function bindsOnLoopback(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () =>
      server.close(() => resolve(true))
    );
  });
}

async function checkPorts() {
  const busy = listeningOn(ALLOCATED_PORTS);
  for (const port of ALLOCATED_PORTS) {
    if (!busy.includes(port) && !(await bindsOnLoopback(port))) busy.push(port);
  }
  if (busy.length) fail(`allocated ports are in use, nothing was started: ${busy.join(", ")}`, 4);
  return ALLOCATED_PORTS;
}

// ---------------------------------------------------------------- outbound policy

/**
 * Deny every outbound connection but local IPC and the allocated loopback
 * ports. Later rules win in SBPL, so the resolver socket is denied after unix
 * sockets are allowed: nothing in the run can even look a host up.
 */
function outboundPolicy(ports) {
  return [
    "(version 1)",
    "(allow default)",
    "(deny network-outbound)",
    "(allow network-outbound (remote unix-socket))",
    '(deny network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))',
    ...ports.map((port) => `(allow network-outbound (remote ip "localhost:${port}"))`),
  ].join("\n");
}

const PROBE_SOURCE = `
const net = require("net");
const tryConnect = (host, port) => new Promise((resolve) => {
  const socket = net.connect({ host, port });
  const done = (result) => { socket.destroy(); resolve(result); };
  socket.setTimeout(2000, () => done("timeout"));
  socket.once("connect", () => done("connected"));
  socket.once("error", (error) => done(error.code || error.message));
});
(async () => {
  const [allowed, denied] = process.argv.slice(1).map(Number);
  const out = {
    allowedLoopback: await tryConnect("127.0.0.1", allowed),
    deniedLoopback: await tryConnect("127.0.0.1", denied),
    // TEST-NET-1 (RFC 5737): a documentation address that routes nowhere.
    deniedRemote: await tryConnect("192.0.2.1", 9),
  };
  process.stdout.write(JSON.stringify(out));
})();
`;

/**
 * The one bounded check that the inherited outbound policy works here: a child
 * under it reaches an allowed loopback port, and is refused a loopback port
 * the policy leaves out and a remote address.
 */
async function checkContainment(run) {
  const [allowedPort, deniedPort] = [ALLOCATED_PORTS[0], ALLOCATED_PORTS[1]];
  const servers = [];
  try {
    for (const port of [allowedPort, deniedPort]) {
      const server = net.createServer((socket) => socket.end());
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ port, host: "127.0.0.1", exclusive: true }, resolve);
      });
      servers.push(server);
    }
    const probe = spawnSync(
      SANDBOX_EXEC,
      [
        "-p",
        outboundPolicy([allowedPort]),
        process.execPath,
        "-e",
        PROBE_SOURCE,
        String(allowedPort),
        String(deniedPort),
      ],
      {
        encoding: "utf8",
        timeout: 20000,
        env: { PATH: "/usr/bin:/bin", HOME: run.paths.home, TMPDIR: run.paths.temp },
      }
    );
    let observed = null;
    try {
      observed = JSON.parse(probe.stdout);
    } catch {}
    const refused = (code) => code === "EPERM" || code === "EACCES";
    const compatible = Boolean(
      probe.status === 0 &&
      observed &&
      observed.allowedLoopback === "connected" &&
      refused(observed.deniedLoopback) &&
      refused(observed.deniedRemote)
    );
    const result = {
      at: new Date().toISOString(),
      sandboxExec: SANDBOX_EXEC,
      exitStatus: probe.status,
      signal: probe.signal,
      stderr: (probe.stderr || "").trim().slice(0, 500),
      observed,
      compatible,
    };
    writeJson(path.join(run.runDir, "containment.json"), result);
    return result;
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

// ---------------------------------------------------------------- processes

function processTable() {
  const out = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  return out
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
}

function descendants(rootPid, table = processTable()) {
  const found = [];
  const queue = [rootPid];
  while (queue.length) {
    const pid = queue.shift();
    const entry = table.find((row) => row.pid === pid);
    if (entry) found.push(entry);
    for (const child of table.filter((row) => row.ppid === pid)) queue.push(child.pid);
  }
  return found;
}

function sidecarPids(run) {
  const dir = path.join(run.paths.userData, "sidecar-pids");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".pid"))
    .map((file) => ({
      name: path.basename(file, ".pid"),
      pid: Number(fs.readFileSync(path.join(dir, file), "utf8").trim()),
    }))
    .filter((entry) => Number.isInteger(entry.pid) && entry.pid > 0);
}

/** The exact processes this runner owns, kept in RUN_DIR/pids.json across launches. */
class PidLedger {
  constructor(run) {
    this.file = path.join(run.runDir, "pids.json");
    this.run = run;
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : { runner: [], launches: [] };
    this.state.runner.push({ pid: process.pid, at: new Date().toISOString() });
    this.save();
  }

  save() {
    writeJson(this.file, this.state);
  }

  launch(pid, label) {
    const entry = { label, pid, at: new Date().toISOString(), processes: {}, ended: null };
    this.state.launches.push(entry);
    this.save();
    return entry;
  }

  /** Remember every process under the app, and every sidecar it wrote a PID file for. */
  snapshot(entry) {
    const table = processTable();
    const tree = descendants(entry.pid, table);
    for (const sidecar of sidecarPids(this.run)) {
      const row = table.find((r) => r.pid === sidecar.pid);
      if (row && !tree.some((t) => t.pid === row.pid)) tree.push(row);
    }
    for (const row of tree) {
      entry.processes[row.pid] ??= {
        command: row.command.slice(0, 300),
        firstSeen: new Date().toISOString(),
      };
    }
    this.save();
    return tree.length;
  }

  /** Processes from this ledger that still run the command they were recorded with. */
  alive(entry) {
    const table = processTable();
    const recorded = { [entry.pid]: { command: null }, ...entry.processes };
    return Object.entries(recorded)
      .map(([pid, info]) => ({ pid: Number(pid), info }))
      .filter(({ pid, info }) => {
        const row = table.find((r) => r.pid === pid);
        return row && (info.command === null || row.command.slice(0, 300) === info.command);
      })
      .map(({ pid }) => pid);
  }
}

function signal(pid, name) {
  try {
    process.kill(pid, name);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(ledger, entry, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let alive = ledger.alive(entry);
  while (alive.length && Date.now() < deadline) {
    await sleep(250);
    alive = ledger.alive(entry);
  }
  return alive;
}

/** Quit the app as Cmd+Q would, then end any recorded process that outlived it. */
async function quitAndClean(ledger, entry) {
  ledger.snapshot(entry);
  signal(entry.pid, "SIGTERM");
  let alive = await waitGone(ledger, entry, QUIT_TIMEOUT_MS);
  const leftovers = [...alive];
  for (const pid of alive) signal(pid, "SIGTERM");
  if (alive.length) alive = await waitGone(ledger, entry, 5000);
  for (const pid of alive) signal(pid, "SIGKILL");
  if (alive.length) alive = await waitGone(ledger, entry, 3000);
  entry.ended = {
    at: new Date().toISOString(),
    recorded: Object.keys(entry.processes).length,
    outlivedQuit: leftovers,
    stillAlive: alive,
  };
  ledger.save();
  return entry.ended;
}

// ---------------------------------------------------------------- launch

function electronBinary() {
  const binary = require("electron");
  if (typeof binary !== "string" || !fs.existsSync(binary)) fail("the Electron binary is missing");
  return binary;
}

function appEnvironment(run) {
  return {
    [nativeE2E.REQUEST_ENV]: "1",
    [nativeE2E.ROOT_ENV]: run.root,
    [nativeE2E.RUN_DIR_ENV]: run.runDir,
    [nativeE2E.TOKEN_ENV]: run.token,
    NODE_ENV: "test",
    HOME: run.paths.home,
    TMPDIR: run.paths.temp,
    CFFIXED_USER_HOME: run.paths.home,
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    USER: process.env.USER || "",
    LOGNAME: process.env.LOGNAME || process.env.USER || "",
    LANG: "en_US.UTF-8",
    OATS_LOG_LEVEL: "debug",
  };
}

/** sandbox-exec's arguments: the outer policy first, then Electron and its switches. */
function electronArgs(clip, { noSandbox = false, electron = "electron" } = {}) {
  return [
    "-p",
    outboundPolicy(ALLOCATED_PORTS),
    electron,
    REPO,
    "--use-mock-keychain",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `${nativeE2E.FAKE_AUDIO_SWITCH}${clip}${nativeE2E.FAKE_AUDIO_SUFFIX}`,
    // Chromium's audio service sandbox cannot read the fake device's file on macOS.
    "--disable-features=AudioServiceSandbox",
    `--remote-debugging-port=${CDP_PORT}`,
    ...(noSandbox ? [nativeE2E.NO_SANDBOX_SWITCH] : []),
  ];
}

/** `--chromium-sandbox off` is the only way to ask for --no-sandbox. */
function chromiumSandboxOption(options) {
  const value = options["chromium-sandbox"] ?? "on";
  if (value !== "on" && value !== "off") fail("--chromium-sandbox must be on or off", 2);
  return value === "off";
}

function launchApp(run, ledger, clip, label, { noSandbox = false } = {}) {
  const logFile = path.join(run.paths.logs, `electron-${label}.log`);
  const out = fs.openSync(logFile, "a", 0o600);
  const args = electronArgs(clip, { noSandbox, electron: electronBinary() });
  const env = appEnvironment(run);
  if (noSandbox) env[nativeE2E.NO_SANDBOX_ENV] = "1";
  const child = spawn(SANDBOX_EXEC, args, {
    cwd: REPO,
    env,
    detached: true,
    stdio: ["ignore", out, out],
  });
  fs.closeSync(out);
  child.unref();
  const entry = ledger.launch(child.pid, label);
  log(`${label}: app pid ${child.pid}, log ${logFile}`);
  return { child, entry, logFile };
}

// ---------------------------------------------------------------- CDP

async function openTarget(urlFragment, timeoutMs, isAlive, socketOptions) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) fail("the app exited before its window opened", 5);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const target = list.find((t) => t.type === "page" && t.url.includes(urlFragment));
      if (target) return openSocket(target.webSocketDebuggerUrl, socketOptions);
    } catch {}
    await sleep(250);
  }
  return fail(`no window matching "${urlFragment}" within ${timeoutMs} ms`, 5);
}

async function openSocket(wsUrl, { onEvent } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onclose = () => {
    for (const entry of pending.values()) entry.reject(new Error("debugger socket closed"));
    pending.clear();
  };
  ws.onmessage = (message) => dispatchCdpMessage(JSON.parse(message.data), pending, onEvent);
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return result.result.value;
  };
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  return { ws, send, evaluate };
}

async function waitFor(label, timeoutMs, probe, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe().catch((error) => ({ error: error.message }));
    if (last && !last.error && last !== false) return last;
    await sleep(intervalMs);
  }
  return fail(`${label}: not reached within ${timeoutMs} ms (last: ${JSON.stringify(last)})`, 6);
}

// A button is found by its accessible name: its aria-label, else its text. The
// recording's Stop carries its shortcut in a Kbd, so its text is not "Stop".
const findButton = (label) => `Array.from(document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || b.textContent.trim()) === ${JSON.stringify(label)} &&
      b.offsetParent !== null && !b.disabled
  )`;

const visibleButton = (label) => `(() => {
  const button = ${findButton(label)};
  if (!button) return false;
  button.click();
  return true;
})()`;

const hasButton = (label) => `Boolean(${findButton(label)})`;

const START_LABEL = "Record conversation";
const FINISH_LABEL = "Finish conversation";

const READ_NOTES = `(async () => {
  const notes = await window.electronAPI.getNotes();
  return notes.map((note) => {
    let segments = [];
    try {
      const raw = typeof note.transcript === "string" ? JSON.parse(note.transcript) : note.transcript;
      segments = Array.isArray(raw) ? raw : Array.isArray(raw?.segments) ? raw.segments : [];
    } catch {}
    return {
      id: note.id,
      title: note.title,
      type: note.note_type,
      duration: note.audio_duration_seconds,
      segmentIds: segments.map((s) => s.id ?? null),
      text: segments.map((s) => s.text || "").join(" ").trim(),
      contentChars: (note.content || "").length,
    };
  });
})()`;

async function openApp(run, ledger, clip, label, launchOptions, socketOptions) {
  const launched = launchApp(run, ledger, clip, label, launchOptions);
  const isAlive = () => ledger.alive(launched.entry).includes(launched.entry.pid);
  const page = await openTarget("panel=true", 90000, isAlive, socketOptions);
  await waitFor("page load", 60000, () => page.evaluate(`document.readyState === "complete"`));
  ledger.snapshot(launched.entry);
  return { ...launched, page, isAlive };
}

// ---------------------------------------------------------------- transcript evidence

function normalizeWords(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []).map((w) => w.replace(/^'+|'+$/g, ""));
}

/** AMI's own word timings for the clip's span: evidence that does not come from Oats. */
function referenceWords(wordsDir, meeting, start, seconds) {
  if (!wordsDir) return null;
  const dir = realDir(wordsDir, "--words");
  const words = [];
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${meeting}.`) && f.endsWith(".words.xml"))) {
    const xml = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of xml.matchAll(/<w [^>]*starttime="([\d.]+)"[^>]*>([^<]*)<\/w>/g)) {
      const at = Number(match[1]);
      if (at >= start && at < start + seconds) words.push(...normalizeWords(match[2]));
    }
  }
  return words;
}

function compareToReference(recognized, reference) {
  const heard = normalizeWords(recognized);
  if (!reference) return { recognizedWords: heard.length, reference: null };
  const vocabulary = new Set(reference);
  const distinct = [...new Set(heard.filter((w) => w.length >= 3))];
  const shared = distinct.filter((w) => vocabulary.has(w));
  return {
    recognizedWords: heard.length,
    referenceWords: reference.length,
    distinctRecognized: distinct.length,
    sharedWithReference: shared.length,
    sharedFraction: distinct.length ? Number((shared.length / distinct.length).toFixed(3)) : 0,
  };
}

// ---------------------------------------------------------------- capture diagnostics

/**
 * Route one debugger message: a reply settles its command, and every other
 * message with a method (console calls, exceptions, log entries) goes to
 * onEvent. Events carry no id, so a receiver that only matched ids lost them.
 */
function dispatchCdpMessage(msg, pending, onEvent) {
  if (msg.id !== undefined && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result);
    return "reply";
  }
  if (typeof msg.method === "string") {
    onEvent?.(msg);
    return "event";
  }
  return "ignored";
}

function cdpArgText(arg) {
  if (!arg) return "";
  if (arg.value !== undefined) {
    return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  }
  if (arg.preview?.properties?.length) {
    const fields = arg.preview.properties.map((p) => `${p.name}: ${p.value}`).join(", ");
    return `{${fields}${arg.preview.overflow ? ", …" : ""}}`;
  }
  return arg.description ?? arg.unserializableValue ?? arg.type ?? "";
}

/** One line for a console call, page exception or browser log entry; null for any other event. */
function summarizeCdpEvent(msg) {
  const p = msg?.params || {};
  if (msg?.method === "Runtime.consoleAPICalled") {
    const text = (p.args || []).map(cdpArgText).join(" ");
    return { kind: "console", level: p.type ?? null, text: text.slice(0, 2000), at: p.timestamp };
  }
  if (msg?.method === "Runtime.exceptionThrown") {
    const d = p.exceptionDetails || {};
    const text = d.exception?.description ?? d.text ?? "";
    return {
      kind: "exception",
      text: String(text).slice(0, 2000),
      url: d.url ?? null,
      line: d.lineNumber ?? null,
      at: p.timestamp,
    };
  }
  if (msg?.method === "Log.entryAdded") {
    const e = p.entry || {};
    return {
      kind: "log",
      level: e.level ?? null,
      source: e.source ?? null,
      text: String(e.text ?? "").slice(0, 2000),
      url: e.url ?? null,
      at: e.timestamp,
    };
  }
  return null;
}

/** Keep every retained event in memory and append it to FILE as it arrives. */
function eventRecorder(file) {
  const kept = [];
  const onEvent = (msg) => {
    const line = summarizeCdpEvent(msg);
    if (!line) return;
    kept.push(line);
    try {
      fs.appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
    } catch {}
  };
  return { file, kept, onEvent };
}

/**
 * Installed with Page.addScriptToEvaluateOnNewDocument, so it runs before the
 * app's scripts. It wraps the capture calls only to record when each one was
 * made and how it settled; every value and error passes through unchanged.
 */
function captureProbe() {
  const w = globalThis;
  if (w.__oatsE2EProbe) return;
  const t0 = w.performance.now();
  const now = () => Math.round(w.performance.now() - t0);
  const probe = {
    installedAt: Date.now(),
    gum: [],
    devices: [],
    contexts: [],
    resumes: [],
    sinks: [],
    modules: [],
    nodes: [],
    send: { wrapped: null, count: 0, bytes: 0, firstAt: null, lastSource: null },
  };
  Object.defineProperty(w, "__oatsE2EProbe", { value: probe });
  const describe = (error) => ({
    name: error?.name ?? null,
    message: String(error?.message ?? error).slice(0, 300),
  });
  const call = (fn) => {
    try {
      return Promise.resolve(fn());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const observe = (list, entry, promise) => {
    list.push(entry);
    return promise.then(
      (value) => {
        entry.resolvedAt = now();
        return value;
      },
      (error) => {
        entry.rejectedAt = now();
        entry.error = describe(error);
        throw error;
      }
    );
  };
  const isArrayBuffer = (value) => Object.prototype.toString.call(value) === "[object ArrayBuffer]";

  const wrapSend = () => {
    if (probe.send.wrapped === "yes") return;
    const api = w.electronAPI;
    if (!api) {
      probe.send.wrapped = "no-api";
      return;
    }
    const original = api.meetingTranscriptionSend;
    if (typeof original !== "function") {
      probe.send.wrapped = "missing";
      return;
    }
    const counted = function (buffer, source) {
      probe.send.count += 1;
      probe.send.bytes += buffer?.byteLength ?? 0;
      if (probe.send.firstAt === null) probe.send.firstAt = now();
      probe.send.lastSource = source;
      return original.call(this, buffer, source);
    };
    try {
      api.meetingTranscriptionSend = counted;
    } catch (error) {
      probe.send.wrapped = `refused: ${describe(error).message}`;
      return;
    }
    probe.send.wrapped = api.meetingTranscriptionSend === counted ? "yes" : "read-only";
  };

  const media = w.navigator?.mediaDevices;
  if (media && typeof media.getUserMedia === "function") {
    const getUserMedia = media.getUserMedia.bind(media);
    media.getUserMedia = (constraints) => {
      wrapSend();
      const audio = constraints?.audio;
      const entry = {
        at: now(),
        exactDevice: Boolean(audio && typeof audio === "object" && audio.deviceId),
        video: Boolean(constraints?.video),
      };
      return observe(
        probe.gum,
        entry,
        call(() => getUserMedia(constraints))
      ).then((stream) => {
        entry.tracks = stream.getAudioTracks().map((track) => {
          const settings = track.getSettings?.() ?? {};
          const seen = {
            label: track.label,
            readyState: track.readyState,
            muted: track.muted,
            enabled: track.enabled,
            sampleRate: settings.sampleRate ?? null,
            channelCount: settings.channelCount ?? null,
          };
          track.addEventListener?.("ended", () => (seen.endedAt = now()));
          track.addEventListener?.("mute", () => (seen.mutedAt = now()));
          track.addEventListener?.("unmute", () => (seen.unmutedAt = now()));
          return seen;
        });
        return stream;
      });
    };
  }
  if (media && typeof media.enumerateDevices === "function") {
    const enumerateDevices = media.enumerateDevices.bind(media);
    media.enumerateDevices = () => {
      const entry = { at: now() };
      return observe(
        probe.devices,
        entry,
        call(() => enumerateDevices())
      ).then((devices) => {
        entry.audioInputs = devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ label: d.label, hasId: Boolean(d.deviceId) }));
        return devices;
      });
    };
  }

  const OriginalContext = w.AudioContext;
  if (typeof OriginalContext === "function") {
    for (const [name, list] of [
      ["resume", probe.resumes],
      ["setSinkId", probe.sinks],
    ]) {
      const original = OriginalContext.prototype[name];
      if (typeof original !== "function") continue;
      OriginalContext.prototype[name] = function (...args) {
        const entry = { at: now(), stateBefore: this.state };
        return observe(
          list,
          entry,
          call(() => original.apply(this, args))
        ).then((value) => {
          entry.stateAfter = this.state;
          return value;
        });
      };
    }
    w.AudioContext = class AudioContext extends OriginalContext {
      constructor(...args) {
        super(...args);
        const entry = { at: now(), sampleRate: this.sampleRate, state: this.state, changes: [] };
        probe.contexts.push(entry);
        this.addEventListener("statechange", () => {
          entry.state = this.state;
          entry.changes.push({ at: now(), state: this.state });
        });
      }
    };
  }

  const workletProto = w.Worklet?.prototype ?? w.AudioWorklet?.prototype;
  if (workletProto && typeof workletProto.addModule === "function") {
    const addModule = workletProto.addModule;
    workletProto.addModule = function (url, ...rest) {
      const entry = { at: now(), scheme: String(url).split(":")[0] };
      return observe(
        probe.modules,
        entry,
        call(() => addModule.call(this, url, ...rest))
      );
    };
  }

  const OriginalNode = w.AudioWorkletNode;
  if (typeof OriginalNode === "function") {
    w.AudioWorkletNode = class AudioWorkletNode extends OriginalNode {
      constructor(context, name, options) {
        super(context, name, options);
        const entry = {
          at: now(),
          name,
          messages: 0,
          bytes: 0,
          peak: 0,
          firstAt: null,
          lastAt: null,
        };
        probe.nodes.push(entry);
        this.port.addEventListener("message", (event) => {
          if (!isArrayBuffer(event.data)) return;
          const samples = new Int16Array(event.data);
          let peak = 0;
          for (let i = 0; i < samples.length; i++) {
            const v = samples[i] < 0 ? -samples[i] : samples[i];
            if (v > peak) peak = v;
          }
          entry.messages += 1;
          entry.bytes += event.data.byteLength;
          entry.lastAt = now();
          if (entry.firstAt === null) {
            entry.firstAt = entry.lastAt;
            entry.firstPeak = peak;
          }
          if (peak > entry.peak) entry.peak = peak;
        });
      }
    };
  }
  wrapSend();
}

const CAPTURE_PROBE = `(${captureProbe.toString()})();`;
const READ_PROBE = `JSON.parse(JSON.stringify(globalThis.__oatsE2EProbe ?? null))`;
const CAPTURE_STAGES = [
  "getUserMedia",
  "audioContext",
  "worklet",
  "firstPcm",
  "rendererSend",
  "mainReceive",
];

/**
 * Where capture has got to, from the page probe and main's trace notes. The
 * first stage that is neither done nor skipped is pending; a stage that failed
 * outright is pending too, with its error.
 */
function captureStages(probe, mainNotes = []) {
  const p = probe || {};
  const gum = p.gum || [];
  const live = gum.find((e) => (e.tracks || []).some((t) => t.readyState === "live"));
  const rejected = gum.filter((e) => e.error);
  const contexts = p.contexts || [];
  const modules = p.modules || [];
  const nodes = (p.nodes || []).filter((n) => n.name === "meeting-pcm-processor");
  const node = nodes.find((n) => n.messages > 0);
  const send = p.send || {};
  const received = mainNotes.find(
    (n) => n.event === "meeting-audio-received" && n.source === "mic"
  );
  const stages = {
    getUserMedia: live
      ? { done: true, at: live.resolvedAt, track: live.tracks[0] }
      : { done: false, calls: gum.length, errors: rejected.map((e) => e.error) },
    audioContext: contexts.some((c) => c.state === "running")
      ? { done: true }
      : {
          done: false,
          contexts: contexts.map((c) => c.state),
          resumes: (p.resumes || []).length,
          resumesSettled: (p.resumes || []).filter((r) => "resolvedAt" in r || r.error).length,
          sinks: (p.sinks || []).length,
          sinksSettled: (p.sinks || []).filter((r) => "resolvedAt" in r || r.error).length,
        },
    worklet: modules.some((m) => "resolvedAt" in m)
      ? { done: true }
      : {
          done: false,
          calls: modules.length,
          errors: modules.filter((m) => m.error).map((m) => m.error),
        },
    firstPcm: node
      ? { done: true, at: node.firstAt, messages: node.messages, peak: node.peak }
      : { done: false, nodes: nodes.length },
    rendererSend:
      send.wrapped !== "yes"
        ? { skipped: true, reason: send.wrapped ?? "not observed" }
        : send.count > 0
          ? { done: true, at: send.firstAt, count: send.count }
          : { done: false },
    mainReceive: received
      ? { done: true, at: received.at, peak: received.peak ?? null }
      : { done: false },
  };
  const pending =
    CAPTURE_STAGES.find((name) => !stages[name].done && !stages[name].skipped) ?? null;
  const silent = Boolean(node && node.messages >= SILENT_CHUNKS && node.peak === 0);
  return { stages, pending, silent, complete: pending === null };
}

/** main's trace notes about recording audio, written by nativeE2E.observeMeetingAudio. */
function mainAudioNotes(run) {
  try {
    return fs
      .readFileSync(path.join(run.paths.logs, "native-e2e-trace.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((note) => note && String(note.event).startsWith("meeting-audio"));
  } catch {
    return [];
  }
}

/** Chromium's own lines about the fake microphone and its file, from the app's stderr log. */
function fakeDeviceLines(text) {
  return String(text || "")
    .split("\n")
    .filter((line) =>
      /fake[ _-]?(audio|device|capture|input)|use-file-for-fake|failed to read|wav_audio|file_source|audio_input/i.test(
        line
      )
    )
    .slice(0, 40);
}

/** Wait, within the bound, for every capture stage; on a stall say which stage and what was seen. */
async function watchCapture(page, run, startedAt) {
  let last = null;
  while (Date.now() - startedAt < CAPTURE_SETUP_MS) {
    const probe = await page.evaluate(READ_PROBE).catch((error) => ({ error: error.message }));
    last = { probe, ...captureStages(probe, mainAudioNotes(run)) };
    if (last.complete) break;
    await sleep(500);
  }
  // A source that delivers chunks of zeros is a stall too: there is nothing to hear.
  while (last?.complete && Date.now() - startedAt < CAPTURE_SETUP_MS + 10000) {
    const firstPcm = last.stages.firstPcm;
    if (firstPcm.peak > 0 || last.silent) break;
    await sleep(500);
    const probe = await page.evaluate(READ_PROBE).catch((error) => ({ error: error.message }));
    last = { probe, ...captureStages(probe, mainAudioNotes(run)) };
  }
  const ok = Boolean(last?.complete && !last.silent);
  return {
    ok,
    afterMs: Date.now() - startedAt,
    pending: last?.pending ?? "getUserMedia",
    silent: Boolean(last?.silent),
    stages: last?.stages ?? null,
    probe: last?.probe ?? null,
    main: mainAudioNotes(run),
  };
}

/** Finish onboarding as OnboardingFlow's saveSettings does, sentinel included. */
const FIXTURE_ONBOARDING = `(async () => {
  localStorage.setItem("onboardingCompleted", "true");
  await window.electronAPI.markBundleMigrated();
  const state = await window.electronAPI.getPostMigrationState();
  return { onboardingCompleted: localStorage.getItem("onboardingCompleted"), postMigration: state };
})()`;

const VISIBLE_DIALOGS = `Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]'))
  .filter((d) => d.getBoundingClientRect().width > 0)
  .map((d) => (d.querySelector("h1,h2,h3")?.textContent || d.getAttribute("aria-label") || "").trim())`;

/** If the reminder dialog shows anyway, Remind Me Later is its harmless answer; never Grant Access. */
const DISMISS_REMINDER = `(() => {
  const dialogs = ${VISIBLE_DIALOGS};
  const later = ${findButton("Remind Me Later")};
  if (later) later.click();
  return { dialogs, remindMeLater: Boolean(later) };
})()`;

const START_HIT = `(() => {
  const button = ${findButton(START_LABEL)};
  if (!button) return { found: false };
  const r = button.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const name = hit
    ? hit.tagName.toLowerCase() +
      (typeof hit.className === "string" && hit.className
        ? "." + hit.className.trim().split(/\\s+/).slice(0, 3).join(".")
        : "")
    : null;
  return { found: true, covered: !(hit && (hit === button || button.contains(hit))), hit: name, dialogs: ${VISIBLE_DIALOGS} };
})()`;

// ---------------------------------------------------------------- commands

async function prepare(options) {
  if (process.platform !== "darwin") fail("the native run is macOS only");
  if (!fs.existsSync(SANDBOX_EXEC)) fail(`${SANDBOX_EXEC} is missing`, 3);
  await checkPorts();
  const run = makeRunDir(options.root);
  log(`run directory ${run.runDir}`);
  const ledger = new PidLedger(run);
  const assets = prepareAssets(run, options);
  log(
    `clip ${assets.clip.file} (${assets.clip.seconds} s), models ${assets.models.files.map((m) => m.name).join(", ")}`
  );
  const containment = await checkContainment(run);
  log(
    `outbound policy check: ${JSON.stringify(containment.observed)} compatible=${containment.compatible}`
  );
  if (!containment.compatible) {
    fail("the inherited outbound policy did not behave as required; no native work was started", 3);
  }
  const check = { run, ledger, assets, containment };
  return check;
}

async function smoke(options) {
  const noSandbox = chromiumSandboxOption(options);
  const { run, ledger, assets } = await prepare(options);
  if (!fs.existsSync(path.join(REPO, "src", "dist", "index.html"))) {
    fail("src/dist is missing: run npm run build:renderer first");
  }
  const clip = assets.clip.file;
  const meeting = path.basename(clip).split("-")[0];
  const result = {
    runDir: run.runDir,
    startedAt: new Date().toISOString(),
    chromiumSandbox: noSandbox
      ? "off: test-only --no-sandbox inside the outer outbound policy; the shipped sandbox is untested"
      : "on",
    steps: {},
  };
  const save = () => writeJson(path.join(run.runDir, "smoke-result.json"), result);
  const launchOptions = { noSandbox };
  if (noSandbox) log("Chromium sandbox off for this test run (--no-sandbox), outer policy kept");
  let current = null;
  const recordEvents = eventRecorder(path.join(run.paths.logs, "cdp-events-record.jsonl"));
  try {
    // First launch: record through the visible controls. Events are kept from
    // the first debugger connection, so the reload and Start are both covered.
    current = await openApp(run, ledger, clip, "record", launchOptions, {
      onEvent: recordEvents.onEvent,
    });
    await current.page.send("Page.addScriptToEvaluateOnNewDocument", { source: CAPTURE_PROBE });
    result.steps.fixture = await current.page.evaluate(FIXTURE_ONBOARDING);
    save();
    await current.page.send("Page.reload");
    await sleep(500);
    await waitFor("page reload", 60000, () =>
      current.page.evaluate(`document.readyState === "complete"`)
    );
    await waitFor("Start recording button", 60000, () =>
      current.page.evaluate(hasButton(START_LABEL))
    );
    // The reminder is opened after an IPC round trip on mount; give it time to show.
    await sleep(1500);
    const reminder = await current.page.evaluate(DISMISS_REMINDER);
    if (reminder.remindMeLater) await sleep(500);
    const startHit = await current.page.evaluate(START_HIT);
    result.steps.overlay = { ...reminder, start: startHit };
    result.steps.beforeStart = {
      probeInstalled: await current.page.evaluate(`Boolean(globalThis.__oatsE2EProbe)`),
      eventsRetained: recordEvents.kept.length,
      exceptions: recordEvents.kept.filter((e) => e.kind === "exception").length,
    };
    save();
    if (!startHit.found || startHit.covered) {
      fail(
        `the Start button is covered (${startHit.hit}); nothing was recorded`,
        EXIT_START_COVERED
      );
    }
    const before = await current.page.evaluate(READ_NOTES);
    await waitFor("press Start recording", 10000, () =>
      current.page.evaluate(visibleButton(START_LABEL))
    );
    const startedAt = Date.now();
    await waitFor("recording badge", 20000, () => current.page.evaluate(hasButton(FINISH_LABEL)));
    // The badge is shown before capture is set up, so it proves only the press.
    result.steps.recordingStarted = { afterMs: Date.now() - startedAt };
    save();
    ledger.snapshot(current.entry);
    result.steps.capture = await watchCapture(current.page, run, startedAt);
    save();
    ledger.snapshot(current.entry);
    if (!result.steps.capture.ok) {
      const stage = result.steps.capture.silent
        ? "firstPcm (silent)"
        : result.steps.capture.pending;
      log(`capture setup stalled at ${stage}; stopping early`);
      result.steps.earlyStop = {
        stage,
        finishPressed: await current.page.evaluate(visibleButton(FINISH_LABEL)).catch(() => false),
      };
      await sleep(3000);
      result.steps.earlyStop.probeAfter = await current.page.evaluate(READ_PROBE).catch(() => null);
      save();
      fail(`capture setup stalled at ${stage}`, EXIT_CAPTURE_STALLED);
    }
    await sleep(Math.max(0, assets.clip.seconds * 1000 + 6000 - (Date.now() - startedAt)));
    ledger.snapshot(current.entry);
    result.steps.counters = await current.page.evaluate(
      `document.body.innerText.match(/\\d+ words?/)?.[0] ?? null`
    );
    await waitFor("press Stop", 10000, () => current.page.evaluate(visibleButton(FINISH_LABEL)));
    const stoppedAt = Date.now();
    const known = new Set(before.map((n) => n.id));
    const saved = await waitFor(
      "saved conversation",
      180000,
      async () => {
        const notes = await current.page.evaluate(READ_NOTES);
        const fresh = notes.find((n) => !known.has(n.id) && n.text.length > 0);
        const recording = await current.page.evaluate(hasButton(FINISH_LABEL));
        return fresh && !recording ? fresh : false;
      },
      1000
    );
    // Let the post-Finish work (speakers, title) settle before the quit.
    await sleep(10000);
    const finished = (await current.page.evaluate(READ_NOTES)).find((n) => n.id === saved.id);
    const events = await current.page.evaluate(
      `window.electronAPI.listConversationEvents ? window.electronAPI.listConversationEvents(${saved.id}) : null`
    );
    const segmentIds = finished.segmentIds.filter((id) => id !== null);
    const eventSegmentIds = (Array.isArray(events) ? events : []).flatMap((e) => {
      try {
        return Array.isArray(e.segmentIds) ? e.segmentIds : JSON.parse(e.segment_ids_json || "[]");
      } catch {
        return [];
      }
    });
    result.steps.saved = {
      afterStopMs: Date.now() - stoppedAt,
      noteId: finished.id,
      title: finished.title,
      durationSeconds: finished.duration,
      segments: finished.segmentIds.length,
      segmentIdsUnique: new Set(segmentIds).size === segmentIds.length,
      events: Array.isArray(events) ? events.length : null,
      eventSegmentsFound: eventSegmentIds.every((id) => segmentIds.includes(id)),
      evidence: compareToReference(
        finished.text,
        referenceWords(options.words, meeting, assets.clip.start, assets.clip.seconds)
      ),
      textSample: finished.text.slice(0, 160),
    };
    save();
    current.page.ws.close();
    result.steps.firstQuit = await quitAndClean(ledger, current.entry);
    current = null;

    // Second launch on the same directory: the conversation must still be there.
    current = await openApp(run, ledger, clip, "reopen", launchOptions);
    const reopened = await waitFor("reopened conversation", 60000, async () => {
      const notes = await current.page.evaluate(READ_NOTES);
      return notes.find((n) => n.id === finished.id) || false;
    });
    result.steps.reopened = {
      noteId: reopened.id,
      sameText: reopened.text === finished.text,
      segments: reopened.segmentIds.length,
    };
    current.page.ws.close();
    result.steps.secondQuit = await quitAndClean(ledger, current.entry);
    current = null;
  } finally {
    if (current) {
      try {
        current.page?.ws?.close();
      } catch {}
      result.steps.abortQuit = await quitAndClean(ledger, current.entry);
    }
    result.finishedAt = new Date().toISOString();
    result.trace = path.join(run.paths.logs, "native-e2e-trace.jsonl");
    let appLog = "";
    try {
      appLog = fs.readFileSync(path.join(run.paths.logs, "electron-record.log"), "utf8");
    } catch {}
    result.diagnostics = {
      events: recordEvents.file,
      eventsRetained: recordEvents.kept.length,
      exceptions: recordEvents.kept.filter((e) => e.kind === "exception").slice(0, 20),
      errors: recordEvents.kept
        .filter((e) => e.level === "error" || e.level === "warning")
        .slice(0, 40),
      fakeDeviceLog: fakeDeviceLines(appLog),
      mainAudio: mainAudioNotes(run),
    };
    save();
  }

  const s = result.steps;
  const ev = s.saved?.evidence ?? {};
  const checks = {
    recordedAndSaved: Boolean(s.saved && s.saved.segments > 0 && ev.recognizedWords >= 5),
    matchesClip: ev.reference === null || (ev.sharedFraction ?? 0) >= 0.3,
    segmentIdsCorrelate: Boolean(s.saved?.segmentIdsUnique && s.saved?.eventSegmentsFound),
    reopened: Boolean(s.reopened?.sameText),
    cleanQuits: [s.firstQuit, s.secondQuit].every((q) => q && q.stillAlive.length === 0),
  };
  result.checks = checks;
  result.ok = Object.values(checks).every(Boolean);
  save();
  log(`result ${path.join(run.runDir, "smoke-result.json")}: ${JSON.stringify(checks)}`);
  if (!result.ok) fail("the smoke run did not pass every check", 7);
}

async function stop(runDirArg) {
  if (!runDirArg) fail("stop needs RUN_DIR");
  const run = readRun(fs.realpathSync(runDirArg));
  const ledger = new PidLedger(run);
  for (const entry of ledger.state.launches) {
    const alive = ledger.alive(entry);
    if (!alive.length) continue;
    log(`${entry.label}: ending ${alive.join(", ")}`);
    await quitAndClean(ledger, entry);
  }
  log("no recorded process is running");
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "check") {
    const { run } = await prepare(options);
    log(`check passed; ${run.runDir}`);
  } else if (command === "smoke") {
    await smoke(options);
  } else if (command === "stop") {
    await stop(options._[0]);
  } else {
    fail("usage: run-native-e2e.js check|smoke|stop (see the top of the file)", 2);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[native-e2e] ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}

module.exports = {
  CAPTURE_PROBE,
  DISMISS_REMINDER,
  FIXTURE_ONBOARDING,
  captureStages,
  dispatchCdpMessage,
  eventRecorder,
  fakeDeviceLines,
  summarizeCdpEvent,
  outboundPolicy,
  electronArgs,
  chromiumSandboxOption,
  sliceWav,
  compareToReference,
  normalizeWords,
  ALLOCATED_PORTS,
};
