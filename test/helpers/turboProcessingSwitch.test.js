const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

// Turbo's automatic download when the processing choice moves away from this
// Mac (deviceTier.js, speechTier.mjs `shouldLeaveTurbo`, useSpeechUpgrade.ts).
// Real DeviceTier, WhisperManager and downloadFile; the transport is a server
// on 127.0.0.1 that holds the transfer part way, and Electron's `net.request`
// is Node's http pointed at it. Nothing leaves the machine: any other host
// throws. The renderer's hook is stood in by the same rules it evaluates.

const electronPath = require.resolve("electron");
const outbound = [];
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    net: {
      request({ url, method }) {
        if (new URL(url).hostname !== "127.0.0.1") {
          outbound.push(url);
          throw new Error(`outbound request in a test: ${url}`);
        }
        const request = http.request(url, { method, agent: false });
        request.abort = () => request.destroy();
        return request;
      },
    },
  },
};

const registry = require("../../src/models/modelRegistryData.json");
const { DeviceTier, TURBO_MODEL } = require("../../src/helpers/deviceTier");
const WhisperManager = require("../../src/helpers/whisper");

let speechTier;
test.before(async () => {
  speechTier = await import("../../src/helpers/speechTier.mjs");
});

const SIZE = 1 << 20;
const CHUNK = 16 << 10;
const HOLD_AT = 256 << 10;
const BODY = crypto.randomBytes(SIZE);
const M5_PRO = {
  platform: "darwin",
  arch: "arm64",
  chip: "Apple M5 Pro",
  gpuCores: 16,
  memoryBytes: 48 * 1024 ** 3,
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return true;
    await sleep(5);
  }
  return false;
}

/** A server that sends turbo's stand-in, holding at HOLD_AT bytes until `release()`. */
function createTransport() {
  const transport = { requests: 0, sentBytes: 0, completed: 0, closedEarly: 0, port: null };
  let gate;
  transport.hold = () => {
    gate = new Promise((resolve) => {
      transport.release = resolve;
    });
  };
  transport.hold();
  transport.server = http.createServer((_req, res) => {
    transport.requests += 1;
    res.writeHead(200, { "content-length": SIZE, "content-type": "application/octet-stream" });
    let offset = 0;
    let done = false;
    let closed = false;
    res.on("close", () => {
      closed = true;
      if (!done) transport.closedEarly += 1;
    });
    void (async () => {
      while (offset < SIZE && !closed) {
        if (offset >= HOLD_AT) await gate;
        if (closed) break;
        const chunk = BODY.subarray(offset, offset + CHUNK);
        offset += chunk.length;
        transport.sentBytes += chunk.length;
        if (offset >= SIZE) {
          // Counted before the client can close on the last byte.
          done = true;
          transport.completed += 1;
          res.end(chunk);
          break;
        }
        res.write(chunk);
        await sleep(1);
      }
    })();
  });
  return transport;
}

