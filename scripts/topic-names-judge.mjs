#!/usr/bin/env node
/**
 * The blind judge for topic names, across variants and models.
 *
 * The unit is a human topic segment of an AMI meeting (a stretch the
 * annotators marked as one top-level topic, 40 words or more). For each, every
 * run (`scripts/topic-loop-eval.mjs --json`) gives the name the live view
 * showed 30 s after the stretch ended and the name the record gives it. One
 * judge model grades all of them for that stretch, unlabelled, deduplicated and
 * shuffled, against an excerpt of what was said (the manual transcript) and
 * the annotators' label, as `scripts/topic-names-eval.mjs` (#121) grades:
 * relevance and specificity 1 to 5, match with the annotators' label 0 to 2.
 * Repeats reshuffle with another seed, so the judge's own spread is measured.
 *
 *   node scripts/topic-names-judge.mjs --runs a.json,b.json [--judge anthropic:claude-sonnet-5-5]
 *     [--repeats 2] [--which live,record] [--max-candidates 14] [--cache judge-cache.json]
 *     [--json out.json] [--concurrency 6]
 *
 * A name is graded once per (judge, stretch, name, repeat) and kept in the
 * cache, so runs added later cost only their new names.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { ask, bootstrapMean, mean, seeded } from "./lib/fast-models.mjs";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string" },
    judge: { type: "string", default: "anthropic:claude-sonnet-5-5" },
    repeats: { type: "string", default: "2" },
    which: { type: "string", default: "live,record" },
    "max-candidates": { type: "string", default: "14" },
    cache: { type: "string" },
    json: { type: "string" },
    concurrency: { type: "string", default: "6" },
    "dry-run": { type: "boolean", default: false },
    only: { type: "string" },
  },
});

if (!args.runs) {
  console.error("--runs a.json,b.json");
  process.exit(2);
}
const JUDGE = args.judge;
const REPEATS = Number(args.repeats);
const WHICH = args.which.split(",");
const MAX = Number(args["max-candidates"]);
const CACHE_FILE =
  args.cache ?? path.join(path.dirname(path.resolve(args.runs.split(",")[0])), "judge-cache.json");

const SYSTEM = [
  "You grade the names an app showed for parts of a meeting. You get one part of a transcribed meeting (a stretch human annotators marked as one topic): an excerpt of what was said in it, the annotators' label for it, the labels of the meeting's other parts, and candidate names. Each candidate is the name one version of the app showed for this stretch.",
  "",
  "Grade every candidate on its own, on three scales:",
  "- relevance, 1 to 5: 5 names exactly what was said in the excerpt; 3 is related but partly off or too broad; 1 is wrong or meaningless",
  '- specificity, 1 to 5: 5 is specific enough to tell this stretch apart from the rest of the meeting; 3 is somewhat generic; 1 is generic or empty ("Discussion", random words)',
  "- match, 0 to 2: 2 names the same subject as the annotators' label; 1 is related or names a part of it; 0 is a different subject",
  "",
  "Judge relevance and specificity from the excerpt; the annotators' label decides only match. Several candidates can get the same grades.",
  'Reply with JSON only: {"grades":[{"id":"A","relevance":5,"specificity":4,"match":2}]}',
].join("\n");

const SCHEMA = {
  name: "grades",
  schema: {
    type: "object",
    properties: {
      grades: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            relevance: { type: "integer" },
            specificity: { type: "integer" },
            match: { type: "integer" },
          },
          required: ["id", "relevance", "specificity", "match"],
          additionalProperties: false,
        },
      },
    },
    required: ["grades"],
    additionalProperties: false,
  },
};

const nameKey = (name) =>
  String(name ?? "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function hash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

// --- Items: one per human segment, with every run's names for it.

// A run is named by its file, so repeats of one variant and model stay apart.
const runs = args.runs.split(",").map((file) => {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, label: path.basename(file, ".json"), data };
});
const items = new Map();
for (const run of runs) {
  for (const result of run.data.results) {
    const others = (result.names ?? []).map((name) => name.label);
    for (const entry of result.names ?? []) {
      if (!entry.excerpt?.length) continue;
      // An item is one stretch of one transcript: a recognized meeting's
      // stretches are separate items from the manual transcript's.
      const itemKey = `${result.source}:${entry.key}`;
      const item = items.get(itemKey) ?? {
        key: itemKey,
        meeting: result.id,
        source: result.source,
        label: entry.label,
        subtopics: entry.subtopics ?? [],
        words: entry.words,
        excerpt: entry.excerpt,
        others: [...new Set(others.filter((label) => label !== entry.label))],
        candidates: new Map(),
      };
      items.set(itemKey, item);
      for (const which of WHICH) {
        const name = entry[which]?.name;
        if (!name) continue;
        const key = nameKey(name);
        if (!key) continue;
        const candidate = item.candidates.get(key) ?? { name, by: [] };
        candidate.by.push(`${run.label}/${which}`);
        item.candidates.set(key, candidate);
      }
    }
  }
}

// --- Grading.

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
} catch {}
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
const cacheKey = (item, name, repeat) =>
  hash(
    `${JUDGE}\n${item.key}\n${item.excerpt.join("\n")}\n${item.label}\n${nameKey(name)}\n${repeat}`
  );

function prompt(item, chunk) {
  const sub = item.subtopics.length
    ? ` (sub-topics: ${item.subtopics.map((s) => `"${s.label}"`).join(", ")})`
    : "";
  return [
    "The meeting: a product design team at work (the AMI meeting corpus).",
    `Annotators' label for this stretch: "${item.label}"${sub}`,
    `Labels of the meeting's other parts: ${item.others.length ? item.others.map((label) => `"${label}"`).join(", ") : "none"}`,
    "",
    "Excerpt:",
    ...item.excerpt.map((line) => `- ${line}`),
    "",
    "Candidates:",
    ...chunk.map((candidate) => `${candidate.id}: "${candidate.name}"`),
  ].join("\n");
}

const jobs = [];
for (const item of items.values()) {
  if (args.only && !item.key.includes(args.only)) continue;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const missing = [...item.candidates.values()].filter(
      (candidate) => cache[cacheKey(item, candidate.name, repeat)] == null
    );
    if (!missing.length) continue;
    const random = seeded(Number.parseInt(hash(`${item.key}#${repeat}`).slice(0, 8), 16));
    const shuffled = missing
      .map((candidate) => ({ candidate, order: random() }))
      .sort((a, b) => a.order - b.order)
      .map(({ candidate }) => candidate);
    for (let start = 0; start < shuffled.length; start += MAX) {
      const chunk = shuffled
        .slice(start, start + MAX)
        .map((candidate, index) => ({ ...candidate, id: String.fromCharCode(65 + index) }));
      jobs.push({ item, repeat, chunk });
    }
  }
}
console.error(`${items.size} stretches, ${jobs.length} judge requests to make`);
if (args["dry-run"]) process.exit(0);

let done = 0;
let failed = 0;
async function work(job) {
  const result = await ask(JUDGE, {
    system: SYSTEM,
    user: prompt(job.item, job.chunk),
    schema: SCHEMA,
    maxTokens: 1500,
    parseJson: true,
    purpose: "judge",
    timeoutMs: 90_000,
    attempts: 3,
  });
  const grades = new Map((result.json?.grades ?? []).map((grade) => [String(grade.id), grade]));
  for (const candidate of job.chunk) {
    const grade = grades.get(candidate.id);
    const valid =
      grade &&
      [grade.relevance, grade.specificity].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 5
      ) &&
      Number.isInteger(grade.match) &&
      grade.match >= 0 &&
      grade.match <= 2;
    if (!valid) {
      failed += 1;
      continue;
    }
    cache[cacheKey(job.item, candidate.name, job.repeat)] = {
      relevance: grade.relevance,
      specificity: grade.specificity,
      match: grade.match,
    };
  }
  done += 1;
  if (done % 20 === 0) {
    saveCache();
    console.error(`  ${done}/${jobs.length}`);
  }
}
const queue = [...jobs];
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (queue.length) await work(queue.shift());
  })
);
saveCache();
if (failed) console.error(`${failed} grades missing (malformed answers); rerun to fill them`);

// --- Scores per run and view.

const groups = new Map();
for (const item of items.values()) {
  for (const candidate of item.candidates.values()) {
    const grades = [];
    for (let repeat = 0; repeat < REPEATS; repeat += 1) {
      const grade = cache[cacheKey(item, candidate.name, repeat)];
      if (grade) grades.push(grade);
    }
    if (!grades.length) continue;
    for (const by of candidate.by) {
      const list = groups.get(by) ?? [];
      list.push({ item: item.key, name: candidate.name, words: item.words, grades });
      groups.set(by, list);
    }
  }
}

const table = [];
for (const [group, list] of groups) {
  const avg = (key) => list.map((entry) => mean(entry.grades.map((grade) => grade[key])));
  // The judge's spread: how far one repeat's grade is from the other's, per name.
  const spread = list
    .filter((entry) => entry.grades.length > 1)
    .map((entry) => Math.abs(entry.grades[0].relevance - entry.grades[1].relevance));
  const perRepeat = Array.from({ length: REPEATS }, (_, repeat) =>
    mean(list.map((entry) => entry.grades[repeat]?.relevance).filter(Number.isFinite))
  );
  table.push({
    group,
    n: list.length,
    relevance: bootstrapMean(avg("relevance")),
    specificity: bootstrapMean(avg("specificity")),
    match: bootstrapMean(avg("match")),
    good: mean(
      list.map((entry) =>
        mean(entry.grades.map((grade) => grade.relevance)) >= 4 &&
        mean(entry.grades.map((grade) => grade.specificity)) >= 4
          ? 1
          : 0
      )
    ),
    repeatRelevance: perRepeat,
    judgeAbsDiff: mean(spread),
  });
}
table.sort((a, b) => b.relevance.mean - a.relevance.mean);
const f = (value, digits = 2) =>
  value == null || Number.isNaN(value) ? "n/a" : value.toFixed(digits);
const show = (stat) => `${f(stat.mean)} [${f(stat.low)}, ${f(stat.high)}]`;
console.log(`judge ${JUDGE}, ${REPEATS} repeat(s), ${items.size} stretches`);
for (const row of table) {
  console.log(
    `${row.group.padEnd(58)} n=${String(row.n).padStart(3)}  rel ${show(row.relevance)}  spec ${show(row.specificity)}  match ${show(row.match)}  good ${f(row.good * 100, 0)}%  repeats ${row.repeatRelevance.map((v) => f(v)).join("/")}  |Δ| ${f(row.judgeAbsDiff)}`
  );
}
if (args.json) {
  fs.writeFileSync(
    args.json,
    JSON.stringify(
      {
        judge: JUDGE,
        repeats: REPEATS,
        stretches: items.size,
        table,
        names: [...groups.entries()].map(([group, list]) => ({ group, list })),
      },
      null,
      1
    )
  );
}
