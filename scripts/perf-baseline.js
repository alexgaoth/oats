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

/**
 * The children of a process — read from every thread, not just the main one.
 *
 * `/proc/<pid>/task/<pid>/children` lists only the children of the *main
 * thread*, and Chromium forks its renderers and mojo utilities from a launcher
 * thread. Walking the main thread alone silently reached 10 of 13 processes
 * here, omitting the renderer that draws the surface being measured — so both
 * the CPU and the memory totals were of an arbitrary subset that varied between
 * runs.
 */
function childrenOf(pid) {
  const out = [];
  let threads;
  try {
    threads = fs.readdirSync(`/proc/${pid}/task`);
  } catch {
    return out;
  }
  for (const tid of threads) {
    try {
      const listed = fs.readFileSync(`/proc/${pid}/task/${tid}/children`, "utf8").trim();
      if (listed) out.push(...listed.split(/\s+/).map(Number));
    } catch {
      // The thread went away between the listing and the read.
    }
  }
  return out;
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
      childrenOf(pid).forEach(walk);
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
      childrenOf(pid).forEach(walk);
    } catch {
      // Same.
    }
  };
  walk(rootPid);
  return total;
}

/**
 * Proportional set size for a process tree, from /proc/<pid>/smaps_rollup.
 *
 * `rssKb` sums VmRSS, and a Chromium tree shares a great deal: the binary, the
 * fonts, the buffers a renderer and the GPU process both map. Summed RSS counts
 * every shared page once per process holding it, which is how "idle RSS is
 * ~1 GB" came to be written down. PSS divides each shared page among its
 * sharers, so the total is the tree's own share of physical memory. Both are
 * reported — the gap between them is the double count.
 *
 * PSS divides shared pages among every sharer on the machine, so a second Oats
 * or Electron running beside this one halves the pages they have in common and
 * lowers this figure for a reason that has nothing to do with the build. Run it
 * with no other instance up.
 */
function pssKb(rootPid) {
  if (process.platform !== "linux" || !rootPid) return null;
  let total = 0;
  const seen = new Set();
  const walk = (pid) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    try {
      const rollup = fs.readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
      const match = /^Pss:\s+(\d+) kB/m.exec(rollup);
      if (match) total += Number(match[1]);
      childrenOf(pid).forEach(walk);
    } catch {
      // Same.
    }
  };
  walk(rootPid);
  return total;
}

function procStat(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return Number(fields[11]) + Number(fields[12]);
  } catch {
    return null;
  }
}

