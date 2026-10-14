// node director/capture.mjs <scene.mjs> <out dir> [--scheme dark]
//
// Runs one scene script against the real Oats renderer in headless Chrome and
// records it: JPEG frames from the screencast (quality 100), plus logs on the
// same clock of every cursor move, click and named cue. assemble.mjs turns the
// frames into a constant-rate clip; the Remotion edit reads the logs to draw a
// smooth cursor and to place camera moves.
//
// Slow motion: the page runs `slow` times slower than real time while it is
// filmed (its clocks, timers, frames and CSS animations), and every log is
// written in the page's time. The screencast drops frames when the page is
// heavy or the Mac is busy (a 2x frame of a text-heavy view is about 700 KB),
// and each dropped frame was a hitch in a glide or a scroll. Filmed at half
// speed, 30 frames a second of real time are 60 of the page's.
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
/** How many times slower than real time the page runs while it is filmed. */
const slow = Math.max(1, Math.round(Number(process.env.OATS_SLOW ?? scene.capture?.slow ?? 2)));
await browser.page("Page.addScriptToEvaluateOnNewDocument", { source: slowMotion(slow) });
await browser.page("Animation.enable");
const now = () => Date.now() / 1000;
/** Waits are in the page's time. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms * slow));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const log = { cursor: [], cues: [], frames: [], moves: [] };
let recordingSince = null;
let cursor = scene.cursorStart ? { ...scene.cursorStart } : { x: viewport.width * 0.62, y: viewport.height * 0.58 };

const director = {
  viewport,
  sleep,
  async goto(url) {
    await browser.page("Page.navigate", { url });
    await director.waitFor("document.readyState === 'complete'");
    // CSS transitions and animations run on the document's timeline.
    await browser.page("Animation.setPlaybackRate", { playbackRate: 1 / slow });
  },
  wait: sleep,
  async waitFor(expression, timeoutMs = 20000) {
    const until = Date.now() + timeoutMs * slow;
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
      } else if (spec.startsWith("js=")) {
        // An expression that finds the element, for targets no selector names
        // (a canvas node's hidden button, found by its label).
        el = (0, eval)(spec.slice(3));
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
  /**
   * Where an element is, in the app's CSS pixels: `{ x, y, w, h }` of the first
   * match (a selector or `text=`), or of its nearest ancestor matching
   * `closest`, grown by `pad`. Logged as the cue `rect:<name>`, so the edit's
   * camera frames what was on screen in this capture rather than a guess.
   */
  async rect(name, target, { closest = null, pad = 0 } = {}) {
    const spec = JSON.stringify(target);
    const up = JSON.stringify(closest);
    const box = await browser.evaluate(`(() => {
      const spec = ${spec};
      const up = ${up};
      let el = null;
      if (spec.startsWith("text=")) {
        const want = spec.slice(5).trim();
        el = [...document.querySelectorAll("button, a, [role=radio], [role=tab], li, h1, h2, h3, h4, span, p, div")]
          .find((node) => node.offsetParent !== null && node.childElementCount === 0 && node.textContent.trim() === want);
      } else {
        el = document.querySelector(spec);
      }
      if (el && up) el = el.closest(up) ?? el;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    if (!box) throw new Error(`No element for ${target}`);
    const rect = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
    log.cues.push({ t: now(), name: `rect:${name}`, rect });
    return rect;
  },
  /**
   * Move the pointer to a target, eased. The page gets mouse events along the
   * way, as fast as they can be sent; the film draws the pointer from the
   * move itself (`moves`: start, end, time, duration), on the same curve, so
   * its path is smooth whatever the timing of those events was.
   */
  async moveTo(target, { duration = 650 } = {}) {
    const to = await director.point(target);
    const from = { ...cursor };
    const start = now();
    log.moves.push({ t: start, ms: duration, from, to: { x: to.x, y: to.y } });
    for (;;) {
      const elapsed = ((now() - start) * 1000) / slow;
      const t = easeInOut(Math.min(1, elapsed / duration));
      cursor = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      await browser.page("Input.dispatchMouseEvent", { type: "mouseMoved", x: cursor.x, y: cursor.y });
      log.cursor.push({ t: now(), x: cursor.x, y: cursor.y, kind: "move" });
      if (elapsed >= duration) break;
      await sleep(12 / slow);
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
  /**
   * Scroll the pane under the pointer by `deltaY` CSS pixels, eased over
   * `duration` (the page's time: it reads its own slowed clock). The page
   * animates it itself, once per frame, so the scroll is as smooth as the
   * screen: wheel events sent from here arrived unevenly, and the pane stepped
   * with them.
   */
  async scroll(deltaY, { duration = 1200 } = {}) {
    log.cues.push({ t: now(), name: "scroll-start", deltaY });
    await browser.evaluate(`new Promise((resolve) => {
      let el = document.elementFromPoint(${cursor.x}, ${cursor.y});
      while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      el = el ?? document.scrollingElement;
      const from = el.scrollTop;
      const start = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (time) => {
        const t = Math.min(1, (time - start) / ${duration});
        el.scrollTop = from + ${deltaY} * ease(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    })`);
    log.cues.push({ t: now(), name: "scroll-end", deltaY });
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
      quality: scene.capture?.quality ?? 100,
      everyNthFrame: scene.capture?.everyNthFrame ?? 1,
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
  // In the page's time: real seconds since the start, slowed.
  const rel = (entries) => entries.map((entry) => ({ ...entry, t: Math.round(((entry.t - start) * 1000) / slow) }));
  fs.writeFileSync(
    path.join(outDir, "capture.json"),
    JSON.stringify(
      {
        scene: path.basename(scenePath),
        viewport,
        scheme: scheme ?? scene.scheme ?? "light",
        slow,
        frames: rel(log.frames),
        cursor: rel(log.cursor),
        moves: rel(log.moves),
        cues: rel(log.cues),
      },
      null,
      1
    )
  );
  browser.close();
  console.log(`${log.frames.length} frames, ${log.cursor.length} cursor points, ${log.cues.length} cues (slow ${slow}) -> ${outDir}`);
}

/**
 * A script for the page, run before its own: every clock the page reads runs
 * `k` times slower. Date.now and performance.now are slowed; timers wait `k`
 * times longer; animation frames go to the page every `k`th screen frame, so a
 * simulation that steps once a frame steps at the page's 60 a second too. CSS
 * animations are slowed separately, through the document timeline
 * (Animation.setPlaybackRate). That also slows the timestamps Chrome gives
 * animation frames, so the frames get the slowed performance.now instead:
 * slowing Chrome's timestamp again made them run k² times slower.
 */
function slowMotion(k) {
  return `(() => {
    const k = ${k};
    if (!(k > 1)) return;
    const realDateNow = Date.now.bind(Date);
    const realPerfNow = performance.now.bind(performance);
    const d0 = realDateNow();
    const p0 = realPerfNow();
    Date.now = () => d0 + (realDateNow() - d0) / k;
    performance.now = () => p0 + (realPerfNow() - p0) / k;
    const realSetTimeout = window.setTimeout.bind(window);
    const realSetInterval = window.setInterval.bind(window);
    window.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms * k, ...args);
    window.setInterval = (fn, ms = 0, ...args) => realSetInterval(fn, ms * k, ...args);
    const realRAF = window.requestAnimationFrame.bind(window);
    let queue = new Map();
    let nextId = 1;
    let screenFrames = 0;
    let scheduled = false;
    const schedule = () => {
      if (scheduled || !queue.size) return;
      scheduled = true;
      realRAF(pump);
    };
    function pump() {
      scheduled = false;
      screenFrames += 1;
      if (screenFrames % k !== 0) return schedule();
      const callbacks = queue;
      queue = new Map();
      const slowed = performance.now();
      for (const callback of callbacks.values()) {
        try {
          callback(slowed);
        } catch (error) {
          realSetTimeout(() => {
            throw error;
          });
        }
      }
      schedule();
    }
    window.requestAnimationFrame = (callback) => {
      const id = nextId++;
      queue.set(id, callback);
      schedule();
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      queue.delete(id);
    };
  })();`;
}
