// Fetch-based clients for the fast-model experiments (`scripts/topic-loop-eval.mjs`,
// `scripts/asr-repair-eval.mjs`): OpenAI (Responses API, the app's own request
// shape), Anthropic (Messages API), AWS Bedrock (Converse, with a Bedrock API key
// as a bearer token) and a llama-server on this computer (its OpenAI-compatible
// chat endpoint, as `helpers/llamaServer.js` calls it).
//
// Keys are read from the environment at the moment of the request and never
// written anywhere: OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_BEARER_TOKEN_BEDROCK.
// Every request's tokens and cost go to a spend ledger (JSONL, `FM_LEDGER`), with
// no prompt text, and a request that would pass `FM_BUDGET_USD` in total is not
// sent.
//
// A model is named `provider:model[@option,...]`, for example
// `openai:gpt-6-luna@none` (reasoning effort none), `anthropic:claude-haiku-5-5`,
// `bedrock:us.amazon.nova-micro-v1:0`, `local:qwen3.5-2b`.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Standard-tier prices in USD per million tokens.
// OpenAI: developers.openai.com/api/docs/pricing, read 2026-10-26 (gpt-6-astra
// and gpt-5.5-pro 2026-10-28; gpt-5.5-pro has no cached-input discount).
// Anthropic: first-party rates (prompts under 100K tokens), 2026-10-26.
// Bedrock: the AWS Price List API (AmazonBedrock, us-east-1, version
// 20261016210806), on-demand, in-region, read 2026-10-26; the rows added on
// 2026-10-28 are from aws.amazon.com/bedrock/pricing (US cross-region rate
// where the page lists no in-region one; Claude at Anthropic's list price plus
// 10%, which the page does not show).
// Local models cost nothing per token.
export const PRICES = {
  "openai:gpt-6-astra": { input: 10, cached: 1, output: 50 },
  "openai:gpt-5.5-pro": { input: 30, cached: 30, output: 180 },
  "openai:gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "openai:gpt-6-sol": { input: 2, cached: 0.2, output: 10 },
  "openai:gpt-6.1-sol": { input: 2, cached: 0.1, output: 10 },
  "openai:gpt-6.1-terra": { input: 1, cached: 0.05, output: 5 },
  // developers.openai.com/api/docs/pricing, standard tier, read 2026-10-28 (Flex and
  // Batch are half: the summary eval books a flex request at half these).
  "openai:gpt-5.6-luna": { input: 0.2, cached: 0.02, output: 1.2 },
  "openai:gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
  "openai:gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
  "openai:gpt-5.4-nano": { input: 0.2, cached: 0.02, output: 1.25 },
  "openai:gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "openai:gpt-5-nano": { input: 0.05, cached: 0.005, output: 0.4 },
  "openai:gpt-5-mini": { input: 0.25, cached: 0.025, output: 2 },
  "openai:gpt-4.1-nano": { input: 0.1, cached: 0.025, output: 0.4 },
  "openai:gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "openai:gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  // The Claude API reference's model table (cached 2026-10-06): $10 / $50,
  // cache reads $0.25; cache writes at 1.25x the input price, as in the rows below.
  "anthropic:claude-fable-5-1": { input: 10, cached: 0.25, write: 12.5, output: 50 },
  "anthropic:claude-haiku-5-5": { input: 0.1, cached: 0.01, write: 0.125, output: 0.5 },
  "anthropic:claude-sonnet-5-5": { input: 2, cached: 0.2, write: 2.5, output: 10 },
  "anthropic:claude-opus-5-5": { input: 4, cached: 0.2, write: 5, output: 20 },
  // The models in the app's own Anthropic list (modelRegistryData.json), first-party
  // rates from the Claude API model table (cached 2026-10-06), for the summary eval.
  "anthropic:claude-fable-5": { input: 10, cached: 1, write: 12.5, output: 50 },
  "anthropic:claude-sonnet-5": { input: 2, cached: 0.2, write: 2.5, output: 10 },
  "anthropic:claude-opus-5": { input: 5, cached: 0.5, write: 6.25, output: 25 },
  "anthropic:claude-opus-4-8": { input: 5, cached: 0.5, write: 6.25, output: 25 },
  "anthropic:claude-sonnet-4-6": { input: 3, cached: 0.3, write: 3.75, output: 15 },
  "anthropic:claude-haiku-4-5": { input: 1, cached: 0.1, write: 1.25, output: 5 },
  "bedrock:anthropic.claude-opus-4-6-v1": { input: 5.5, cached: 0.55, output: 27.5 },
  "bedrock:anthropic.claude-sonnet-4-6": { input: 3.3, cached: 0.33, output: 16.5 },
  "bedrock:moonshotai.kimi-k3": { input: 3.3, cached: 3.3, output: 16.5 },
  "bedrock:moonshotai.kimi-k2.5": { input: 0.6, cached: 0.6, output: 3 },
  "bedrock:zai.glm-5": { input: 1, cached: 1, output: 3.2 },
  "bedrock:mistral.mistral-large-3-675b-instruct": { input: 0.5, cached: 0.5, output: 1.5 },
  "bedrock:deepseek.v3.2": { input: 0.62, cached: 0.62, output: 1.85 },
  "bedrock:qwen.qwen3-vl-235b-a22b": { input: 0.53, cached: 0.53, output: 2.66 },
  "bedrock:qwen.qwen3-next-80b-a3b": { input: 0.15, cached: 0.15, output: 1.2 },
  "bedrock:minimax.minimax-m2.5": { input: 0.3, cached: 0.3, output: 1.2 },
  "bedrock:nvidia.nemotron-super-3-120b": { input: 0.15, cached: 0.15, output: 0.65 },
  "bedrock:amazon.nova-micro-v1:0": { input: 0.035, cached: 0.035, output: 0.14 },
  "bedrock:amazon.nova-lite-v1:0": { input: 0.06, cached: 0.06, output: 0.24 },
  "bedrock:amazon.nova-2-lite-v1:0": { input: 0.33, cached: 0.33, output: 2.75 },
  "bedrock:meta.llama3-1-8b-instruct-v1:0": { input: 0.22, cached: 0.22, output: 0.22 },
  "bedrock:mistral.ministral-3-3b-instruct": { input: 0.1, cached: 0.1, output: 0.1 },
  "bedrock:mistral.ministral-3-8b-instruct": { input: 0.15, cached: 0.15, output: 0.15 },
  "bedrock:mistral.ministral-3-14b-instruct": { input: 0.2, cached: 0.2, output: 0.2 },
  "bedrock:google.gemma-3-4b-it": { input: 0.04, cached: 0.04, output: 0.08 },
  "bedrock:google.gemma-3-12b-it": { input: 0.09, cached: 0.09, output: 0.29 },
  "bedrock:zai.glm-4.7-flash": { input: 0.07, cached: 0.07, output: 0.4 },
  "bedrock:nvidia.nemotron-nano-9b-v2": { input: 0.06, cached: 0.06, output: 0.23 },
  "bedrock:nvidia.nemotron-nano-3-30b": { input: 0.06, cached: 0.06, output: 0.24 },
  "bedrock:qwen.qwen3-32b-v1:0": { input: 0.15, cached: 0.15, output: 0.6 },
  "bedrock:openai.gpt-oss-20b-1:0": { input: 0.07, cached: 0.07, output: 0.3 },
  // aws.amazon.com/bedrock/pricing, us-east-1 on-demand, read 2026-10-28.
  // Not on that page's text; the launch prices.
  "bedrock:openai.gpt-oss-120b-1:0": { input: 0.15, cached: 0.15, output: 0.6 },
  "bedrock:anthropic.claude-haiku-4-5-20251001-v1:0": { input: 1, cached: 0.1, output: 5 },
};

