#!/usr/bin/env node
/**
 * Oats performance baseline.
 *
 * TODO.md P0.2: "A subjective lag report must become a reproducible performance
 * budget." This is that instrument. It launches an isolated Oats instance,
 * drives the three surfaces over the Chrome DevTools Protocol, and reports
 * numbers that can be compared between builds and between machines.
 *
 *   npm run perf:baseline                 # measure, print a table
 *   npm run perf:baseline -- --json out   # also write docs/perf/out.json
 *
 * It runs on the `staging` channel so it gets its own userData directory and
 * its own single-instance lock — a development Oats can stay open beside it.
 *
 * What it deliberately does NOT measure, because a script cannot: anything that
 * needs real speech, a real microphone, or a real window manager. Those stay
 * manual and are listed in docs/performance-baseline.md.
 */

const { spawn } = require("child_process");
const { setTimeout: sleep } = require("timers/promises");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.OATS_PERF_PORT || 9455);
const SETTLE_MS = 400;
const IDLE_SAMPLE_MS = Number(process.env.OATS_PERF_IDLE_MS || 15000);
const REPEATS = Number(process.env.OATS_PERF_REPEATS || 7);

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index] * 10) / 10;
}

/**
 * The pid of the browser process actually serving the debug port.
 *
 * NOT the pid we spawned: on a Wayland session main.js re-executes itself with
 * `--ozone-platform=x11` as a *detached* child and exits, so the spawned pid is
 * gone by the time there is anything to measure. Everything below is measured
 * from here down.
 */
function findBrowserPid(port) {
  if (process.platform !== "linux") return null;
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (cmdline.includes(`--remote-debugging-port=${port}`) && !cmdline.includes("--type=")) {
        return Number(entry);
      }
    } catch {
      // Vanished mid-scan.
    }
  }
  return null;
}

/** Total CPU jiffies for a process tree, read from /proc. Linux only. */
function cpuJiffies(rootPid) {
  if (process.platform !== "linux" || !rootPid) return null;
  let total = 0;
  const seen = new Set();
  const walk = (pid) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      total += Number(fields[11]) + Number(fields[12]); // utime + stime
      const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
      if (children) children.split(/\s+/).forEach((child) => walk(Number(child)));
    } catch {
      // The process went away between the listing and the read.
    }
  };
  walk(rootPid);
  return total;
}

function rssKb(rootPid) {
  if (process.platform !== "linux" || !rootPid) return null;
  let total = 0;
  const seen = new Set();
  const walk = (pid) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const match = /VmRSS:\s+(\d+) kB/.exec(status);
      if (match) total += Number(match[1]);
      const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
      if (children) children.split(/\s+/).forEach((child) => walk(Number(child)));
    } catch {
      // Same.
    }
  };
  walk(rootPid);
  return total;
}

async function connect(urlFragment, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let target;
  while (!target && Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.url.includes(urlFragment));
    } catch {
      // Not listening yet.
    }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error(`no debugger target matching "${urlFragment}"`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return result.result.value;
  };
  await send("Runtime.enable");
  return { ws, send, evaluate };
}

