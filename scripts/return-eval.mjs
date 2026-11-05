#!/usr/bin/env node
// The return benchmark: inside one conversation, is a drawn "came back" right,
// and does a real return get drawn at the right moment? The method is in
// docs/link-eval.md ("The gold for returns").
//
//   node scripts/topic-loop-eval.mjs --variant d1 --ami <dir> --set all --trace-lanes --json d1.json
//   node scripts/return-eval.mjs score --input d1.json --split tune
//
// Corpus: AMI's human topic annotations (manual annotations 1.6.2, CC BY 4.0).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { amiReference, annotationsDir, topicNames } from "./lib/topic-corpus.mjs";
import { splitOfMeeting } from "./lib/link-split.mjs";
import { meetingReturns } from "./lib/return-truth.mjs";
import {
  chancePairs,
  scoreMeeting,
  summarizeReturns,
  verdictOf,
} from "./lib/return-score.mjs";
import { percentile } from "./lib/fast-models.mjs";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(os.homedir(), "oats-asr-cache", "AMI") },
    input: { type: "string" },
    split: { type: "string", default: "tune" },
    level: { type: "string", default: "fine,top" },
    show: { type: "boolean", default: false },
  },
});

const DIR = annotationsDir(args.ami);
const NAMES = topicNames(DIR);

/** The meetings of a trace on one side of the split, each with its gold at one level. */
export function meetingsOf(results, split, level) {
  return results
    .filter((result) => split === "all" || splitOfMeeting(result.id) === split)
    .map((result) => {
      const conversation = amiReference(DIR, result.id, NAMES);
      return {
        id: result.id,
        result,
        conversation,
        gold: meetingReturns(conversation, { level }),
      };
    });
}

function rowsOf(meetings, drawnOf) {
  return meetings.map((meeting) => {
    const { verdicts, found } = scoreMeeting(meeting, drawnOf(meeting));
    const count = (verdict) => verdicts.filter((item) => item.verdict === verdict).length;
    return {
      id: meeting.id,
      right: count("right"),
      wrong: count("wrong"),
      unverifiable: count("unverifiable"),
      goldFound: found.filter((item) => item.match).length,
      gold: found.length,
      verdicts,
      found,
    };
  });
}

const fmt = (value) => (value == null ? "  -  " : value.toFixed(2));
const ci = (value, interval) => `${fmt(value)} [${fmt(interval?.[0])}, ${fmt(interval?.[1])}]`;

function line(name, rows) {
  const s = summarizeReturns(rows);
  const drawn = s.right + s.wrong + s.unverifiable;
  console.log(
    `${name.padEnd(30)} drawn ${String(drawn).padStart(4)} right ${String(s.right).padStart(3)} wrong ${String(s.wrong).padStart(3)} unverifiable ${String(s.unverifiable).padStart(3)}` +
      `  P ${ci(s.precision, s.intervals.precision)}  strict ${ci(s.strict, s.intervals.strict)}  R ${ci(s.recall, s.intervals.recall)} (${s.goldFound}/${s.gold})`
  );
  return s;
}

