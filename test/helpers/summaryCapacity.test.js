const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");

// A summary that does not fit the writing model on this Mac, followed from
// llama-server's answer to the record: llamaServer -> modelManagerBridge -> the
// "process-local-reasoning" handler -> the renderer's local provider -> the
// summary action. The answers are the shapes the bundled llama-server (b9763,
// Gemma 4 E4B, --ctx-size 16384) gave on 2026-11-08 to public AMI meetings and
// to one fictional two-line exchange. No socket is opened: http.request is
// answered in process.

const ROOT = path.join(__dirname, "..", "..");
const MODEL = "gemma-4-e4b-it-q4_k_m";

// Main's modules ask Electron for its app only to find paths; none is needed here.
const loadModule = Module._load;
Module._load = function withoutElectron(request) {
  if (request === "electron") return { app: { isReady: () => true, getPath: () => "/tmp" } };
  return loadModule.apply(this, arguments);
};

// --- llama-server's answers.

const choice = (finish, content) => [{ index: 0, finish_reason: finish, message: { content } }];
// TS3003a+b+c, 98 minutes: the context filled 273 tokens into a 2,048-token answer.
const CONTEXT_FILLED = () => ({
  body: {
    choices: choice("length", "## Threads\n- The remote"),
    usage: { completion_tokens: 273, prompt_tokens: 16111, total_tokens: 16384 },
  },
});
// A two-line exchange whose answer used every token it was allowed.
const ANSWER_FILLED = (request) => ({
  body: {
    choices: choice("length", "Ava and Ben"),
    usage: {
      completion_tokens: request.max_tokens,
      prompt_tokens: 56,
      total_tokens: 56 + request.max_tokens,
    },
  },
});
// IS1009c, 30 minutes.
const COMPLETE = () => ({
  body: {
    choices: choice("stop", "## Threads\n- The kite launch moved to Tuesday."),
    usage: { completion_tokens: 568, prompt_tokens: 6242, total_tokens: 6810 },
  },
});
// ES2004a-d, 132 minutes: refused before anything was written.
const REFUSED = () => ({
  status: 400,
  body: {
    error: {
      code: 400,
      message:
        "request (30076 tokens) exceeds the available context size (16384 tokens), try increasing it",
      type: "exceed_context_size_error",
      n_prompt_tokens: 30076,
      n_ctx: 16384,
    },
  },
});
// Cut, with nothing to say why: not evidence of either limit.
const CUT_UNCOUNTED = () => ({ body: { choices: choice("length", "Ava") } });
const DROPPED = () => ({ socketError: "socket hang up" });

const replies = [];
const sent = [];
const realRequest = http.request;
http.request = function answeredInProcess(options, onResponse) {
  if (options?.path !== "/v1/chat/completions") return realRequest.apply(http, arguments);
  const req = new EventEmitter();
  let body = "";
  req.write = (chunk) => {
    body += chunk;
  };
  req.destroy = () => {};
  req.end = () =>
    setImmediate(() => {
      const request = JSON.parse(body);
      sent.push(request);
      const reply = (replies.shift() ?? COMPLETE)(request);
      if (reply.socketError) {
        req.emit("error", new Error(reply.socketError));
        return;
      }
      const res = new EventEmitter();
      res.statusCode = reply.status ?? 200;
      onResponse(res);
      res.emit("data", JSON.stringify(reply.body));
      res.emit("end");
    });
  return req;
};

function answerWith(...queue) {
  replies.length = 0;
  sent.length = 0;
  replies.push(...queue);
}

// --- Main: the bridge's server, and the IPC handler with everything else stubbed.

let server;
let invoke;

function stub() {
  const fn = function stubbed() {
    return stub();
  };
  return new Proxy(fn, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) return () => "";
      if (key === "then") return undefined;
      if (key === Symbol.iterator) return function* none() {};
      return stub();
    },
    apply: () => stub(),
    construct: () => stub(),
  });
}