/** The price row for a model id, ignoring a Bedrock cross-region prefix and the options. */
export function priceOf(spec) {
  const { provider, model } = parseSpec(spec);
  if (provider === "local") return { input: 0, cached: 0, output: 0 };
  const bare = provider === "bedrock" ? model.replace(/^(us|eu|apac|global)\./, "") : model;
  return PRICES[`${provider}:${bare}`] ?? null;
}

/** `provider:model@opt1,opt2` into its parts. Bedrock ids keep their own colons. */
export function parseSpec(spec) {
  const text = String(spec);
  const colon = text.indexOf(":");
  if (colon < 0) throw new Error(`Model spec needs a provider: ${spec}`);
  const provider = text.slice(0, colon);
  let rest = text.slice(colon + 1);
  let options = [];
  const at = rest.lastIndexOf("@");
  if (at > 0) {
    options = rest
      .slice(at + 1)
      .split(",")
      .filter(Boolean);
    rest = rest.slice(0, at);
  }
  return { provider, model: rest, options };
}

export function costOf(spec, usage) {
  const price = priceOf(spec);
  if (!price || !usage) return null;
  const cached = usage.cached ?? 0;
  const written = usage.written ?? 0;
  const fresh = Math.max(0, (usage.input ?? 0) - cached - written);
  return (
    (fresh * price.input +
      cached * (price.cached ?? price.input) +
      written * (price.write ?? price.input) +
      (usage.output ?? 0) * price.output) /
    1e6
  );
}

