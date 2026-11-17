const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const nativeE2E = require("../../src/helpers/nativeE2E");
const runner = require("../../scripts/run-native-e2e.js");

const {
  FAKE_AUDIO_SUFFIX,
  FAKE_AUDIO_SWITCH,
  MARKER_FILE,
  REQUIRED_SWITCHES,
  EXIT_REFUSED,
  validateRequest,
  bootstrap,
} = nativeE2E;

function makeRun() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oats-native-e2e-")));
  const root = path.join(base, "native-e2e");
  fs.mkdirSync(root, { mode: 0o700 });
  const runDir = path.join(root, "run-1");
  fs.mkdirSync(runDir, { mode: 0o700 });
  fs.chmodSync(runDir, 0o700);
  const token = "ab".repeat(16);
  fs.writeFileSync(path.join(runDir, MARKER_FILE), JSON.stringify({ version: 1, runDir, token }));
  fs.mkdirSync(path.join(runDir, "assets"));
  const wav = path.join(runDir, "assets", "clip.wav");
  fs.writeFileSync(wav, Buffer.alloc(44));
  const home = path.join(runDir, "home");
  const env = {
    OATS_NATIVE_E2E: "1",
    OATS_NATIVE_E2E_ROOT: root,
    OATS_NATIVE_E2E_RUN_DIR: runDir,
    OATS_NATIVE_E2E_TOKEN: token,
    NODE_ENV: "test",
    HOME: home,
    TMPDIR: path.join(runDir, "tmp"),
    CFFIXED_USER_HOME: home,
    PATH: "/usr/bin:/bin",
    SOME_SETTING: "kept out",
  };
  const argv = [
    "electron",
    ".",
    ...REQUIRED_SWITCHES,
    `${FAKE_AUDIO_SWITCH}${wav}${FAKE_AUDIO_SUFFIX}`,
    "--remote-debugging-port=18628",
  ];
  return { base, root, runDir, token, env, argv, wav, home };
}

function validate(run, overrides = {}) {
  return validateRequest({
    env: overrides.env ?? run.env,
    argv: overrides.argv ?? run.argv,
    isPackaged: overrides.isPackaged ?? false,
    platform: "darwin",
  });
}

function fakeApp() {
  return {
    isPackaged: false,
    paths: {},
    setPath(name, value) {
      this.paths[name] = value;
    },
    setAppLogsPath(value) {
      this.logsPath = value;
    },
    on() {},
    whenReady: () => Promise.resolve(),
    quit() {
      this.quitCalled = true;
    },
  };
}

function fakeNet() {
  const calls = [];
  class Socket {
    connect(...args) {
      calls.push(args);
      return this;
    }
    destroy(error) {
      this.destroyedWith = error;
    }
  }
  return { Socket, calls };
}

test.afterEach(() => nativeE2E._setActiveForTests(null));

test("an ordinary launch takes no test route and changes nothing", () => {
  const app = fakeApp();
  let exited = null;
  const env = { PATH: "/usr/bin", NODE_ENV: "test", HOME: "/Users/someone" };
  const config = bootstrap({ app, env, argv: ["electron", "."], exit: (code) => (exited = code) });
  assert.equal(config, null);
  assert.equal(exited, null);
  assert.deepEqual(app.paths, {});
  assert.equal(env.HOME, "/Users/someone");
  assert.equal(nativeE2E.isActive(), false);
  assert.deepEqual(nativeE2E.portRange("whisper", [8178, 8199]), [8178, 8199]);
  assert.equal(nativeE2E.suppresses("update-check"), false);
});

test("an incomplete request exits before any path is moved", () => {
  const app = fakeApp();
  let exited = null;
  const logs = [];
  bootstrap({
    app,
    env: { OATS_NATIVE_E2E: "1", NODE_ENV: "test", HOME: "/Users/someone" },
    argv: ["electron", "."],
    exit: (code) => (exited = code),
    log: (line) => logs.push(line),
  });
  assert.equal(exited, EXIT_REFUSED);
  assert.deepEqual(app.paths, {});
  assert.equal(nativeE2E.isActive(), false);
  assert.match(logs.join("\n"), /refused, nothing was started/);
});

