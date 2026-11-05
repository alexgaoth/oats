// Apple's on-device system model, through track Y's command line bridge
// (~/oats-asr-cache/fidelity-2/fm-bridge, Foundation Models). No key, no
// download, nothing leaves the computer. Run a batch under the GPU lock.
//
// `serve` reads one JSON object a line and answers one line each, in order.
// Each request is a new session. The context is 8,192 tokens on macOS 27.0.1,
// and 4,096 when back-deployed on macOS 26.0 to 26.3.

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

const BINARY = path.join(os.homedir(), "oats-asr-cache", "fidelity-2", "fm-bridge", "bin", "fm-bridge");

/**
 * @returns {{ ask: (request: { system: string, user: string, schema?: object, maxTokens?: number }) =>
 *   Promise<{ ok: boolean, text?: string, error?: string, ms: number, cost: number, usage?: object }>,
 *   close: () => void }} `schema` is in the bridge's subset of JSON Schema.
 */
export function fmBridge() {
  const child = spawn(BINARY, ["serve"], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  lines.on("line", (line) => waiting.shift()?.(line));
  let serial = 0;
  return {
    ask: ({ system, user, schema, maxTokens = 1500 }) =>
      new Promise((resolve) => {
        serial += 1;
        const started = performance.now();
        waiting.push((line) => {
          const reply = JSON.parse(line);
          const ms = reply.ms ?? performance.now() - started;
          resolve(
            reply.ok
              ? { ok: true, text: reply.text, ms, cost: 0, usage: { input: reply.inputTokens } }
              : { ok: false, error: `${reply.error}: ${reply.detail ?? ""}`, ms, cost: 0 }
          );
        });
        child.stdin.write(
          `${JSON.stringify({
            id: String(serial),
            system,
            prompt: user,
            temperature: 0,
            maxTokens,
            greedy: true,
            ...(schema ? { schema } : {}),
          })}\n`
        );
      }),
    close: () => child.stdin.end(),
  };
}
