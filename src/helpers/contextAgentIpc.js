// The context agent's IPC channels. contextAgentRunner.js runs the agent;
// these let the renderer ask for a check, follow it and stop it.
//
// - `context-agent-status` → `{ available, path, version }`
// - `context-agent-check` `{ checkId, question, reply, outcome }` → the result.
//   While it runs, `context-agent-progress` carries `{ checkId, sources }`: the
//   services the agent has read so far ("Notion", "Slack").
// - `context-agent-cancel` `checkId` → stops that run.
//
// The renderer decides whether a check runs at all (it is off by default).
// Main runs at most two at a time, because each one is a whole Claude Code
// process; a third is answered `busy` at once rather than queued behind them.

const debugLogger = require("./debugLogger");
const sidecarRegistry = require("./sidecarRegistry");

const MAX_RUNNING = 2;
const OUTCOMES = new Set(["uncertain", "denied"]);

const isCheckId = (value) =>
  (typeof value === "string" && value.length > 0 && value.length <= 200) ||
  Number.isSafeInteger(value);

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ runner?: { agentStatus: Function, runContextAgent: Function },
 *   registry?: { register: Function } }} [options] the runner and the quit-time
 *   registry, replaceable for tests
 */
function registerContextAgentIpc(ipcMain, { runner, registry = sidecarRegistry } = {}) {
  const agent = runner ?? require("./contextAgentRunner");
  /** @type {Map<string | number, { controller: AbortController, promise: Promise<object> }>} */
  const running = new Map();

  ipcMain.handle("context-agent-status", () => agent.agentStatus());

  ipcMain.handle("context-agent-check", (event, request) => {
    const checkId = request?.checkId;
    if (
      !isCheckId(checkId) ||
      typeof request?.question !== "string" ||
      !OUTCOMES.has(request?.outcome)
    ) {
      return { ok: false, reason: "failed" };
    }
    // The same check asked twice is the same run.
    const existing = running.get(checkId);
    if (existing) return existing.promise;
    if (running.size >= MAX_RUNNING) return { ok: false, reason: "busy" };

    const controller = new AbortController();
    const sender = event?.sender;
    // A window that closes or reloads mid-check will never read the answer.
    const onDestroyed = () => controller.abort();
    sender?.once?.("destroyed", onDestroyed);
    const onProgress = ({ sources }) => {
      if (!sender || sender.isDestroyed?.()) return;
      try {
        sender.send("context-agent-progress", { checkId, sources });
      } catch {
        // The window went away between the check and the send.
      }
    };

    const promise = Promise.resolve()
      .then(() =>
        agent.runContextAgent(
          {
            question: request.question,
            reply: typeof request.reply === "string" ? request.reply : "",
            outcome: request.outcome,
          },
          { signal: controller.signal, onProgress }
        )
      )
      .catch((error) => {
        debugLogger.warn("Context agent check failed", { error: error?.message }, "context");
        return { ok: false, reason: "failed" };
      })
      .finally(() => {
        running.delete(checkId);
        sender?.removeListener?.("destroyed", onDestroyed);
      });
    running.set(checkId, { controller, promise });
    return promise;
  });

  ipcMain.handle("context-agent-cancel", (_event, checkId) => {
    const run = running.get(checkId);
    if (!run) return { success: false };
    run.controller.abort();
    return { success: true };
  });

  // Quitting stops every run and waits for it, inside the registry's deadline.
  registry.register("context-agent", async () => {
    const runs = [...running.values()];
    for (const run of runs) run.controller.abort();
    await Promise.allSettled(runs.map((run) => run.promise));
  });
}

module.exports = { MAX_RUNNING, registerContextAgentIpc };
