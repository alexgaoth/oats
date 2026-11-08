#!/usr/bin/env node
/**
 * The numbers the change detector reads (`src/helpers/topicChange.mjs`) at every
 * pause of a conversation, for `scripts/topic-change-train.py`. One implementation:
 * what is learned from here is what the app computes.
 *
 *   node scripts/topic-change-features.mjs --out <dir> [--lag 60]
 *     (--ami <dir> [--meetings a,b] [--vectors <dir>] | --icsi <dir> [--vectors <dir>]
 *      | --ami <dir> --replay <dir> [--vectors <dir>])
 *
 * `--vectors` holds `<id>.minilm.f32` files made ahead of time, one vector for
 * each turn; without it the turns are embedded here by all-MiniLM-L6-v2.
 * Writes `<id>.json`: `{ id, features, rows, starts, words, cuts }`, one row for
 * each pause, `cuts` the turns where the annotators' top-level topic changes.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { createEmbedder } from "./lib/minilm.mjs";
import {
  amiMeetingIds,
  amiRecognized,
  amiReference,
  annotationsDir,
  icsiMeetingIds,
  icsiReference,
  referenceLabels,
  topicNames,
} from "./lib/topic-corpus.mjs";
import { contentWords } from "../src/helpers/conversationTopics.mjs";
import { gapFeatures, makeTurn } from "../src/helpers/topicChange.mjs";

const { values: args } = parseArgs({
  options: {
    ami: { type: "string" },
    icsi: { type: "string" },
    replay: { type: "string" },
    meetings: { type: "string" },
    vectors: { type: "string" },
    out: { type: "string" },
    lag: { type: "string", default: "60" },
  },
});
const LAG = Number(args.lag);
fs.mkdirSync(args.out, { recursive: true });

function* conversations() {
  if (args.icsi) {
    const ids = args.meetings ? args.meetings.split(",") : icsiMeetingIds(args.icsi);
    for (const id of ids) yield icsiReference(args.icsi, id);
    return;
  }
  const dir = annotationsDir(args.ami);
  const names = topicNames(dir);
  if (args.replay) {
    for (const file of fs.readdirSync(args.replay).filter((name) => name.endsWith(".json"))) {
      const recording = JSON.parse(fs.readFileSync(path.join(args.replay, file), "utf8"));
      yield amiRecognized(dir, recording.meeting, names, recording.segments);
    }
    return;
  }
  const ids = args.meetings ? args.meetings.split(",") : amiMeetingIds(dir);
  for (const id of ids) yield amiReference(dir, id, names);
}

const embedder = args.vectors
  ? null
  : await createEmbedder({ cacheDir: path.join(os.homedir(), ".cache/oats/topic-change/vectors") });

for (const conversation of conversations()) {
  const { id, utterances } = conversation;
  let vectors;
  if (args.vectors) {
    const file = path.join(args.vectors, `${id}.minilm.f32`);
    const raw = fs.readFileSync(file);
    const data = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const dimension = data.length / utterances.length;
    vectors = utterances.map((_, index) =>
      data.subarray(index * dimension, (index + 1) * dimension)
    );
  } else {
    vectors = await embedder.embed(utterances.map((utterance) => utterance.text));
  }
  const firstSeen = new Map();
  const turns = utterances.map((utterance, index) => {
    const keys = contentWords(utterance.text);
    for (const key of keys) if (!firstSeen.has(key)) firstSeen.set(key, index);
    const turn = makeTurn({
      id: utterance.id,
      text: utterance.text,
      start: utterance.start,
      end: utterance.end,
      words: utterance.text.trim().split(/\s+/).length,
      keys,
    });
    turn.vector = vectors[index];
    return turn;
  });
  let names = null;
  const rows = [];
  for (let g = 1; g < turns.length; g += 1) {
    const features = gapFeatures(turns, g, { lag: LAG, firstSeen });
    names ??= Object.keys(features);
    rows.push(names.map((name) => Number(features[name].toFixed(6))));
  }
  const reference = referenceLabels(conversation);
  const cuts = reference.flatMap((label, index) =>
    index && label !== reference[index - 1] ? [index] : []
  );
  fs.writeFileSync(
    path.join(args.out, `${id}.json`),
    JSON.stringify({
      id,
      features: names,
      rows,
      starts: turns.map((turn) => turn.start),
      words: utterances.map((utterance) => utterance.refTop.length),
      labels: reference.map(String),
      cuts,
    })
  );
  console.error(id, turns.length);
}
