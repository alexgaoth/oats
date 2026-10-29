#!/usr/bin/env node
/**
 * Summaries, measured. Runs the app's own Finish summary — its prompt, its
 * transcript format and each route's request shape — over AMI meetings, and
 * grades every summary blind against the annotators' summary and the manual
 * transcript. `docs/summaries.md` has the method and the results.
 *
 *   node scripts/summary-eval.mjs generate --model <provider:model> --ami <dir> --out <dir>
 *        [--sets ref,quiet,steady] [--asr quiet=<room-replay.json>] [--asr steady=<...>]
 *        [--meetings a,b] [--prompt-ref <git ref>] [--tag <name>] [--concurrency 4]
 *        [--gguf <file> --llama-server <binary>]           (local models)
 *   node scripts/summary-eval.mjs judge --ami <dir> --out <dir> [--judge <spec>]
 *        [--keys key,key] [--meetings a,b] [--chunk 8] [--effort low] [--batch]
 *   node scripts/summary-eval.mjs report --out <dir> [--baseline <key>] [--json <file>]
 *   node scripts/summary-eval.mjs speed --model local:<id> --gguf <file> --llama-server <binary>
 *        --ami <dir> [--meetings a+b,c]                    (a+b: one conversation of both)
 *
 * Routes, each as the app sends it at Finish (ReasoningService.processText):
 *   local:<registry id>  llama-server with the app's arguments (llamaServer.js: --ctx-size
 *                        min(16384, the model's context), 4 threads, all layers on the GPU,
 *                        --jinja) and request (temperature 0.3, max_tokens 2048 for any
 *                        transcript over 1,024 characters, enable_thinking false). A summary
 *                        cut at the limit fails, as the app fails it (#139).
 *   openai:<model>       the Responses API (inferenceProviders/openai.ts): store false,
 *                        max_output_tokens 4096, no reasoning effort, temperature only for
 *                        models the registry says take it. The app gives up after 30 s.
 *   anthropic:<model>    the Messages API as ipcHandlers.js "process-anthropic-reasoning"
 *                        sends it (anthropic-version 2023-06-01, max_tokens 4096), but
 *                        without temperature: the app's 0.3 is refused (HTTP 400) by every
 *                        current Claude model, so as shipped it writes no summary at all.
 *   bedrock:<model>      Converse with the parameters of "process-enterprise-reasoning"
 *                        (max tokens 4096, temperature 0.3). Not a writing route in the
 *                        app today: measured for the decision.
 *
 * Public data only. Keys come from the environment (OPENAI_API_KEY, ANTHROPIC_API_KEY,
 * AWS_BEARER_TOKEN_BEDROCK) and are never written; every billed request goes to the
 * spend ledger (FM_LEDGER) and none is sent past FM_BUDGET_USD.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  FAR8,
  appSummaryPrompt,
  finishTranscript,
  humanSummary,
  judgeTranscript,
  loadInputs,
} from "./lib/summary-corpus.mjs";
import { rougeL, tokens, youThemLines } from "./lib/summary-score.mjs";
import {
  bootstrapMean,
  costOf,
  ledgerTotal,
  mean,
  parseSpec,
  percentile,
  priceOf,
  seeded,
  startLocalServer,
  stopLocalServers,
} from "./lib/fast-models.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAR8_SET = new Set(FAR8);
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/models/modelRegistryData.json"), "utf8")
);

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    ami: { type: "string" },
    out: { type: "string" },
    sets: { type: "string", default: "ref" },
    asr: { type: "string", multiple: true, default: [] },
    meetings: { type: "string" },
    "prompt-ref": { type: "string", default: "" },
    tag: { type: "string" },
    concurrency: { type: "string", default: "4" },
    gguf: { type: "string" },
    "llama-server": { type: "string" },
    port: { type: "string", default: "8391" },
    judge: { type: "string", default: "anthropic:claude-opus-5-5" },
    keys: { type: "string" },
    chunk: { type: "string", default: "8" },
    effort: { type: "string", default: "medium" },
    batch: { type: "boolean", default: false },
    baseline: { type: "string" },
    json: { type: "string" },
    "max-usd": { type: "string" },
    seed: { type: "string", default: "17" },
    repeat: { type: "string", default: "1" },
    "judge-sets": { type: "string" },
    key: { type: "string" },
    pairs: { type: "string" },
    regrade: { type: "string" },
    "regrade-sets": { type: "string" },
    dry: { type: "boolean", default: false },
  },
});
const command = positionals[0];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Spend: the fast-models ledger, with a stop before the budget.

const LEDGER =
  process.env.FM_LEDGER || path.join(process.env.HOME, ".cache/oats/summaries/ledger.jsonl");
const BUDGET = Number(process.env.FM_BUDGET_USD || "10");
const RUN_CAP = args["max-usd"] ? Number(args["max-usd"]) : Infinity;
let spentBefore = null;
let spentHere = 0;

function guard(spec) {
  if (parseSpec(spec).provider === "local") return;
  if (!priceOf(spec)) throw new Error(`No price for ${spec}: add it to PRICES first`);
  if (spentBefore === null) spentBefore = ledgerTotal();
  if (spentBefore + spentHere >= BUDGET) {
    throw new Error(`Budget of $${BUDGET} reached ($${(spentBefore + spentHere).toFixed(3)})`);
  }
  if (spentHere >= RUN_CAP) throw new Error(`This run's cap of $${RUN_CAP} reached`);
}

function record(spec, purpose, usage, extra = {}) {
  const cost = usage ? (costOf(spec, usage) ?? 0) * (extra.discount ?? 1) : (extra.cost ?? 0);
  spentHere += cost;
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(
    LEDGER,
    `${JSON.stringify({ at: new Date().toISOString(), spec, purpose, ...(usage ?? {}), cost, ...extra })}\n`
  );
  return cost;
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: response.status, json, text, ms: performance.now() - started };
  } catch (error) {
    return {
      status: error?.name === "AbortError" ? "timeout" : "network",
      json: null,
      text: String(error?.message ?? error),
      ms: performance.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** postJson, again on a rate limit, a server fault or a dropped connection (as the app's withRetry). */
async function postRetrying(url, headers, body, timeoutMs, attempts = 4) {
  let res = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    res = await postJson(url, headers, body, timeoutMs);
    const transient =
      res.status === 429 ||
      res.status === "network" ||
      (typeof res.status === "number" && res.status >= 500);
    if (!transient || attempt === attempts) break;
    await sleep(2000 * 2 ** (attempt - 1) * (0.5 + Math.random()));
  }
  return res;
}

// --- The routes, as the app sends a summary or a title.

const MEASURE_TIMEOUT_MS = 300_000;
const localPorts = new Map();

function registryModel(provider, id) {
  if (provider === "local") {
    for (const p of REGISTRY.localProviders) {
      const found = p.models.find((m) => m.id === id);
      if (found) return found;
    }
    return null;
  }
  for (const p of REGISTRY.cloudProviders) {
    if (p.id !== provider) continue;
    return p.models.find((m) => m.id === id) ?? null;
  }
  return null;
}