// --- The spend ledger.

const LEDGER =
  process.env.FM_LEDGER || path.join(os.homedir(), ".cache", "oats", "fast-models", "ledger.jsonl");
const BUDGET = Number(process.env.FM_BUDGET_USD || "20");
let spentAtStart = null;
let spentHere = 0;

/** Total spend in the ledger so far (every process that wrote to it). */
export function ledgerTotal() {
  try {
    let total = 0;
    for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        total += JSON.parse(line).cost || 0;
      } catch {}
    }
    return total;
  } catch {
    return 0;
  }
}

function checkBudget(spec) {
  if (parseSpec(spec).provider === "local") return;
  // A request with no price would be counted as free and slip past the budget.
  if (!priceOf(spec)) throw new BudgetError(`No price for ${spec}: add it to PRICES first`);
  if (spentAtStart === null) spentAtStart = ledgerTotal();
  // Other processes may be spending too: read the ledger again now and then.
  if (Math.random() < 0.02) spentAtStart = ledgerTotal() - spentHere;
  if (spentAtStart + spentHere >= BUDGET) {
    throw new BudgetError(
      `Budget of $${BUDGET} reached ($${(spentAtStart + spentHere).toFixed(2)} spent)`
    );
  }
}

export class BudgetError extends Error {}

function writeLedger(entry) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(LEDGER, `${JSON.stringify(entry)}\n`);
}

// --- Requests.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    if (!response.ok) {
      const message = json?.error?.message || json?.message || text.slice(0, 300);
      const error = new Error(`HTTP ${response.status}: ${message}`);
      error.status = response.status;
      throw error;
    }
    return json;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error(`timed out after ${timeoutMs} ms`);
      timeout.status = "timeout";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Output tokens added to a request's cap when the model reasons or thinks: the
 * reasoning counts against the cap, and a cap sized for the answer alone (200
 * tokens for a topic check) would end the answer before it starts.
 */
export const REASONING_HEADROOM = 2000;

/** Whether an OpenAI request reasons: any effort but none or minimal, or the model's default. */
function openaiReasons(model, effort) {
  if (/^gpt-4/.test(model)) return false;
  return !effort || !/^(none|minimal)$/.test(effort);
}

