const test = require("node:test");
const assert = require("node:assert/strict");
const dc = require("node:diagnostics_channel");
const EventEmitter = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const {
  WEB_REQUEST_FILTER,
  classifyUrl,
  createNetworkLedger,
  installNetworkLedger,
  isLoopbackHost,
} = require("../../src/helpers/networkLedger");

// The sidebar's "N network requests since launch" (networkLedger.js). The count
// must be complete, so these pin both halves: what counts as leaving this
// machine, and that every hook really fires. Nothing here leaves the machine:
// the Node hooks are driven against a loopback server, and an "outbound" host
// is resolved to 127.0.0.1 by the request's own `lookup`, so no DNS is asked.

let summaryIsLoopbackHost;
test.before(async () => {
  ({ isLoopbackHost: summaryIsLoopbackHost } =
    await import("../../src/helpers/onDeviceSummary.mjs"));
});

const LOOPBACK = [
  "127.0.0.1",
  "127.255.255.254",
  "127.1",
  "0x7f.0.0.1",
  "localhost",
  "LOCALHOST",
  "localhost.",
  "app.localhost",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
  "::ffff:127.0.0.1",
  "[::ffff:7f00:1]",
  "0.0.0.0",
  "::",
];

const ELSEWHERE = [
  "api.openai.com",
  "www.google.com",
  "huggingface.co",
  "192.168.1.20",
  "10.0.0.1",
  "8.8.8.8",
  "128.0.0.1",
  "126.255.255.255",
  "localhost.example.com",
  "127.0.0.1.nip.io",
  "notlocalhost",
  "::2",
  "fe80::1",
  "2001:db8::1",
  "::ffff:8.8.8.8",
  "",
];

test("loopback is the 127/8 block, ::1, localhost and the unspecified address", () => {
  for (const host of LOOPBACK) assert.equal(isLoopbackHost(host), true, host);
  for (const host of ELSEWHERE) assert.equal(isLoopbackHost(host), false, host);
});

test("the footer's own loopback rule agrees with the counter's on every host", () => {
  // Two copies: the counter is CommonJS in main, the footer ESM in the
  // renderer. One table holds them together.
  for (const host of [...LOOPBACK, ...ELSEWHERE, null, undefined, "not a host"]) {
    assert.equal(summaryIsLoopbackHost(host), isLoopbackHost(host), String(host));
  }
});

test("a request is outbound unless it is loopback or not a network request at all", () => {
  const cases = {
    "https://api.openai.com/v1/chat/completions": "outbound",
    "wss://api.openai.com/v1/realtime": "outbound",
    "http://192.168.1.20:8080/v1/models": "outbound",
    "https://huggingface.co/ggml-org/whisper/resolve/main/ggml-base.bin": "outbound",
    "http://127.0.0.1:8178/inference": "local",
    "ws://localhost:6006/": "local",
    "http://[::1]:6333/collections": "local",
    "file:///Applications/Oats.app/Contents/Resources/app.asar/src/dist/index.html": "not-network",
    "devtools://devtools/bundled/devtools_app.html": "not-network",
    "data:text/html,<p>x</p>": "not-network",
    "blob:file:///0f3c": "not-network",
    "mailto:someone@example.com": "not-network",
    "x-apple.systempreferences:com.apple.preference.security": "not-network",
    // What cannot be read is counted: too high, never too low.
    "not a url": "outbound",
  };
  for (const [url, kind] of Object.entries(cases)) assert.equal(classifyUrl(url), kind, url);
});

test("the ledger counts what left, remembers what it excluded, and tells its listeners", () => {
  const ledger = createNetworkLedger({ now: () => 1700000000000 });
  const heard = [];
  ledger.subscribe((snapshot) => heard.push(snapshot.outbound));
  ledger.subscribe(() => {
    throw new Error("a broken listener");
  });

  assert.equal(ledger.recordUrl("chromium", "https://api.openai.com/v1/models"), true);
  assert.equal(ledger.recordUrl("chromium", "http://127.0.0.1:8178/"), false);
  assert.equal(ledger.recordUrl("browser", "mailto:someone@example.com"), false);
  assert.equal(ledger.recordHost("node-http", "api.anthropic.com"), true);
  assert.equal(ledger.recordHost("node-http", "localhost"), false);
  assert.equal(ledger.recordHost("node-http", "localhost", { socketPath: "/tmp/x.sock" }), false);
  assert.equal(
    ledger.recordHost("node-http", "api.example.com", { socketPath: "/tmp/x.sock" }),
    false
  );

  assert.deepEqual(ledger.snapshot(), {
    outbound: 2,
    local: 4,
    bySource: { chromium: 1, "node-http": 1 },
    since: 1700000000000,
  });
  // Only an outbound request is news, and a listener that throws stops nothing.
  assert.deepEqual(heard, [1, 2]);
});

/** A fake of the slice of Electron the ledger touches. */
function fakeElectron() {
  const app = new EventEmitter();
  let ready;
  const readyPromise = new Promise((resolve) => (ready = resolve));
  app.whenReady = () => readyPromise;
  const makeSession = () => {
    const target = new EventEmitter();
    target.registrations = [];
    target.webRequest = {
      onSendHeaders(filter, listener) {
        target.registrations.push({ filter, listener });
      },
    };
    target.send = (url) => target.registrations.at(-1).listener({ url });
    return target;
  };
  const opened = [];
  const shell = {
    openExternal(url, options) {
      opened.push({ url, options });
      return Promise.resolve();
    },
  };
  const session = { defaultSession: makeSession() };
  return { app, shell, session, makeSession, opened, ready };
}