function loadIpcHandler() {
  const ipcPath = path.join(ROOT, "src", "helpers", "ipcHandlers.js");
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler), on() {} };
  const keep = new Set(["path", "fs", "os", "crypto", "child_process"]);
  const originalLoad = Module._load;
  // Only ipcHandlers.js's own requires are replaced; the local reasoning bridge
  // and everything under it are the real modules.
  Module._load = function load(request, parent) {
    if (parent?.filename === ipcPath) {
      if (request === "electron") return new Proxy({ ipcMain }, { get: (t, k) => t[k] ?? stub() });
      if (
        keep.has(request) ||
        request.startsWith("node:") ||
        request.endsWith(".json") ||
        request === "../services/localReasoningBridge" ||
        request === "./localAnswerLimit"
      ) {
        return originalLoad.apply(this, arguments);
      }
      return stub();
    }
    return originalLoad.apply(this, arguments);
  };
  const IPCHandlers = require(ipcPath);
  const self = new Proxy({}, { get: (t, k) => (k in t ? t[k] : stub()) });
  IPCHandlers.prototype.setupHandlers.call(self);
  const handler = handlers.get("process-local-reasoning");
  assert.equal(typeof handler, "function");
  return (text, config) => handler({}, text, MODEL, null, config);
}

// --- The renderer: TypeScript modules with their app-wide neighbours stubbed.

