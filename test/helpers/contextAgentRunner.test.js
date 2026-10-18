const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

// The runner against a fake Claude Code: what it starts, what it records in the
// network count, what it reports while running, and how each way a run can end
// becomes a result. The event lines are the shapes Claude Code 2.1.302 wrote
// (contextAgent.test.js pins those).

const runnerPath = require.resolve("../../src/helpers/contextAgentRunner.js");
const originalLoad = Module._load;

function loadRunner() {
  delete require.cache[runnerPath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "./debugLogger") {
      return { debug() {}, info() {}, warn() {}, error() {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(runnerPath);
  } finally {
    Module._load = originalLoad;
  }
}

const runner = loadRunner();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oats-agent-runner-test-"));
test.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

const INIT = {
  type: "system",
  subtype: "init",
  tools: ["Read", "ToolSearch", "mcp__plugin_notion_notion__notion-search"],
  mcp_servers: [{ name: "plugin_notion_notion", status: "connected", source: "plugin" }],
  permissionMode: "dontAsk",
};
const toolUse = (...names) => ({
  type: "assistant",
  message: { content: names.map((name) => ({ type: "tool_use", name, input: {} })) },
});
const VERDICT = {
  verdict: "wrong",
  answer: "Tuesday 28 October",
  source: { title: "Q4 launch plan", url: "https://www.notion.so/acme/Q4-launch-plan-1a2b3c" },
  quote: "The public launch is on Tuesday 28 October.",
};
const result = (text, extra = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: text,
  ...extra,
});
const REQUEST = {
  question: "When is the launch?",
  reply: "I think the 23rd?",
  outcome: "uncertain",
};

/**
 * A fake Claude Code. `script(child, helpers)` decides what it writes and when
 * it exits; a SIGTERM to its group ends it.
 */
function fakeClaude(script) {
  const spawned = [];
  const signals = [];
  const records = [];
  const write = (child, events) => {
    for (const event of events) {
      child.stdout.write(typeof event === "string" ? event : `${JSON.stringify(event)}\n`);
    }
  };
  const exit = (child, code = 0) => {
    if (child.exited) return;
    child.exited = true;
    child.stdout.end();
    child.stdout.once("end", () => {
      child.exitCode = code;
      child.emit("close", code);
    });
    child.stdout.resume();
  };
  const spawnProcess = (binary, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 424242;
    child.exitCode = null;
    spawned.push({
      binary,
      args,
      options,
      cwdEntries: fs.readdirSync(options.cwd),
    });
    setImmediate(() => {
      child.emit("spawn");
      script(child, { write: (events) => write(child, events), exit: (code) => exit(child, code) });
    });
    return child;
  };
  const killGroup = (child, signal) => {
    signals.push(signal);
    if (signal === "SIGTERM") setImmediate(() => exit(child, null));
  };
  const ledger = {
    recordUrl: (source, url) => records.push(["url", source, url]),
    recordHost: (source, host) => records.push(["host", source, host]),
  };
  const run = runner.createContextAgentRunner({
    spawnProcess,
    killGroup,
    findBinary: async () => "/fake/bin/claude",
    ledger: () => ledger,
    tempRoot: () => tempRoot,
    exitWaitMs: 20,
  });
  return { run: run.runContextAgent, spawned, signals, records };
}

const leftoverRunDirs = () =>
  fs.readdirSync(tempRoot).filter((entry) => entry.startsWith("oats-context-agent-"));

test("a run that finds the answer returns its verdict and the services it read", async () => {
  const fake = fakeClaude((child, { write, exit }) => {
    write([
      INIT,
      toolUse("ToolSearch"),
      toolUse("mcp__plugin_notion_notion__notion-search"),
      toolUse("mcp__plugin_notion_notion__notion-create-pages"),
      toolUse(
        "mcp__plugin_notion_notion__notion-fetch",
        "mcp__plugin_slack_slack__slack_search_public"
      ),
      toolUse("mcp__gmail__search_threads"),
      result(`Found it.\n${JSON.stringify(VERDICT)}`),
    ]);
    exit(0);
  });
  const progress = [];
  const outcome = await fake.run(REQUEST, { onProgress: (update) => progress.push(update) });

  assert.deepEqual(outcome, { ok: true, verdict: VERDICT, sources: ["Notion", "Slack"] });
  assert.deepEqual(progress, [{ sources: ["Notion"] }, { sources: ["Notion", "Slack"] }]);
  // One request to Anthropic's API, then one per service actually read: not
  // the refused write, not the server outside the four.
  assert.deepEqual(fake.records, [
    ["url", "context-agent", "https://api.anthropic.com/"],
    ["host", "context-agent", "plugin_notion_notion"],
    ["host", "context-agent", "plugin_slack_slack"],
  ]);
  assert.deepEqual(leftoverRunDirs(), [], "the run's directory is removed");
});

test("Claude Code starts in an empty directory of its own, in its own process group", async () => {
  const agent = await import("../../src/helpers/contextAgent.mjs");
  const fake = fakeClaude((child, { write, exit }) => {
    write([INIT, result(JSON.stringify(VERDICT))]);
    exit(0);
  });
  const saved = { run: process.env.ELECTRON_RUN_AS_NODE, nested: process.env.CLAUDECODE };
  process.env.ELECTRON_RUN_AS_NODE = "1";
  process.env.CLAUDECODE = "1";
  try {
    await fake.run(REQUEST);
  } finally {
    for (const [key, value] of [
      ["ELECTRON_RUN_AS_NODE", saved.run],
      ["CLAUDECODE", saved.nested],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const [{ binary, args, options, cwdEntries }] = fake.spawned;
  assert.equal(binary, "/fake/bin/claude");
  assert.deepEqual(args, agent.buildAgentArgs({ prompt: agent.buildAgentPrompt(REQUEST) }));
  assert.deepEqual(cwdEntries, []);
  assert.ok(path.basename(options.cwd).startsWith("oats-context-agent-"));
  assert.equal(path.dirname(options.cwd), tempRoot);
  assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(options.detached, process.platform !== "win32");
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(options.env.CLAUDECODE, undefined);
  assert.equal(options.env.DISABLE_AUTOUPDATER, "1");
});

test("a start-up event that still lists a denied tool stops the run before it acts", async () => {
  const fake = fakeClaude((child, { write }) => {
    write([{ ...INIT, tools: [...INIT.tools, "Bash"] }]);
    // Anything after the stop must not count.
    setImmediate(() => write([toolUse("mcp__plugin_notion_notion__notion-search")]));
  });
  const progress = [];
  const outcome = await fake.run(REQUEST, { onProgress: (update) => progress.push(update) });
  assert.deepEqual(outcome, { ok: false, reason: "failed" });
  assert.deepEqual(fake.signals[0], "SIGTERM");
  assert.deepEqual(progress, []);
  assert.deepEqual(fake.records, [["url", "context-agent", "https://api.anthropic.com/"]]);
});

test("a run in another permission mode is stopped too", async () => {
  const fake = fakeClaude((child, { write }) => {
    write([{ ...INIT, permissionMode: "bypassPermissions" }]);
  });
  assert.deepEqual(await fake.run(REQUEST), { ok: false, reason: "failed" });
  assert.equal(fake.signals[0], "SIGTERM");
});

test("a result with no start-up event before it is not believed", async () => {
  const fake = fakeClaude((child, { write, exit }) => {
    write([result(JSON.stringify(VERDICT))]);
    exit(0);
  });
  assert.deepEqual(await fake.run(REQUEST), { ok: false, reason: "failed" });
});

test("a run past its time limit is stopped and reported as a timeout", async () => {
  const fake = fakeClaude((child, { write }) => {
    write([INIT, toolUse("mcp__plugin_notion_notion__notion-search")]);
  });
  const outcome = await fake.run(REQUEST, { timeoutMs: 30 });
  assert.deepEqual(outcome, { ok: false, reason: "timeout" });
  assert.equal(fake.signals[0], "SIGTERM");
  assert.deepEqual(leftoverRunDirs(), []);
});

test("an answer that came before the time limit still counts", async () => {
  const fake = fakeClaude((child, { write }) => {
    // Claude Code answers, then hangs instead of exiting.
    write([INIT, result(JSON.stringify(VERDICT))]);
  });
  const outcome = await fake.run(REQUEST, { timeoutMs: 60000 });
  assert.equal(outcome.ok, true, "stopped after the exit wait, not the time limit");
  assert.equal(fake.signals[0], "SIGTERM");
});

test("cancelling stops the run", async () => {
  const controller = new AbortController();
  const fake = fakeClaude((child, { write }) => {
    write([INIT]);
    setImmediate(() => controller.abort());
  });
  const outcome = await fake.run(REQUEST, { signal: controller.signal });
  assert.deepEqual(outcome, { ok: false, reason: "cancelled" });
  assert.equal(fake.signals[0], "SIGTERM");

  const before = fakeClaude(() => assert.fail("nothing starts for a cancelled check"));
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await before.run(REQUEST, { signal: aborted.signal }), {
    ok: false,
    reason: "cancelled",
  });
});

test("an answer that settles nothing is unclear", async () => {
  const unclear = JSON.stringify({
    verdict: "unclear",
    answer: "",
    source: { title: "", url: "" },
  });
  for (const text of [unclear, "I could not find anything.", ""]) {
    const fake = fakeClaude((child, { write, exit }) => {
      write([INIT, result(text)]);
      exit(0);
    });
    assert.deepEqual(await fake.run(REQUEST), { ok: false, reason: "unclear" }, text);
  }
  const outOfTurns = fakeClaude((child, { write, exit }) => {
    write([INIT, result("", { subtype: "error_max_turns", is_error: true })]);
    exit(0);
  });
  assert.deepEqual(await outOfTurns.run(REQUEST), { ok: false, reason: "unclear" });
});

test("an error result, a crash, or no result at all is a failure", async () => {
  const errored = fakeClaude((child, { write, exit }) => {
    write([INIT, result("API Error: 529", { subtype: "error_during_execution", is_error: true })]);
    exit(1);
  });
  assert.deepEqual(await errored.run(REQUEST), { ok: false, reason: "failed" });
  const crashed = fakeClaude((child, { write, exit }) => {
    write([INIT, "{half a line"]);
    exit(1);
  });
  assert.deepEqual(await crashed.run(REQUEST), { ok: false, reason: "failed" });
});

test("lines split across chunks, and a last line with no newline, are read", async () => {
  const verdictLine = JSON.stringify(result(JSON.stringify(VERDICT)));
  const fake = fakeClaude((child, { write, exit }) => {
    const initLine = `${JSON.stringify(INIT)}\n`;
    write([initLine.slice(0, 10), initLine.slice(10)]);
    write([verdictLine.slice(0, 25)]);
    setImmediate(() => {
      write([verdictLine.slice(25)]);
      exit(0);
    });
  });
  assert.equal((await fake.run(REQUEST)).ok, true);
});

test("a request it cannot phrase, or no Claude Code, starts nothing", async () => {
  const fake = fakeClaude(() => assert.fail("nothing starts"));
  assert.deepEqual(await fake.run({ question: "", outcome: "uncertain" }), {
    ok: false,
    reason: "failed",
  });
  assert.deepEqual(await fake.run({ question: "Why?", outcome: "maybe" }), {
    ok: false,
    reason: "failed",
  });
  const missing = runner.createContextAgentRunner({
    findBinary: async () => null,
    spawnProcess: () => assert.fail("nothing starts"),
  });
  assert.deepEqual(await missing.runContextAgent(REQUEST), { ok: false, reason: "not-installed" });
});

test("a binary that is gone when it starts reads as not installed", async () => {
  const gone = runner.createContextAgentRunner({
    findBinary: async () => "/fake/bin/claude",
    tempRoot: () => tempRoot,
    ledger: () => ({ recordUrl: () => assert.fail("it never started"), recordHost() {} }),
    spawnProcess: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      setImmediate(() =>
        child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))
      );
      return child;
    },
  });
  assert.deepEqual(await gone.runContextAgent(REQUEST), { ok: false, reason: "not-installed" });
  assert.deepEqual(leftoverRunDirs(), []);
});