async function main() {
  const started = Date.now();
  // `--ozone-platform=x11` is passed here rather than left to main.js. On a
  // Wayland session main.js re-execs itself with that flag; the first process
  // has already bound the debug port, the replacement loses the race to rebind
  // it, and Chromium disables remote debugging without saying so. Passing it up
  // front means one process and one bind. It is what the app runs under anyway
  // (CLAUDE.md, "Linux input and clipboard").
  const child = spawn(
    process.execPath,
    [
      path.join(__dirname, "..", "node_modules", ".bin", "electron"),
      ".",
      `--remote-debugging-port=${PORT}`,
      ...(process.platform === "linux" ? ["--ozone-platform=x11"] : []),
    ],
    {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, OATS_CHANNEL: process.env.OATS_CHANNEL || "staging" },
      stdio: "ignore",
    }
  );
  let browserPid = null;
  const stop = () => {
    for (const pid of [browserPid, child.pid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  };
  process.on("exit", stop);

  const { send, evaluate } = await connect("panel=true");
  browserPid = findBrowserPid(PORT);
  if (!browserPid && process.platform === "linux") {
    console.warn("[perf] could not locate the browser process; CPU and memory will be blank");
  }

  // Cold launch → interactive: the moment the three destinations can be clicked.
  const navReady = async () =>
    evaluate(`document.querySelectorAll('nav button').length >= 3`).catch(() => false);
  while (!(await navReady())) await sleep(50);
  const coldLaunchMs = Date.now() - started;

  // Onboarding would sit in front of everything on a fresh profile.
  await evaluate(`localStorage.setItem("onboardingCompleted","true")`);
  await send("Page.reload", { ignoreCache: false });
  const reloadStart = Date.now();
  while (!(await navReady())) await sleep(50);
  const warmReloadMs = Date.now() - reloadStart;
  await sleep(2500);

  const switchTo = (name) => `(async () => {
    const button = Array.from(document.querySelectorAll('nav button'))
      .find((b) => b.textContent.trim().toLowerCase() === ${JSON.stringify(name)});
    if (!button) return null;
    const t0 = performance.now();
    button.click();
    // Two frames: one for React to commit, one for the browser to paint it.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t0;
  })()`;

  const switches = { conversation: [], intelligence: [], settings: [] };
  let settingsFirstOpen = null;
  for (let i = 0; i < REPEATS; i += 1) {
    for (const surface of ["intelligence", "settings", "conversation"]) {
      const ms = await evaluate(switchTo(surface));
      if (surface === "settings" && settingsFirstOpen === null) settingsFirstOpen = ms;
      switches[surface].push(ms);
      await sleep(SETTLE_MS);
    }
  }

  // Idle cost per surface. This is what P0.1 (freezing the field off the
  // Conversation surface) is supposed to move, so it is measured per surface
  // rather than as one number.
  const idle = {};
  const clockTick = 100; // Linux USER_HZ
  for (const surface of ["conversation", "intelligence", "settings"]) {
    await evaluate(switchTo(surface));
    await sleep(1500);
    const beforeCpu = cpuJiffies(browserPid);
    const t0 = Date.now();
    await sleep(IDLE_SAMPLE_MS);
    const afterCpu = cpuJiffies(browserPid);
    const elapsed = (Date.now() - t0) / 1000;
    idle[surface] = {
      cpuPercent:
        beforeCpu === null
          ? null
          : Math.round(((afterCpu - beforeCpu) / clockTick / elapsed) * 1000) / 10,
      rssMb: rssKb(browserPid) === null ? null : Math.round(rssKb(browserPid) / 1024),
    };
  }

  // Advanced Settings is a lazily-loaded chunk; first open pays for the fetch.
  await evaluate(switchTo("settings"));
  await sleep(600);
  const advancedFirstMs = await evaluate(`(async () => {
    const button = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'Advanced');
    if (!button) return null;
    const t0 = performance.now();
    button.click();
    for (let i = 0; i < 600; i += 1) {
      await new Promise((r) => requestAnimationFrame(r));
      if (document.body.innerText.length > 800) return performance.now() - t0;
    }
    return -1;
  })()`);

  const report = {
    when: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    coldLaunchToInteractiveMs: coldLaunchMs,
    warmReloadToInteractiveMs: warmReloadMs,
    surfaceSwitchMs: Object.fromEntries(
      Object.entries(switches).map(([k, v]) => [
        k,
        { p50: percentile(v, 50), p95: percentile(v, 95) },
      ])
    ),
    settingsFirstOpenMs: Math.round(settingsFirstOpen ?? 0),
    advancedFirstOpenMs: advancedFirstMs === null ? null : Math.round(advancedFirstMs),
    idlePerSurface: idle,
  };

  console.log("\nOats performance baseline");
  console.log("=========================");
  console.log(`platform                    ${report.platform}`);
  console.log(`cold launch → interactive   ${report.coldLaunchToInteractiveMs} ms`);
  console.log(`warm reload → interactive   ${report.warmReloadToInteractiveMs} ms`);
  for (const [surface, stats] of Object.entries(report.surfaceSwitchMs)) {
    console.log(`switch → ${surface.padEnd(14)}     p50 ${stats.p50} ms   p95 ${stats.p95} ms`);
  }
  console.log(`settings first open         ${report.settingsFirstOpenMs} ms`);
  console.log(`advanced first open         ${report.advancedFirstOpenMs} ms (lazy chunk)`);
  console.log("idle, foreground:");
  for (const [surface, stats] of Object.entries(report.idlePerSurface)) {
    console.log(
      `  ${surface.padEnd(14)}            ${stats.cpuPercent}% CPU   ${stats.rssMb} MB RSS`
    );
  }

  const jsonFlag = process.argv.indexOf("--json");
  if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
    const outDir = path.join(__dirname, "..", "docs", "perf");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${process.argv[jsonFlag + 1]}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nwritten to ${path.relative(path.join(__dirname, ".."), outPath)}`);
  }

  stop();
  process.exit(0);
}

main().catch((error) => {
  console.error(`[perf] ${error.message}`);
  process.exit(1);
});