const STUB_SOURCES = {
  "../services/ReasoningService":
    "export default { processText: (...args) => globalThis.__oats.processText(...args) };",
  "./settingsStore": [
    "export const getSettings = () => globalThis.__oats.settings;",
    "export const selectResolvedNoteFormatting = () => globalThis.__oats.formatting;",
    "export const useSettingsStore = Object.assign(() => undefined, { getState: () => globalThis.__oats.settings });",
  ].join("\n"),
  "../config/prompts":
    "export const appendDictionarySuffix = (p) => p; export const wrapCleanupTranscript = (t) => t;",
  "../../../config/prompts":
    "export const appendDictionarySuffix = (p) => p; export const wrapCleanupTranscript = (t) => t;",
  "../utils/generateTitle": "export const generateNoteTitle = async () => null;",
  "../helpers/noteFormattingOverrides": "export const buildNoteFormattingOverrides = () => ({});",
  "./conversationGroupSortStore": [
    "export const claimWritingModel = async () => () => {};",
    "export const sortConversationIntoGroup = async () => {};",
    "export const currentWritingRoute = () => 'local:';",
  ].join("\n"),
  "./conversationLinkStore": "export const checkConversationLinks = async () => {};",
  "../utils/logger":
    "export default { logReasoning() {}, debug() {}, info() {}, warn() {}, error() {} };",
  "../../../utils/logger":
    "export default { logReasoning() {}, debug() {}, info() {}, warn() {}, error() {} };",
  "./meetingRecordingStore":
    "export const useMeetingRecordingStore = { getState: () => ({ isRecording: false, isTranscribing: false }) };",
  "./modelDownloadStore": "export const watchModelDownloads = () => {};",
  "../hooks/useSummaryReadiness":
    "export const summaryReadinessNow = async () => 'ready'; export const useSummaryReadinessState = () => ({ readiness: 'ready', settled: true });",
  "../utils/writingKeys": "export const writingKeyPresent = () => true;",
};

Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(STUB_SOURCES, specifier) && context.parentURL?.includes("/src/")) {
      return { url: `oats-stub:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      for (const ext of [".ts", ".js", ".mjs"]) {
        try {
          return nextResolve(specifier + ext, context);
        } catch {
          // the next extension
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith("oats-stub:")) {
      const source = STUB_SOURCES[decodeURIComponent(url.slice("oats-stub:".length))];
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const updates = [];
let storedNote = null;
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

let queue;
let action;
let provider;
let queueStore;
let localLimit;

test.before(async () => {
  queue = await import("../../src/helpers/summaryQueue.mjs");
  const bridge = require("../../src/helpers/modelManagerBridge").default;
  server = bridge.serverManager;
  Object.assign(server, {
    ready: true,
    process: { pid: 0 },
    port: 18620,
    contextSize: 16384,
    modelPath: "/models/google_gemma-4-E4B-it-Q4_K_M.gguf",
  });
  server.isAvailable = () => true;
  server.resetIdleTimer = () => {};
  bridge._initialized = true;
  bridge.modelsDir = "/models";
  bridge.checkModelValid = async () => true;
  bridge.currentServerModelId = MODEL;
  invoke = loadIpcHandler();

  globalThis.window = {
    electronAPI: {
      processLocalReasoning: (text, _model, _agent, config) => invoke(text, config),
      updateNote: async (id, fields) => {
        updates.push({ id, fields });
        return { success: true };
      },
      getNote: async () => storedNote,
    },
  };
  globalThis.__oats = {
    settings: { customDictionary: [], uiLanguage: "en", autoGenerateNoteTitle: false },
    formatting: { mode: "local", model: MODEL, disableThinking: true },
    processText: (text, model, agentName, config) =>
      provider.call({ text, model, agentName, config, ctx: { getSystemPrompt: () => "" } }),
  };
  ({ localProvider: provider } = await import("../../src/services/ai/inferenceProviders/local.ts"));
  action = await import("../../src/stores/actionProcessingStore.ts");
  queueStore = await import("../../src/stores/summaryQueueStore.ts");
});

// --- 1. Main, up to the IPC result.

const SUMMARY = { systemPrompt: "You are a professional meeting notes assistant.", requireComplete: true };
// Long enough that the bridge asks for its largest answer, 2,048 tokens.
const TRANSCRIPT = `## Conversation Transcript\n${"Ava: The fictional kite launch moves to Tuesday. ".repeat(40)}`;

test("a context that filled before the answer's limit is the conversation's length", async () => {
  answerWith(CONTEXT_FILLED);
  const result = await invoke(TRANSCRIPT, SUMMARY);
  assert.equal(sent[0].max_tokens, 2048);
  assert.equal(result.success, false);
  assert.equal(result.code, "summary-too-long");
  assert.deepEqual(result.details, {
    promptTokens: 16111,
    completionTokens: 273,
    contextTokens: 16384,
    maxTokens: 2048,
  });
});

test("an answer that used its whole limit on a short input is not 'too long'", async () => {
  answerWith(ANSWER_FILLED);
  const result = await invoke(TRANSCRIPT, SUMMARY);
  assert.equal(result.success, false);
  assert.equal(result.code, "summary-output-limit");
  assert.deepEqual(result.details, {
    promptTokens: 56,
    completionTokens: 2048,
    contextTokens: 16384,
    maxTokens: 2048,
  });
});

test("the server refusing a request over its context is the conversation's length", async () => {
  answerWith(REFUSED);
  const result = await invoke(TRANSCRIPT, SUMMARY);
  assert.equal(result.success, false);
  assert.equal(result.code, "summary-too-long");
  assert.deepEqual(result.details, { promptTokens: 30076, contextTokens: 16384, maxTokens: 2048 });
  // The words are still the server's, for the message match in older callers.
  assert.match(result.error, /exceeds the available context size/);
});

test("finish_reason 'length' alone says neither limit", async () => {
  answerWith(CUT_UNCOUNTED);
  const result = await invoke(TRANSCRIPT, SUMMARY);
  assert.equal(result.success, false);
  assert.equal(result.code, undefined);
  assert.match(result.error, /stopped at its output limit/);
});

test("a complete answer, and a cut one for a caller that takes it, come back as text", async () => {
  answerWith(COMPLETE);
  assert.deepEqual(await invoke(TRANSCRIPT, SUMMARY), {
    success: true,
    text: "## Threads\n- The kite launch moved to Tuesday.",
  });
  answerWith(CONTEXT_FILLED);
  const result = await invoke(TRANSCRIPT, { systemPrompt: "Name the topic." });
  assert.equal(result.success, true);
});

test("a dropped connection carries no limit", async () => {
  answerWith(DROPPED);
  const result = await invoke(TRANSCRIPT, SUMMARY);
  assert.equal(result.success, false);
  assert.equal(result.code, undefined);
  assert.match(result.error, /socket hang up/);
});

test("the server remembers the context it was started with", async () => {
  const LlamaServerManager = require("../../src/helpers/llamaServer");
  const fresh = new LlamaServerManager();
  fresh.getServerBinaryPaths = () => ({ default: "/bin/llama-server" });
  fresh.findAvailablePort = async () => 18620;
  fresh._startWithBinary = async () => {};
  fresh._startWithGpuFallback = async () => {};
  fresh.startHealthCheck = () => {};
  fresh.resetIdleTimer = () => {};
  await fresh.start(__filename, { contextSize: 16384 });
  assert.equal(fresh.contextSize, 16384);
});

test("main and the renderer name the two limits the same way", () => {
  localLimit = require("../../src/helpers/localAnswerLimit.js");
  assert.equal(localLimit.CONTEXT_FULL, queue.SUMMARY_TOO_LONG);
  assert.equal(localLimit.ANSWER_FULL, queue.SUMMARY_OUTPUT_LIMIT);
});

// --- 2. The renderer's provider: the reason survives into the thrown error.

test("the local provider throws the reason it was given, and the queue reads it", async () => {
  for (const [reply, kind] of [
    [CONTEXT_FILLED, "too-long"],
    [REFUSED, "too-long"],
    [ANSWER_FILLED, "output-limit"],
    [CUT_UNCOUNTED, "other"],
    [DROPPED, "other"],
  ]) {
    answerWith(reply);
    const error = await provider
      .call({ text: TRANSCRIPT, model: MODEL, config: SUMMARY, ctx: { getSystemPrompt: () => "" } })
      .then(() => null, (thrown) => thrown);
    assert.ok(error instanceof Error, kind);
    assert.equal(queue.summaryFailureKind(error, "local"), kind, kind);
    // Off this Mac a provider's words are its own.
    assert.equal(queue.summaryFailureKind(error, "providers"), "other");
  }
});

// --- 3. The summary action: how many times it asks, and what it saves.

const ACTION = { id: 1, name: "Summary", prompt: "Summarize.", is_builtin: true };
const LABELS = {
  noModel: "no model",
  noEndpoint: "no endpoint",
  actionFailed: "failed",
  noSummary: "empty",
  tooLong: "too long",
  outputLimit: "answer limit",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Run one summary to its end, the clock moved on 5 s every ten turns. */
async function summarize(t, noteId, { hash = "h1", content = TRANSCRIPT } = {}) {
  updates.length = 0;
  let outcome;
  const running = action
    .runBackgroundAction(noteId, content, hash, ACTION, { isCloudMode: false, modelId: MODEL, isMeetingNote: true }, LABELS)
    .then((value) => {
      outcome = value;
    });
  for (let turn = 0; turn < 400 && outcome === undefined; turn += 1) {
    await flush();
    if (turn % 10 === 9) t.mock.timers.tick(5_000);
  }
  await running;
  // Well past the retry's pause and window: anything owed would have asked.
  t.mock.timers.tick(action.SUMMARY_RETRY_DELAY_MS_FOR_TESTS ?? 130_000);
  for (let turn = 0; turn < 20; turn += 1) await flush();
  return outcome;
}

const stateOf = (noteId) => action.useActionProcessingStore.getState().noteStates[noteId];

test("a conversation over the context asks once, says too long, and saves nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  answerWith(CONTEXT_FILLED, CONTEXT_FILLED);
  assert.equal(await summarize(t, 11), "too-long");
  assert.equal(sent.length, 1);
  assert.equal(stateOf(11).kind, "too-long");
  assert.equal(stateOf(11).message, "too long");
  assert.equal(updates.length, 0);
});

test("a refused request asks once and says too long", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  answerWith(REFUSED, COMPLETE);
  assert.equal(await summarize(t, 12), "too-long");
  assert.equal(sent.length, 1);
  assert.equal(stateOf(12).kind, "too-long");
});

test("an answer at its limit asks once and says so, never 'too long'", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  answerWith(ANSWER_FILLED, ANSWER_FILLED);
  assert.equal(await summarize(t, 13), "output-limit");
  assert.equal(sent.length, 1);
  assert.equal(stateOf(13).kind, "output-limit");
  assert.equal(stateOf(13).message, "answer limit");
  assert.equal(updates.length, 0);
});