/** The OpenAI request shape the app picks (ModelRegistry.getOpenAiApiConfig). */
function openaiTakesTemperature(model) {
  const entry = registryModel("openai", model);
  if (entry?.tokenParam) return entry.supportsTemperature ?? true;
  if (/^gpt-(3|4o|4-)/.test(model) || model === "gpt-4") return true;
  return model.startsWith("gpt-4.1");
}

/**
 * One request by the app's route for `spec`. `kind` is "summary" or "title":
 * both go by the same route with the same parameters (generateNoteTitle).
 * Resolves to { ok, text, usage, cost, ms, status, stop, appOutcome, error, timings }.
 */
async function callRoute(spec, { system, user, purpose, freshPrompt = false }) {
  const { provider, model, options } = parseSpec(spec);
  guard(spec);
  if (provider === "local") {
    const port = localPorts.get(model);
    if (!port) throw new Error(`No llama-server for ${model}`);
    // localReasoningBridge.js: maxTokens from the text's length; llamaServer.js: the body.
    // @out4096 (a measurement, not the app): room for a model that reasons first.
    const outLimit = Number(options.find((o) => /^out\d+$/.test(o))?.slice(3)) || 2048;
    const maxTokens = Math.max(512, Math.min(user.length * 2, outLimit));
    // @low/@medium/@high (a measurement, not the app): GPT-OSS's reasoning effort,
    // which its chat template reads; the app sends none, so the template's medium.
    const effort = options.find((o) => /^(low|medium|high)$/.test(o));
    const res = await postJson(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {},
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: false,
          ...(effort ? { reasoning_effort: effort } : {}),
        },
        // The speed runs read the same conversation twice: the second must not
        // reuse the first one's prompt cache, as a new conversation cannot.
        ...(freshPrompt ? { cache_prompt: false } : {}),
      },
      MEASURE_TIMEOUT_MS
    );
    const message = res.json?.choices?.[0]?.message;
    const raw = String(message?.content || message?.reasoning_content || "").trim();
    const text = raw
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/<think>[\s\S]*$/, "")
      .trim();
    const usage = res.json?.usage
      ? { input: res.json.usage.prompt_tokens ?? 0, output: res.json.usage.completion_tokens ?? 0 }
      : null;
    record(spec, purpose, usage, { ms: Math.round(res.ms), ok: res.status === 200 });
    const stop = res.json?.choices?.[0]?.finish_reason ?? null;
    // The summary needs the whole answer (#139, `requireComplete`): one cut at the
    // output limit or by a full context fails, and nothing is saved.
    const cut = purpose === "summary" && stop === "length";
    const ok = res.status === 200 && Boolean(text) && !cut;
    return {
      ok,
      text,
      usage,
      cost: 0,
      ms: res.ms,
      status: res.status,
      stop,
      timings: res.json?.timings ?? null,
      // The app's request times out at 300 s (llamaServer.js).
      appOutcome: cut ? "cut" : !ok ? "error" : res.ms > 300_000 ? "timeout" : "ok",
      error: ok
        ? null
        : cut
          ? "stopped at the output limit: the app saves no summary (#139)"
          : (res.json?.error?.message ?? res.text).slice(0, 300),
    };
  }
  if (provider === "openai") {
    const body = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      store: false,
      max_output_tokens: 4096,
    };
    if (openaiTakesTemperature(model)) body.temperature = 0.3;
    // @flex: the same request at the Flex tier, half the price and slower. For the
    // quality runs of the dearest models only; their latency is measured without it.
    if (options.includes("flex")) body.service_tier = "flex";
    // @low, @none...: a reasoning effort. The app sends none for a summary (the
    // model's default); an option here measures what setting one would change.
    const effort = options.find((option) => /^(none|minimal|low|medium|high|xhigh)$/.test(option));
    if (effort) body.reasoning = { effort };
    const res = await postRetrying(
      "https://api.openai.com/v1/responses",
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body,
      /-pro$/.test(model) || options.includes("flex") ? 1_200_000 : MEASURE_TIMEOUT_MS
    );
    let text = "";
    for (const item of res.json?.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) {
          text = part.text.trim();
          break;
        }
      }
      if (text) break;
    }
    const usage = res.json?.usage
      ? {
          input: res.json.usage.input_tokens ?? 0,
          cached: res.json.usage.input_tokens_details?.cached_tokens ?? 0,
          output: res.json.usage.output_tokens ?? 0,
          reasoning: res.json.usage.output_tokens_details?.reasoning_tokens ?? 0,
        }
      : null;
    const tier = res.json?.service_tier ?? null;
    const cost = record(spec, purpose, usage, {
      ms: Math.round(res.ms),
      ok: res.status === 200,
      tier,
      discount: tier === "flex" ? 0.5 : 1,
    });
    const ok = res.status === 200;
    // The app: 30 s a request (openai.ts), and an empty answer returns the input
    // itself as the result, so the transcript would be saved as the summary.
    let appOutcome = "ok";
    if (!ok) appOutcome = "error";
    else if (res.ms > 30_000) appOutcome = "timeout";
    else if (!text) appOutcome = "empty";
    return {
      ok: ok && Boolean(text),
      text,
      usage,
      cost,
      ms: res.ms,
      status: res.status,
      stop: res.json?.status ?? null,
      incomplete: res.json?.incomplete_details?.reason ?? null,
      tier,
      appOutcome,
      error: ok ? null : (res.json?.error?.message ?? res.text).slice(0, 300),
    };
  }
  if (provider === "anthropic") {
    // "process-anthropic-reasoning" without temperature (see the header).
    const { body, beta } = anthropicSummaryBody(model, options, system, user);
    const res = await postRetrying(
      "https://api.anthropic.com/v1/messages",
      {
        "X-API-Key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(beta ? { "anthropic-beta": beta } : {}),
      },
      body,
      MEASURE_TIMEOUT_MS
    );
    const blocks = res.json?.content ?? [];
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const usage = res.json?.usage
      ? {
          input:
            (res.json.usage.input_tokens ?? 0) +
            (res.json.usage.cache_read_input_tokens ?? 0) +
            (res.json.usage.cache_creation_input_tokens ?? 0),
          cached: res.json.usage.cache_read_input_tokens ?? 0,
          written: res.json.usage.cache_creation_input_tokens ?? 0,
          output: res.json.usage.output_tokens ?? 0,
        }
      : null;
    const cost = record(spec, purpose, usage, { ms: Math.round(res.ms), ok: res.status === 200 });
    const ok = res.status === 200 && Boolean(text);
    return {
      ok,
      text,
      usage,
      cost,
      ms: res.ms,
      status: res.status,
      stop: res.json?.stop_reason ?? null,
      firstBlock: blocks[0]?.type ?? null,
      // As shipped: HTTP 400 for temperature on every current model (probed).
      appOutcome: ok ? "ok-after-fix" : "error",
      error: ok ? null : (res.json?.error?.message ?? res.text).slice(0, 300),
    };
  }
  if (provider === "bedrock") {
    const res = await postRetrying(
      `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
      { Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}` },
      {
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
      },
      MEASURE_TIMEOUT_MS
    );
    const text = (res.json?.output?.message?.content ?? [])
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    const usage = res.json?.usage
      ? { input: res.json.usage.inputTokens ?? 0, output: res.json.usage.outputTokens ?? 0 }
      : null;
    const cost = record(spec, purpose, usage, { ms: Math.round(res.ms), ok: res.status === 200 });
    const ok = res.status === 200 && Boolean(text);
    return {
      ok,
      text,
      usage,
      cost,
      ms: res.ms,
      status: res.status,
      stop: res.json?.stopReason ?? null,
      // "process-enterprise-reasoning" gives up after 60 s.
      appOutcome: !ok ? "error" : res.ms > 60_000 ? "timeout" : "not-in-app",
      error: ok ? null : (res.json?.message ?? res.text).slice(0, 300),
    };
  }
  throw new Error(`Unknown provider ${provider}`);
}

