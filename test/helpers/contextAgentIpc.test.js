const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

// The three channels between the renderer and the context agent, with a fake
// runner: what reaches the runner, what goes back to the window, and how many
// Claude Code processes can run at once.

const ipcPath = require.resolve("../../src/helpers/contextAgentIpc.js");
const originalLoad = Module._load;

function loadIpc() {
  delete require.cache[ipcPath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "./debugLogger") return { debug() {}, info() {}, warn() {}, error() {} };
    if (request === "./sidecarRegistry") return { register() {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(ipcPath);
  } finally {
    Module._load = originalLoad;
  }
}

const { registerContextAgentIpc, MAX_RUNNING } = loadIpc();

function setUp(runContextAgent) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const stops = [];
  const calls = [];
  const runner = {
    agentStatus: async () => ({ available: true, path: "/fake/claude", version: "2.1.302" }),
    runContextAgent: (request, options) => {
      calls.push({ request, options });
      return runContextAgent(request, options);
    },
  };
  registerContextAgentIpc(ipcMain, {
    runner,
    registry: { register: (name, stop) => stops.push({ name, stop }) },
  });
  const sender = Object.assign(new EventEmitter(), {
    sent: [],
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    send(channel, payload) {
      this.sent.push([channel, payload]);
    },
  });
  const invoke = (channel, ...args) => handlers.get(channel)({ sender }, ...args);
  return { handlers, invoke, sender, calls, stops };
}

const REQUEST = {
  checkId: "q-1",
  question: "When is the launch?",
  reply: "I think the 23rd?",
  outcome: "uncertain",
};

/** A run that waits until it is aborted or released. */
function pendingRun() {
  let release;
  const run = (request, { signal }) =>
    new Promise((resolve) => {
      release = resolve;
      signal.addEventListener("abort", () => resolve({ ok: false, reason: "cancelled" }));
    });
  return { run, release: (value) => release(value) };
}

test("the three channels are registered, and quitting has a stop", () => {
  const { handlers, stops } = setUp(async () => ({ ok: false, reason: "unclear" }));
  assert.deepEqual([...handlers.keys()].sort(), [
    "context-agent-cancel",
    "context-agent-check",
    "context-agent-status",
  ]);
  assert.deepEqual(
    stops.map(({ name }) => name),
    ["context-agent"]
  );
});

test("status comes from the runner", async () => {
  const { invoke } = setUp(async () => ({}));
  assert.deepEqual(await invoke("context-agent-status"), {
    available: true,
    path: "/fake/claude",
    version: "2.1.302",
  });
});

test("a check reaches the runner, and its progress reaches the window", async () => {
  const verdict = { ok: true, verdict: { verdict: "right" }, sources: ["Notion"] };
  const { invoke, calls, sender } = setUp(async (request, { onProgress }) => {
    onProgress({ sources: ["Notion"] });
    return verdict;
  });
  assert.deepEqual(await invoke("context-agent-check", REQUEST), verdict);
  assert.deepEqual(calls[0].request, {
    question: REQUEST.question,
    reply: REQUEST.reply,
    outcome: "uncertain",
  });
  assert.deepEqual(sender.sent, [
    ["context-agent-progress", { checkId: "q-1", sources: ["Notion"] }],
  ]);
});

test("a malformed check never reaches the runner", async () => {
  const { invoke, calls } = setUp(async () => assert.fail("not run"));
  for (const request of [
    null,
    { ...REQUEST, checkId: undefined },
    { ...REQUEST, checkId: "" },
    { ...REQUEST, checkId: { id: 1 } },
    { ...REQUEST, question: 42 },
    { ...REQUEST, outcome: "answered" },
  ]) {
    assert.deepEqual(await invoke("context-agent-check", request), { ok: false, reason: "failed" });
  }
  assert.equal(calls.length, 0);
  // A missing reply is an empty one.
  const { invoke: invokeOk, calls: okCalls } = setUp(async () => ({
    ok: false,
    reason: "unclear",
  }));
  await invokeOk("context-agent-check", { ...REQUEST, reply: undefined, checkId: 7 });
  assert.equal(okCalls[0].request.reply, "");
});

test("the same check asked twice is one run", async () => {
  const pending = pendingRun();
  const { invoke, calls } = setUp(pending.run);
  const first = invoke("context-agent-check", REQUEST);
  const second = invoke("context-agent-check", REQUEST);
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  pending.release({ ok: false, reason: "unclear" });
  assert.deepEqual(await first, { ok: false, reason: "unclear" });
  assert.equal(calls.length, 1);
});

test(`at most ${MAX_RUNNING} checks run at once; the next is busy`, async () => {
  const runs = [];
  const { invoke } = setUp((request, options) => {
    const pending = pendingRun();
    runs.push(pending);
    return pending.run(request, options);
  });
  const started = [];
  for (let index = 0; index < MAX_RUNNING; index += 1) {
    started.push(invoke("context-agent-check", { ...REQUEST, checkId: `q-${index}` }));
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await invoke("context-agent-check", { ...REQUEST, checkId: "q-extra" }), {
    ok: false,
    reason: "busy",
  });
  for (const run of runs) run.release({ ok: false, reason: "unclear" });
  await Promise.all(started);
  // Once they finish, there is room again.
  const after = invoke("context-agent-check", { ...REQUEST, checkId: "q-after" });
  await new Promise((resolve) => setImmediate(resolve));
  runs.at(-1).release({ ok: false, reason: "unclear" });
  assert.deepEqual(await after, { ok: false, reason: "unclear" });
});

test("cancel stops that run, and only that run", async () => {
  const pending = pendingRun();
  const { invoke } = setUp(pending.run);
  const check = invoke("context-agent-check", REQUEST);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await invoke("context-agent-cancel", "q-unknown"), { success: false });
  assert.deepEqual(await invoke("context-agent-cancel", "q-1"), { success: true });
  assert.deepEqual(await check, { ok: false, reason: "cancelled" });
});

test("a window that goes away cancels its check and hears nothing more", async () => {
  let progress;
  let aborted = false;
  const { invoke, sender } = setUp(
    (request, { signal, onProgress }) =>
      new Promise((resolve) => {
        progress = onProgress;
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve({ ok: false, reason: "cancelled" });
        });
      })
  );
  const check = invoke("context-agent-check", REQUEST);
  await new Promise((resolve) => setImmediate(resolve));
  sender.destroyed = true;
  progress({ sources: ["Slack"] });
  sender.emit("destroyed");
  assert.deepEqual(await check, { ok: false, reason: "cancelled" });
  assert.equal(aborted, true);
  assert.deepEqual(sender.sent, []);
});

test("a runner that throws is a failed check", async () => {
  const { invoke } = setUp(async () => {
    throw new Error("boom");
  });
  assert.deepEqual(await invoke("context-agent-check", REQUEST), { ok: false, reason: "failed" });
});

test("quitting stops every run and waits for it", async () => {
  const pending = pendingRun();
  const { invoke, stops } = setUp(pending.run);
  const check = invoke("context-agent-check", REQUEST);
  await new Promise((resolve) => setImmediate(resolve));
  await stops[0].stop();
  assert.deepEqual(await check, { ok: false, reason: "cancelled" });
});
