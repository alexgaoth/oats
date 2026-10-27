#!/usr/bin/env node
/**
 * Six-word topic names: how often #121's name check refuses a model's name for
 * its length, and whether the names it refused are any worse.
 *
 * The runs are `scripts/topic-loop-eval.mjs --variant v1` runs on AMI (public
 * data), which keep each naming request of #121 and the model's raw answer
 * (`nameAnswers`). For each run, the answers `parseTopicName` keeps with a
 * limit of 5 words and of 6. `--replay` sends the same prompts, with #121's
 * system prompt, to other models and counts the same. `--judge` grades, blind,
 * the names kept at 6 words and refused at 5 against 30 accepted names a run
 * (`--sample`), each against what was said on its topic: relevance and
 * specificity, 1 to 5, `--repeats` times.
 *
 *   node scripts/topic-name-lengths.mjs --runs v1-luna6.json,v1-luna56.json \
 *     [--replay anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5] \
 *     [--judge anthropic:claude-sonnet-5-5 --repeats 2] [--concurrency 6]
 *
 * Keys come from the environment, and every request is in the ledger
 * (`scripts/lib/fast-models.mjs`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { ask, bootstrapMean, seeded } from "./lib/fast-models.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { parseTopicName, TOPIC_NAME_SYSTEM_PROMPT } = await import(
  pathToFileURL(path.join(ROOT, "src/helpers/topicNaming.mjs")).href
);

const { values: args } = parseArgs({
  options: {
    runs: { type: "string" },
    replay: { type: "string" },
    judge: { type: "string" },
    repeats: { type: "string", default: "2" },
    sample: { type: "string", default: "30" },
    concurrency: { type: "string", default: "6" },
  },
});
if (!args.runs) {
  console.error("--runs a.json,b.json");
  process.exit(2);
}

/** What the prompt gave the model: the other topics' names and the lines quoted. */
function contextOf(prompt) {
  const others = (/^Other topics: (.*)$/m.exec(prompt)?.[1] ?? "")
    .split("; ")
    .filter((name) => name && name !== "none yet");
  const excerpt = (prompt.split("What was said on this topic:")[1] ?? "")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  return { others, excerpt };
}

/** One answer at both limits. */
function lengths(prompt, answer) {
  const context = contextOf(prompt);
  const line = String(answer ?? "")
    .split("\n")
    .map((text) => text.trim())
    .find(Boolean);
  return {
    five: parseTopicName(answer, { ...context, maxWords: 5 }),
    six: parseTopicName(answer, { ...context, maxWords: 6 }),
    words: line ? line.split(/\s+/).length : 0,
    excerpt: context.excerpt,
  };
}

function report(label, items) {
  const count = (test) => items.filter(test).length;
  const pct = (n) => `${((100 * n) / Math.max(1, items.length)).toFixed(1)}%`;
  const five = count((item) => item.five);
  const six = count((item) => item.six);
  const refused = items.filter((item) => !item.six);
  console.log(
    `${label.padEnd(34)} answers ${items.length}; kept at 5 words ${pct(five)}, at 6 ${pct(six)}; ` +
      `six-word ${six - five}; refused at 6: ${refused.length}, ` +
      `${refused.filter((item) => item.words > 6).length} of them seven words or more`
  );
}

async function pool(jobs, work) {
  const queue = [...jobs];
  const workers = Array.from({ length: Number(args.concurrency) }, async () => {
    while (queue.length) await work(queue.shift());
  });
  await Promise.all(workers);
}

const runs = args.runs.split(",").map((file) => {
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const answers = run.results.flatMap((result) => result.nameAnswers ?? []);
  return { file, model: run.summary?.model ?? path.basename(file), answers };
});

for (const run of runs) {
  run.items = run.answers.map(({ prompt, answer }) => lengths(prompt, answer));
  report(run.model, run.items);
}

// The same prompts to other models.
if (args.replay) {
  const prompts = runs[0].answers.map((item) => item.prompt);
  for (const spec of args.replay.split(",")) {
    const items = [];
    await pool(prompts, async (prompt) => {
      const result = await ask(spec, {
        system: TOPIC_NAME_SYSTEM_PROMPT,
        user: prompt,
        maxTokens: 100,
        purpose: "name-lengths:replay",
      });
      if (result.ok) items.push(lengths(prompt, result.text));
    });
    report(`${spec} (${path.basename(runs[0].file)}'s prompts)`, items);
  }
}

// Blind: the six-word names against a sample of the accepted ones.
if (args.judge) {
  const SYSTEM = [
    "You grade a name an app gave to one topic of a meeting, against what was said on that topic (an excerpt of a transcript with recognition errors).",
    "- relevance, 1 to 5: 5 names exactly what was said; 3 is related but partly off or too broad; 1 is wrong or meaningless",
    "- specificity, 1 to 5: 5 is specific enough to tell this topic apart from others in a meeting; 3 is somewhat generic; 1 is generic or empty",
    'Reply with JSON only: {"relevance": 4, "specificity": 4}',
  ].join("\n");
  const SCHEMA = {
    name: "grade",
    schema: {
      type: "object",
      properties: { relevance: { type: "integer" }, specificity: { type: "integer" } },
      required: ["relevance", "specificity"],
      additionalProperties: false,
    },
  };
  const graded = [];
  for (const run of runs) {
    for (const item of run.items) {
      if (!item.five && item.six)
        graded.push({ group: "six words (refused at 5)", name: item.six, item });
    }
    const random = seeded(11);
    const accepted = run.items
      .filter((item) => item.five)
      .map((item) => ({ item, key: random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, Number(args.sample));
    for (const { item } of accepted)
      graded.push({ group: "2 to 5 words (accepted)", name: item.five, item });
  }
  const grades = [];
  const jobs = graded.flatMap((entry) =>
    Array.from({ length: Number(args.repeats) }, (_, repeat) => ({ entry, repeat }))
  );
  await pool(jobs, async ({ entry, repeat }) => {
    const user = [
      `Name: "${entry.name}"`,
      "",
      "What was said on this topic:",
      ...entry.item.excerpt.slice(0, 40).map((line) => `- ${line}`),
    ].join("\n");
    const result = await ask(args.judge, {
      system: SYSTEM,
      // A repeat differs by a newline, so it is not a cached answer.
      user: repeat ? `${user}${"\n".repeat(repeat)}` : user,
      schema: SCHEMA,
      maxTokens: 100,
      parseJson: true,
      purpose: "name-lengths:judge",
    });
    if (result.json) grades.push({ group: entry.group, ...result.json });
  });
  for (const group of [...new Set(graded.map((entry) => entry.group))]) {
    const list = grades.filter((grade) => grade.group === group);
    const relevance = bootstrapMean(list.map((grade) => grade.relevance));
    const specificity = bootstrapMean(list.map((grade) => grade.specificity));
    const ci = (stat) =>
      `${stat.mean.toFixed(2)} [${stat.low.toFixed(2)}, ${stat.high.toFixed(2)}]`;
    console.log(
      `${group.padEnd(26)} names ${graded.filter((entry) => entry.group === group).length}  ` +
        `relevance ${ci(relevance)}  specificity ${ci(specificity)}`
    );
  }
}