/** generateNoteTitle's cleaning: trimmed, outer quotes off, kept only under 100 characters. */
function cleanTitle(raw) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  return cleaned.length > 0 && cleaned.length < 100 ? cleaned : "";
}

async function startLocal(spec) {
  const { model } = parseSpec(spec);
  if (localPorts.has(model)) return;
  if (!args.gguf || !args["llama-server"]) throw new Error("--gguf and --llama-server are needed");
  const entry = registryModel("local", model);
  // modelManagerBridge.serverOptions: 16384, or less if the model's context is smaller.
  const contextSize = Math.min(16384, entry?.contextLength || 16384);
  const port = Number(args.port);
  const started = performance.now();
  const child = await startLocalServer(model, {
    binary: args["llama-server"],
    model: args.gguf,
    port,
    contextSize,
    threads: 4,
  });
  localPorts.set(model, port);
  const log = child.startupLog?.() ?? "";
  return {
    loadMs: performance.now() - started,
    contextSize,
    pid: child.pid,
    buffers: bufferSizes(log),
    // The log's own memory lines, as printed (the buffer names change between builds).
    memoryLines: log
      .split("\n")
      .filter((line) => /buffer size|KV self size|kv.?cache|RS buffer|memory/i.test(line))
      .map((line) => line.trim())
      .slice(0, 60),
  };
}

/** llama-server's own buffer sizes (MiB) from its start log: model, KV cache, compute. */
function bufferSizes(log) {
  const sum = (pattern) => {
    let total = 0;
    let found = false;
    for (const match of log.matchAll(pattern)) {
      total += Number(match[1]);
      found = true;
    }
    return found ? Math.round(total * 10) / 10 : null;
  };
  return {
    modelMiB: sum(/model buffer size\s*=\s*([\d.]+) MiB/g),
    kvMiB: sum(/(?:KV|RS) (?:buffer|cache|self) size\s*=\s*([\d.]+) MiB/gi),
    computeMiB: sum(/compute buffer size\s*=\s*([\d.]+) MiB/g),
  };
}

/** A process's physical footprint in MB (macOS `footprint`), or null. */
async function footprintMb(pid) {
  if (!pid) return null;
  const { execFileSync } = await import("node:child_process");
  try {
    const text = execFileSync("/usr/bin/footprint", [String(pid)], { encoding: "utf8" });
    const match = /Footprint:\s*([\d.]+)\s*(KB|MB|GB)/i.exec(text);
    if (!match) return null;
    const value = Number(match[1]);
    return match[2].toUpperCase() === "GB"
      ? value * 1024
      : match[2].toUpperCase() === "KB"
        ? value / 1024
        : value;
  } catch {
    return null;
  }
}

/**
 * A process's resident memory in MB (`ps -o rss`): with the model file's pages the
 * GPU has read, which the footprint leaves out (llama-server maps the file).
 */
async function residentMb(pid) {
  if (!pid) return null;
  const { execFileSync } = await import("node:child_process");
  try {
    const kb = Number(
      execFileSync("/bin/ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" })
    );
    return Number.isFinite(kb) && kb > 0 ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

function keyOf(spec, tag) {
  return `${spec.replace(/[:/]/g, "_")}${tag ? `+${tag}` : ""}`;
}

async function pool(items, size, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function parseAsr() {
  const out = {};
  for (const value of args.asr) {
    const [name, file] = value.split("=");
    out[name] = file;
  }
  return out;
}

// --- generate

async function generate() {
  const spec = args.model;
  const { provider } = parseSpec(spec);
  const prompt = appSummaryPrompt(args["prompt-ref"]);
  // --key: write into another run's directory, e.g. a model's Flex requests beside
  // the same model's standard ones (one configuration, two price tiers).
  const key = args.key ?? keyOf(spec, args.tag);
  const dir = path.join(args.out, "gen", key);
  fs.mkdirSync(dir, { recursive: true });
  const inputs = loadInputs(args.ami, {
    sets: args.sets.split(","),
    asr: parseAsr(),
    meetings: args.meetings ? args.meetings.split(",") : null,
  });
  let load = null;
  if (provider === "local") load = await startLocal(spec);
  const todo = inputs.filter((input) => !fs.existsSync(path.join(dir, `${input.id}.json`)));
  console.error(`${key}: ${todo.length} of ${inputs.length} to write (prompt: ${prompt.ref})`);
  const concurrency = provider === "local" ? 1 : Number(args.concurrency);
  // --batch (Anthropic): the summaries through the Message Batches API at half the
  // price, the same request bodies; the titles after, one by one. Latency is not
  // measured this way: a few inputs go without --batch for that.
  const batched =
    args.batch && provider === "anthropic" && todo.length
      ? await anthropicBatchSummaries(spec, prompt, todo)
      : null;
  let done = 0;
  try {
    await pool(todo, concurrency, async (input) => {
      const user = prompt.userPrefix + finishTranscript(input.segments);
      const summary =
        batched?.get(input.id) ??
        (await callRoute(spec, { system: prompt.system, user, purpose: "summary" }));
      // The title is written from what the summary call returned (the app's
      // `enhanced`): for OpenAI's empty answer, that is the transcript itself.
      const enhanced = summary.ok ? summary.text : summary.appOutcome === "empty" ? user : "";
      let title = null;
      if (enhanced) {
        title = await callRoute(spec, {
          system: prompt.titleSystem,
          user: enhanced.slice(0, 2000),
          purpose: "title",
        });
      }
      const result = {
        spec,
        key,
        tag: args.tag ?? null,
        promptRef: prompt.ref,
        input: input.id,
        meeting: input.meeting,
        set: input.set,
        minutes: input.minutes,
        transcriptChars: user.length,
        summary,
        title: title ? { ...title, clean: cleanTitle(title.text) } : null,
        load: done === 0 ? load : null,
      };
      fs.writeFileSync(path.join(dir, `${input.id}.json`), JSON.stringify(result, null, 1));
      done += 1;
      console.error(
        `${input.id.padEnd(14)} ${summary.ok ? "ok " : "ERR"} ${String(summary.status).padEnd(4)} ${(summary.ms / 1000).toFixed(1)}s ${summary.usage ? `${summary.usage.input}/${summary.usage.output}` : ""} ${summary.appOutcome} ${summary.stop ?? ""} ${summary.error ?? ""} | ${title?.text?.slice(0, 60) ?? ""}`
      );
    });
  } finally {
    stopLocalServers();
  }
  console.error(`spent here $${spentHere.toFixed(4)}`);
}

/**
 * The app's Anthropic summary body (without temperature). `@low`/`@high`... add an
 * effort, which the app does not send (a measurement of what it would change).
 * Claude Opus 5.5 gets the server-side refusal fallback, as the fixed route sends it.
 */
function anthropicSummaryBody(model, options, system, user) {
  const body = {
    model,
    messages: [{ role: "user", content: user }],
    system,
    max_tokens: Math.max(100, Math.min(user.length * 2, 4096)),
  };
  const effort = options.find((option) => /^(low|medium|high|xhigh|max)$/.test(option));
  if (effort) body.output_config = { effort };
  // @nothink: thinking off as the fixed route (#133) sends it with the app's default
  // "disable thinking": Sonnet 5.5 "between_tools", the others that allow it "disabled".
  if (options.includes("nothink")) {
    body.thinking = /^claude-sonnet-5-5/.test(model)
      ? { type: "between_tools" }
      : { type: "disabled" };
  }
  let beta = null;
  if (/^claude-opus-5-5/.test(model) && !options.includes("nofallback")) {
    body.fallbacks = "default";
    beta = "server-side-fallback-2026-07-01";
  }
  return { body, beta };
}

const ANTHROPIC_BATCH_HEADERS = (beta = null) => ({
  "x-api-key": process.env.ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  ...(beta ? { "anthropic-beta": beta } : {}),
});

/** Submits one Message Batch, waits for it, and returns its results by custom_id. */
async function runAnthropicBatch(requests, label, beta = null) {
  const headers = ANTHROPIC_BATCH_HEADERS(beta);
  const created = await postJson(
    "https://api.anthropic.com/v1/messages/batches",
    headers,
    { requests },
    120_000
  );
  if (created.status !== 200) {
    throw new Error(`batch create HTTP ${created.status}: ${created.text.slice(0, 300)}`);
  }
  const id = created.json.id;
  console.error(`${label}: batch ${id}, ${requests.length} requests`);
  let status = created.json;
  while (status.processing_status !== "ended") {
    await sleep(20_000);
    const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers });
    status = await res.json();
    console.error(`${label}: ${status.processing_status} ${JSON.stringify(status.request_counts)}`);
  }
  const text = await (await fetch(status.results_url, { headers })).text();
  const out = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    out.set(row.custom_id, { ...row.result, batch: id });
  }
  return out;
}

