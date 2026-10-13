#!/usr/bin/env node
// Screenshots of the demo harness, as 2x PNGs, light and dark: headless Chrome
// driven over the DevTools protocol with Node's own WebSocket, so nothing is
// installed for it. Start the harness first (`npm run demo:harness`).
//
//   node demo/capture.mjs --out ~/oats-screens
//   node demo/capture.mjs --out ~/oats-screens --only home,global --themes dark
//
//   --url <origin>    the harness (default http://127.0.0.1:5391)
//   --out <dir>       where the PNGs go (required)
//   --chrome <path>   Chrome or Chromium (default: CHROME_PATH, then the macOS app)
//   --only a,b        shot names (see SHOTS below)
//   --themes a,b      light, dark (default both)
//   --size WxH        the window, in CSS pixels (default 1440x900)
//   --scale n         device pixel ratio (default 2)
//
// Chrome runs with a throwaway profile in the system temp directory. The
// harness never asks for a microphone, so no permission is ever involved.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SHOTS = [
  { name: "home", query: "", script: "" },
  // Nothing recorded yet: the offer of the example, then the example opened.
  { name: "first-run", query: "profile=empty", script: "" },
  {
    name: "first-run-conversations",
    query: "profile=empty",
    script: "await oatsDemo.show('conversations')",
  },
  {
    name: "example-opened",
    query: "profile=empty",
    script: "await demo.press('Open an example conversation'); await demo.wait(600)",
  },
  {
    name: "live-calm-lanes",
    query: "demo=live&from=560&end=hold&view=calm",
    script: "await demo.untilSeconds(563)",
  },
  {
    name: "live-calm-graph",
    query: "demo=live&from=1062&end=hold&view=calm&flow=graph",
    script: "await demo.untilSeconds(1066)",
  },
  {
    name: "live-words",
    query: "demo=live&from=1452&end=hold&view=words",
    script: "await demo.untilSeconds(1457)",
  },
  { name: "reading-summary", query: "", script: "await oatsDemo.open()" },
  {
    name: "reading-outcomes",
    query: "",
    script:
      "await oatsDemo.open(); await demo.press('Show the answers'); await demo.scrollTo('What this left open')",
  },
  {
    name: "reading-threads",
    query: "",
    script: "await oatsDemo.open(); await demo.scrollTo('Threads')",
  },
  {
    name: "reading-transcript",
    query: "",
    script:
      "await oatsDemo.open(undefined, { tab: 'transcript' }); await demo.scrollTo('Summary', 'tab')",
  },
  {
    name: "reading-connections",
    query: "",
    script:
      "await oatsDemo.open(undefined, { tab: 'connections' }); await demo.scrollTo('Summary', 'tab'); await demo.wait(2500)",
  },
  { name: "conversations", query: "", script: "await oatsDemo.show('conversations')" },
  { name: "global", query: "", script: "await oatsDemo.show('global'); await demo.wait(1500)" },
  {
    // Pointing at the newest conversation lights it in both charts.
    name: "global-highlight",
    query: "",
    script:
      "await oatsDemo.show('global'); await demo.wait(1500); await demo.point(oatsDemo.samples()[0].id)",
  },
  {
    name: "global-many",
    query: "profile=many",
    script: "await oatsDemo.show('global'); await demo.wait(2500)",
  },
];

