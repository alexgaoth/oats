#!/usr/bin/env node
/**
 * Runs of `scripts/topic-loop-eval.mjs` on learn83 with change detectors that
 * never saw the meeting they cut. The shipped model learned from every learn83
 * meeting, so on them it scores better than it would anywhere else. Here the
 * series are dealt into six folds, a model is trained without each fold
 * (`scripts/topic-change-train.py`, the shipped settings), and each meeting is
 * replayed with the model that left its fold out. `docs/topic-split.md`.
 *
 *   node scripts/topic-split-folds.mjs models --features <dir with ami/ and icsi/> --out <dir>
 *     [--python <venv python>]
 *   node scripts/topic-split-folds.mjs run --models <dir> --ami <dir> --json out.json
 *     [--options '{"detector":{...}}'] [--split-models <dir>] [--label name]
 *
 * `models` needs the features of `scripts/topic-change-features.mjs --lag 45` for
 * the learn83 meetings (ami/) and ICSI (icsi/); with `--fine`, features made with
 * `--fine`, for trees of subtopics, and the threshold their own cross-validation
 * picks. `run` passes the shipped threshold to every fold's detector unless
 * `--options` sets another; `--split-models` gives each fold the subtopic trees
 * that left it out, for `detector.split` and `detector.recordSplit`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { CHANGE_MODEL } from "../src/helpers/topicChangeModel.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOLDS = 6;

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    features: { type: "string" },
    out: { type: "string" },
    python: { type: "string", default: "python3" },
    models: { type: "string" },
    ami: { type: "string" },
    json: { type: "string" },
    options: { type: "string", default: "{}" },
    label: { type: "string" },
    "split-models": { type: "string" },
    fine: { type: "boolean", default: false },
  },
});

const series = (id) => id.replace(/[a-d]$/, "");

/** The learn83 meetings dealt into folds by series, in a fixed order. */
function folds(ids) {
  const names = [...new Set(ids.map(series))].sort();
  return Array.from({ length: FOLDS }, (_, fold) => {
    const held = new Set(names.filter((_, index) => index % FOLDS === fold));
    return ids.filter((id) => held.has(series(id)));
  });
}

if (positionals[0] === "models") {
  const amiDir = path.join(args.features, "ami");
  const ids = fs
    .readdirSync(amiDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
  fs.mkdirSync(args.out, { recursive: true });
  const dealt = folds(ids);
  fs.writeFileSync(path.join(args.out, "folds.json"), JSON.stringify(dealt));
  dealt.forEach((held, fold) => {
    const output = execFileSync(args.python, [
      path.join(ROOT, "scripts/topic-change-train.py"),
      "--data",
      `ami=${amiDir}`,
      "--data",
      `icsi=${path.join(args.features, "icsi")}`,
      "--hold",
      "15",
      "--spacing",
      "90",
      ...(args.fine ? [] : ["--threshold", String(CHANGE_MODEL.threshold)]),
      "--exclude",
      held.join(","),
      "--write",
      path.join(args.out, `fold${fold}.mjs`),
    ]);
    process.stderr.write(`fold ${fold} (${held.length} meetings): ${output}`);
  });
} else if (positionals[0] === "run") {
  const dealt = JSON.parse(fs.readFileSync(path.join(args.models, "folds.json"), "utf8"));
  const options = JSON.parse(args.options);
  const results = [];
  let summaryOptions = null;
  dealt.forEach((held, fold) => {
    const out = path.join(path.dirname(path.resolve(args.json)), `.fold${fold}.json`);
    const foldOptions = {
      ...options,
      ...(args["split-models"]
        ? { splitModel: path.join(args["split-models"], `fold${fold}.mjs`) }
        : {}),
      changeModel: path.join(args.models, `fold${fold}.mjs`),
      detector: { threshold: CHANGE_MODEL.threshold, ...(options.detector ?? {}) },
    };
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "scripts/topic-loop-eval.mjs"),
        "--variant",
        "d2",
        "--vectors",
        "--quiet",
        "--ami",
        args.ami,
        "--meetings",
        held.join(","),
        "--options",
        JSON.stringify(foldOptions),
        "--json",
        out,
      ],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    const value = JSON.parse(fs.readFileSync(out, "utf8"));
    fs.rmSync(out);
    summaryOptions = { ...options, folds: path.resolve(args.models) };
    results.push(...value.results);
  });
  fs.writeFileSync(
    args.json,
    JSON.stringify({ label: args.label ?? null, options: summaryOptions, results }, null, 1)
  );
  console.log(`${args.json}: ${results.length} meetings`);
} else {
  console.error("models | run");
  process.exit(2);
}