async function anthropicBatchSummaries(spec, prompt, inputs) {
  const { model, options } = parseSpec(spec);
  guard(spec);
  let beta = null;
  const requests = inputs.map((input) => {
    const user = prompt.userPrefix + finishTranscript(input.segments);
    const built = anthropicSummaryBody(model, options, prompt.system, user);
    beta = built.beta;
    return { custom_id: input.id.replace(/[^a-zA-Z0-9_-]/g, "_"), params: built.body };
  });
  // A rough ceiling before sending: input at 1 token per 3.5 characters, 2,500 out.
  const price = priceOf(spec);
  const estimate =
    requests.reduce(
      (sum, r) =>
        sum + (r.params.messages[0].content.length / 3.5) * price.input + 2500 * price.output,
      0
    ) / 2e6;
  if ((spentBefore ?? 0) + spentHere + estimate >= BUDGET || spentHere + estimate > RUN_CAP) {
    throw new Error(
      `The batch would cost up to $${estimate.toFixed(2)}: over the budget or the cap`
    );
  }
  console.error(`${spec}: up to $${estimate.toFixed(2)} at the batch price`);
  const results = await runAnthropicBatch(requests, spec, beta);
  const out = new Map();
  for (const input of inputs) {
    const result = results.get(input.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const message = result?.type === "succeeded" ? result.message : null;
    const blocks = message?.content ?? [];
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const usage = message?.usage
      ? {
          input: message.usage.input_tokens ?? 0,
          output: message.usage.output_tokens ?? 0,
        }
      : null;
    const cost = record(spec, "summary-batch", usage, {
      discount: 0.5,
      ok: Boolean(message),
      batch: result?.batch,
    });
    out.set(input.id, {
      ok: Boolean(text),
      text,
      usage,
      cost,
      ms: null,
      status: message ? 200 : (result?.type ?? "missing"),
      stop: message?.stop_reason ?? null,
      firstBlock: blocks[0]?.type ?? null,
      appOutcome: text ? "ok-after-fix" : "error",
      error: text ? null : JSON.stringify(result?.error ?? result?.type ?? "").slice(0, 300),
      batch: result?.batch ?? null,
    });
  }
  return out;
}

// --- speed: one conversation at a time on a warm server, with llama-server's own timings.

async function speed() {
  const spec = args.model;
  const prompt = appSummaryPrompt(args["prompt-ref"]);
  const load = await startLocal(spec);
  load.footprintLoadedMb = await footprintMb(load.pid);
  load.residentLoadedMb = await residentMb(load.pid);
  const rows = [];
  try {
    for (const group of (args.meetings ?? "IS1009c,TS3003a+TS3003b").split(",")) {
      const parts = group.split("+");
      const inputs = loadInputs(args.ami, { sets: ["ref"], meetings: parts });
      const segments = inputs.flatMap((input) => input.segments);
      const minutes = inputs.reduce((sum, input) => sum + input.minutes, 0);
      const user = prompt.userPrefix + finishTranscript(segments);
      for (let run = 0; run < Number(args.repeat); run += 1) {
        const result = await callRoute(spec, {
          system: prompt.system,
          user,
          purpose: "speed",
          freshPrompt: true,
        });
        const t = result.timings ?? {};
        rows.push({
          conversation: group,
          minutes,
          ms: result.ms,
          ok: result.ok,
          stop: result.stop,
          error: result.error,
          promptTokens: t.prompt_n,
          promptMs: t.prompt_ms,
          promptPerSecond: t.prompt_per_second,
          outputTokens: t.predicted_n,
          outputMs: t.predicted_ms,
          outputPerSecond: t.predicted_per_second,
          footprintMb: await footprintMb(load.pid),
          residentMb: await residentMb(load.pid),
        });
        console.error(JSON.stringify(rows.at(-1)));
      }
    }
  } finally {
    stopLocalServers();
  }
  const out = { spec, gguf: args.gguf, load, rows };
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
}

// --- judge

const JUDGE_SYSTEM = `You grade summaries of a recorded meeting. You are careful and strict, and you grade each summary on its own.

You get:
1. TRANSCRIPT: the manual transcript of the meeting, what was really said. Each line is a speaker (a letter, and a role when known) and their words. Speech overlaps, so some lines are fragments.
2. REFERENCE: a summary written by a person who studied the meeting: an abstract (items A1, A2, ...), decisions (D1, ...), actions (T1, ...) and problems (P1, ...). Some lists can be empty.
3. CANDIDATES: summaries of the same meeting written by different systems, each with a title and an id. Some were written from an automatic transcript with many recognition errors. Their order means nothing.

For each candidate, give:
- "covered": the ids of the REFERENCE items whose substance the candidate states, anywhere in its text (a paraphrase counts; a passing mention of the subject without the point does not). Check every reference item.
- "unsupported": every claim in the candidate that the TRANSCRIPT does not support. Count invented facts, wrong numbers or prices, decisions or agreements that were not made, actions nobody took on, and things attributed to the wrong person. Do not count omissions, vague but true statements, opinions about the meeting, headings, or speaker labels like "You" and "Them" when the claim itself is true. Quote each claim briefly, 15 words or fewer.
- "useful": 1 to 5. How useful is this summary to a participant who wants a record of the meeting? 5: accurate, covers what mattered, easy to read. 3: some value, real gaps or noise. 1: misleading or of no use.
- "title": 1 to 5. How well does the title name this meeting? 5: specific and accurate. 1: wrong, empty or generic.

Answer with JSON only: {"grades": [{"id": "...", "covered": ["D1", "A3"], "unsupported": ["..."], "useful": 4, "title": 3}]}, one entry per candidate, in any order.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          covered: { type: "array", items: { type: "string" } },
          unsupported: { type: "array", items: { type: "string" } },
          useful: { type: "integer" },
          title: { type: "integer" },
        },
        required: ["id", "covered", "unsupported", "useful", "title"],
        additionalProperties: false,
      },
    },
  },
  required: ["grades"],
  additionalProperties: false,
};

function referenceText(human) {
  const lines = [];
  for (const [section, label] of [
    ["abstract", "Abstract"],
    ["decisions", "Decisions"],
    ["actions", "Actions"],
    ["problems", "Problems"],
  ]) {
    lines.push(`${label}:`);
    if (!human[section].length) lines.push("(none)");
    for (const item of human[section]) lines.push(`${item.id}. ${item.text}`);
  }
  return lines.join("\n");
}

function loadSummaries(out, keys) {
  const genDir = path.join(out, "gen");
  const all = [];
  for (const key of fs.readdirSync(genDir)) {
    if (keys && !keys.includes(key)) continue;
    for (const file of fs.readdirSync(path.join(genDir, key))) {
      if (!file.endsWith(".json")) continue;
      all.push(JSON.parse(fs.readFileSync(path.join(genDir, key, file), "utf8")));
    }
  }
  return all;
}

function randomId(random) {
  const letters = "BCDFGHJKLMNPQRSTVWXZ";
  let id = "";
  for (let i = 0; i < 4; i += 1) id += letters[Math.floor(random() * letters.length)];
  return id;
}

function candidateList(candidates) {
  const list = candidates
    .map(
      (c) =>
        `=== Candidate ${c.id} ===\nTitle: ${c.title || "(no title)"}\n\n${c.text}\n=== End of ${c.id} ===`
    )
    .join("\n\n");
  return `CANDIDATES (${candidates.length}):\n\n${list}\n\nGrade all ${candidates.length} candidates: ${candidates.map((c) => c.id).join(", ")}.`;
}

function judgePrefix(meeting) {
  return `TRANSCRIPT:\n${meeting.transcript}\n\nREFERENCE:\n${meeting.reference}`;
}

/** The Anthropic judge request. In a batch the prefix is cached for an hour, so a meeting's chunks share it. */
function judgeRequest(spec, meeting, candidates, effort, { longCache = false } = {}) {
  const { model } = parseSpec(spec);
  return {
    model,
    max_tokens: 32000,
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: judgePrefix(meeting),
            cache_control: longCache ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" },
          },
          { type: "text", text: candidateList(candidates) },
        ],
      },
    ],
    output_config: { effort, format: { type: "json_schema", schema: JUDGE_SCHEMA } },
  };
}

/** The OpenAI judge request (a second judge from another family): Responses API, strict JSON. */
function openaiJudgeRequest(spec, meeting, candidates, effort) {
  const { model, options } = parseSpec(spec);
  const body = {
    model,
    input: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: `${judgePrefix(meeting)}\n\n${candidateList(candidates)}` },
    ],
    store: false,
    max_output_tokens: 32000,
    reasoning: { effort },
    text: { format: { type: "json_schema", name: "grades", schema: JUDGE_SCHEMA, strict: true } },
  };
  if (options.includes("flex")) body.service_tier = "flex";
  return body;
}

function judgeUsage(json) {
  const u = json?.usage;
  if (!u) return null;
  if (u.input_tokens_details || u.output_tokens_details) {
    return {
      input: u.input_tokens ?? 0,
      cached: u.input_tokens_details?.cached_tokens ?? 0,
      output: u.output_tokens ?? 0,
      reasoning: u.output_tokens_details?.reasoning_tokens ?? 0,
    };
  }
  const read = u.cache_read_input_tokens ?? 0;
  const written = u.cache_creation_input_tokens ?? 0;
  return {
    input: (u.input_tokens ?? 0) + read + written,
    cached: read,
    written,
    output: u.output_tokens ?? 0,
  };
}

function judgeText(json) {
  if (Array.isArray(json?.output)) {
    let text = "";
    for (const item of json.output) {
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) if (part.type === "output_text") text += part.text;
    }
    return text;
  }
  return (json?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseGrades(json) {
  const text = judgeText(json);
  try {
    return JSON.parse(text).grades;
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    try {
      return JSON.parse(text.slice(first, last + 1)).grades;
    } catch {
      return null;
    }
  }
}

/** Where one judge's grades go: a directory per judge model, effort and pass. */
function judgeDirKey(spec, effort, pass) {
  const parts = [];
  if (effort !== "medium") parts.push(effort);
  if (pass > 1) parts.push(`p${pass}`);
  return keyOf(spec, parts.join("+"));
}

/** The chunks to grade: per meeting, every summary not yet graded in this pass, shuffled, in groups. */
function planJudging(spec, pass) {
  const judgeKey = judgeDirKey(spec, args.effort, pass);
  const dir = path.join(args.out, "judge", judgeKey);
  fs.mkdirSync(dir, { recursive: true });
  const graded = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file.startsWith("batch-")) continue;
    const chunk = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for (const c of chunk.candidates) if (chunk.grades?.[c.id]) graded.add(`${c.key}/${c.input}`);
  }
  const keys = args.keys ? args.keys.split(",") : null;
  const wanted = args.meetings ? new Set(args.meetings.split(",")) : null;
  const sets = args["judge-sets"] ? new Set(args["judge-sets"].split(",")) : null;
  // --regrade: these keys are graded again in this pass, beside the new ones,
  // to show whether a later wave grades the same summary the same way.
  const regrade = new Set(args.regrade ? args.regrade.split(",") : []);
  // --regrade-sets ref: only these inputs of the regraded keys (an anchor on the
  // manual transcripts, beside new summaries of every set).
  const regradeSets = args["regrade-sets"] ? new Set(args["regrade-sets"].split(",")) : null;
  const summaries = loadSummaries(args.out, keys ? [...keys, ...regrade] : null).filter(
    (s) =>
      s.summary.ok &&
      (regrade.has(s.key) || !graded.has(`${s.key}/${s.input}`)) &&
      (!regrade.has(s.key) || !regradeSets || regradeSets.has(s.set)) &&
      (!wanted || wanted.has(s.meeting)) &&
      (!sets || sets.has(s.set))
  );
  const byMeeting = new Map();
  for (const s of summaries) {
    if (!byMeeting.has(s.meeting)) byMeeting.set(s.meeting, []);
    byMeeting.get(s.meeting).push(s);
  }
  const random = seeded(Number(args.seed) * 1000 + pass * 97 + fs.readdirSync(dir).length);
  const size = Number(args.chunk);
  const chunks = [];
  for (const [meeting, list] of byMeeting) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const groups = Math.ceil(list.length / size);
    for (let g = 0; g < groups; g += 1) {
      const part = list.filter((_, index) => index % groups === g);
      const used = new Set();
      const candidates = part.map((s) => {
        let id;
        do id = randomId(random);
        while (used.has(id));
        used.add(id);
        return {
          id,
          key: s.key,
          input: s.input,
          title: s.title?.clean ?? "",
          text: s.summary.text,
        };
      });
      chunks.push({
        meeting,
        candidates,
        file: path.join(dir, `${meeting}-${Date.now()}-${pass}-${g}.json`),
      });
    }
  }
  return { judgeKey, dir, chunks };
}

const meetingCache = new Map();
function meetingMaterial(meeting) {
  if (!meetingCache.has(meeting)) {
    meetingCache.set(meeting, {
      transcript: judgeTranscript(args.ami, meeting),
      reference: referenceText(humanSummary(args.ami, meeting)),
    });
  }
  return meetingCache.get(meeting);
}

function saveChunk(chunk, json, spec, extra = {}) {
  const grades = parseGrades(json) ?? [];
  const byId = {};
  for (const grade of grades) if (grade?.id) byId[grade.id] = grade;
  const missing = chunk.candidates.filter((c) => !byId[c.id]).map((c) => c.id);
  fs.writeFileSync(
    chunk.file,
    JSON.stringify(
      {
        judge: spec,
        effort: args.effort,
        meeting: chunk.meeting,
        candidates: chunk.candidates.map(({ id, key, input }) => ({ id, key, input })),
        grades: byId,
        missing,
        usage: judgeUsage(json),
        stop: json?.stop_reason ?? json?.status ?? null,
        ...extra,
      },
      null,
      1
    )
  );
  return missing;
}

async function judge() {
  const spec = args.judge;
  const { provider, options } = parseSpec(spec);
  const pass = Number(args.repeat) || 1;
  const { chunks } = planJudging(spec, pass);
  console.error(
    `${chunks.length} chunks to grade with ${spec} (effort ${args.effort}, pass ${pass})`
  );
  if (!chunks.length) return;
  if (args.batch && provider === "anthropic") return judgeBatch(spec, chunks);
  // Chunks of one meeting share the cached prefix, so a meeting's chunks go in order.
  const byMeeting = new Map();
  for (const chunk of chunks) {
    if (!byMeeting.has(chunk.meeting)) byMeeting.set(chunk.meeting, []);
    byMeeting.get(chunk.meeting).push(chunk);
  }
  await pool([...byMeeting.values()], Number(args.concurrency), async (list) => {
    for (const chunk of list) {
      guard(spec);
      const material = meetingMaterial(chunk.meeting);
      const res =
        provider === "openai"
          ? await postRetrying(
              "https://api.openai.com/v1/responses",
              { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
              openaiJudgeRequest(spec, material, chunk.candidates, args.effort),
              1_200_000
            )
          : await postRetrying(
              "https://api.anthropic.com/v1/messages",
              { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2026-10-21" },
              judgeRequest(spec, material, chunk.candidates, args.effort),
              900_000
            );
      const usage = judgeUsage(res.json);
      const flex = res.json?.service_tier === "flex" || options.includes("flex");
      const cost = record(spec, "judge", usage, {
        ms: Math.round(res.ms),
        ok: res.status === 200,
        discount: provider === "openai" && flex ? 0.5 : 1,
      });
      if (res.status !== 200) {
        console.error(`${chunk.meeting} judge HTTP ${res.status}: ${res.text.slice(0, 300)}`);
        continue;
      }
      const missing = saveChunk(chunk, res.json, spec, { pass });
      console.error(
        `${chunk.meeting} ${chunk.candidates.length} graded, missing ${missing.length}, ${usage?.input}/${usage?.cached}/${usage?.output} tok, $${cost.toFixed(4)}, ${(res.ms / 1000).toFixed(0)}s`
      );
    }
  });
  console.error(`spent here $${spentHere.toFixed(4)}`);
}

/** The same requests through the Message Batches API: half the price, results within the hour. */
async function judgeBatch(spec, chunks) {
  const pass = Number(args.repeat) || 1;
  const requests = chunks.map((chunk, index) => ({
    custom_id: `c${index}`,
    params: judgeRequest(spec, meetingMaterial(chunk.meeting), chunk.candidates, args.effort, {
      longCache: true,
    }),
  }));
  // An estimate before sending: inputs at the batch price, 700 output tokens a candidate.
  const price = priceOf(spec);
  const candidatesCount = chunks.reduce((sum, chunk) => sum + chunk.candidates.length, 0);
  const estimate =
    (requests.reduce(
      (sum, r) => sum + (JSON.stringify(r.params.messages).length / 3.6) * price.input,
      0
    ) +
      candidatesCount * 700 * price.output) /
    2e6;
  guard(spec);
  if (spentBefore + spentHere + estimate >= BUDGET || spentHere + estimate > RUN_CAP) {
    throw new Error(
      `The batch would cost about $${estimate.toFixed(2)}: over the budget or the cap`
    );
  }
  console.error(
    `batch of ${requests.length} chunks (${candidatesCount} summaries), about $${estimate.toFixed(2)}`
  );
  // --dry: the plan and its estimate, nothing sent.
  if (args.dry) return;
  const headers = { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2026-10-21" };
  const created = await postJson(
    "https://api.anthropic.com/v1/messages/batches",
    headers,
    { requests },
    300_000
  );
  if (created.status !== 200)
    throw new Error(`batch create HTTP ${created.status}: ${created.text.slice(0, 300)}`);
  const id = created.json.id;
  fs.writeFileSync(
    path.join(path.dirname(chunks[0].file), `batch-${id}.json`),
    JSON.stringify({ id, chunks }, null, 1)
  );
  console.error(`batch ${id}`);
  let status = created.json;
  while (status.processing_status !== "ended") {
    await sleep(30_000);
    const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers });
    status = await res.json();
    console.error(
      `batch ${id}: ${status.processing_status} ${JSON.stringify(status.request_counts)}`
    );
  }
  const results = await (await fetch(status.results_url, { headers })).text();
  for (const line of results.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const chunk = chunks[Number(row.custom_id.slice(1))];
    if (row.result?.type !== "succeeded") {
      console.error(
        `${chunk.meeting}: ${row.result?.type} ${JSON.stringify(row.result?.error ?? "").slice(0, 200)}`
      );
      continue;
    }
    const message = row.result.message;
    // The 1-hour cache write is booked at twice the input price (the write rate in the
    // table is the 5-minute one), half of it in a batch.
    const usage = judgeUsage(message);
    const cost = record(
      spec,
      "judge-batch",
      usage ? { ...usage, written: 0, input: usage.input + (usage.written ?? 0) } : null,
      {
        discount: 0.5,
        ok: true,
        batch: id,
      }
    );
    const extraWrite = usage?.written ? (usage.written * price.input * 1) / 2e6 : 0;
    if (extraWrite)
      record(spec, "judge-batch-cache-1h", null, { cost: extraWrite, tokens: usage.written });
    const missing = saveChunk(chunk, message, spec, { batch: id, pass });
    console.error(
      `${chunk.meeting} graded, missing ${missing.length}, $${(cost + extraWrite).toFixed(4)}`
    );
  }
  console.error(`spent here $${spentHere.toFixed(4)}`);
}

// --- report

function pairedInterval(rows, metric, baselineKey, key) {
  const base = new Map(
    rows
      .filter((r) => r.key === baselineKey && Number.isFinite(r[metric]))
      .map((r) => [r.input, r[metric]])
  );
  const diffs = rows
    .filter((r) => r.key === key && Number.isFinite(r[metric]) && base.has(r.input))
    .map((r) => r[metric] - base.get(r.input));
  return bootstrapMean(diffs);
}

/** Every pass of one judge (model and effort): `${key}/${input}` → the grades, one per pass. */
function loadGrades(spec, effort) {
  const base = judgeDirKey(spec, effort, 1);
  const root = path.join(args.out, "judge");
  const grades = new Map();
  if (!fs.existsSync(root)) return grades;
  for (const dirName of fs.readdirSync(root)) {
    // The first pass's directory, or a later pass's: `${base}+p<n>`. Compared as
    // text, not as a pattern built from the directory name.
    const pass = dirName.startsWith(`${base}+p`) ? dirName.slice(base.length + 2) : "";
    if (dirName !== base && !/^\d+$/.test(pass)) continue;
    const dir = path.join(root, dirName);
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json") || file.startsWith("batch-")) continue;
      const chunk = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const c of chunk.candidates) {
        const grade = chunk.grades?.[c.id];
        if (!grade) continue;
        const id = `${c.key}/${c.input}`;
        if (!grades.has(id)) grades.set(id, []);
        grades.get(id).push({ ...grade, pass: dirName });
      }
    }
  }
  return grades;
}

function gradeMetrics(grade, human) {
  const covered = new Set(grade.covered ?? []);
  const share = (list) =>
    list.length ? list.filter((item) => covered.has(item.id)).length / list.length : null;
  const dtp = [...human.decisions, ...human.actions, ...human.problems];
  return {
    dtp: share(dtp),
    decisions: share(human.decisions),
    actions: share(human.actions),
    problems: share(human.problems),
    abstract: share(human.abstract),
    unsupported: (grade.unsupported ?? []).length,
    anyUnsupported: (grade.unsupported ?? []).length ? 1 : 0,
    useful: Math.min(5, Math.max(1, Number(grade.useful) || 1)),
    title: Math.min(5, Math.max(1, Number(grade.title) || 1)),
  };
}

const METRICS = [
  "dtp",
  "decisions",
  "actions",
  "problems",
  "abstract",
  "unsupported",
  "anyUnsupported",
  "useful",
  "title",
];

/** One row per summary: what it cost and took, and its grades averaged over the judge's passes. */
function summaryRows(spec, effort) {
  const summaries = loadSummaries(args.out, args.keys ? args.keys.split(",") : null);
  const grades = loadGrades(spec, effort);
  const humans = new Map();
  return summaries.map((s) => {
    if (!humans.has(s.meeting)) humans.set(s.meeting, humanSummary(args.ami, s.meeting));
    const human = humans.get(s.meeting);
    const list = grades.get(`${s.key}/${s.input}`) ?? [];
    const per = list.map((grade) => gradeMetrics(grade, human));
    const avg = {};
    for (const metric of METRICS) {
      const values = per.map((m) => m[metric]).filter((v) => v != null && Number.isFinite(v));
      avg[metric] = values.length ? mean(values) : null;
      avg[`${metric}Passes`] = per.map((m) => m[metric]);
    }
    const refText = [...human.abstract, ...human.decisions, ...human.actions, ...human.problems]
      .map((item) => item.text)
      .join(" ");
    return {
      key: s.key,
      input: s.input,
      meeting: s.meeting,
      set: s.set,
      minutes: s.minutes,
      ok: s.summary.ok,
      appOutcome: s.summary.appOutcome,
      status: s.summary.status,
      ms: s.summary.ms,
      cost: (s.summary.cost ?? 0) + (s.title?.cost ?? 0),
      // What the same requests cost at the standard tier: Flex and the Batch API
      // are booked at half price.
      standardCost:
        (s.summary.cost ?? 0) * (s.summary.tier === "flex" || s.summary.batch ? 2 : 1) +
        (s.title?.cost ?? 0) * (s.title?.tier === "flex" ? 2 : 1),
      spec: s.spec,
      tier: s.summary.batch ? "batch" : (s.summary.tier ?? null),
      inputTokens: s.summary.usage?.input ?? null,
      outputTokens: s.summary.usage?.output ?? null,
      reasoningTokens: s.summary.usage?.reasoning ?? null,
      stop: s.summary.stop,
      firstBlock: s.summary.firstBlock ?? null,
      words: tokens(s.summary.text).length,
      youThem: s.summary.ok ? youThemLines(s.summary.text) : null,
      hasTitle: Boolean(s.title?.clean),
      passes: per.length,
      ...avg,
      rougeL: s.summary.ok ? rougeL(s.summary.text, refText) : null,
    };
  });
}

function report() {
  const rows = summaryRows(args.judge, args.effort);
  const keys = [...new Set(rows.map((r) => r.key))].sort();
  const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(d));
  const ci = (b, d = 2, scale = 1) =>
    b.mean == null
      ? "–"
      : `${fmt(b.mean * scale, d)} [${fmt(b.low * scale, d)}, ${fmt(b.high * scale, d)}]`;
  const pct = (values) => {
    const m = mean(values.filter((v) => v != null));
    return m == null ? "–" : (m * 100).toFixed(0);
  };
  const views = [
    ["ref", (r) => r.set === "ref"],
    ["ref, the 8 far-field meetings", (r) => r.set === "ref" && FAR8_SET.has(r.meeting)],
    ["quiet", (r) => r.set === "quiet"],
    ["steady", (r) => r.set === "steady"],
  ];
  const lines = [`Judge: ${args.judge} (effort ${args.effort}); grades averaged over its passes.`];
  for (const [label, filter] of views) {
    const view = rows.filter(filter);
    if (!view.length) continue;
    lines.push(`\n## ${label}\n`);
    lines.push(
      "| model | ok / all | app outcome | graded (passes) | D+T+P covered % | decisions % | actions % | problems % | abstract % | unsupported per summary | with any unsupported % | useful | title | You/Them lines | ROUGE-L | words | latency p50 / p95 s | $ per summary |"
    );
    lines.push(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const key of keys) {
      const list = view.filter((r) => r.key === key);
      if (!list.length) continue;
      const okList = list.filter((r) => r.ok);
      const graded = okList.filter((r) => r.passes > 0);
      const outcomes = {};
      for (const r of list) outcomes[r.appOutcome] = (outcomes[r.appOutcome] ?? 0) + 1;
      const pick = (metric) => bootstrapMean(graded.map((r) => r[metric]));
      const passCounts = [...new Set(graded.map((r) => r.passes))].join("/");
      const latency = list.map((r) => (r.ms == null ? NaN : r.ms / 1000));
      lines.push(
        `| ${key} | ${okList.length}/${list.length} | ${Object.entries(outcomes)
          .map(([k, v]) => `${k} ${v}`)
          .join(
            ", "
          )} | ${graded.length} (${passCounts || 0}) | ${ci(pick("dtp"), 0, 100)} | ${pct(graded.map((r) => r.decisions))} | ${pct(graded.map((r) => r.actions))} | ${pct(graded.map((r) => r.problems))} | ${ci(pick("abstract"), 0, 100)} | ${ci(pick("unsupported"))} | ${pct(graded.map((r) => r.anyUnsupported))} | ${ci(pick("useful"))} | ${fmt(mean(graded.map((r) => r.title)))} | ${fmt(mean(okList.map((r) => r.youThem)), 1)} | ${fmt(mean(okList.map((r) => r.rougeL)), 3)} | ${fmt(mean(okList.map((r) => r.words)), 0)} | ${fmt(percentile(latency, 50), 1)} / ${fmt(percentile(latency, 95), 1)} | ${fmt(mean(list.map((r) => r.cost)), 4)} |`
      );
    }
    if (args.baseline && view.some((r) => r.key === args.baseline)) {
      lines.push(
        `\nPaired against ${args.baseline}, same inputs (mean difference, 95% bootstrap interval):\n`
      );
      lines.push(
        "| model | n | Δ D+T+P covered (points) | Δ abstract (points) | Δ unsupported | Δ useful | Δ title |"
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- |");
      const graded = view.filter((r) => r.ok && r.passes > 0);
      for (const key of keys) {
        if (key === args.baseline) continue;
        const d = pairedInterval(graded, "dtp", args.baseline, key);
        if (!d.n) continue;
        lines.push(
          `| ${key} | ${d.n} | ${ci(d, 1, 100)} | ${ci(pairedInterval(graded, "abstract", args.baseline, key), 1, 100)} | ${ci(pairedInterval(graded, "unsupported", args.baseline, key))} | ${ci(pairedInterval(graded, "useful", args.baseline, key))} | ${ci(pairedInterval(graded, "title", args.baseline, key))} |`
        );
      }
    }
  }
  // What recognition errors cost each model: the same meeting, heard in a room, against its manual transcript.
  lines.push(
    "\n## Recognition errors: each far-field input against the same meeting's manual transcript\n"
  );
  lines.push(
    "| model | Δ D+T+P quiet (points) | Δ D+T+P steady (points) | Δ unsupported quiet | Δ unsupported steady | Δ useful quiet | Δ useful steady |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const key of keys) {
    const graded = rows.filter((r) => r.key === key && r.ok && r.passes > 0);
    const ref = new Map(graded.filter((r) => r.set === "ref").map((r) => [r.meeting, r]));
    const delta = (set, metric) =>
      bootstrapMean(
        graded
          .filter((r) => r.set === set && ref.has(r.meeting))
          .map((r) => r[metric] - ref.get(r.meeting)[metric])
      );
    if (!graded.some((r) => r.set !== "ref")) continue;
    lines.push(
      `| ${key} | ${ci(delta("quiet", "dtp"), 1, 100)} | ${ci(delta("steady", "dtp"), 1, 100)} | ${ci(delta("quiet", "unsupported"))} | ${ci(delta("steady", "unsupported"))} | ${ci(delta("quiet", "useful"))} | ${ci(delta("steady", "useful"))} |`
    );
  }
  // --pairs base:variant,...: one change measured on the same inputs (a prompt, an
  // effort), per set and over every input.
  if (args.pairs) {
    lines.push("\n## Pairs (variant minus base, same inputs, 95% bootstrap interval)\n");
    lines.push(
      "| base → variant | inputs | n | Δ D+T+P covered (points) | Δ abstract (points) | Δ unsupported | Δ useful | Δ title | Δ words | Δ You/Them lines |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const pair of args.pairs.split(",")) {
      const [base, variant] = pair.split(":");
      for (const [label, filter] of [
        ["all", () => true],
        ["ref", (r) => r.set === "ref"],
        ["quiet", (r) => r.set === "quiet"],
        ["steady", (r) => r.set === "steady"],
      ]) {
        const view = rows.filter((r) => r.ok && filter(r));
        const graded = view.filter((r) => r.passes > 0);
        const d = pairedInterval(graded, "dtp", base, variant);
        if (!d.n) continue;
        lines.push(
          `| ${base} → ${variant} | ${label} | ${d.n} | ${ci(d, 1, 100)} | ${ci(pairedInterval(graded, "abstract", base, variant), 1, 100)} | ${ci(pairedInterval(graded, "unsupported", base, variant))} | ${ci(pairedInterval(graded, "useful", base, variant))} | ${ci(pairedInterval(graded, "title", base, variant))} | ${ci(pairedInterval(view, "words", base, variant), 0)} | ${ci(pairedInterval(view, "youThem", base, variant), 1)} |`
        );
      }
    }
  }
  // The judge against itself: summaries graded in two passes, different shuffles and chunks.
  const twice = rows.filter((r) => r.passes >= 2);
  if (twice.length) {
    const agree = (metric) => {
      const a = twice.map((r) => r[`${metric}Passes`][0]);
      const b = twice.map((r) => r[`${metric}Passes`][1]);
      return { mad: mean(a.map((v, i) => Math.abs(v - b[i]))), r: correlation(a, b) };
    };
    lines.push(
      `\nJudge repeatability over ${twice.length} summaries graded twice: ` +
        METRICS.filter((m) => ["dtp", "abstract", "unsupported", "useful", "title"].includes(m))
          .map((m) => {
            const x = agree(m);
            return `${m} mean |difference| ${fmt(x.mad, 3)}, r ${fmt(x.r, 2)}`;
          })
          .join("; ")
    );
  }
  console.log(lines.join("\n"));
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(rows, null, 1));
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

const commands = { generate, judge, report, speed };
if (!commands[command]) {
  console.error("summary-eval.mjs generate|judge|report|speed (see the header)");
  process.exit(2);
}
await commands[command]();
