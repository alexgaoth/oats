// node director/capture.mjs <scene.mjs> <out dir> [--scheme dark]
//
// Runs one scene script against the real Oats renderer in headless Chrome and
// records it: JPEG frames from the screencast (quality 100), plus logs on the
// same clock of every cursor move, click and named cue. assemble.mjs turns the
// frames into a constant-rate clip; the Remotion edit reads the logs to draw a
// smooth cursor and to place captions and camera moves.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./cdp.mjs";

const [scenePath, outDir, ...rest] = process.argv.slice(2);
if (!scenePath || !outDir) {
  console.error("usage: node director/capture.mjs <scene.mjs> <out dir> [--scheme dark]");
  process.exit(1);
}
const scheme = rest.includes("--scheme") ? rest[rest.indexOf("--scheme") + 1] : undefined;
const scene = (await import(pathToFileURL(path.resolve(scenePath)).href)).default;
const viewport = { width: 1440, height: 900, scale: 2, ...scene.viewport };

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "frames"), { recursive: true });

const browser = await launch({ ...viewport, scheme: scheme ?? scene.scheme ?? "light" });
const now = () => Date.now() / 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const log = { cursor: [], cues: [], frames: [] };
let recordingSince = null;
let cursor = { x: viewport.width * 0.62, y: viewport.height * 0.58 };

const director = {
  viewport,
  sleep,
  async goto(url) {
    await browser.page("Page.navigate", { url });
    await director.waitFor("document.readyState === 'complete'");
  },
  wait: sleep,
  async waitFor(expression, timeoutMs = 20000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await browser.evaluate(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(50);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  },
  eval: (expression) => browser.evaluate(expression),
  /** The centre of the first element matching `selector` (or a text match), in CSS pixels. */
  async point(target) {
    if (typeof target === "object") return target;
    const spec = JSON.stringify(target);
    const box = await browser.evaluate(`(() => {
      const spec = ${spec};
      let el = null;
      if (spec.startsWith("text=")) {
        const want = spec.slice(5).trim();
        el = [...document.querySelectorAll("button, a, [role=radio], [role=menuitem], [role=tab], li, h1, h2, h3, span, p, input")]
          .find((node) => node.offsetParent !== null && node.textContent.trim() === want);
      } else {
        el = document.querySelector(spec);
      }
      if (!el) return null;
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!box) throw new Error(`No element for ${target}`);
    return box;
  },
  async moveTo(target, { duration = 650 } = {}) {
    const to = await director.point(target);
    const from = { ...cursor };
    const steps = Math.max(2, Math.round(duration / 16));
    for (let i = 1; i <= steps; i += 1) {
      const t = easeInOut(i / steps);
      cursor = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      await browser.page("Input.dispatchMouseEvent", { type: "mouseMoved", x: cursor.x, y: cursor.y });
      log.cursor.push({ t: now(), x: cursor.x, y: cursor.y, kind: "move" });
      await sleep(duration / steps);
    }
    return to;
  },
  async click(target, options = {}) {
    if (target) await director.moveTo(target, options);
    const at = { x: cursor.x, y: cursor.y, button: "left", clickCount: 1 };
    log.cursor.push({ t: now(), ...cursor, kind: "down" });
    await browser.page("Input.dispatchMouseEvent", { type: "mousePressed", ...at });
    await sleep(70);
    await browser.page("Input.dispatchMouseEvent", { type: "mouseReleased", ...at });
    log.cursor.push({ t: now(), ...cursor, kind: "up" });
  },
  async type(text, { perChar = 55 } = {}) {
    for (const char of text) {
      await browser.page("Input.insertText", { text: char });
      await sleep(perChar + Math.random() * perChar * 0.6);
    }
  },
  async key(key, { meta = false, shift = false } = {}) {
    const modifiers = (meta ? 4 : 0) | (shift ? 8 : 0);
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    const base = { key, code, modifiers, windowsVirtualKeyCode: key === "Escape" ? 27 : key.toUpperCase().charCodeAt(0) };
    await browser.page("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await browser.page("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    log.cues.push({ t: now(), name: `key:${meta ? "⌘" : ""}${key}` });
  },
  /** A named moment for the edit: a caption start, a camera move, a cut. */
  cue(name, extra = {}) {
    log.cues.push({ t: now(), name, ...extra });
  },
  /** Record the screencast while `body` runs. */
  async record(body) {
    let frameIndex = 0;
    const writes = [];
    const stop = browser.on("Page.screencastFrame", (params) => {
      const file = `${String(frameIndex++).padStart(6, "0")}.jpg`;
      log.frames.push({ t: params.metadata.timestamp, file });
      writes.push(fs.promises.writeFile(path.join(outDir, "frames", file), Buffer.from(params.data, "base64")));
      browser.page("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
    });
    await browser.page("Page.startScreencast", {
      format: "jpeg",
      quality: 100,
      everyNthFrame: 1,
      maxWidth: viewport.width * viewport.scale,
      maxHeight: viewport.height * viewport.scale,
    });
    recordingSince = now();
    log.cues.push({ t: recordingSince, name: "start" });
    // A first paint for the clip's opening frame.
    await browser.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    try {
      await body();
    } finally {
      log.cues.push({ t: now(), name: "end" });
      await sleep(250);
      await browser.page("Page.stopScreencast");
      stop();
      await Promise.all(writes);
    }
  },
};

try {
  if (scene.url) await director.goto(scene.url);
  await scene.run(director);
} finally {
  const start = recordingSince ?? log.frames[0]?.t ?? now();
  const rel = (entries) => entries.map((entry) => ({ ...entry, t: Math.round((entry.t - start) * 1000) }));
  fs.writeFileSync(
    path.join(outDir, "capture.json"),
    JSON.stringify(
      {
        scene: path.basename(scenePath),
        viewport,
        scheme: scheme ?? scene.scheme ?? "light",
        frames: rel(log.frames),
        cursor: rel(log.cursor),
        cues: rel(log.cues),
      },
      null,
      1
    )
  );
  browser.close();
  console.log(`${log.frames.length} frames, ${log.cursor.length} cursor points, ${log.cues.length} cues -> ${outDir}`);
}
