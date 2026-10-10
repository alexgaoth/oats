const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const WhisperServerManager = require("../../src/helpers/whisperServer");

// `isIdle()` is what a room's live partial asks before it takes the server
// (partialScheduler.mjs): the server answers one request at a time, so a
// partial sent while a dictation or a final is being answered would delay it.

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function createManager(port) {
  const manager = new WhisperServerManager();
  manager.ready = true;
  manager.hostname = "127.0.0.1";
  manager.port = port;
  manager.canConvert = true;
  manager.process = {};
  manager._convertToWav = async (buffer) => buffer;
  return manager;
}

/** A server that answers each request only when told to. */
async function heldServer(t) {
  const held = [];
  const { server, port } = await startServer((req, res) => {
    req.resume();
    held.push((status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: "hello" }));
    });
  });
  t.after(() => server.close());
  const arrived = async (count) => {
    while (held.length < count) await new Promise((resolve) => setTimeout(resolve, 2));
  };
  return { port, held, arrived };
}

test("busy from the moment a request is sent until it is answered", async (t) => {
  const { port, held, arrived } = await heldServer(t);
  const manager = createManager(port);
  assert.equal(manager.isIdle(), true);

  const request = manager.transcribe(Buffer.from("audio"));
  assert.equal(manager.isIdle(), false, "busy before the request reaches the server");
  await arrived(1);
  assert.equal(manager.isIdle(), false);
  held[0]();
  assert.equal((await request).text, "hello");
  assert.equal(manager.isIdle(), true);
});

test("two requests at once: busy until both are answered", async (t) => {
  // A boolean set and cleared per request — what `WhisperManager._transcribing`
  // is — reads idle the moment the first one returns.
  const { port, held, arrived } = await heldServer(t);
  const manager = createManager(port);
  const dictation = manager.transcribe(Buffer.from("dictation"));
  const final = manager.transcribe(Buffer.from("final"));
  await arrived(2);
  held[0]();
  await dictation;
  assert.equal(manager.isIdle(), false, "one is still being answered");
  held[1]();
  await final;
  assert.equal(manager.isIdle(), true);
});

test("idle again after a request that failed", async (t) => {
  const { port, held, arrived } = await heldServer(t);
  const manager = createManager(port);
  const request = manager.transcribe(Buffer.from("audio"));
  await arrived(1);
  held[0](500);
  await assert.rejects(request, /status 500/);
  assert.equal(manager.isIdle(), true);
});

test("never idle while the server is down or starting", () => {
  const manager = new WhisperServerManager();
  assert.equal(manager.isIdle(), false, "not started");
  manager.ready = true;
  manager.startupPromise = Promise.resolve();
  assert.equal(manager.isIdle(), false, "restarting");
  manager.startupPromise = null;
  assert.equal(manager.isIdle(), true);
});