test("a complete answer is saved after one request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  answerWith(COMPLETE);
  assert.equal(await summarize(t, 14), "saved");
  assert.equal(sent.length, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].fields.enhanced_at_content_hash, "h1");
});

test("a dropped connection, or a cut without counts, is tried once more", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  answerWith(DROPPED, COMPLETE);
  assert.equal(await summarize(t, 15), "saved");
  assert.equal(sent.length, 2);
  answerWith(CUT_UNCOUNTED, CUT_UNCOUNTED, COMPLETE);
  assert.equal(await summarize(t, 16), "failed");
  assert.equal(sent.length, 2);
  assert.equal(stateOf(16).kind, "other");
});

test("a summary still being written when a newer one starts never saves over it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gates = [];
  const saved = globalThis.__oats.processText;
  globalThis.__oats.processText = () => new Promise((resolve) => gates.push(resolve));
  try {
    updates.length = 0;
    const older = action.runBackgroundAction(21, TRANSCRIPT, "old", ACTION, { isCloudMode: false, modelId: MODEL, isMeetingNote: true }, LABELS);
    await flush();
    action.cancelAction(21);
    const newer = action.runBackgroundAction(21, TRANSCRIPT, "new", ACTION, { isCloudMode: false, modelId: MODEL, isMeetingNote: true }, LABELS);
    for (let turn = 0; turn < 5; turn += 1) await flush();
    assert.equal(gates.length, 2);
    gates[1]("## Threads\n- newer");
    assert.equal(await newer, "saved");
    gates[0]("## Threads\n- older");
    assert.equal(await older, "cancelled");
    assert.deepEqual(
      updates.map((update) => update.fields.enhanced_at_content_hash),
      ["new"]
    );
  } finally {
    globalThis.__oats.processText = saved;
  }
});