test("a complete request validates", () => {
  const run = makeRun();
  const result = validate(run);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.config.runDir, run.runDir);
  assert.equal(result.config.audioFile, run.wav);
  assert.equal(result.config.mockKeychain, true);
});

test("every invalid request is refused, with a reason", () => {
  const run = makeRun();
  const without = (flag) => run.argv.filter((arg) => arg !== flag);
  const cases = [
    ["not test", { env: { ...run.env, NODE_ENV: "development" } }, /NODE_ENV/],
    ["packaged", { isPackaged: true }, /packaged/],
    ["no mock keychain", { argv: without("--use-mock-keychain") }, /--use-mock-keychain/],
    ["no fake device", { argv: without("--use-fake-device-for-media-stream") }, /fake-device/],
    ["short token", { env: { ...run.env, OATS_NATIVE_E2E_TOKEN: "abc" } }, /TOKEN/],
    ["secret in env", { env: { ...run.env, OPENAI_API_KEY: "x" } }, /OPENAI_API_KEY/],
    ["real home", { env: { ...run.env, HOME: os.homedir() } }, /HOME must be/],
    ["real CF home", { env: { ...run.env, CFFIXED_USER_HOME: os.homedir() } }, /CFFIXED/],
    ["user data dir", { argv: [...run.argv, "--user-data-dir=/tmp/x"] }, /--user-data-dir/],
    ["inspector", { argv: [...run.argv, "--inspect=9229"] }, /--inspect/],
    [
      "wide debugger",
      { argv: [...run.argv, "--remote-debugging-address=0.0.0.0"] },
      /remote-debugging-address/,
    ],
    [
      "other debug port",
      {
        argv: [
          ...run.argv.filter((a) => !a.startsWith("--remote")),
          "--remote-debugging-port=9222",
        ],
      },
      /debugging port must be 18628/,
    ],
    [
      "clip outside the run",
      {
        argv: [
          ...run.argv.filter((a) => !a.startsWith(FAKE_AUDIO_SWITCH)),
          `${FAKE_AUDIO_SWITCH}${path.join(run.base, "clip.wav")}${FAKE_AUDIO_SUFFIX}`,
        ],
      },
      /fake microphone/,
    ],
    [
      "looping clip",
      {
        argv: [
          ...run.argv.filter((a) => !a.startsWith(FAKE_AUDIO_SWITCH)),
          `${FAKE_AUDIO_SWITCH}${run.wav}`,
        ],
      },
      /fake microphone/,
    ],
    [
      "run dir not under the root",
      { env: { ...run.env, OATS_NATIVE_E2E_RUN_DIR: path.join(run.base, "elsewhere") } },
      /direct child/,
    ],
    [
      "root with another name",
      { env: { ...run.env, OATS_NATIVE_E2E_ROOT: run.base } },
      /ending in \/native-e2e/,
    ],
  ];
  for (const [name, overrides, reason] of cases) {
    const result = validate(run, overrides);
    assert.equal(result.ok, false, `${name} was accepted`);
    assert.match(result.errors.join("; "), reason, name);
  }
});

test("a run directory that is shared, linked or not this request's is refused", () => {
  const shared = makeRun();
  fs.chmodSync(shared.runDir, 0o755);
  assert.match(validate(shared).errors.join("; "), /0700/);

  const marked = makeRun();
  fs.writeFileSync(
    path.join(marked.runDir, MARKER_FILE),
    JSON.stringify({ version: 1, runDir: marked.runDir, token: "cd".repeat(16) })
  );
  assert.match(validate(marked).errors.join("; "), /marker does not match/);

  const linked = makeRun();
  const target = path.join(linked.root, "run-link");
  fs.symlinkSync(linked.runDir, target);
  const env = { ...linked.env, OATS_NATIVE_E2E_RUN_DIR: target };
  assert.match(validate(linked, { env }).errors.join("; "), /symlinks are refused/);
});

