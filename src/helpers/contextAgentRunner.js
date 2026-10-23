// Runs the context agent: the user's own Claude Code, headless, reading GitHub,
// Linear, Notion and Slack through the connections Claude Code already has.
// What it is asked, the limits it runs under and how its output is read are in
// contextAgent.mjs; this file finds Claude Code, starts it, watches it and
// stops it.
//
// Three choices here are deliberate:
//
// - Claude Code is found where its installers put it, then through the user's
//   login shell. An app opened from the Dock has a short PATH (main.js
//   `setupProductionPath` adds only the Homebrew and /usr/local directories),
//   and the native installer puts `claude` in ~/.local/bin.
// - The run starts in its own process group, so a timeout or a cancel stops
//   Claude Code and the MCP servers it started together. It is not registered
//   with the sidecar reaper: the reaper matches a pid it finds after a crash
//   against a command fragment, and a fragment as short as "claude" would also
//   match the user's own Claude Code session when a pid is reused.
// - A child process passes none of the hooks in networkLedger.js, so the run
//   records itself: one request to Anthropic's API when it starts, and one for
//   each connected service it reads from.

const { spawn, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const debugLogger = require("./debugLogger");
const { getNetworkLedger } = require("./networkLedger");
const { getSafeTempDir } = require("./safeTempDir");
const { killProcessGroup } = require("../utils/process");

/** Where Claude Code sends the model requests a run makes. */
const ANTHROPIC_API_URL = "https://api.anthropic.com/";

/** The ledger's name for requests a context check made. */
const LEDGER_SOURCE = "context-agent";

const DEFAULT_TIMEOUT_MS = 90000;
const VERSION_TIMEOUT_MS = 5000;
const SHELL_LOOKUP_TIMEOUT_MS = 3000;
// How long Claude Code gets to stop on SIGTERM before the group is killed.
const KILL_GRACE_MS = 2000;
// How long Claude Code gets to exit by itself once it has answered.
const EXIT_WAIT_MS = 5000;
// A missing Claude Code is looked for again after this long, so installing it
// while Oats runs works without a restart, and a check does not wait on the
// login shell every time.
const NOT_FOUND_RETRY_MS = 30000;
// One stream-json line carries at most one tool result; a longer one is not
// read, and the buffer must not grow without bound.
const MAX_LINE_CHARS = 16 * 1024 * 1024;

/**
 * @param {string} file
 * @returns {boolean} an absolute path to an executable regular file
 */
function isExecutableFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) return false;
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks the user's login shell where `claude` is: their profile is where a
 * custom install puts it on PATH. Only an absolute path to an executable is
 * believed, so a shell function or alias named `claude` (which `command -v`
 * prints by name) is ignored, as is anything a profile prints first.
 *
 * @param {{ shell?: string, timeoutMs?: number }} [options]
 * @returns {Promise<string | null>}
 */
function lookUpInLoginShell({
  shell = process.env.SHELL,
  timeoutMs = SHELL_LOOKUP_TIMEOUT_MS,
} = {}) {
  if (!shell || !path.isAbsolute(shell)) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      shell,
      ["-lc", "command -v claude"],
      { timeout: timeoutMs, encoding: "utf8", windowsHide: true, env: agentEnv() },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const last = String(stdout)
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .pop();
        resolve(last && isExecutableFile(last) ? last : null);
      }
    );
  });
}

/**
 * Where Claude Code is, searched in order: `OATS_CLAUDE_PATH`, the native
 * installer's ~/.local/bin, the old npm-local ~/.claude/local, Homebrew, and
 * /usr/local/bin, then the login shell. Not on Windows: the guard hook is a
 * POSIX sh command, and a check that cannot be guarded does not run.
 *
 * @param {{ env?: NodeJS.ProcessEnv, home?: string, platform?: string,
 *   lookUp?: () => Promise<string | null> }} [options]
 * @returns {Promise<string | null>}
 */