function openaiBody({ model, options }, { system, user, maxTokens, schema }) {
  const effort = options.find((option) => /^(none|minimal|low|medium|high|xhigh)$/.test(option));
  const body = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    store: false,
    max_output_tokens: openaiReasons(model, effort) ? maxTokens + REASONING_HEADROOM : maxTokens,
  };
  if (effort) body.reasoning = { effort };
  if (/^gpt-4/.test(model)) body.temperature = 0;
  if (schema && !options.includes("noschema")) {
    body.text = {
      format: { type: "json_schema", name: schema.name, schema: schema.schema, strict: true },
    };
  }
  return body;
}

async function callOpenai(parsed, request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const json = await postJson(
    "https://api.openai.com/v1/responses",
    { Authorization: `Bearer ${key}` },
    openaiBody(parsed, request),
    request.timeoutMs
  );
  let text = "";
  for (const item of json.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) if (part.type === "output_text") text += part.text;
  }
  return {
    text: text.trim(),
    usage: {
      input: json.usage?.input_tokens ?? 0,
      cached: json.usage?.input_tokens_details?.cached_tokens ?? 0,
      output: json.usage?.output_tokens ?? 0,
      reasoning: json.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    },
    stop: json.status,
  };
}

/** Claude models whose thinking cannot be turned off: any explicit off setting is an HTTP 400. */
export const ALWAYS_THINKS = /opus-5-5|fable-5|mythos-5/;

/** Claude models that take no `effort` (an HTTP 400 if sent). */
const NO_EFFORT = /haiku-4-5|sonnet-4-5|claude-3/;

async function callAnthropic({ model, options }, { system, user, maxTokens, schema, timeoutMs }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const effort = options.find((option) => /^(low|medium|high|xhigh|max)$/.test(option)) ?? "low";
  // Thinking off where the model allows it: Haiku 5.5 takes "disabled" at
  // effort high or below; Sonnet 5.5 takes "between_tools", which in a request
  // without tools means none. Opus 5.5 and Fable 5.x always think (adaptive),
  // so their effort is the only control and their cap gets headroom.
  const thinks = options.includes("think") || ALWAYS_THINKS.test(model);
  const body = {
    model,
    max_tokens: thinks ? maxTokens + REASONING_HEADROOM : maxTokens,
    system: options.includes("cache")
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system,
    messages: [{ role: "user", content: user }],
  };
  if (!NO_EFFORT.test(model)) body.output_config = { effort };
  if (!thinks) {
    body.thinking = /sonnet-5-5/.test(model) ? { type: "between_tools" } : { type: "disabled" };
  }
  if (schema && !options.includes("noschema")) {
    body.output_config = {
      ...(body.output_config ?? {}),
      format: { type: "json_schema", schema: schema.schema },
    };
  }
  const json = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": key, "anthropic-version": "2026-10-21" },
    body,
    timeoutMs
  );
  const text = (json.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const read = json.usage?.cache_read_input_tokens ?? 0;
  const written = json.usage?.cache_creation_input_tokens ?? 0;
  return {
    text: text.trim(),
    usage: {
      // Anthropic's input_tokens excludes the cached and cache-written ones.
      input: (json.usage?.input_tokens ?? 0) + read + written,
      cached: read,
      written,
      output: json.usage?.output_tokens ?? 0,
      reasoning: 0,
    },
    stop: json.stop_reason,
  };
}

