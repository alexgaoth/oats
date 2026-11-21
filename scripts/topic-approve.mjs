#!/usr/bin/env node
/**
 * An approver for early topic marks: a writing model reads the minute and a half
 * before a candidate pause and the first seconds after it, and says whether a
 * new subject started there. Candidates come from
 * `scripts/topic-early-eval.mjs --dump-candidates`. The eval reads the verdicts
 * back with `--approvals`. Method and results: docs/topic-early.md.
 *
 *   OPENAI_API_KEY=... node scripts/topic-approve.mjs --in candidates.jsonl \
 *     --spec openai:gpt-6-luna@none --out verdicts.jsonl [--concurrency 8] [--limit N]
 *
 * Public AMI text only. Keys come from the environment and are never printed.
 * Every request goes to the ledger of scripts/lib/fast-models.mjs, under its budget.
 */

import fs from "node:fs";
import { parseArgs } from "node:util";

import { ask, parseSpec, startLocalServer, stopLocalServers } from "./lib/fast-models.mjs";

const { values: args } = parseArgs({
  options: {
    in: { type: "string" },
    spec: { type: "string" },
    out: { type: "string" },
    concurrency: { type: "string", default: "8" },
    limit: { type: "string" },
    // Only candidates whose early score reaches this (the eval's --dump-threshold is lower).
    "min-score": { type: "string", default: "0" },
    // A model on this Mac: `--spec local:<name> --local-model <gguf> --llama-server <binary>`.
    "local-model": { type: "string" },
    "llama-server": { type: "string" },
  },
});
if (!args.in || !args.spec || !args.out) {
  console.error("--in candidates.jsonl --spec provider:model --out verdicts.jsonl");
  process.exit(2);
}

export const APPROVER_SYSTEM = `You watch the live transcript of a conversation. At a marked pause you decide, from only the first few seconds that follow it, whether the people just started a new subject.

A new subject means the main thing they discuss changes: a new item on the agenda, a different problem, a different part of the work. It is not a follow-up question on the same subject, a short aside, a joke, a summary of what was said, or another detail of the same point.

Say true only when the lines after the marker clearly begin a different subject from the lines before it. The transcript comes from speech recognition, so expect small errors. Answer with JSON only.`;

export function approverPrompt({ before, after }) {
  return `Before the marker (about the last minute and a half):
${before.map((line) => `- ${line}`).join("\n") || "- (nothing)"}

--- marker: a pause ---

After the marker (the first seconds):
${after.map((line) => `- ${line}`).join("\n") || "- (nothing)"}

Did a new subject start at the marker? Answer exactly:
{"new_subject": true or false, "confidence": a number from 0 to 1, "name": "2 to 5 words that name the new subject, or empty"}`;
}

const candidates = fs
  .readFileSync(args.in, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const done = new Set();
if (fs.existsSync(args.out)) {
  for (const line of fs.readFileSync(args.out, "utf8").split("\n").filter(Boolean)) {
    const verdict = JSON.parse(line);
    if (verdict.spec === args.spec) done.add(`${verdict.meeting}#${verdict.g}`);
  }
}
const todo = candidates
  .filter((candidate) => candidate.score >= Number(args["min-score"]))
  .filter((candidate) => !done.has(`${candidate.meeting}#${candidate.g}`))
  .slice(0, args.limit ? Number(args.limit) : undefined);
console.error(`${todo.length} of ${candidates.length} candidates to ask (${done.size} done)`);

if (parseSpec(args.spec).provider === "local") {
  if (!args["local-model"] || !args["llama-server"]) {
    console.error("--local-model <gguf> and --llama-server <binary> are needed for a local model");
    process.exit(2);
  }
  await startLocalServer(parseSpec(args.spec).model, {
    binary: args["llama-server"],
    model: args["local-model"],
    port: 18_000 + Math.floor(Math.random() * 1000),
  });
}
const out = fs.createWriteStream(args.out, { flags: "a" });
let next = 0;
let cost = 0;
let failed = 0;
async function worker() {
  while (next < todo.length) {
    const candidate = todo[next++];
    const result = await ask(args.spec, {
      system: APPROVER_SYSTEM,
      user: approverPrompt(candidate),
      maxTokens: 120,
      timeoutMs: 30_000,
      parseJson: true,
      purpose: "topic-approve",
    });
    cost += result.cost ?? 0;
    const json = result.json ?? {};
    if (!result.ok) failed += 1;
    out.write(
      `${JSON.stringify({
        spec: args.spec,
        meeting: candidate.meeting,
        g: candidate.g,
        ok: Boolean(result.ok),
        newSubject: json.new_subject === true,
        confidence: Number.isFinite(Number(json.confidence)) ? Number(json.confidence) : 0,
        name: typeof json.name === "string" ? json.name.slice(0, 60) : "",
        ms: Math.round(result.ms ?? 0),
        error: result.ok ? undefined : String(result.error ?? "").slice(0, 120),
      })}\n`
    );
  }
}
await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
out.end();
stopLocalServers();
console.error(`asked ${todo.length}, failed ${failed}, cost $${cost.toFixed(3)}`);