function executable(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}

test("Claude Code is looked for where its installers put it, then in the login shell", async () => {
  const home = fs.mkdtempSync(path.join(tempRoot, "home-"));
  const systemInstall = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"].some((file) =>
    fs.existsSync(file)
  );
  const lookUp = async () => "/from/login/shell/claude";
  assert.equal(await runner.searchClaudeBinary({ env: {}, home, platform: "win32", lookUp }), null);
  if (!systemInstall) {
    assert.equal(
      await runner.searchClaudeBinary({ env: {}, home, platform: "darwin", lookUp }),
      "/from/login/shell/claude"
    );
  }
  // A file that is not executable is passed over.
  fs.mkdirSync(path.join(home, ".claude", "local"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "local", "claude"), "");
  fs.mkdirSync(path.join(home, ".local", "bin"), { recursive: true });
  const native = executable(path.join(home, ".local", "bin"), "claude", "exit 0");
  assert.equal(
    await runner.searchClaudeBinary({ env: {}, home, platform: "darwin", lookUp }),
    native
  );
  const chosen = executable(home, "my-claude", "exit 0");
  assert.equal(
    await runner.searchClaudeBinary({
      env: { OATS_CLAUDE_PATH: chosen },
      home,
      platform: "linux",
      lookUp,
    }),
    chosen
  );
});