async function callBedrock({ model, options }, { system, user, maxTokens, timeoutMs }) {
  const key = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!key) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not set");
  const region = options.find((option) => /^[a-z]{2}-[a-z]+-\d$/.test(option)) ?? "us-east-1";
  // Reasoning models write their reasoning inside maxTokens; newer Claude and
  // GPT models refuse a sampling temperature.
  const reasons =
    options.includes("think") ||
    /kimi-k3|kimi-k2-thinking|minimax|gpt-oss|deepseek\.r1/.test(model);
  const noTemperature =
    reasons ||
    /anthropic\.claude-(opus-4-[78]|opus-5|sonnet-5|haiku-5|fable|mythos)|openai\.gpt-(5\.[5-9]|6)/.test(
      model
    );
  const body = {
    system: [{ text: system }],
    messages: [{ role: "user", content: [{ text: user }] }],
    inferenceConfig: {
      maxTokens: reasons ? maxTokens + REASONING_HEADROOM : maxTokens,
      ...(noTemperature ? {} : { temperature: 0 }),
    },
  };
  const json = await postJson(
    `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
    { Authorization: `Bearer ${key}` },
    body,
    timeoutMs
  );
  const text = (json.output?.message?.content ?? [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return {
    text: text.trim(),
    usage: {
      input: json.usage?.inputTokens ?? 0,
      cached: json.usage?.cacheReadInputTokens ?? 0,
      output: json.usage?.outputTokens ?? 0,
      reasoning: 0,
    },
    stop: json.stopReason,
    serverMs: json.metrics?.latencyMs ?? null,
  };
}

// Local models: a llama-server this process started (`startLocalServer`), one
// per model, keyed by the name after `local:`.
const localServers = new Map();

async function callLocal({ model, options }, { system, user, maxTokens, schema, timeoutMs }) {
  const server = localServers.get(model);
  if (!server) throw new Error(`No llama-server for ${model}: call startLocalServer first`);
  const body = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: maxTokens,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  };
  if (schema && options.includes("grammar")) {
    body.response_format = { type: "json_schema", json_schema: { schema: schema.schema } };
  }
  // One request at a time, as the app's llama-server answers them.
  const run = server.queue.then(() =>
    postJson(`http://127.0.0.1:${server.port}/v1/chat/completions`, {}, body, timeoutMs)
  );
  server.queue = run.catch(() => undefined);
  const json = await run;
  const message = json.choices?.[0]?.message;
  return {
    text: String(message?.content || message?.reasoning_content || "").trim(),
    usage: {
      input: json.usage?.prompt_tokens ?? 0,
      cached: json.timings?.cache_n ?? 0,
      output: json.usage?.completion_tokens ?? 0,
      reasoning: 0,
    },
    stop: json.choices?.[0]?.finish_reason,
  };
}

/**
 * One request. Resolves to `{ ok, text, json, usage, cost, ms, error }`; it
 * never throws for a failed or malformed answer (those are measured), only for
 * a spent budget.
 *
 * @param {string} spec `provider:model[@options]`
 * @param {{ system: string, user: string, maxTokens?: number, schema?: { name: string, schema: object },
 *   timeoutMs?: number, purpose?: string, attempts?: number, parseJson?: boolean }} request
 */
export async function ask(spec, request) {
  const parsed = parseSpec(spec);
  const call = {
    openai: callOpenai,
    anthropic: callAnthropic,
    bedrock: callBedrock,
    local: callLocal,
  }[parsed.provider];
  if (!call) throw new Error(`Unknown provider ${parsed.provider}`);
  const full = { maxTokens: 400, timeoutMs: 30_000, attempts: 2, ...request };
  let lastError = null;
  // Throttling (429) is the replay's doing, not the model's: many conversations
  // replay at once, while one live conversation sends a request or two a
  // minute. It is waited out and counted apart; the latency kept is the
  // answered attempt's.
  let throttled = 0;
  for (let attempt = 1; attempt <= full.attempts; attempt += 1) {
    checkBudget(spec);
    const started = performance.now();
    try {
      const result = await call(parsed, full);
      const ms = performance.now() - started;
      const cost = costOf(spec, result.usage) ?? 0;
      spentHere += cost;
      writeLedger({
        at: new Date().toISOString(),
        spec,
        purpose: full.purpose ?? null,
        ...result.usage,
        cost,
        ms: Math.round(ms),
        ok: true,
      });
      let json = null;
      if (full.parseJson) json = extractJson(result.text);
      return {
        ok: true,
        text: result.text,
        json,
        usage: result.usage,
        cost,
        ms,
        serverMs: result.serverMs ?? null,
        stop: result.stop,
        attempts: attempt,
        throttled,
      };
    } catch (error) {
      lastError = error;
      writeLedger({
        at: new Date().toISOString(),
        spec,
        purpose: full.purpose ?? null,
        cost: 0,
        ms: Math.round(performance.now() - started),
        ok: false,
        throttle: error?.status === 429,
        error: String(error?.message ?? error).slice(0, 200),
      });
      if (error instanceof BudgetError) throw error;
      if (error?.status === 429 && throttled < 10) {
        throttled += 1;
        attempt -= 1;
        await sleep(Math.min(30_000, 1_000 * 2 ** Math.min(throttled, 5)) * (0.5 + Math.random()));
        continue;
      }
      const retryable =
        error?.status === "timeout" ||
        error?.status === 429 ||
        (typeof error?.status === "number" && error.status >= 500) ||
        error?.status === undefined;
      if (!retryable || attempt >= full.attempts) break;
      await sleep(800 * attempt);
    }
  }
  return {
    ok: false,
    text: "",
    json: null,
    usage: null,
    cost: 0,
    ms: null,
    error: String(lastError?.message ?? lastError),
  };
}

