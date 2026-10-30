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
  // Summaries that start by themselves (stores/summaryQueueStore.ts), in each
  // state the record can say instead of a summary. `bare=` takes the review's
  // summary away, as from a conversation recorded before a model was ready.
  {
    // Opened with the model ready: it starts at once, with nothing to press.
    name: "summary-starting",
    query: "bare=launch-readiness-review",
    script: "await oatsDemo.open(); await demo.toSummary()",
  },
  {
    // The writing model on this Mac still downloading.
    name: "summary-downloading",
    query: "writing=gemma-4-e4b-it-q4_k_m&download=40&bare=launch-readiness-review",
    script: "await oatsDemo.open(); await demo.toSummary()",
  },
  {
    // No writing model chosen yet.
    name: "summary-needs-model",
    query: "writing=none&bare=launch-readiness-review",
    script: "await oatsDemo.open(); await demo.toSummary()",
  },
  {
    // Both tries failed: only now does the record say so.
    name: "summary-failed",
    query: "summary=fail&bare=launch-readiness-review",
    script:
      "await oatsDemo.open(); await demo.until(() => /could not be written/.test(document.body.innerText), 30000); await demo.wait(6500); await demo.toSummary()",
  },
  {
    // Too long for the model on this Mac: why, and the way to a model that can.
    name: "summary-too-long",
    query: "summary=too-long&bare=launch-readiness-review",
    script:
      "await oatsDemo.open(); await demo.until(() => /too long for the writing model/.test(document.body.innerText), 30000); await demo.wait(6500); await demo.toSummary()",
  },
  {
    // The conversation being recorded: its Finish writes the summary.
    name: "summary-while-recording",
    query: "demo=live&end=hold&from=120&edits=0",
    script:
      "await demo.untilSeconds(121); await oatsDemo.open(oatsDemo.status().noteId); await demo.toSummary()",
  },
  {
    // Another conversation, opened during a recording with the model on this
    // Mac: it waits, so the model does not compete with the transcription.
    name: "summary-after-recording",
    query: "demo=live&end=hold&from=120&edits=0&bare=all",
    script:
      "await demo.untilSeconds(121); await oatsDemo.open(oatsDemo.samples()[0].id); await demo.toSummary()",
  },
  {
    // The line under Record names the setting, and goes there in one press.
    name: "home-no-writing-model",
    query: "writing=none",
    script: "",
  },
  { name: "conversations", query: "", script: "await oatsDemo.show('conversations')" },
  { name: "global", query: "", script: "await oatsDemo.show('global'); await demo.wait(1500)" },
  {
    // The board linked by words, as before it read meaning (and as it still is
    // when Oats listens for a language other than English).
    name: "global-words",
    query: "speech=de",
    script: "await oatsDemo.show('global'); await demo.wait(1500)",
  },
  {
    // The review as a cloud model's link check would leave it: its links are
    // the check's, with the check's name for the subject. The check is written
    // the way conversationLinkStore.ts writes one.
    name: "global-cloud-check",
    query: "",
    script: [
      "await oatsDemo.show('global'); await demo.wait(1200);",
      "const notes = await window.electronAPI.getNotes('meeting', 50);",
      "const find = (pattern) => notes.find((note) => pattern.test(note.title));",
      "const review = find(/Enterprise launch review/), corbel = find(/Corbel/), crit = find(/Design crit/), hiring = find(/Backend hiring/);",
      "const link = (note, subject, topic, earlierTopic) => ({ id: note.id, subject, topic, earlierTopic });",
      "await window.electronAPI.updateNote(review.id, { conversation_links: JSON.stringify({ checkedAt: new Date().toISOString(), model: 'claude-opus-5-5', candidates: [corbel.id, crit.id, hiring.id],",
      "links: [link(corbel, 'SSO as a launch gate', 'SSO', 'SSO'), link(crit, 'SSO as a launch gate', 'SSO', 'SAML errors'), link(hiring, 'Data migration risk', 'data migration', 'data migration')] }) });",
      "await demo.wait(1500);",
    ].join(" "),
  },
  {
    // Pointing at the newest conversation lights it in both charts.
    name: "global-highlight",
    query: "",
    script:
      "await oatsDemo.show('global'); await demo.wait(1500); await demo.point(oatsDemo.samples()[0].id)",
  },
  {
    // The Add menu, open: what the board can hold.
    name: "global-add",
    query: "",
    script:
      "await oatsDemo.show('global'); await demo.wait(1200); [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await demo.wait(400)",
  },
  {
    name: "global-many",
    query: "profile=many",
    script: "await oatsDemo.show('global'); await demo.wait(2500)",
  },
  // The speech model this Mac's GPU decides (src/helpers/speechTier.mjs), in
  // each state the speed check reports (harness/deviceTier.mjs).
  { name: "speech-setup", query: "firstrun=1&tier=fast", ready: "h1", script: "" },
  { name: "speech-sidebar-downloading", query: "tier=downloading", script: "" },
  // Oats starts the download by itself and says so, once (SpeechUpgradeNotice).
  { name: "speech-notice", query: "tier=fast", script: "" },
  ...["downloading", "checking", "ready", "declined", "failed", "slow", "intel"].map((tier) => ({
    name: `speech-settings-${tier}`,
    query: `tier=${tier}`,
    script: "await oatsDemo.settings('models')",
  })),
  // Field mode (Settings › General › Advanced): the backdrop composed for each
  // screen in front of it (src/components/field/fieldViews.ts).
  { name: "field-home", query: "field=1", script: "" },
  { name: "field-home-empty", query: "field=1&profile=empty", script: "" },
  {
    name: "field-conversations",
    query: "field=1",
    script: "await oatsDemo.show('conversations')",
  },
  {
    name: "field-conversations-empty",
    query: "field=1&profile=empty",
    script: "await oatsDemo.show('conversations')",
  },
  {
    name: "field-global",
    query: "field=1",
    script: "await oatsDemo.show('global'); await demo.wait(1500)",
  },
  { name: "field-record", query: "field=1", script: "await oatsDemo.open()" },
  {
    name: "field-live",
    query: "field=1&demo=live&from=560&end=hold&view=calm",
    script: "await demo.untilSeconds(563)",
  },
  { name: "field-settings", query: "field=1", script: "await oatsDemo.settings('general')" },
  {
    name: "speech-settings-chosen",
    query: "tier=ready&chosen=small",
    script: "await oatsDemo.settings('models')",
  },
  {
    name: "speech-settings-detection",
    query: "tier=ready&speech=auto",
    script: "await oatsDemo.settings('models')",
  },
  // Settings › AI models: the processing choice, one row per model with its
  // state, and Advanced (src/components/settings/ModelsPage.tsx). The writing
  // model on this Mac follows its memory (src/helpers/writingTier.mjs).
  ...[
    ["local-ready", ""],
    ["local-downloading", "tier=downloading&writingState=downloading"],
    ["local-declined", "writingState=declined&tier=declined"],
    ["local-failed", "writingState=failed&tier=failed"],
    ["local-8gb", "memory=8&writingState=small&tier=none"],
    ["local-chosen", "writing=qwen3.5-9b-q4_k_m&chosen=small"],
    ["providers-nokey", "processing=providers"],
    ["providers-openai", "processing=providers&keys=openai"],
    ["providers-anthropic", "processing=providers&keys=anthropic"],
  ].map(([name, query]) => ({
    name: `models-${name}`,
    query,
    script: "await oatsDemo.settings('models')",
  })),
  ...[
    ["advanced-local", ""],
    ["advanced-providers", "processing=providers&keys=openai"],
  ].map(([name, query]) => ({
    name: `models-${name}`,
    query,
    script: [
      "await oatsDemo.settings('models');",
      "await demo.openAdvanced();",
      "await demo.scrollTo('Choose models yourself')",
    ].join(" "),
  })),
  {
    // The writing chooser under Advanced, on its own: the rows of one family.
    name: "models-advanced-writing",
    query: "writingState=downloading",
    script: [
      "await oatsDemo.settings('models');",
      "await demo.openAdvanced();",
      "await demo.scrollTo('Writing', 'heading')",
    ].join(" "),
  },
  {
    // An Anthropic key pasted where the writing row asks for one: checked,
    // saved, and the row turns to Claude Opus 5.5 (ProviderKeyField).
    name: "models-key-saved",
    query: "processing=providers",
    script:
      "await oatsDemo.settings('models'); await demo.typeKey('sk-ant-api03-demo-key-0123456789'); await demo.wait(800)",
  },
  {
    // A key that is neither OpenAI's nor Anthropic's is not saved.
    name: "models-key-wrong",
    query: "processing=providers",
    script:
      "await oatsDemo.settings('models'); await demo.typeKey('AIzaSyD-not-an-openai-key'); await demo.wait(400)",
  },
  // Oats starts the writing model's download by itself and says so, once
  // (WritingModelNotice), and Home says what it means for a conversation now.
  { name: "writing-notice", query: "writingState=none&tier=ready", script: "await demo.wait(1500)" },
  { name: "writing-home-downloading", query: "writingState=downloading&noticedWriting=1", script: "" },
  { name: "writing-home-nokey", query: "processing=providers", script: "" },
  // The tour at the end of setup (components/onboarding/OatsTour.tsx): setup
  // finished the way a person finishes it, then Next to each slide. The
  // questions slide is taken twice: while its newest card is still open, and
  // once the reply has settled it.
  ...[
    ["tour-topics", 0, 0],
    ["tour-questions-asked", 1, 0],
    ["tour-questions", 1, 1200],
    ["tour-shape", 2, 0],
    ["tour-voices", 3, 0],
    ["tour-open", 4, 0],
  ].map(([name, slide, settle]) => ({
    name,
    query: "firstrun=1",
    ready: "h1",
    script: [
      "await demo.press('Allow'); await demo.wait(400);",
      "await demo.press('Get started');",
      "await demo.until(() => document.querySelector('section[aria-label] h1'));",
      ...Array.from({ length: slide }, () => "await demo.press('Next');"),
      `await demo.wait(${settle});`,
      // The tour gives Next the focus; a script is not a keyboard.
      "document.activeElement?.blur();",
    ].join(" "),
  })),
  // The questions slide under reduced motion: its cards are settled at once.
  {
    name: "tour-questions-still",
    query: "firstrun=1",
    ready: "h1",
    reducedMotion: true,
    script: [
      "await demo.press('Allow'); await demo.wait(400);",
      "await demo.press('Get started');",
      "await demo.until(() => document.querySelector('section[aria-label] h1'));",
      "await demo.press('Next');",
      "document.activeElement?.blur();",
    ].join(" "),
  },
];