async function searchClaudeBinary({
  env = process.env,
  home = os.homedir(),
  platform = process.platform,
  lookUp = lookUpInLoginShell,
} = {}) {
  if (platform === "win32") return null;
  const candidates = [
    env.OATS_CLAUDE_PATH,
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  const found = candidates.find((candidate) => isExecutableFile(candidate));
  if (found) return found;
  return lookUp();
}

let cachedBinary = null;
let notFoundAt = 0;
let searching = null;

/**
 * `searchClaudeBinary()`, remembered. A found path is kept while it still
 * exists; a miss is kept for 30 seconds.
 *
 * @returns {Promise<string | null>}
 */
async function findClaudeBinary() {
  if (process.env.OATS_CLAUDE_PATH && isExecutableFile(process.env.OATS_CLAUDE_PATH)) {
    return process.env.OATS_CLAUDE_PATH;
  }
  if (cachedBinary && isExecutableFile(cachedBinary)) return cachedBinary;
  if (!cachedBinary && notFoundAt && Date.now() - notFoundAt < NOT_FOUND_RETRY_MS) return null;
  searching ??= searchClaudeBinary().finally(() => {
    searching = null;
  });
  const found = await searching;
  cachedBinary = found;
  notFoundAt = found ? 0 : Date.now();
  return found;
}

/** Forget a remembered path, after it failed to start. */
function forgetClaudeBinary() {
  cachedBinary = null;
  notFoundAt = 0;
}

/**
 * The environment Claude Code runs with: Oats's own, less two variables that
 * would change what starts. `ELECTRON_RUN_AS_NODE` makes an Electron binary act
 * as Node; `CLAUDECODE` is how a Claude Code session marks its children, and
 * Claude Code refuses to start a nested session under it (an Oats started from
 * a Claude Code terminal). The auto-updater is off for the run: a context check
 * should not update the user's tools.
 *
 * @returns {NodeJS.ProcessEnv}
 */
function agentEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CLAUDECODE;
  env.DISABLE_AUTOUPDATER = "1";
  return env;
}

/**
 * @param {string} binary
 * @returns {Promise<string | null>} e.g. "2.1.302", or null when it did not run
 */
function readVersion(binary) {
  return new Promise((resolve) => {
    execFile(
      binary,
      ["--version"],
      { timeout: VERSION_TIMEOUT_MS, encoding: "utf8", windowsHide: true, env: agentEnv() },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const text = String(stdout).trim();
        resolve(text.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? (text || null));
      }
    );
  });
}

/**
 * Whether a context check can run: Claude Code is found and answers
 * `--version`.
 *
 * @returns {Promise<{ available: boolean, path: string | null, version: string | null }>}
 */
async function agentStatus() {
  const binary = await findClaudeBinary();
  if (!binary) return { available: false, path: null, version: null };
  const version = await readVersion(binary);
  return { available: version !== null, path: binary, version };
}

let agentHelpers = null;
const loadAgentHelpers = () => (agentHelpers ??= import("./contextAgent.mjs"));

/**
 * @typedef {{ verdict: "right" | "wrong" | "answer", answer: string,
 *   source: { title: string, url: string }, quote: string }} AgentVerdict
 * @typedef {{ ok: true, verdict: AgentVerdict, sources: string[] }
 *   | { ok: false, reason: "not-installed" | "timeout" | "failed" | "unclear" | "cancelled" }} AgentResult
 */

/**
 * A runner with its process, binary, ledger and waits supplied, so the tests
 * can run it against a fake Claude Code.
 */
