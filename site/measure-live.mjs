// Measures how tall each live figure is at every width and writes the table
// of reserved heights in site/assets/site.css (between the `live-heights`
// markers), so a figure is its component's height from the first paint and
// nothing moves when the component arrives.
//
//   npm run build:site && node site/measure-live.mjs          # print the table
//   node site/measure-live.mjs --write                         # and write it
//
// Run it again after a change to a live figure's components. It serves site/
// itself and drives the system Chrome headless over the DevTools protocol, as
// demo/capture.mjs does (CHROME_PATH or --chrome to use another).
//
// Each figure is measured at rest: the replays at their end, every topic in
// its lane; the question cards settled, with their Replay. Between two
// measured widths a range takes the taller of the two, so a figure is never
// taller than its box.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SLOTS = { map: ["hero", "map"], topics: ["topics"], questions: ["questions"], after: ["after"] };
// Between the page's own breakpoints a wider window only gives a figure more
// room, so it is never taller than at the narrow end of a range; the first
// width past each breakpoint (641, 901) is measured, where a figure can jump
// taller as its column narrows.
const BREAKPOINTS = [641, 901];
const WIDTHS = [
  ...Array.from({ length: 39 }, (_, index) => 320 + index * 10), // 320 to 700
  ...Array.from({ length: 26 }, (_, index) => 700 + (index + 1) * 20), // 720 to 1220
  1440,
  ...BREAKPOINTS,
].sort((a, b) => a - b);

const args = process.argv.slice(2);
const chromeAt = args.indexOf("--chrome");
const chrome =
  chromeAt >= 0
    ? args[chromeAt + 1]
    : process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".mp4": "video/mp4", ".json": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    let file = path.join(here, decodeURIComponent(pathname));
    if (pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(here) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oats-measure-"));
  const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let log = "";
    child.stderr.on("data", (chunk) => {
      log += chunk;
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (found) resolve(found[1]);
    });
    child.on("exit", (code) => reject(new Error(`Chrome exited (${code}):\n${log}`)));
  });
  const socket = new WebSocket(endpoint);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, (data) => (data.error ? reject(new Error(data.error.message)) : resolve(data.result)));
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, close: () => (socket.close(), child.kill()) };
}

// At one width: the figures brought on screen and measured once drawn.
const measure = (selector) => `(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const out = {};
  for (const figure of document.querySelectorAll(${JSON.stringify(selector)})) {
    figure.scrollIntoView({ block: "center", behavior: "instant" });
    const until = performance.now() + 15000;
    while (figure.dataset.live !== "ready" && performance.now() < until) await wait(50);
    // With motion on the question cards settle 2.2 s after they are seen.
    await wait(figure.dataset.liveSlot === "questions" && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 2600 : 150);
    const root = figure.querySelector(".live-host")?.shadowRoot?.querySelector(".live-root");
    out[figure.dataset.liveSlot] = root ? Math.ceil(root.getBoundingClientRect().height) : null;
  }
  return out;
})()`;

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const cdp = await launch();
const measured = [];
const run = (sessionId, expression) =>
  cdp
    .send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)
    .then((result) => result.result.value);
const load = async (sessionId, reduce) => {
  const value = reduce ? "reduce" : "no-preference";
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] }, sessionId);
  await cdp.send("Page.navigate", { url: `${origin}/` }, sessionId);
  await new Promise((resolve) => setTimeout(resolve, 600));
};
try {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  const size = (width) =>
    cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  // With motion on the question cards carry Replay, the same height at any
  // width: measured once, and added to every width's settled cards.
  await size(1200);
  await load(sessionId, false);
  const moving = await run(sessionId, measure('[data-live-slot="questions"]'));
  await load(sessionId, true);
  const settled = await run(sessionId, measure('[data-live-slot="questions"]'));
  const replayRoom = moving.questions - settled.questions;
  // Each width at rest under reduced motion: the replays end on the finished map.
  for (const width of WIDTHS) {
    await size(width);
    await load(sessionId, true);
    const still = await run(sessionId, measure("[data-live-slot]"));
    const row = {
      width,
      map: Math.max(still.hero, still.map),
      topics: still.topics,
      questions: still.questions + replayRoom,
      after: still.after,
    };
    measured.push(row);
    process.stderr.write(`${width}: ${JSON.stringify(row)}\n`);
  }
} finally {
  cdp.close();
  server.close();
}
measured.sort((a, b) => a.width - b.width);

// Ranges between measured widths take the taller of their two ends.
const ranges = measured.map((row, index) => {
  const next = measured[index + 1] ?? row;
  return Object.fromEntries(
    Object.keys(SLOTS).map((slot) => [slot, Math.max(row[slot], next[slot])])
  );
});
const lines = [];
let last = {};
for (const [index, range] of ranges.entries()) {
  const changed = Object.keys(SLOTS).filter((slot) => range[slot] !== last[slot]);
  if (!changed.length) continue;
  const decls = changed.map((slot) => `--live-${slot}: ${range[slot]}px;`).join(" ");
  lines.push(index === 0 ? `  :root { ${decls} }` : `  @media (min-width: ${measured[index].width}px) { :root { ${decls} } }`);
  last = range;
}
const table = lines.join("\n");
console.log(table);

if (args.includes("--write")) {
  const file = path.join(here, "assets/site.css");
  const css = fs.readFileSync(file, "utf8");
  const start = css.indexOf("  /* live-heights:start */");
  const end = css.indexOf("  /* live-heights:end */");
  if (start < 0 || end < 0) throw new Error("site.css has no live-heights markers");
  fs.writeFileSync(file, `${css.slice(0, start)}  /* live-heights:start */\n${table}\n${css.slice(end)}`);
  console.error("written: site/assets/site.css");
}