function procPssKb(pid) {
  try {
    const match = /^Pss:\s+(\d+) kB/m.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * The sidecars: every process in the tree that is not one of Chromium's own.
 * `SystemInfo.getProcessInfo` enumerates the browser, the renderers, the GPU
 * process and the mojo utilities, and knows nothing about whisper-server,
 * qdrant, or `pactl subscribe`. Those are found by walking /proc and skipping
 * anything carrying a `--type=` switch.
 */
function sidecarPids(rootPid, knownPids) {
  if (process.platform !== "linux" || !rootPid) return [];
  const found = [];
  const seen = new Set();
  const walk = (pid) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    try {
      const raw = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
      const argv = raw.split("\0").filter(Boolean);
      if (!knownPids.has(pid) && !raw.includes("--type=") && argv.length) {
        found.push({ pid, name: path.basename(argv[0]) });
      }
      childrenOf(pid).forEach(walk);
    } catch {
      // Same.
    }
  };
  walk(rootPid);
  return found;
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
  return openSocket(target.webSocketDebuggerUrl);
}

/** The browser-level endpoint, which is the only one that answers SystemInfo. */
async function connectBrowser() {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  return openSocket(version.webSocketDebuggerUrl);
}

async function openSocket(wsUrl) {
  const ws = new WebSocket(wsUrl);
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
  // The browser-level target has no Runtime domain; page targets need it.
  await send("Runtime.enable").catch(() => {});
  return { ws, send, evaluate };
}

/**
 * Idle CPU and PSS per process, named. Returns rows sorted by CPU.
 */
async function attributeIdleCost(sampleMs) {
  if (process.platform !== "linux") return null;
  let browser;
  try {
    browser = await connectBrowser();
  } catch {
    return null;
  }
  let info;
  try {
    info = (await browser.send("SystemInfo.getProcessInfo")).processInfo;
  } catch {
    browser.ws.close();
    return null;
  }
  const rows = info.map((p) => ({ pid: p.id, name: p.type }));

  // Name each renderer by the window it draws.
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const rendererPids = info.filter((p) => p.type === "renderer").map((p) => p.id);
  for (const target of targets.filter((t) => t.type === "page")) {
    // Overlay windows are created and destroyed by IPC while this runs, so a
    // target listed a moment ago may already be gone. A dead socket never
    // rejects — it just never answers — so this needs its own deadline, or a
    // four-minute run hangs here and writes no report at all.
    let page;
    try {
      page = await Promise.race([
        openSocket(target.webSocketDebuggerUrl),
        sleep(5000).then(() => Promise.reject(new Error("target went away"))),
      ]);
    } catch {
      continue;
    }
    const before = rendererPids.map(procStat);
    await Promise.race([
      page.evaluate("(() => { const t = Date.now(); while (Date.now() - t < 500); return 1 })()"),
      sleep(5000),
    ]).catch(() => {});
    const after = rendererPids.map(procStat);
    const busiest = rendererPids
      .map((pid, i) => ({ pid, delta: (after[i] ?? 0) - (before[i] ?? 0) }))
      .sort((a, b) => b.delta - a.delta)[0];
    // Only believe the identification if the spin actually showed up. If the
    // evaluate failed, every delta is ~0 and the "winner" is whichever pid
    // sorted first — which would print a confidently mislabelled table, and
    // which renderer is spending the CPU is the entire published conclusion.
    const row = busiest && busiest.delta >= 25 ? rows.find((r) => r.pid === busiest.pid) : null;
    if (row) row.name = `renderer ${target.url.replace(/^.*\//, "")}`;
    page.ws.close();
  }

  const known = new Set(rows.map((r) => r.pid));
  const browserPid = info.find((p) => p.type === "browser")?.id;
  for (const sidecar of sidecarPids(browserPid, known)) {
    rows.push({ pid: sidecar.pid, name: `sidecar ${sidecar.name}` });
  }

  // Let the spins above settle — their GC lands in the renderer that was just
  // made busy, which is exactly the process whose *idle* cost is being read.
  await sleep(2500);
  const before = rows.map((r) => procStat(r.pid));
  const t0 = Date.now();
  await sleep(sampleMs);
  const elapsed = (Date.now() - t0) / 1000;
  const measured = rows.map((row, i) => {
    const after = procStat(row.pid);
    const jiffies = after === null || before[i] === null ? null : after - before[i];
    const pss = procPssKb(row.pid);
    return {
      process: row.name,
      cpuPercent: jiffies === null ? null : Math.round((jiffies / 100 / elapsed) * 1000) / 10,
      pssMb: pss === null ? null : Math.round(pss / 1024),
    };
  });
  browser.ws.close();
  const sorted = measured.sort((a, b) => (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0));

  // Whatever the named rows do not account for — the zygotes Chromium forks
  // from, and the node launcher. Without this the table silently fails to sum
  // to the per-surface total above it, and a reader has no way to tell whether
  // the difference is a process nobody named or an error in the walk.
  const treePss = pssKb(browserPid);
  const namedPss = sorted.reduce((total, row) => total + (row.pssMb ?? 0), 0);
  const remainder = treePss === null ? null : Math.round(treePss / 1024) - namedPss;
  if (remainder && remainder > 0) {
    sorted.push({ process: "zygote and launcher processes", cpuPercent: null, pssMb: remainder });
  }
  // Read at this instant, so the rows above sum to it. The per-surface PSS
  // printed earlier is a different sample and will differ by a few tens of MB.
  if (treePss !== null) {
    sorted.push({
      process: "— whole tree, this instant",
      cpuPercent: null,
      pssMb: Math.round(treePss / 1024),
    });
  }
  return sorted;
}

/**
 * Kill whatever is still holding our debug port, before Chromium tries to bind.
 *
 * A killed Oats leaves its `pactl subscribe` child behind, and that child holds
 * an *inherited* copy of the debug port's listening socket — measured here:
 * `/proc/<pactl>/fd/63 -> socket:[8511221]`, the same inode `ss -ltnp` reports
 * LISTENing on the port, with the pactl reparented to init. So the port accepts
 * connections and never answers, and Chromium — which binds before any app code
 * runs, so `reapStaleSidecars()` is far too late — disables remote debugging
 * without a word. The symptom is `no debugger target matching "panel=true"`
 * ninety seconds later.
 */
function freePort(port) {
  if (process.platform !== "linux") return;
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  let inode = null;
  try {
    for (const line of fs.readFileSync("/proc/net/tcp", "utf8").split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      // 0A is TCP_LISTEN.
      if (fields[3] === "0A" && fields[1]?.endsWith(`:${hex}`)) inode = fields[9];
    }
  } catch {
    return;
  }
  if (!inode || inode === "0") return;
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let fds;
    try {
      fds = fs.readdirSync(`/proc/${entry}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (fs.readlinkSync(`/proc/${entry}/fd/${fd}`) !== `socket:[${inode}]`) continue;
      } catch {
        continue;
      }
      console.warn(`[perf] pid ${entry} still holds port ${port}; killing it`);
      try {
        process.kill(Number(entry), "SIGKILL");
      } catch {
        // Already gone.
      }
      break;
    }
  }
}

async function main() {
  freePort(PORT);
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
      pssMb: pssKb(browserPid) === null ? null : Math.round(pssKb(browserPid) / 1024),
      summedRssMb: rssKb(browserPid) === null ? null : Math.round(rssKb(browserPid) / 1024),
    };
  }

  // Where the idle cost actually is. The per-surface number above is one figure
  // for a tree of a dozen processes, and for months it was read as "the
  // application floor" — Electron plus the sidecars — which turned out to be
  // wrong by a factor of twenty-five. Chromium's own processes are named by
  // SystemInfo; the sidecars are found by walking /proc; and the two renderers
  // are told apart by making one of them busy and seeing which pid moved, since
  // a renderer forked from the zygote keeps the zygote's command line.
  await evaluate(switchTo("conversation"));
  await sleep(1500);
  const attribution = await attributeIdleCost(IDLE_SAMPLE_MS);

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
    idleAttribution: attribution,
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
      `  ${surface.padEnd(14)}            ${stats.cpuPercent}% CPU   ` +
        `${stats.pssMb} MB PSS (${stats.summedRssMb} MB summed RSS)`
    );
  }

  if (report.idleAttribution) {
    console.log("idle cost per process (conversation surface):");
    for (const row of report.idleAttribution) {
      console.log(
        `  ${(row.cpuPercent === null ? "" : `${row.cpuPercent}%`).padStart(6)}  ` +
          `${String(row.pssMb).padStart(5)} MB  ${row.process}`
      );
    }
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