// Page helpers, evaluated in the page before each shot's script.
const PAGE_HELPERS = `
window.demo = {
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  async until(test, ms = 10000) {
    const until = performance.now() + ms;
    while (!test()) {
      if (performance.now() > until) throw new Error("demo.until: timed out");
      await demo.wait(100);
    }
  },
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
  // Paste a key into the first key field on the page and save it.
  async typeKey(text) {
    const until = performance.now() + 10000;
    let input;
    while (!(input = document.querySelector("form input[type='password']"))) {
      if (performance.now() > until) throw new Error("no key field on the page");
      await demo.wait(100);
    }
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await demo.wait(100);
    input.form.requestSubmit();
    input.blur();
  },
  // Settings › AI models: open "Choose models yourself" once the page is there.
  async openAdvanced() {
    const until = performance.now() + 10000;
    let button;
    while (!(button = [...document.querySelectorAll("button[aria-expanded]")].find((b) =>
      b.textContent.includes("Choose models yourself")))) {
      if (performance.now() > until) throw new Error("no Advanced on the models page");
      await demo.wait(100);
    }
    button.click();
    button.blur();
    await demo.wait(400);
  },
  // Point at a conversation on the Global conversations board, as the pointer
  // would (oatsDemo.point, in the harness).
  async point(id) {
    await oatsDemo.point(id);
    await demo.wait(200);
  },
  async until(test, ms = 20000) {
    const end = performance.now() + ms;
    while (!test()) {
      if (performance.now() > end) throw new Error("timed out");
      await demo.wait(100);
    }
  },
  // The record's summary area, or what it says instead, in the middle of the window.
  async toSummary() {
    const panel = document.querySelector('[role="tabpanel"][data-state="active"]');
    const status = [...(panel?.querySelectorAll('[role="status"]') ?? [])].at(-1);
    status?.scrollIntoView({ block: "center", behavior: "instant" });
    await demo.wait(300);
  },
  async scrollTo(text, role) {
    const candidates = role === "heading"
      ? [...document.querySelectorAll("h1, h2, h3, h4")]
      : role
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
      for (const shot of shots) {
        // A shot with `reducedMotion` is taken as somebody who asked the
        // system for less motion sees the app.
        await cdp.send(
          "Emulation.setEmulatedMedia",
          {
            features: [
              { name: "prefers-color-scheme", value: theme },
              {
                name: "prefers-reduced-motion",
                value: shot.reducedMotion ? "reduce" : "no-preference",
              },
            ],
          },
          sessionId
        );
        const query = ["panel=true", `theme=${theme}`, shot.query].filter(Boolean).join("&");
        const loaded = cdp.once("Page.loadEventFired", sessionId);
        await cdp.send("Page.navigate", { url: `${args.url}/demo.html?${query}` }, sessionId);
        await loaded;
        // What shows once the page is up: the workspace, or a shot's own
        // `ready` selector (the setup screen has no workspace).
        const ready = JSON.stringify(shot.ready ?? "main[data-active='true'] section");
        await evaluate(
          cdp,
          sessionId,
          `(async () => {
            const until = performance.now() + 20000;
            while (!(window.oatsDemo && document.querySelector(${ready}))) {
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