function score() {
  const { results, summary } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  console.log(`${summary?.label ?? args.input}, split ${args.split}`);
  for (const level of args.level.split(",")) {
    const meetings = meetingsOf(results, args.split, level);
    console.log(`\n${level}: ${meetings.length} meetings, ${meetings.reduce((n, m) => n + m.gold.returns.length, 0)} gold returns`);
    const record = rowsOf(meetings, (meeting) => meeting.result.lanes.record.returns);
    line("record (Connections)", record);
    const chance = rowsOf(meetings, (meeting) => chancePairs(meeting.result.lanes.record.runs));
    const c = chance.reduce(
      (sum, row) => ({ right: sum.right + row.right, wrong: sum.wrong + row.wrong, un: sum.un + row.unverifiable }),
      { right: 0, wrong: 0, un: 0 }
    );
    console.log(`${"chance, all non-adjacent runs".padEnd(30)} P ${fmt(c.right / (c.right + c.wrong))}  strict ${fmt(c.right / (c.right + c.wrong + c.un))} (${c.right + c.wrong + c.un} pairs)`);
    const live = rowsOf(meetings, (meeting) => meeting.result.lanes.live.filter((item) => item.current));
    line("live, still drawn at the end", live);
    const ever = rowsOf(meetings, (meeting) => meeting.result.lanes.live);
    line("live, ever drawn", ever);
    const delays = ever.flatMap((row) =>
      row.found.filter((item) => item.match).map((item) => (item.match.shownAt - item.gold.start * 1000) / 1000)
    );
    const placement = ever.flatMap((row) =>
      row.found.filter((item) => item.match).map((item) => (item.match.at - item.gold.start * 1000) / 1000)
    );
    if (delays.length) {
      console.log(
        `  found returns: shown ${percentile(delays, 50).toFixed(0)} s after the room came back (median; p90 ${percentile(delays, 90).toFixed(0)} s); the bend ${percentile(placement, 50).toFixed(0)} s from it (p10 ${percentile(placement, 10).toFixed(0)}, p90 ${percentile(placement, 90).toFixed(0)})`
      );
    }
    if (args.show && level === "fine") {
      for (const row of record) {
        for (const item of row.verdicts) {
          console.log(`  ${row.id} ${item.verdict.padEnd(12)} at ${Math.round(item.drawn.at / 1000)} s topic ${item.drawn.topic} ${item.subject ?? ""}`);
        }
      }
    }
  }
}

/**
 * Other ways to decide a return, over thresholds, on the record's own cuts.
 * Tuning meetings only, unless --split says otherwise.
 */
async function sweep() {
  const { createEmbedder } = await import("./lib/minilm.mjs");
  const methods = await import("./lib/return-methods.mjs");
  const embedder = await createEmbedder({
    cacheDir: path.join(os.homedir(), ".cache", "oats", "link-eval", "vectors"),
    threads: 2,
  });
  const { results } = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const meetings = meetingsOf(results, args.split, "fine");
  const prepared = [];
  for (const meeting of meetings) {
    const stretches = methods.stretchesOf(meeting.conversation, meeting.result.recordAssignment);
    const texts = [...new Set(meeting.conversation.utterances.map((turn) => turn.text))];
    const embedded = await embedder.embed(texts);
    const vectors = new Map(texts.map((text, index) => [text, embedded[index]]));
    const raw = stretches.map((stretch) =>
      methods.stretchVector(stretch, (text) => vectors.get(text))
    );
    const weights = stretches.map((stretch) =>
      stretch.turns.reduce((sum, turn) => sum + turn.text.split(/\s+/).length, 0)
    );
    prepared.push({ meeting, stretches, raw, centered: methods.centered(raw, weights) });
  }
  const dot = (a, b) => (a && b ? a.reduce((sum, value, index) => sum + value * b[index], 0) : -1);
  const grid = Array.from({ length: 17 }, (_, index) => Math.round(index * 5) / 100);
  for (const [name, key, thresholds] of [
    ["raw cosine", "raw", grid.map((value) => 0.55 + value)],
    ["centred cosine", "centered", grid.map((value) => value - 0.1)],
  ]) {
    for (const link of ["mean", "max"]) {
      console.log(`\n${name}, ${link} of the group`);
      for (const threshold of thresholds) {
        const rows = rowsOf(
          prepared.map((item) => item.meeting),
          (meeting) => {
            const item = prepared.find((other) => other.meeting === meeting);
            const list = item[key];
            const { groups } = methods.groupStretches(
              list.length,
              (j, i) => dot(list[j], list[i]),
              threshold,
              { link }
            );
            return methods.drawnReturns(meeting.conversation, item.stretches, groups);
          }
        );
        line(`t ${threshold.toFixed(2)}`, rows);
      }
    }
  }
}

const COMMANDS = { score, sweep };
if (!COMMANDS[positionals[0]]) {
  console.error(`Usage: node scripts/return-eval.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
void verdictOf;
await COMMANDS[positionals[0]]();