test("every session is watched once, with a filter that leaves file:// and devtools out", async () => {
  const ledger = createNetworkLedger();
  const electron = fakeElectron();
  const installed = installNetworkLedger(ledger, electron);
  try {
    const updater = electron.makeSession();
    electron.app.emit("session-created", electron.session.defaultSession);
    electron.app.emit("session-created", updater);
    electron.app.emit("session-created", updater);
    electron.ready();
    await new Promise((resolve) => setImmediate(resolve));

    // Once each, though the default session was also offered after ready.
    assert.equal(electron.session.defaultSession.registrations.length, 1);
    assert.equal(updater.registrations.length, 1);
    assert.deepEqual(updater.registrations[0].filter, WEB_REQUEST_FILTER);
    assert.deepEqual(WEB_REQUEST_FILTER.urls, [
      "http://*/*",
      "https://*/*",
      "ws://*/*",
      "wss://*/*",
    ]);

    electron.session.defaultSession.send("https://api.openai.com/v1/chat/completions");
    electron.session.defaultSession.send("http://localhost:5173/src/main.jsx");
    updater.send("https://github.com/arum/oats-arum/releases/latest");
    updater.emit("will-download", {}, { getURL: () => "https://example.com/model.bin" });
    updater.emit("will-download", {}, { getURL: () => "blob:file:///export" });
    updater.emit("spellcheck-dictionary-download-begin", {}, "en-US");

    const snapshot = ledger.snapshot();
    assert.equal(snapshot.outbound, 4);
    assert.equal(snapshot.local, 1, "the dev server on localhost is seen and left out");
    assert.deepEqual(snapshot.bySource, { chromium: 2, download: 1, spellcheck: 1 });
  } finally {
    installed.uninstall();
  }
});

test("a link handed to the browser is counted, and the browser still gets it", async () => {
  const ledger = createNetworkLedger();
  const electron = fakeElectron();
  const original = electron.shell.openExternal;
  const installed = installNetworkLedger(ledger, electron);
  try {
    await electron.shell.openExternal("https://www.google.com/search?q=what%20is%20RLHF", {
      activate: false,
    });
    await electron.shell.openExternal("mailto:someone@example.com");
    await electron.shell.openExternal("x-apple.systempreferences:com.apple.preference.security");
    assert.equal(ledger.snapshot().outbound, 1);
    assert.deepEqual(ledger.snapshot().bySource, { browser: 1 });
    assert.deepEqual(
      electron.opened.map((call) => call.url),
      [
        "https://www.google.com/search?q=what%20is%20RLHF",
        "mailto:someone@example.com",
        "x-apple.systempreferences:com.apple.preference.security",
      ]
    );
    assert.deepEqual(electron.opened[0].options, { activate: false });
  } finally {
    installed.uninstall();
  }
  assert.equal(electron.shell.openExternal, original);
});

function listen(server, ...args) {
  return new Promise((resolve) => server.listen(...args, () => resolve(server)));
}

function get(options) {
  return new Promise((resolve, reject) => {
    const request = http.request(options, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    request.on("error", reject);
    request.end();
  });
}

test("Node's http and fetch in this process are seen, and loopback is left out", async () => {
  const ledger = createNetworkLedger();
  const installed = installNetworkLedger(ledger, { diagnosticsChannel: dc });
  const server = await listen(
    http.createServer((_request, response) => response.end("ok")),
    0,
    "127.0.0.1"
  );
  const { port } = server.address();
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-ledger-"));
  const socketPath = path.join(socketDir, "s.sock");
  const socketServer = await listen(
    http.createServer((_request, response) => response.end("ok")),
    socketPath
  );
  try {
    await get({ host: "127.0.0.1", port, path: "/http" });
    await (await fetch(`http://127.0.0.1:${port}/fetch`)).text();
    await get({ socketPath, path: "/unix" });
    assert.equal(ledger.snapshot().outbound, 0);
    assert.equal(ledger.snapshot().local, 3, "the http, fetch and unix-socket hooks all fired");

    // A host that is not this machine is counted by its name. The request's
    // own lookup sends it to the local server, so nothing leaves.
    await get({
      host: "oats-ledger.test",
      port,
      path: "/named",
      lookup: (_host, options, callback) =>
        options?.all
          ? callback(null, [{ address: "127.0.0.1", family: 4 }])
          : callback(null, "127.0.0.1", 4),
    });
    assert.equal(ledger.snapshot().outbound, 1);
    assert.deepEqual(ledger.snapshot().bySource, { "node-http": 1 });
  } finally {
    installed.uninstall();
  }

  // Uninstalled, nothing more is counted.
  await get({ host: "127.0.0.1", port, path: "/after" });
  assert.equal(ledger.snapshot().local, 3);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => socketServer.close(resolve));
  fs.rmSync(socketDir, { recursive: true, force: true });
});