/**
 * The first JSON object in a model's answer: as is, inside a code fence, or
 * the outermost braces in prose. Null when there is none.
 */
export function extractJson(text) {
  const raw = String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const tries = [raw];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fence) tries.push(fence[1]);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) tries.push(raw.slice(first, last + 1));
  for (const candidate of tries) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object") return value;
    } catch {}
  }
  return null;
}

// --- llama-server on this computer.

/**
 * Starts llama-server for a GGUF file with the app's arguments (`llamaServer.js`:
 * all layers on the GPU, 4 threads, `--jinja`) and the given context size.
 * Resolves once /health answers.
 */
export async function startLocalServer(
  name,
  { binary, model, port, contextSize = 8192, threads = 4 }
) {
  const { spawn } = await import("node:child_process");
  const args = [
    "--model",
    model,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--threads",
    String(threads),
    "--ctx-size",
    String(contextSize),
    "--jinja",
    "--n-gpu-layers",
    "99",
  ];
  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    // As the app starts it (llamaServer.js _buildEnv): no fitting probe at start, offline.
    env: {
      ...process.env,
      DYLD_LIBRARY_PATH: path.dirname(binary),
      LLAMA_ARG_FIT: "off",
      LLAMA_ARG_OFFLINE: "1",
    },
  });
  let stderr = "";
  // The start of the log too (buffer sizes: model, KV cache, compute), for a caller
  // that measures memory (summary-eval.mjs speed). llama-server writes some of it
  // to stdout, so both streams are read.
  let startup = "";
  const keep = (chunk) => {
    if (startup.length < 400_000) startup += chunk;
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
    keep(chunk);
  });
  child.startupLog = () => startup;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`llama-server exited: ${stderr.slice(-800)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) break;
    } catch {}
    await sleep(300);
  }
  localServers.set(name, { child, port, queue: Promise.resolve() });
  return child;
}

export function stopLocalServers() {
  for (const server of localServers.values()) {
    try {
      server.child.kill("SIGTERM");
    } catch {}
  }
  localServers.clear();
}

// --- Small statistics helpers shared by the scripts.

export const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/** A seeded random generator (LCG), for shuffles that repeat. */
export function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** 95% bootstrap interval of the mean, over items (resampled with a fixed seed). */
export function bootstrapMean(values, { samples = 2000, seed = 7 } = {}) {
  const list = values.filter(Number.isFinite);
  if (list.length < 2) return { mean: mean(list), low: null, high: null, n: list.length };
  const random = seeded(seed);
  const means = [];
  for (let s = 0; s < samples; s += 1) {
    let total = 0;
    for (let i = 0; i < list.length; i += 1) total += list[Math.floor(random() * list.length)];
    means.push(total / list.length);
  }
  return {
    mean: mean(list),
    low: percentile(means, 2.5),
    high: percentile(means, 97.5),
    n: list.length,
  };
}
