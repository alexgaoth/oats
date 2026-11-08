#!/usr/bin/env node
/**
 * The summary on "On this Mac", through the app's own main-process code, without
 * the app: LocalReasoningService → modelManagerBridge → llamaServer, the same
 * request Finish sends (the renderer's part, the prompt, is read from the source
 * by summary-corpus.mjs). Electron is replaced by a stand-in that gives paths.
 * It reads public AMI meetings only.
 *
 *   lockf -k gpu.lock node scripts/local-summary-check.cjs --ami <dir> --models <dir> \
 *     --resources <dir with bin/llama-server-darwin-arm64> --model gemma-4-e4b-it-q4_k_m \
 *     --meetings IS1009c,TS3003a+TS3003b --json out.json
 *
 * <models> holds the files under the registry's names (links are fine). Reports,
 * per conversation: what came back, how long it took, the title, and the server's
 * resident memory at its largest.
 */
const Module = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { parseArgs } = require("util");

const { values: args } = parseArgs({
  options: {
    ami: { type: "string" },
    models: { type: "string" },
    resources: { type: "string" },
    model: { type: "string" },
    meetings: { type: "string" },
    json: { type: "string" },
    limit: { type: "string", default: "100000" },
  },
});

// A home whose .cache/oats/models is the folder given, so the bridge finds the models.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "oats-check-"));
fs.mkdirSync(path.join(home, ".cache", "oats"), { recursive: true });
fs.symlinkSync(path.resolve(args.models), path.join(home, ".cache", "oats", "models"));

const electronStub = {
  app: {
    isReady: () => true,
    getPath: (name) => (name === "home" ? home : path.join(home, name)),
    getVersion: () => "0.2.0",
    on() {},
  },
};
const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "electron") return electronStub;
  return realLoad.call(this, request, parent, isMain);
};
process.resourcesPath = path.resolve(args.resources);

function residentMb(pid) {
  try {
    const kb = Number(
      execFileSync("/bin/ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" })
    );
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

async function main() {
  const corpus = await import("./lib/summary-corpus.mjs");
  const queue = await import("../src/helpers/summaryQueue.mjs");
  const call = await import("../src/helpers/summaryCall.mjs");
  const service = require("../src/services/localReasoningBridge").default;
  const modelManager = require("../src/helpers/modelManagerBridge").default;
  const prompt = corpus.appSummaryPrompt();
  const rows = [];
  for (const group of args.meetings.split(",")) {
    const [input] = corpus.loadInputs(args.ami, { sets: ["ref"], meetings: [group] });
    const note = prompt.userPrefix + corpus.finishTranscript(input.segments);
    const row = { conversation: group, minutes: input.minutes, chars: note.length };
    row.tooLongBeforeSending = queue.tooLongForLocalModel(prompt.system.length + note.length);
    let peak = 0;
    const sampler = setInterval(() => {
      const pid = modelManager.serverManager.process?.pid;
      if (pid) peak = Math.max(peak, residentMb(pid) ?? 0);
    }, 500);
    const started = performance.now();
    try {
      const text = await service.processText(note, args.model, {
        systemPrompt: prompt.system,
        temperature: 0.3,
        disableThinking: true,
        ...call.summaryLimits("local"),
      });
      row.ok = !call.summaryAnswerProblem(text, note);
      row.summaryMs = Math.round(performance.now() - started);
      row.text = text;
      row.words = text.split(/\s+/).length;
      const titleStart = performance.now();
      const title = await service.processText(text.slice(0, 2000), args.model, {
        systemPrompt: prompt.titleSystem,
        temperature: 0.3,
        disableThinking: true,
      });
      row.titleMs = Math.round(performance.now() - titleStart);
      row.title = title.trim();
    } catch (error) {
      row.ok = false;
      row.summaryMs = Math.round(performance.now() - started);
      row.error = String(error?.message ?? error).slice(0, 400);
      row.kind = queue.summaryFailureKind(error, "local");
    }
    clearInterval(sampler);
    row.peakResidentMb = peak;
    rows.push(row);
    console.error(
      `${group} ${row.ok ? "ok" : "FAILED"} ${(row.summaryMs / 1000).toFixed(1)} s, title ${((row.titleMs ?? 0) / 1000).toFixed(1)} s, peak ${peak} MB, ${row.words ?? 0} words ${row.error ?? ""} | ${row.title ?? ""}`
    );
  }
  await modelManager.stopServer();
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ model: args.model, rows }, null, 1));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