test("the login shell's answer counts only as an absolute path to an executable", async () => {
  const dir = fs.mkdtempSync(path.join(tempRoot, "shell-"));
  const claude = executable(dir, "claude", "exit 0");
  const noisy = executable(dir, "noisy-shell", `echo "Welcome back"\necho "${claude}"`);
  assert.equal(await runner.lookUpInLoginShell({ shell: noisy }), claude);
  // `command -v` prints a shell function's name, not a path.
  const fn = executable(dir, "function-shell", "echo claude");
  assert.equal(await runner.lookUpInLoginShell({ shell: fn }), null);
  const failing = executable(dir, "failing-shell", "exit 1");
  assert.equal(await runner.lookUpInLoginShell({ shell: failing }), null);
  const slow = executable(dir, "slow-shell", `sleep 5\necho "${claude}"`);
  assert.equal(await runner.lookUpInLoginShell({ shell: slow, timeoutMs: 200 }), null);
  assert.equal(await runner.lookUpInLoginShell({ shell: "relative-shell" }), null);
});

test("agentStatus reports the version Claude Code prints", async () => {
  const dir = fs.mkdtempSync(path.join(tempRoot, "status-"));
  const saved = process.env.OATS_CLAUDE_PATH;
  try {
    process.env.OATS_CLAUDE_PATH = executable(dir, "claude", 'echo "2.1.302 (Claude Code)"');
    assert.deepEqual(await runner.agentStatus(), {
      available: true,
      path: process.env.OATS_CLAUDE_PATH,
      version: "2.1.302",
    });
    process.env.OATS_CLAUDE_PATH = executable(dir, "broken-claude", "exit 3");
    assert.deepEqual(await runner.agentStatus(), {
      available: false,
      path: process.env.OATS_CLAUDE_PATH,
      version: null,
    });
  } finally {
    if (saved === undefined) delete process.env.OATS_CLAUDE_PATH;
    else process.env.OATS_CLAUDE_PATH = saved;
  }
});