test("the test route moves every path and the environment into the run", () => {
  const run = makeRun();
  const app = fakeApp();
  const shell = { openExternal: () => Promise.resolve() };
  const shortcuts = { register: () => true, registerAll: () => {} };
  const net = fakeNet();
  const env = { ...run.env };
  const sigtermBefore = process.listeners("SIGTERM");
  let exited = null;
  try {
    const config = bootstrap({
      app,
      shell,
      globalShortcut: shortcuts,
      netModule: net,
      env,
      argv: run.argv,
      exit: (code) => (exited = code),
    });
    assert.equal(exited, null);
    assert.ok(config);
    for (const name of [
      "appData",
      "userData",
      "sessionData",
      "home",
      "logs",
      "crashDumps",
      "temp",
    ]) {
      assert.ok(app.paths[name].startsWith(`${run.runDir}${path.sep}`), name);
      assert.ok(fs.statSync(app.paths[name]).isDirectory(), name);
    }
    assert.equal(app.logsPath, path.join(run.runDir, "logs"));
    assert.equal(env.HOME, run.home);
    assert.equal(env.TMPDIR, path.join(run.runDir, "tmp"));
    assert.equal(env.SOME_SETTING, undefined, "variables outside the allowlist are removed");
    assert.equal(env.PATH, "/usr/bin:/bin");
    assert.equal(nativeE2E.isActive(), true);
    assert.deepEqual(nativeE2E.portRange("whisper", [8178, 8199]), [18622, 18622]);
    assert.deepEqual(nativeE2E.portRange("llama", [8200, 8220]), [18624, 18627]);
    assert.equal(nativeE2E.suppresses("update-check"), true);
    assert.equal(shortcuts.register("Control+Space"), false);
    return shell.openExternal("https://example.com").then(
      () => assert.fail("a link was opened"),
      (error) => assert.match(error.message, /refused/)
    );
  } finally {
    for (const listener of process.listeners("SIGTERM")) {
      if (!sigtermBefore.includes(listener)) process.removeListener("SIGTERM", listener);
    }
  }
});

test("only local resources and allocated loopback ports may be loaded", () => {
  for (const url of [
    "file:///app/src/dist/index.html",
    "data:text/javascript,1",
    "blob:file:///abc",
    "devtools://devtools/bundled/inspector.html",
    "http://127.0.0.1:18622/inference",
    "ws://localhost:18628/devtools/page/1",
    "http://[::1]:18620/collections",
  ]) {
    assert.equal(nativeE2E.isAllowedUrl(url), true, url);
  }
  for (const url of [
    "https://huggingface.co/model.bin",
    "http://127.0.0.1:8178/inference",
    "http://127.0.0.1/",
    "http://10.0.0.2:18622/",
    "ftp://127.0.0.1:18622/",
    "not a url",
  ]) {
    assert.equal(nativeE2E.isAllowedUrl(url), false, url);
  }
});

test("Chromium requests outside the allocation are cancelled", async () => {
  let listener = null;
  const session = { defaultSession: { webRequest: { onBeforeRequest: (fn) => (listener = fn) } } };
  const restore = nativeE2E.installEgressGuard({
    app: { on() {}, whenReady: () => Promise.resolve() },
    session,
    netModule: fakeNet(),
  });
  await new Promise((resolve) => setImmediate(resolve));
  restore();
  const decide = (url) => new Promise((resolve) => listener({ url }, resolve));
  assert.deepEqual(await decide("https://api.openai.com/v1/chat"), { cancel: true });
  assert.deepEqual(await decide("file:///app/src/dist/worklet.js"), { cancel: false });
  assert.deepEqual(await decide("http://127.0.0.1:18624/completion"), { cancel: false });
});

test("Node sockets reach only allocated loopback ports and local paths", () => {
  const net = fakeNet();
  const restore = nativeE2E.installEgressGuard({ netModule: net });
  try {
    const allowed = new net.Socket();
    allowed.connect({ host: "127.0.0.1", port: 18622 });
    new net.Socket().connect("/tmp/some.sock");
    new net.Socket().connect(18620, "localhost");
    assert.equal(net.calls.length, 3);

    const blocked = new net.Socket();
    blocked.connect({ host: "203.0.113.5", port: 443 });
    const outside = new net.Socket();
    outside.connect(8178, "127.0.0.1");
    assert.equal(net.calls.length, 3, "a refused connection never reaches the real connect");
    return new Promise((resolve) => process.nextTick(resolve)).then(() => {
      assert.equal(blocked.destroyedWith?.code, "EOATSNATIVEE2E");
      assert.equal(outside.destroyedWith?.code, "EOATSNATIVEE2E");
    });
  } finally {
    restore();
  }
});