/** Listen on the first free loopback port of 18630-18639. */
async function listen(server) {
  for (let port = 18630; port <= 18639; port += 1) {
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("no free loopback port in 18630-18639");
}

/**
 * A Mac that qualifies for turbo, its WhisperManager on a temp dir, turbo's
 * registry entry pointed at the transport, and the renderer's hook: on every
 * snapshot and setting change it asks for turbo (`shouldFetchTurbo`) or lets
 * go of it (`shouldLeaveTurbo`), each on the change, as the effects do.
 */
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-turbo-switch-"));
  const transport = createTransport();
  transport.port = await listen(transport.server);
  const turbo = registry.whisperModels[TURBO_MODEL];
  const saved = { ...turbo };
  Object.assign(turbo, {
    downloadUrl: `http://127.0.0.1:${transport.port}/turbo.bin`,
    expectedSizeBytes: SIZE,
    sha256: crypto.createHash("sha256").update(BODY).digest("hex"),
  });
  fs.writeFileSync(path.join(dir, "ggml-small.en.bin"), "small");
  const storePath = path.join(dir, "userData", "device-tier.json");
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      version: 1,
      appVersion: "0.2.0",
      device: M5_PRO,
      smallClipMs: 170,
      turboClipMs: null,
      measuredAt: "2026-11-08T00:00:00.000Z",
      turboDeclined: false,
    })
  );
  const whisperManager = new WhisperManager();
  whisperManager.getModelsDir = () => dir;

  const settings = {
    local: true,
    followsDefault: true,
    whisperModel: "small.en",
    recording: false,
  };
  const hook = { fetch: false, leave: false, starts: 0, leaves: 0 };
  const env = { dir, transport, settings, hook, whisperManager, storePath };
  const evaluate = () => {
    const snapshot = env.tier.snapshot();
    const choice = speechTier.chooseSpeechModel({
      ...snapshot.device,
      smallClipMs: snapshot.smallClipMs,
      turboClipMs: snapshot.turboClipMs,
      language: "en",
    });
    const fetch = speechTier.shouldFetchTurbo({
      choice,
      setupDone: true,
      followsDefault: settings.followsDefault,
      local: settings.local,
      recording: settings.recording,
      turbo: snapshot.turbo,
    });
    if (fetch && !hook.fetch) {
      hook.starts += 1;
      void env.tier.startUpgrade({ language: "en" });
    }
    hook.fetch = fetch;
    const leave = speechTier.shouldLeaveTurbo({
      local: settings.local,
      followsDefault: settings.followsDefault,
      whisperModel: settings.whisperModel,
      turbo: snapshot.turbo,
    });
    if (leave && !hook.leave) {
      hook.leaves += 1;
      env.tier.cancelUpgrade({ decline: false });
    }
    hook.leave = leave;
  };
  env.published = [];
  env.tier = new DeviceTier({
    whisperManager,
    storePath,
    appVersion: "0.2.0",
    detect: async () => ({ ...M5_PRO }),
    createServer: () => ({
      isAvailable: () => true,
      async start() {},
      stopHealthCheck() {},
      async transcribePreparedWav() {
        return { text: "monsieur was the only one" };
      },
      async stop() {},
    }),
    time: async (read) => {
      await read();
      return 650;
    },
    isBusy: () => settings.recording,
    sleep: async () => {
      await sleep(1);
    },
    publish: (snapshot) => {
      env.published.push(snapshot);
      setImmediate(evaluate);
    },
  });
  await env.tier.ensureMeasured();
  env.evaluate = evaluate;
  env.turboFile = whisperManager.getModelPath(TURBO_MODEL);
  /** Change a setting, as the processing switch does, and let the hook run. */
  env.set = (patch) => {
    Object.assign(settings, patch);
    evaluate();
  };
  env.settled = () => until(() => !env.tier.download && !env.tier.checking, 4000);
  env.stored = () => JSON.parse(fs.readFileSync(storePath, "utf8"));
  env.cleanup = async () => {
    transport.release();
    await env.settled();
    Object.assign(turbo, saved);
    await new Promise((resolve) => transport.server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return env;
}

/** Until the transfer is held part way, with progress in main's snapshot. */
async function heldPartWay(env) {
  assert.ok(
    await until(() => env.transport.sentBytes >= HOLD_AT && env.tier.download?.receivedBytes > 0),
    "the transfer is under way"
  );
}

test("With an API key and an OpenAI key, turbo's transfer stops, and nothing is a no", async () => {
  const env = await setup();
  try {
    env.evaluate();
    await heldPartWay(env);
    const received = env.tier.download.receivedBytes;
    // setProcessing("providers") with an OpenAI key: applyProvidersSpeech moves
    // every scope off this Mac.
    env.set({ local: false });
    assert.ok(await until(() => env.transport.closedEarly === 1), "the connection is closed");
    env.transport.release();
    await env.settled();
    await sleep(30);

    assert.equal(env.transport.completed, 0, "the rest of the file is never sent");
    assert.ok(env.transport.sentBytes < SIZE);
    assert.ok(received > 0 && received < SIZE, `${received} bytes received before the stop`);
    const { turbo } = env.tier.snapshot();
    assert.equal(turbo.installed, false, "a stopped download is not installed");
    assert.equal(turbo.downloading, null);
    assert.equal(turbo.declined, false, "Oats' own stop is not the person's no");
    assert.equal(turbo.failed, null, "nor a failure");
    assert.equal(env.stored().turboDeclined, false);
    assert.equal(fs.existsSync(env.turboFile), false);
    assert.equal(fs.existsSync(`${env.turboFile}.tmp`), false, "the partial file goes");
    assert.equal(
      env.published.some((snapshot) => snapshot.turbo.installed),
      false,
      "no snapshot ever said installed"
    );
    // The setting that follows the default stays on the bundle's model.
    const choice = speechTier.chooseSpeechModel({ ...M5_PRO, smallClipMs: 170, language: "en" });
    assert.equal(
      speechTier.defaultSpeechModel({ choice, bundleModel: "small.en", turboInstalled: false }),
      "small.en"
    );
    assert.deepEqual([env.hook.starts, env.hook.leaves], [1, 1]);
    assert.deepEqual(outbound, []);
  } finally {
    await env.cleanup();
  }
});

test("back on this Mac, the default fetches turbo again, from the start", async () => {
  const env = await setup();
  try {
    env.evaluate();
    await heldPartWay(env);
    env.set({ local: false });
    await env.settled();
    env.transport.hold();
    env.set({ local: true });
    assert.ok(await until(() => env.transport.requests === 2), "asked for again");
    env.transport.release();
    await env.settled();
    assert.ok(await until(() => env.tier.snapshot().turbo.installed));
    assert.equal(env.transport.completed, 1);
    assert.equal(env.tier.snapshot().turbo.declined, false);
    assert.equal(env.tier.record.turboClipMs, 650, "its clip was timed");
    assert.equal(
      crypto.createHash("sha256").update(fs.readFileSync(env.turboFile)).digest("hex"),
      registry.whisperModels[TURBO_MODEL].sha256
    );
    assert.deepEqual([env.hook.starts, env.hook.leaves], [2, 1]);
  } finally {
    await env.cleanup();
  }
});

test("With an API key and only an Anthropic key, speech stays here and so does turbo", async () => {
  const env = await setup();
  try {
    env.evaluate();
    await heldPartWay(env);
    // applyProvidersSpeech without an OpenAI key leaves every scope on this Mac.
    env.set({ local: true });
    env.transport.release();
    await env.settled();
    assert.equal(env.tier.snapshot().turbo.installed, true);
    assert.equal(env.transport.closedEarly, 0);
    assert.equal(env.hook.leaves, 0);
  } finally {
    await env.cleanup();
  }
});

test("switching back and forth stops each transfer once and ends with one turbo", async () => {
  const env = await setup();
  try {
    env.evaluate();
    for (let round = 1; round <= 3; round += 1) {
      await heldPartWay(env);
      env.set({ local: false });
      // A second press of the same choice changes nothing.
      env.set({ local: false });
      await env.settled();
      assert.equal(env.transport.closedEarly, round);
      env.transport.hold();
      env.transport.sentBytes = 0;
      env.set({ local: true });
      assert.ok(await until(() => env.transport.requests === round + 1), `start ${round + 1}`);
    }
    env.transport.release();
    await env.settled();
    assert.equal(env.tier.snapshot().turbo.installed, true);
    assert.equal(env.transport.completed, 1);
    assert.equal(env.tier.snapshot().turbo.declined, false);
    assert.deepEqual([env.hook.starts, env.hook.leaves], [4, 3]);
  } finally {
    await env.cleanup();
  }
});

test("a start asked for just before the switch stops as soon as it shows", async () => {
  const env = await setup();
  try {
    // Main is still reading this Mac when the renderer asks.
    let measured;
    env.tier.measured = new Promise((resolve) => {
      measured = resolve;
    });
    env.evaluate();
    env.set({ local: false });
    measured(env.tier.record);
    assert.ok(await until(() => env.hook.leaves === 1), "stopped once it showed");
    env.transport.release();
    await env.settled();
    await sleep(30);
    assert.equal(env.tier.snapshot().turbo.installed, false);
    assert.equal(env.tier.snapshot().turbo.declined, false);
    assert.equal(env.transport.completed, 0, "nothing was transferred to the end");
    assert.ok(env.transport.sentBytes < SIZE);
    assert.equal(fs.existsSync(env.turboFile), false);
  } finally {
    await env.cleanup();
  }
});

test("the person's Cancel and Delete are still a no, on either side of the switch", async () => {
  const env = await setup();
  try {
    env.evaluate();
    await heldPartWay(env);
    env.tier.cancelUpgrade();
    await env.settled();
    assert.equal(env.tier.snapshot().turbo.declined, true);
    assert.equal(env.stored().turboDeclined, true);
    env.set({ local: false });
    env.set({ local: true });
    await sleep(50);
    assert.equal(env.transport.requests, 1, "not fetched again by itself");

    // Oats' stop first, then the person's Cancel while it settles: the Cancel counts.
    const again = await setup();
    try {
      again.evaluate();
      await heldPartWay(again);
      again.tier.cancelUpgrade({ decline: false });
      again.tier.cancelUpgrade();
      await again.settled();
      assert.equal(again.tier.snapshot().turbo.declined, true);
    } finally {
      await again.cleanup();
    }

    // An app stop with nothing downloading remembers nothing; Delete still does.
    const idle = await setup();
    try {
      idle.tier.cancelUpgrade({ decline: false });
      assert.equal(idle.tier.snapshot().turbo.declined, false);
      idle.tier.modelDeleted(TURBO_MODEL);
      assert.equal(idle.tier.snapshot().turbo.declined, true);
    } finally {
      await idle.cleanup();
    }
  } finally {
    await env.cleanup();
  }
});

test("turbo the person chose keeps downloading when speech leaves this Mac", async () => {
  const env = await setup();
  try {
    env.evaluate();
    await heldPartWay(env);
    env.set({ followsDefault: false, whisperModel: TURBO_MODEL, local: false });
    env.transport.release();
    await env.settled();
    assert.equal(env.tier.snapshot().turbo.installed, true);
    assert.equal(env.hook.leaves, 0);
  } finally {
    await env.cleanup();
  }
});

test("a recording neither stops the transfer nor lets the switch happen halfway", async () => {
  const env = await setup();
  try {
    // A recording that starts first: nothing is asked for until it ends.
    env.set({ recording: true });
    await sleep(30);
    assert.equal(env.transport.requests, 0);
    env.set({ recording: false });
    await heldPartWay(env);
    // A recording that starts during the transfer: it goes on, and the clip
    // check waits for the recording to end.
    env.set({ recording: true });
    env.transport.release();
    assert.ok(await until(() => env.tier.checking));
    await sleep(40);
    assert.equal(env.tier.checking, true, "waiting for the recording");
    assert.equal(env.tier.record.turboClipMs, null);
    env.set({ recording: false });
    await env.settled();
    assert.equal(env.tier.snapshot().turbo.installed, true);
    assert.equal(env.tier.record.turboClipMs, 650);
    assert.equal(env.hook.leaves, 0);
  } finally {
    await env.cleanup();
  }
});

test("a stop that arrives after the last byte remembers nothing and installs what arrived", async () => {
  const env = await setup();
  try {
    // The clip is read with turbo once its checksum matched: held here.
    let readClip;
    const clipHeld = new Promise((resolve) => {
      readClip = resolve;
    });
    env.tier.time = async (read) => {
      await clipHeld;
      await read();
      return 650;
    };
    env.evaluate();
    await heldPartWay(env);
    env.transport.release();
    // Turbo is being checked: no transfer is left to stop.
    assert.ok(await until(() => env.tier.checking));
    env.set({ local: false });
    env.tier.cancelUpgrade({ decline: false });
    readClip();
    await env.settled();
    const { turbo } = env.tier.snapshot();
    assert.equal(turbo.installed, true, "the file arrived whole and matched its checksum");
    assert.equal(turbo.declined, false);
    assert.equal(env.transport.completed, 1);
  } finally {
    await env.cleanup();
  }
});