// Page helpers, evaluated in the page before each shot's script.
const PAGE_HELPERS = `
window.demo = {
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  async untilSeconds(seconds) {
    const until = performance.now() + 60000;
    while (!(oatsDemo.status().phase === "recording" && oatsDemo.status().seconds >= seconds)) {
      if (performance.now() > until) throw new Error("the replay did not reach " + seconds + "s");
      await demo.wait(100);
    }
  },
  async press(label) {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
    button?.click();
    button?.blur();
    await demo.wait(300);
  },
  // Point at a conversation on the Global conversations board, as the pointer
  // would (oatsDemo.point, in the harness).
  async point(id) {
    await oatsDemo.point(id);
    await demo.wait(200);
  },
  async scrollTo(text, role) {
    const candidates = role
      ? [...document.querySelectorAll('[role="' + role + '"]')]
      : [...document.querySelectorAll("h1, h2, h3, h4, [data-slot='card-title'], div, p, span")];
    const target = candidates.find((element) => element.textContent.trim() === text);
    target?.scrollIntoView({ block: "start", behavior: "instant" });
    const scroller = target?.closest(".overflow-y-auto");
    if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollTop - 24);
    await demo.wait(300);
  },
};
`;

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:5391",
    out: null,
    chrome:
      process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    only: null,
    themes: ["light", "dark"],
    width: 1440,
    height: 900,
    scale: 2,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split("=");
    const value = () => inline ?? argv[(index += 1)];
    if (flag === "--url") args.url = value().replace(/\/$/, "");
    else if (flag === "--out") args.out = value();
    else if (flag === "--chrome") args.chrome = value();
    else if (flag === "--only") args.only = value().split(",");
    else if (flag === "--themes") args.themes = value().split(",");
    else if (flag === "--scale") args.scale = Number(value());
    else if (flag === "--size") [args.width, args.height] = value().split("x").map(Number);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!args.out) throw new Error("pass --out <dir>");
  args.out = args.out.replace(/^~(?=$|\/)/, os.homedir());
  return args;
}

function launchChrome(chrome, profile) {
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--password-store=basic",
      "--hide-scrollbars",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
      "--deny-permission-prompts",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${log}`)), 20000);
    child.stderr.on("data", (chunk) => {
      log += chunk;
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (found) {
        clearTimeout(timer);
        resolve({ child, endpoint: found[1] });
      }
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited (${code}):\n${log}`)));
  });
}

function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  let nextId = 1;
  const pending = new Map();
  const waiters = [];
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
      return;
    }
    for (const waiter of [...waiters]) {
      if (waiter.method === data.method && waiter.sessionId === data.sessionId) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(data.params);
      }
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const once = (method, sessionId) =>
    new Promise((resolve) => waiters.push({ method, sessionId, resolve }));
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve({ send, once, close: () => socket.close() }));
    socket.addEventListener("error", reject);
  });
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oats-capture-"));
  const { child, endpoint } = await launchChrome(args.chrome, profile);
  const cdp = await connect(endpoint);
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: args.width, height: args.height, deviceScaleFactor: args.scale, mobile: false },
      sessionId
    );
    const shots = SHOTS.filter((shot) => !args.only || args.only.includes(shot.name));
    for (const theme of args.themes) {
      await cdp.send(
        "Emulation.setEmulatedMedia",
        { features: [{ name: "prefers-color-scheme", value: theme }] },
        sessionId
      );
      for (const shot of shots) {
        const query = ["panel=true", `theme=${theme}`, shot.query].filter(Boolean).join("&");
        const loaded = cdp.once("Page.loadEventFired", sessionId);
        await cdp.send("Page.navigate", { url: `${args.url}/demo.html?${query}` }, sessionId);
        await loaded;
        await evaluate(
          cdp,
          sessionId,
          `(async () => {
            const until = performance.now() + 20000;
            while (!(window.oatsDemo && document.querySelector("main[data-active='true'] section"))) {
              if (performance.now() > until) throw new Error("the app did not render");
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await new Promise((resolve) => setTimeout(resolve, 800));
          })()`
        );
        await evaluate(cdp, sessionId, PAGE_HELPERS);
        if (shot.script) await evaluate(cdp, sessionId, `(async () => { ${shot.script}; })()`);
        // The surfaces cross-fade, and the live contour redraws once a second.
        await evaluate(cdp, sessionId, "new Promise((resolve) => setTimeout(resolve, 1600))");
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
        const file = path.join(args.out, `${shot.name}-${theme}.png`);
        fs.writeFileSync(file, Buffer.from(data, "base64"));
        console.log(file);
      }
    }
  } finally {
    cdp.close();
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome can still be closing files; the system cleans its temp directory.
    }
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
