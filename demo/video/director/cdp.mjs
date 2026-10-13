// A small Chrome DevTools Protocol client: one headless Chrome per run, one
// page, real input events. No dependencies: Node 24 has WebSocket built in.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch({ width = 1440, height = 900, scale = 2, scheme = "light", flags = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oats-director-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--force-color-profile=srgb",
      `--window-size=${width},${height}`,
      // The screencast sends the compositor's own frames, which follow the
      // window's scale, not the page emulation's; this makes them 2x.
      `--force-device-scale-factor=${scale}`,
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      ...flags,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    chrome.on("exit", () => reject(new Error("Chrome exited before DevTools was ready")));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  await page("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });

  const on = (method, handler) => {
    const listener = (message) => {
      if (message.method === method && message.sessionId === sessionId) handler(message.params);
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const evaluate = async (expression) => {
    const result = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };

  const close = () => {
    try {
      ws.close();
    } catch {}
    try {
      process.kill(chrome.pid, "SIGKILL");
    } catch {}
    for (let i = 0; i < 5; i += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        return;
      } catch {}
    }
  };

  return { page, on, evaluate, close, width, height, scale };
}