test("under the test route, secrets use safeStorage only and never the OS keyring", () => {
  const run = makeRun();
  const keyringRequests = [];
  const encrypted = [];
  const fakeElectron = {
    app: { getPath: () => run.runDir, isPackaged: false },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => {
        encrypted.push(value);
        return Buffer.from(`mock:${value}`);
      },
      decryptString: (buffer) => buffer.toString().slice("mock:".length),
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return fakeElectron;
    if (request === "@napi-rs/keyring") {
      keyringRequests.push(request);
      throw new Error("the keyring must not be loaded");
    }
    return originalLoad.call(this, request, ...rest);
  };
  const secretPath = require.resolve("../../src/helpers/secretCrypto");
  delete require.cache[secretPath];
  try {
    const config = validate(run).config;
    nativeE2E._setActiveForTests(config);
    const secretCrypto = require(secretPath);
    const blob = secretCrypto.encrypt("not a real key");
    assert.equal(secretCrypto.decrypt(blob).value, "not a real key");
    assert.deepEqual(keyringRequests, []);
    assert.deepEqual(encrypted, ["not a real key"], "no master key backup was written");
    assert.equal(fs.existsSync(path.join(run.runDir, "secure-keys")), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[secretPath];
  }
});

test("under the test route, a port outside the allocation is never probed", async () => {
  const run = makeRun();
  const { isPortAvailable } = require("../../src/utils/serverUtils");
  nativeE2E._setActiveForTests(validate(run).config);
  assert.equal(await isPortAvailable(8178), false);
  assert.equal(await isPortAvailable(18629), false);
});

test("under the test route, the default and writing llama servers share only the allocation", async () => {
  const run = makeRun();
  const LlamaServerManager = require("../../src/helpers/llamaServer");
  nativeE2E._setActiveForTests(validate(run).config);
  const a = new LlamaServerManager();
  const b = new LlamaServerManager({ pidName: "llama-writing" });
  try {
    const [pa, pb] = await Promise.all([a.findAvailablePort(), b.findAvailablePort()]);
    assert.notEqual(pa, pb);
    for (const port of [pa, pb]) assert.ok(port >= 18624 && port <= 18627, `port ${port}`);
    a.releasePort();
    assert.equal(a.reservedPort, null);
    assert.equal(b.reservedPort, pb);
  } finally {
    a.releasePort();
    b.releasePort();
  }
});
test("the runner's outbound policy allows only local IPC and the allocated ports", () => {
  const policy = runner.outboundPolicy(runner.ALLOCATED_PORTS);
  const lines = policy.split("\n");
  assert.equal(lines[0], "(version 1)");
  assert.ok(lines.indexOf("(deny network-outbound)") > lines.indexOf("(allow default)"));
  assert.ok(
    lines.findIndex((l) => l.includes("mDNSResponder")) >
      lines.indexOf("(allow network-outbound (remote unix-socket))")
  );
  const allowedPorts = [...policy.matchAll(/remote ip "localhost:(\d+)"/g)].map((m) =>
    Number(m[1])
  );
  assert.deepEqual(allowedPorts, [18620, 18621, 18622, 18623, 18624, 18625, 18626, 18627, 18628]);
  assert.doesNotMatch(policy, /remote ip "\*/);
});

test("the runner cuts an owned clip with a correct PCM header", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oats-native-e2e-wav-")));
  const source = path.join(dir, "source.wav");
  const rate = 16000;
  const pcm = Buffer.alloc(rate * 2 * 3);
  for (let i = 0; i < rate * 3; i++) pcm.writeInt16LE(i % 3000, i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(source, Buffer.concat([header, pcm]));

  const target = path.join(dir, "clip.wav");
  runner.sliceWav(source, target, 1, 1.5);
  const clip = fs.readFileSync(target);
  assert.equal(clip.length, 44 + rate * 2 * 1.5);
  assert.equal(clip.readUInt32LE(40), rate * 2 * 1.5);
  assert.equal(clip.readUInt32LE(24), rate);
  assert.equal(clip.readInt16LE(44), rate % 3000);
  assert.throws(() => runner.sliceWav(source, target, 2, 2), /shorter/);
});

test("the transcript is compared with the corpus's own words", () => {
  const evidence = runner.compareToReference("We need the remote control to be cheap.", [
    "we",
    "need",
    "the",
    "remote",
    "control",
    "cheaper",
  ]);
  assert.equal(evidence.recognizedWords, 8);
  assert.equal(evidence.distinctRecognized, 5);
  assert.equal(evidence.sharedWithReference, 4);
  assert.equal(evidence.sharedFraction, 0.8);
});

test("Chromium's sandbox is off only with the explicit opt-in and the switch together", () => {
  const run = makeRun();
  const optIn = { ...run.env, OATS_NATIVE_E2E_NO_SANDBOX: "1" };
  const withSwitch = [...run.argv, "--no-sandbox"];

  assert.equal(validate(run).config.chromiumSandbox, "on");
  const both = validate(run, { env: optIn, argv: withSwitch });
  assert.equal(both.ok, true, JSON.stringify(both.errors));
  assert.equal(both.config.chromiumSandbox, "disabled-for-test");

  const refused = [
    [
      "switch without opt-in",
      { argv: withSwitch },
      /--no-sandbox needs OATS_NATIVE_E2E_NO_SANDBOX=1/,
    ],
    ["opt-in without switch", { env: optIn }, /OATS_NATIVE_E2E_NO_SANDBOX=1 needs --no-sandbox/],
    [
      "opt-in not 1",
      { env: { ...run.env, OATS_NATIVE_E2E_NO_SANDBOX: "true" }, argv: withSwitch },
      /must be 1/,
    ],
    ["packaged", { env: optIn, argv: withSwitch, isPackaged: true }, /packaged/],
    [
      "opt-in without the rest of the guard",
      { env: { ...optIn, NODE_ENV: "development" }, argv: withSwitch },
      /NODE_ENV/,
    ],
  ];
  for (const [name, overrides, reason] of refused) {
    const result = validate(run, overrides);
    assert.equal(result.ok, false, `${name} was accepted`);
    assert.match(result.errors.join("; "), reason, name);
  }
});

test("the sandbox opt-in alone is a test request, and an incomplete one exits", () => {
  const app = fakeApp();
  let exited = null;
  const config = bootstrap({
    app,
    env: { OATS_NATIVE_E2E_NO_SANDBOX: "1", HOME: "/Users/someone" },
    argv: ["electron", ".", "--no-sandbox"],
    exit: (code) => (exited = code),
    log: () => {},
  });
  assert.equal(config, null);
  assert.equal(exited, EXIT_REFUSED);
  assert.deepEqual(app.paths, {});
});

test("the runner adds --no-sandbox only when the smoke opts in, inside the outer policy", () => {
  const clip = "/owned/run/assets/clip.wav";
  const plain = runner.electronArgs(clip);
  assert.equal(plain.includes("--no-sandbox"), false);
  assert.equal(runner.electronArgs(clip, { noSandbox: false }).includes("--no-sandbox"), false);
  const optedIn = runner.electronArgs(clip, { noSandbox: true });
  assert.equal(optedIn.filter((arg) => arg === "--no-sandbox").length, 1);
  assert.deepEqual(optedIn.slice(0, 2), ["-p", runner.outboundPolicy(runner.ALLOCATED_PORTS)]);
  for (const required of REQUIRED_SWITCHES) assert.ok(optedIn.includes(required), required);
  assert.deepEqual(
    optedIn.filter((arg) => arg !== "--no-sandbox"),
    plain,
    "the opt-in changes nothing else"
  );

  assert.equal(runner.chromiumSandboxOption({}), false);
  assert.equal(runner.chromiumSandboxOption({ "chromium-sandbox": "on" }), false);
  assert.equal(runner.chromiumSandboxOption({ "chromium-sandbox": "off" }), true);
  assert.throws(() => runner.chromiumSandboxOption({ "chromium-sandbox": "no" }), /on or off/);
});
