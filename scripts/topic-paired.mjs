#!/usr/bin/env node
/**
 * Paired differences between runs of `scripts/topic-loop-eval.mjs`: the mean
 * difference over meetings with its 95% bootstrap interval.
 *
 *   node scripts/topic-paired.mjs --base a.json --runs b.json,c.json [--part live|record]
 *     [--metric pk|windowDiff] [--only ES2004,IS1009,TS3003]
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { bootstrapMean } from "./lib/fast-models.mjs";

const { values: args } = parseArgs({
  options: {
    base: { type: "string" },
    runs: { type: "string" },
    part: { type: "string", default: "live" },
    metric: { type: "string", default: "pk" },
    only: { type: "string" },
  },
});

const prefixes = args.only ? args.only.split(",") : null;
const read = (file) => {
  const out = new Map();
  for (const result of JSON.parse(fs.readFileSync(file, "utf8")).results) {
    if (prefixes && !prefixes.some((prefix) => result.id.startsWith(prefix))) continue;
    const value = result[args.part]?.[args.metric];
    if (Number.isFinite(value)) out.set(result.id, value);
  }
  return out;
};
const base = read(args.base);
const f = (value) => (value >= 0 ? "+" : "") + value.toFixed(3);
for (const file of args.runs.split(",")) {
  const run = read(file);
  const shared = [...run.keys()].filter((id) => base.has(id));
  const stat = bootstrapMean(shared.map((id) => run.get(id) - base.get(id)));
  const mean = shared.reduce((sum, id) => sum + run.get(id), 0) / shared.length;
  console.log(
    `${path.basename(file, ".json").padEnd(44)} ${args.part} ${args.metric} ${mean.toFixed(3)}  Δ ${f(stat.mean)} [${f(stat.low)}, ${f(stat.high)}]  n=${shared.length}`
  );
}