test("a slow summary of an earlier transcript never saves over one of the current transcript", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gates = [];
  const saved = globalThis.__oats.processText;
  globalThis.__oats.processText = () => new Promise((resolve) => gates.push(resolve));
  try {
    updates.length = 0;
    const transcript = "[{\"id\":\"s1\",\"text\":\"one\"},{\"id\":\"s2\",\"text\":\"two\"}]";
    const running = action.runBackgroundAction(22, TRANSCRIPT, "18-earlier", ACTION, { isCloudMode: false, modelId: MODEL, isMeetingNote: true }, LABELS);
    for (let turn = 0; turn < 5; turn += 1) await flush();
    // Meanwhile the conversation went on, and a summary of all of it was saved.
    storedNote = {
      id: 22,
      transcript,
      enhanced_content: "## Threads\n- all of it",
      enhanced_at_content_hash: queue.summaryContentHash(transcript),
    };
    gates[0]("## Threads\n- the first part");
    assert.equal(await running, "cancelled");
    assert.equal(updates.length, 0);
  } finally {
    storedNote = null;
    globalThis.__oats.processText = saved;
  }
});

// --- 4. The queue's memory: an unchanged failure is not asked again, even after a restart.

const FINGERPRINT = { source: "61452-[{\"id\":\"s1\"", model: `local:${MODEL}` };

test("a too-long or answer-limit failure is remembered, and a restart still knows it", async () => {
  storage.clear();
  assert.equal(await queueStore.runSummary(31, async () => "too-long", FINGERPRINT), "too-long");
  assert.equal(await queueStore.runSummary(32, async () => "output-limit", FINGERPRINT), "output-limit");
  assert.equal(await queueStore.runSummary(33, async () => "failed", FINGERPRINT), "failed");
  const now = { ...FINGERPRINT, context: queue.LOCAL_CONTEXT_TOKENS };
  assert.equal(queueStore.standingSummaryFailure({ id: 31, ...now }), "too-long");
  assert.equal(queueStore.standingSummaryFailure({ id: 32, ...now }), "output-limit");
  // Anything else fails differently next time: not remembered.
  assert.equal(queueStore.standingSummaryFailure({ id: 33, ...now }), null);

  // Restarted: a fresh copy of the store reads what was kept.
  const restarted = await import("../../src/stores/summaryQueueStore.ts?restart=1");
  assert.equal(restarted.standingSummaryFailure({ id: 31, ...now }), "too-long");
  // A changed transcript, model or context may be tried.
  assert.equal(restarted.standingSummaryFailure({ id: 31, ...now, source: "61900-[{\"id\":\"s1\"" }), null);
  assert.equal(restarted.standingSummaryFailure({ id: 31, ...now, model: "local:gemma-4-12b-it-qat-q4_0" }), null);
  assert.equal(restarted.standingSummaryFailure({ id: 31, ...now, context: 32768 }), null);
});

test("a saved summary clears what was remembered", async () => {
  storage.clear();
  await queueStore.runSummary(34, async () => "too-long", FINGERPRINT);
  const now = { id: 34, ...FINGERPRINT, context: queue.LOCAL_CONTEXT_TOKENS };
  assert.equal(queueStore.standingSummaryFailure(now), "too-long");
  await queueStore.runSummary(34, async () => "saved", { ...FINGERPRINT, source: "new" });
  assert.equal(queueStore.standingSummaryFailure(now), null);
});