function createContextAgentRunner({
  spawnProcess = spawn,
  findBinary = findClaudeBinary,
  ledger = getNetworkLedger,
  tempRoot = getSafeTempDir,
  killGroup = killProcessGroup,
  exitWaitMs = EXIT_WAIT_MS,
} = {}) {
  /**
   * One context check: start Claude Code in a fresh, empty directory, read its
   * events as they come, and resolve with the verdict or the reason there is
   * none. `onProgress` hears the services the agent is reading, in the order
   * it first reads each.
   *
   * @param {{ question: string, reply?: string, outcome: "uncertain" | "denied" }} request
   * @param {{ onProgress?: (progress: { sources: string[] }) => void, timeoutMs?: number,
   *   signal?: AbortSignal }} [options]
   * @returns {Promise<AgentResult>}
   */
  async function runContextAgent(
    request,
    { onProgress, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}
  ) {
    const agent = await loadAgentHelpers();
    const outcome = request?.outcome;
    const prompt = agent.buildAgentPrompt({
      question: request?.question,
      reply: request?.reply,
      outcome,
    });
    if (!prompt) return { ok: false, reason: "failed" };
    const binary = await findBinary();
    if (!binary) return { ok: false, reason: "not-installed" };
    if (signal?.aborted) return { ok: false, reason: "cancelled" };

    let cwd;
    try {
      cwd = fs.mkdtempSync(path.join(tempRoot(), "oats-context-agent-"));
    } catch (error) {
      debugLogger.warn("Context agent: no temp directory", { error: error.message }, "context");
      return { ok: false, reason: "failed" };
    }
    try {
      return await runIn(cwd, { agent, binary, prompt, outcome, onProgress, timeoutMs, signal });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }

  function runIn(cwd, { agent, binary, prompt, outcome, onProgress, timeoutMs, signal }) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let child;
      try {
        child = spawnProcess(binary, agent.buildAgentArgs({ prompt }), {
          cwd,
          env: agentEnv(),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        });
      } catch (error) {
        debugLogger.warn("Context agent did not start", { error: error.message }, "context");
        resolve({ ok: false, reason: "failed" });
        return;
      }

      const sources = [];
      const readServers = new Set();
      let buffer = "";
      let stderrTail = "";
      let initChecked = false;
      let result = null;
      let stopReason = null;
      let settled = false;
      let timer = null;
      let killTimer = null;
      let onAbort = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        if (onAbort) signal?.removeEventListener?.("abort", onAbort);
        debugLogger.info(
          "Context agent finished",
          {
            ok: value.ok,
            reason: value.reason,
            sources,
            seconds: Math.round((Date.now() - startedAt) / 100) / 10,
          },
          "context"
        );
        resolve(value);
      };

      const stop = (reason) => {
        if (stopReason) return;
        stopReason = reason;
        killGroup(child, "SIGTERM");
        killTimer = setTimeout(() => killGroup(child, "SIGKILL"), KILL_GRACE_MS);
      };

      const handleLine = (line) => {
        // Once a run is being stopped, nothing more it says counts.
        if (stopReason || !line.trim()) return;
        for (const event of agent.parseStreamLineAll(line)) {
          if (event.kind === "init") {
            // The limits are command-line flags and settings; a Claude Code that
            // ignored them says so here, before the model has done anything.
            const unsafe = agent.unsafeTools(event.tools);
            const mode = event.permissionMode;
            if (unsafe.length > 0 || (mode !== null && mode !== "dontAsk")) {
              debugLogger.warn(
                "Context agent stopped: its tool limits did not apply",
                { unsafe, permissionMode: mode },
                "context"
              );
              stop("unsafe");
              return;
            }
            initChecked = true;
            debugLogger.debug(
              "Context agent started",
              { servers: event.servers.map(({ name, status }) => `${name}:${status}`) },
              "context"
            );
          } else if (event.kind === "tool") {
            // Only a call the guard lets through reaches a service.
            if (!event.server || agent.agentToolDecision(event.name) !== "allow") continue;
            if (readServers.has(event.server)) continue;
            readServers.add(event.server);
            ledger().recordHost(LEDGER_SOURCE, event.server);
            const label = agent.serverLabel(event.server);
            if (!sources.includes(label)) {
              sources.push(label);
              try {
                onProgress?.({ sources: [...sources] });
              } catch {
                // A listener that throws must not stop the check.
              }
            }
          } else if (event.kind === "result") {
            result = event;
            // The answer is in. Claude Code exits on its own a moment later;
            // one that lingers is stopped rather than timed out.
            clearTimeout(timer);
            timer = setTimeout(() => stop("lingered"), exitWaitMs);
          }
        }
      };

      child.once("spawn", () => {
        // Claude Code calls the model as soon as it starts.
        ledger().recordUrl(LEDGER_SOURCE, ANTHROPIC_API_URL);
      });

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          handleLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
        if (buffer.length > MAX_LINE_CHARS) buffer = "";
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderrTail = (stderrTail + chunk).slice(-2000);
      });

      timer = setTimeout(() => stop("timeout"), timeoutMs);
      onAbort = () => stop("cancelled");
      signal?.addEventListener?.("abort", onAbort, { once: true });

      child.on("error", (error) => {
        debugLogger.warn("Context agent failed to run", { error: error.message }, "context");
        if (error.code === "ENOENT") forgetClaudeBinary();
        finish({ ok: false, reason: error.code === "ENOENT" ? "not-installed" : "failed" });
      });

      child.on("close", (code) => {
        handleLine(buffer);
        buffer = "";
        if (stopReason === "cancelled") {
          finish({ ok: false, reason: "cancelled" });
        } else if (stopReason === "unsafe") {
          finish({ ok: false, reason: "failed" });
        } else if (!result && stopReason === "timeout") {
          finish({ ok: false, reason: "timeout" });
        } else if (!result || !initChecked) {
          debugLogger.warn(
            "Context agent ended without a result",
            { code, initChecked, stderr: stderrTail.trim() },
            "context"
          );
          finish({ ok: false, reason: "failed" });
        } else if (result.isError) {
          // Running out of turns is a search that found nothing settled.
          finish({
            ok: false,
            reason: result.subtype === "error_max_turns" ? "unclear" : "failed",
          });
        } else {
          const verdict = agent.parseAgentVerdict(result.text, { outcome });
          finish(
            verdict
              ? { ok: true, verdict, sources: [...sources] }
              : { ok: false, reason: "unclear" }
          );
        }
      });
    });
  }

  return { runContextAgent };
}

const { runContextAgent } = createContextAgentRunner();

module.exports = {
  ANTHROPIC_API_URL,
  LEDGER_SOURCE,
  agentEnv,
  agentStatus,
  createContextAgentRunner,
  findClaudeBinary,
  lookUpInLoginShell,
  runContextAgent,
  searchClaudeBinary,
};
