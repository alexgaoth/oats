#!/usr/bin/env node
// Runs the real Oats app natively inside one runner-owned directory, through
// the test route in src/helpers/nativeE2E.js: a mock keychain, a public WAV as
// Chromium's fake microphone, owned copies of the public models, and loopback
// ports from one fixed allocation, all under a sandbox-exec outbound policy
// that the app and every child inherit.
//
//   node scripts/run-native-e2e.js check --root DIR --wav FILE --models DIR [--bin DIR]
//   node scripts/run-native-e2e.js smoke --root DIR --wav FILE --models DIR [--bin DIR]
//          [--words DIR] [--start S] [--seconds S]
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
// The renderer must be built first (`npm run build:renderer`): the app loads
// src/dist.

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

function launchApp(run, ledger, clip, label) {
  const logFile = path.join(run.paths.logs, `electron-${label}.log`);
  const out = fs.openSync(logFile, "a", 0o600);
  const args = [
    "-p",
    outboundPolicy(ALLOCATED_PORTS),
    electronBinary(),
    REPO,
    "--use-mock-keychain",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `${nativeE2E.FAKE_AUDIO_SWITCH}${clip}${nativeE2E.FAKE_AUDIO_SUFFIX}`,
    // Chromium's audio service sandbox cannot read the fake device's file on macOS.
    "--disable-features=AudioServiceSandbox",
    `--remote-debugging-port=${CDP_PORT}`,
  ];
  const child = spawn(SANDBOX_EXEC, args, {
    cwd: REPO,
    env: appEnvironment(run),
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

async function openTarget(urlFragment, timeoutMs, isAlive) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) fail("the app exited before its window opened", 5);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const target = list.find((t) => t.type === "page" && t.url.includes(urlFragment));
      if (target) return openSocket(target.webSocketDebuggerUrl);
    } catch {}
    await sleep(250);
  }
  return fail(`no window matching "${urlFragment}" within ${timeoutMs} ms`, 5);
}

async function openSocket(wsUrl) {
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
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result);
  };
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

const visibleButton = (label) => `(() => {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent.trim() === ${JSON.stringify(label)} && b.offsetParent !== null && !b.disabled
  );
  if (!button) return false;
  button.click();
  return true;
})()`;

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

async function openApp(run, ledger, clip, label) {
  const launched = launchApp(run, ledger, clip, label);
  const isAlive = () => ledger.alive(launched.entry).includes(launched.entry.pid);
  const page = await openTarget("panel=true", 90000, isAlive);
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
  const { run, ledger, assets } = await prepare(options);
  if (!fs.existsSync(path.join(REPO, "src", "dist", "index.html"))) {
    fail("src/dist is missing: run npm run build:renderer first");
  }
  const clip = assets.clip.file;
  const meeting = path.basename(clip).split("-")[0];
  const result = { runDir: run.runDir, startedAt: new Date().toISOString(), steps: {} };
  const save = () => writeJson(path.join(run.runDir, "smoke-result.json"), result);
  let current = null;
  try {
    // First launch: record through the visible controls.
    current = await openApp(run, ledger, clip, "record");
    await current.page.evaluate(`localStorage.setItem("onboardingCompleted", "true")`);
    await current.page.send("Page.reload");
    await sleep(500);
    await waitFor("page reload", 60000, () =>
      current.page.evaluate(`document.readyState === "complete"`)
    );
    await waitFor("Start recording button", 60000, () =>
      current.page.evaluate(
        `Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "Start recording" && b.offsetParent !== null)`
      )
    );
    const before = await current.page.evaluate(READ_NOTES);
    await waitFor("press Start recording", 10000, () =>
      current.page.evaluate(visibleButton("Start recording"))
    );
    const startedAt = Date.now();
    await waitFor("recording badge", 20000, () =>
      current.page.evaluate(
        `Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "Stop" && b.offsetParent !== null)`
      )
    );
    result.steps.recordingStarted = { afterMs: Date.now() - startedAt };
    ledger.snapshot(current.entry);
    await sleep(assets.clip.seconds * 1000 + 6000);
    ledger.snapshot(current.entry);
    result.steps.counters = await current.page.evaluate(
      `document.body.innerText.match(/\\d+ words?/)?.[0] ?? null`
    );
    await waitFor("press Stop", 10000, () => current.page.evaluate(visibleButton("Stop")));
    const stoppedAt = Date.now();
    const known = new Set(before.map((n) => n.id));
    const saved = await waitFor(
      "saved conversation",
      180000,
      async () => {
        const notes = await current.page.evaluate(READ_NOTES);
        const fresh = notes.find((n) => !known.has(n.id) && n.text.length > 0);
        const recording = await current.page.evaluate(
          `Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "Stop" && b.offsetParent !== null)`
        );
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
    current = await openApp(run, ledger, clip, "reopen");
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

module.exports = { outboundPolicy, sliceWav, compareToReference, normalizeWords, ALLOCATED_PORTS };
