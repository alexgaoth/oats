#!/usr/bin/env node
// Round 2 of the link benchmark (docs/link-eval.md, "Round 2"). Reads what
// `scripts/link-eval.mjs` cached (snapshots, names, gists) and adds to it.
//
//   node scripts/link-eval-2.mjs texts --out texts.json     every text to embed
//
// Nothing of Oats' users is read or sent. The bar and the split were written
// before these runs; `--split tune` reads tuning pairs only.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { splitOfMeeting, splitOfPair } from "./lib/link-split.mjs";
import { amiMeetingIds, amiReference, annotationsDir, topicNames } from "./lib/topic-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(os.homedir(), "oats-asr-cache", "AMI") },
    cache: { type: "string", default: path.join(os.homedir(), ".cache", "oats", "link-eval") },
    out: { type: "string" },
    split: { type: "string", default: "tune" },
    configs: { type: "string", default: "minilm" },
    drawn: { type: "boolean", default: false },
    runs: { type: "string", default: "anthropic_claude-opus-5-5_think_medium" },
    model: { type: "string" },
    variant: { type: "string" },
    calls: { type: "string", default: "tune" },
    concurrency: { type: "string", default: "6" },
    "local-model": { type: "string" },
    "llama-server": { type: "string" },
    center: { type: "string", default: "0.81" },
    kind: { type: "string", default: "excerpt" },
  },
});

const command = positionals[0];
const DIR = annotationsDir(args.ami);
const CACHE = args.cache;
const NAMES = topicNames(DIR);
const NAMING_MODEL = "openai_gpt-5.6-luna_none";
const FM_BRIDGE = path.join(os.homedir(), "oats-asr-cache", "fidelity-2", "fm-bridge", "bin", "fm-bridge");
/** A list longer than this is not an answer a linker gives: the sample asks about at most 12. */
const MAX_LINKS = 12;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** The stored meetings: snapshot, the writing model's names, the summary, the turns. */
function loadMeetings() {
  return amiMeetingIds(DIR).map((id) => {
    const stored = readJson(path.join(CACHE, "snapshots", `${id}.json`));
    if (!stored) throw new Error(`No snapshot for ${id}: run link-eval.mjs snapshots`);
    const conversation = amiReference(DIR, id, NAMES);
    return {
      id,
      nodes: stored.snapshot.nodes,
      names: readJson(path.join(CACHE, "names", NAMING_MODEL, `${id}.json`), {}),
      summary: readJson(path.join(CACHE, "gists", NAMING_MODEL, `${id}.json`))?.summary ?? "",
      conversation,
      turns: new Map(conversation.utterances.map((utterance) => [utterance.id, utterance.text])),
    };
  });
}

function texts() {
  const out = new Set();
  for (const meeting of loadMeetings()) {
    // `--split tune` leaves the test meetings' text for the finalists alone.
    if (args.split === "tune" && splitOfMeeting(meeting.id) !== "tune") continue;
    for (const utterance of meeting.conversation.utterances) out.add(utterance.text);
    for (const node of meeting.nodes) {
      out.add(String(node.label).trim());
      const named = meeting.names[node.id]?.name;
      if (named) out.add(named.trim());
    }
  }
  fs.writeFileSync(args.out, JSON.stringify([...out]));
  console.log(`${out.size} texts`);
}

// ---------------------------------------------------------------------------
// The corpus as the board sees it, as round 1 laid it out: a day apart, in the
// order of the ids.

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);

async function loadCorpus() {
  const truth = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-truth.mjs")).href);
  const links = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationLinks.mjs")).href
  );
  const tracker = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationTopics.mjs")).href
  );
  const meetings = loadMeetings();
  const byMeeting = new Map(
    meetings.map((meeting) => [meeting.id, truth.meetingSubjects(DIR, meeting.id, NAMES)])
  );
  const pairs = truth.truthPairs(
    meetings.map((meeting) => meeting.id),
    byMeeting,
    { minWords: 100 }
  );
  for (const pair of pairs) pair.split = splitOfPair(pair);
  meetings.forEach((meeting, index) => {
    meeting.createdAt = T0 + index * DAY_MS;
    meeting.words = new Map(
      meeting.conversation.utterances.map((utterance) => [
        utterance.id,
        tracker.contentWords(utterance.text).length,
      ])
    );
  });
  return { truth, links, tracker, meetings, pairs, byMeeting };
}

/** A topic's text for a name vector: the writing model's name when `model`, else the tracker's. */
function nameOf(meeting, node, variant) {
  return String((variant === "model" && meeting.names[node.id]?.name) || node.label).trim();
}

/** Each meeting's linkable topics with their vectors from one store. */
function topicVectors(corpus, store, { variant = "device" } = {}) {
  const { links } = corpus;
  return new Map(
    corpus.meetings.map((meeting) => [
      meeting.id,
      meeting.nodes
        .filter((node) => links.isLinkableTopic(node))
        .map((node) => {
          const pieces = node.utteranceIds
            .map((id) => ({
              vector: store.get(meeting.turns.get(String(id)) ?? ""),
              weight: meeting.words.get(String(id)) ?? 0,
            }))
            .filter((piece) => piece.vector && piece.weight > 0);
          return {
            node,
            label: nameOf(meeting, node, variant),
            content: links.topicContentVector(pieces),
            name: store.get(nameOf(meeting, node, variant)),
          };
        }),
    ])
  );
}

/** The board as the app builds it, with one store's vectors in place of the stored ones. */
function boardOf(corpus, topics, variant) {
  const { links } = corpus;
  return corpus.meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.id,
    createdAt: meeting.createdAt,
    snapshot: {
      nodes: meeting.nodes.map((node) => {
        const topic = topics.get(meeting.id).find((item) => item.node === node);
        const { vector: _stored, ...rest } = node;
        return {
          ...rest,
          label: nameOf(meeting, node, variant),
          ...(topic?.content ? { vector: links.encodeTopicVector(topic.content) } : {}),
        };
      }),
    },
  }));
}

/** Pairs linked on a board, from its subjects: `a|b` to the subject's name. */
function coMembers(subjects) {
  const linked = new Map();
  for (const subject of subjects) {
    const ids = [...subject.conversationIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!linked.has(key)) linked.set(key, subject.label);
      }
    }
  }
  return linked;
}

function dot(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return total;
}

/** Each pair's score: its two most alike topics, by `field` of a topic. */
function bestPairScores(corpus, topics, field) {
  const scores = new Map();
  for (const pair of corpus.pairs) {
    let best = -2;
    for (const a of topics.get(pair.a)) {
      if (!a[field]) continue;
      for (const b of topics.get(pair.b)) {
        if (!b[field]) continue;
        const score = dot(a[field], b[field]);
        if (score > best) best = score;
      }
    }
    scores.set(pair.key, best);
  }
  return scores;
}

/** Rates of a decision over pairs. */
function ratesOf(pairs, linked, scoreLib) {
  const counts = scoreLib.confusion(pairs, linked);
  return { counts, ...scoreLib.rates(counts) };
}

const inSplit = (pairs, split, category) =>
  pairs.filter(
    (pair) =>
      (split === "all" || pair.split === split) &&
      (category === "scenario"
        ? pair.category.startsWith("scenario")
        : pair.category === category)
  );

/** The curve of a score on tuning pairs: the best balanced accuracy, and the most recall at the bar. */
function operatingPoints(pairs, scores, grid, scoreLib) {
  let best = null;
  let bar = null;
  for (const threshold of grid) {
    const linked = (pair) => (scores.get(pair.key) ?? -2) >= threshold;
    const r = ratesOf(pairs, linked, scoreLib);
    const balance = (r.recall ?? 0) - (r.falseLinks ?? 0);
    if (!best || balance > best.balance + 1e-12) best = { threshold, balance, ...r };
    if ((r.precision ?? 0) >= 0.9 && (r.falseLinks ?? 1) <= 0.25) {
      if (!bar || (r.recall ?? 0) > bar.recall) bar = { threshold, ...r };
    }
  }
  return { best, bar };
}

/**
 * Screens embedding models on tuning pairs. For each store: the best-pair AUC
 * by topic vectors and by names, the best balanced accuracy, the most recall
 * that reaches the bar's precision and false-link rate, and as the board draws
 * them.
 */
async function screen() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href);
  const corpus = await loadCorpus();
  const split = args.split;
  const scenario = inSplit(corpus.pairs, split, "scenario");
  const mixed = inSplit(corpus.pairs, split, "mixed");
  const within = inSplit(corpus.pairs, split, "non-scenario-within");
  console.log(`${split}: ${scenario.length} scenario pairs (${scenario.filter((pair) => pair.linked).length} linked), ${mixed.length} mixed, ${within.length} non-scenario within`);
  const grid = Array.from({ length: 76 }, (_, index) => Math.round((0.2 + index * 0.01) * 100) / 100);
  const out = [];
  for (const spec of args.configs.split(",")) {
    const [config, dims] = spec.split(":");
    const store = readStore(path.join(CACHE, "embed"), config, { dims: dims ? Number(dims) : undefined });
    const topics = topicVectors(corpus, store);
    const content = bestPairScores(corpus, topics, "content");
    const names = bestPairScores(corpus, topics, "name");
    const auc = (scores) => scoreLib.auc(scenario, (pair) => scores.get(pair.key));
    const points = operatingPoints(scenario, content, grid, scoreLib);
    const pairMixed = (threshold) => mixed.filter((pair) => content.get(pair.key) >= threshold).length;
    const row = {
      spec,
      dimension: store.dimension,
      aucContent: auc(content),
      aucNames: auc(names),
      best: points.best,
      bar: points.bar,
      mixedAtBest: pairMixed(points.best.threshold),
    };
    // As the board draws them, around the pair threshold.
    if (args.drawn) {
      const board = boardOf(corpus, topics, "device");
      const vectorOf = (text) => store.get(text);
      const drawnScores = new Map();
      const thresholds = Array.from({ length: 13 }, (_, index) =>
        Math.round((points.best.threshold - 0.04 + index * 0.02) * 100) / 100
      );
      for (const threshold of thresholds) {
        const linked = coMembers(
          corpus.links.meaningThreads(board, { vectorOf, contentThreshold: threshold }).subjects
        );
        drawnScores.set(threshold, linked);
      }
      row.drawn = thresholds.map((threshold) => {
        const linked = drawnScores.get(threshold);
        const r = ratesOf(scenario, (pair) => linked.has(pair.key), scoreLib);
        return {
          threshold,
          precision: r.precision,
          recall: r.recall,
          falseLinks: r.falseLinks,
          mixed: mixed.filter((pair) => linked.has(pair.key)).length,
        };
      });
    }
    out.push(row);
    const f = (value) => (value == null ? " -  " : value.toFixed(3));
    const b = row.best;
    console.log(
      `${spec.padEnd(18)} dim ${String(row.dimension).padStart(4)}  AUC content ${f(row.aucContent)} names ${f(row.aucNames)}  ` +
        `best t ${b.threshold.toFixed(2)} P ${f(b.precision)} R ${f(b.recall)} FL ${f(b.falseLinks)} mixed ${row.mixedAtBest}  ` +
        `at bar: ${row.bar ? `t ${row.bar.threshold.toFixed(2)} P ${f(row.bar.precision)} R ${f(row.bar.recall)} FL ${f(row.bar.falseLinks)}` : "none"}`
    );
    for (const item of row.drawn ?? []) {
      console.log(
        `    drawn t ${item.threshold.toFixed(2)} P ${f(item.precision)} R ${f(item.recall)} FL ${f(item.falseLinks)} mixed ${item.mixed}`
      );
    }
  }
  fs.writeFileSync(path.join(CACHE, "results", `screen-${split}.json`), JSON.stringify(out));
}

/** The mean of vectors, as a plain array. */
function meanOf(vectors) {
  const sum = new Float64Array(vectors[0].length);
  for (const vector of vectors) for (let k = 0; k < sum.length; k += 1) sum[k] += vector[k];
  return sum.map((value) => value / vectors.length);
}

function normalized(values) {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm);
  return Float32Array.from(values, (value) => value / (norm || 1));
}

/** One curve as the board draws it: each threshold's rates on tuning pairs. */
function drawnCurve(corpus, topics, store, thresholds, scoreLib, split, variant = "device") {
  const scenario = inSplit(corpus.pairs, split, "scenario");
  const mixed = inSplit(corpus.pairs, split, "mixed");
  const within = inSplit(corpus.pairs, split, "non-scenario-within");
  const board = boardOf(corpus, topics, variant);
  const vectorOf = (text) => store.get(text);
  return thresholds.map((threshold) => {
    const linked = coMembers(
      corpus.links.meaningThreads(board, { vectorOf, contentThreshold: threshold }).subjects
    );
    const r = ratesOf(scenario, (pair) => linked.has(pair.key), scoreLib);
    return {
      threshold,
      precision: r.precision,
      recall: r.recall,
      falseLinks: r.falseLinks,
      mixed: mixed.filter((pair) => linked.has(pair.key)).length,
      nsWithin: within.filter((pair) => linked.has(pair.key)).length,
    };
  });
}

function printCurve(name, curve) {
  const f = (value) => (value == null ? " -  " : value.toFixed(3));
  console.log(name);
  for (const item of curve) {
    console.log(
      `  t ${item.threshold.toFixed(2)} P ${f(item.precision)} R ${f(item.recall)} FL ${f(item.falseLinks)} mixed ${item.mixed} ns-within ${item.nsWithin}`
    );
  }
}

/** Structural ideas on tuning pairs, against the app's rule at a finer grid. */
async function explore() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const corpus = await loadCorpus();
  const split = args.split;
  for (const spec of args.configs.split(",")) {
    const [config, dims] = spec.split(":");
    const store = readStore(path.join(CACHE, "embed"), config, {
      dims: dims ? Number(dims) : undefined,
    });
    const topics = topicVectors(corpus, store);
    const center = Number(args.center);
    const plain = Array.from({ length: 11 }, (_, index) =>
      Number((center - 0.05 + index * 0.01).toFixed(2))
    );
    printCurve(`${spec}: the app's rule`, drawnCurve(corpus, topics, store, plain, scoreLib, split));

    // Centred on the history: each topic vector minus the mean of all of them.
    const everything = [...topics.values()].flat().map((topic) => topic.content);
    const mean = meanOf(everything.filter(Boolean));
    const centredTopics = new Map(
      [...topics].map(([id, list]) => [
        id,
        list.map((topic) => ({
          ...topic,
          content: topic.content
            ? normalized(Array.from(topic.content, (value, k) => value - mean[k]))
            : null,
        })),
      ])
    );
    const centredGrid = Array.from({ length: 12 }, (_, index) =>
      Number((0.1 + index * 0.05).toFixed(2))
    );
    printCurve(
      `${spec}: centred on the history`,
      drawnCurve(corpus, centredTopics, store, centredGrid, scoreLib, split)
    );

    // What was said and the name, together.
    for (const [variant, weight] of [
      ["device", 0.3],
      ["model", 0.3],
    ]) {
      const named = topicVectors(corpus, store, { variant });
      const mixedTopics = new Map(
        [...named].map(([id, list]) => [
          id,
          list.map((topic) => ({
            ...topic,
            content:
              topic.content && topic.name
                ? normalized(
                    Array.from(
                      topic.content,
                      (value, k) => (1 - weight) * value + weight * topic.name[k]
                    )
                  )
                : topic.content,
          })),
        ])
      );
      printCurve(
        `${spec}: said + ${weight} name (${variant})`,
        drawnCurve(corpus, mixedTopics, store, plain, scoreLib, split, variant)
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Reranking and hybrid scores, per pair of meetings.

/** For each pair, the two topics most alike by what was said. */
function bestTopicPairs(corpus, topics) {
  const best = new Map();
  for (const pair of corpus.pairs) {
    let top = { score: -2, a: null, b: null };
    for (const a of topics.get(pair.a)) {
      if (!a.content) continue;
      for (const b of topics.get(pair.b)) {
        if (!b.content) continue;
        const score = dot(a.content, b.content);
        if (score > top.score) top = { score, a, b };
      }
    }
    best.set(pair.key, top);
  }
  return best;
}

/** The pair of texts a cross-encoder reads for each pair of meetings, in `corpus.pairs` order. */
async function rerankTexts() {
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const { topicExcerpt } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/topicNaming.mjs")).href
  );
  const { summaryExcerpt } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationGroupSort.mjs")).href
  );
  const corpus = await loadCorpus();
  const store = readStore(path.join(CACHE, "embed"), "minilm");
  const topics = topicVectors(corpus, store, { variant: "model" });
  const best = bestTopicPairs(corpus, topics);
  const meetings = new Map(corpus.meetings.map((meeting) => [meeting.id, meeting]));
  const excerptOf = (meeting, topic) =>
    topicExcerpt(
      topic.node.utteranceIds.map((id) => meeting.turns.get(String(id)) ?? ""),
      { budget: 1000 }
    ).join(" ");
  const gistOf = (meeting) => {
    const names = topics.get(meeting.id).map((topic) => topic.label);
    return `${summaryExcerpt(meeting.summary, 300)} ${names.join("; ")}`;
  };
  const out = corpus.pairs.map((pair) => {
    const a = meetings.get(pair.a);
    const b = meetings.get(pair.b);
    const top = best.get(pair.key);
    if (args.kind === "gist") return [gistOf(a), gistOf(b)];
    if (!top.a) return ["", ""];
    if (args.kind === "name") return [top.a.label, top.b.label];
    return [excerptOf(a, top.a), excerptOf(b, top.b)];
  });
  fs.writeFileSync(args.out, JSON.stringify(out));
  console.log(`${out.length} pairs of ${args.kind} texts`);
}

/** A meeting's or topic's words as a tf-idf vector over the whole corpus, unit length. */
function tfidfVectors(bags) {
  const spread = new Map();
  for (const bag of bags.values()) {
    for (const word of bag.keys()) spread.set(word, (spread.get(word) ?? 0) + 1);
  }
  const out = new Map();
  for (const [key, bag] of bags) {
    const vector = new Map();
    let norm = 0;
    for (const [word, count] of bag) {
      const weight = (1 + Math.log(count)) * Math.log((bags.size + 1) / spread.get(word));
      if (weight <= 0) continue;
      vector.set(word, weight);
      norm += weight * weight;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [word, weight] of vector) vector.set(word, weight / norm);
    out.set(key, vector);
  }
  return out;
}

function sparseDot(a, b) {
  let total = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [word, weight] of small) {
    const other = large.get(word);
    if (other) total += weight * other;
  }
  return total;
}

/** Okapi BM25 of a query's words over a document, with the corpus' lengths. */
function bm25Scorer(documents) {
  const k1 = 1.2;
  const b = 0.75;
  const spread = new Map();
  let total = 0;
  for (const words of documents.values()) {
    total += words.length;
    for (const word of new Set(words)) spread.set(word, (spread.get(word) ?? 0) + 1);
  }
  const mean = total / Math.max(1, documents.size);
  const counts = new Map(
    [...documents].map(([key, words]) => {
      const bag = new Map();
      for (const word of words) bag.set(word, (bag.get(word) ?? 0) + 1);
      return [key, bag];
    })
  );
  const idf = (word) => {
    const df = spread.get(word) ?? 0;
    return Math.log(1 + (documents.size - df + 0.5) / (df + 0.5));
  };
  return (queryKey, documentKey) => {
    const bag = counts.get(documentKey);
    const length = documents.get(documentKey).length;
    let score = 0;
    for (const word of new Set(documents.get(queryKey))) {
      const tf = bag.get(word);
      if (!tf) continue;
      score += (idf(word) * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * length) / mean));
    }
    return score;
  };
}

/** Every hybrid signal for every pair. No label is read here. */
async function hybridFeatures(corpus, store) {
  const { summaryExcerpt } = await import(
    pathToFileURL(path.join(ROOT, "src/helpers/conversationGroupSort.mjs")).href
  );
  const { truth, tracker } = corpus;
  const device = topicVectors(corpus, store, { variant: "device" });
  const model = topicVectors(corpus, store, { variant: "model" });
  const contentBest = bestTopicPairs(corpus, device);
  const nameDevice = bestPairScores(corpus, device, "name");
  const nameModel = bestPairScores(corpus, model, "name");

  // Words of each meeting and of each linkable topic, from what was said.
  const meetingBags = new Map();
  const topicBags = new Map();
  const add = (bag, words) => {
    for (const word of words) bag.set(word, (bag.get(word) ?? 0) + 1);
  };
  for (const meeting of corpus.meetings) {
    const whole = new Map();
    for (const topic of device.get(meeting.id)) {
      const bag = new Map();
      for (const id of topic.node.utteranceIds) {
        add(bag, tracker.contentWords(meeting.turns.get(String(id)) ?? ""));
      }
      topicBags.set(`${meeting.id}#${topic.node.id}`, bag);
      add(whole, bag.keys());
    }
    meetingBags.set(meeting.id, whole);
  }
  const topicTfidf = tfidfVectors(topicBags);
  const meetingTfidf = tfidfVectors(meetingBags);
  const gists = new Map(
    corpus.meetings.map((meeting) => [
      meeting.id,
      tracker.contentWords(summaryExcerpt(meeting.summary, 300)),
    ])
  );
  const bm25 = bm25Scorer(gists);
  const fingerprints = new Map(
    corpus.meetings.map((meeting) => [
      meeting.id,
      new Set(device.get(meeting.id).flatMap((topic) => topic.node.words.slice(0, 5))),
    ])
  );
  const wordSpread = new Map();
  for (const words of fingerprints.values()) {
    for (const word of words) wordSpread.set(word, (wordSpread.get(word) ?? 0) + 1);
  }
  const indexOf = new Map(corpus.meetings.map((meeting, index) => [meeting.id, index]));
  const crossEncoders = {};
  for (const name of [
    "rerank-stsb-distilroberta-base",
    "rerank-jina-v1-tiny-en",
    "rerank-ms-marco-MiniLM-L6-v2",
  ]) {
    for (const kind of ["excerpt", "gist", "name"]) {
      const scores = readJson(path.join(CACHE, "rerank", `${name}~${kind}.json`));
      if (scores) crossEncoders[`${name.split("-")[1]}-${kind}`] = scores;
    }
  }
  const features = new Map();
  corpus.pairs.forEach((pair, index) => {
    const top = contentBest.get(pair.key);
    const shared = [...fingerprints.get(pair.a)].filter((word) => fingerprints.get(pair.b).has(word));
    const row = {
      content: top.score,
      nameDevice: nameDevice.get(pair.key),
      nameModel: nameModel.get(pair.key),
      bm25Gist: bm25(pair.a, pair.b) + bm25(pair.b, pair.a),
      tfidfTopic:
        top.a && top.b
          ? sparseDot(
              topicTfidf.get(`${pair.a}#${top.a.node.id}`),
              topicTfidf.get(`${pair.b}#${top.b.node.id}`)
            )
          : 0,
      tfidfMeeting: sparseDot(meetingTfidf.get(pair.a), meetingTfidf.get(pair.b)),
      sharedTerms: shared.reduce(
        (sum, word) => sum + Math.log((corpus.meetings.length + 1) / wordSpread.get(word)),
        0
      ),
      samePeople: truth.seriesOf(pair.a) === truth.seriesOf(pair.b) ? 1 : 0,
      recency: -Math.log(1 + Math.abs(indexOf.get(pair.a) - indexOf.get(pair.b))),
    };
    for (const [name, scores] of Object.entries(crossEncoders)) row[name] = scores[index];
    features.set(pair.key, row);
  });
  return features;
}

/** Logistic regression by gradient descent, on standardized features, with a little L2. */
function fitLogistic(rows, labels, { rounds = 400, rate = 0.5, l2 = 0.001 } = {}) {
  const width = rows[0].length;
  const means = new Array(width).fill(0);
  const scales = new Array(width).fill(0);
  for (const row of rows) row.forEach((value, k) => (means[k] += value / rows.length));
  for (const row of rows) row.forEach((value, k) => (scales[k] += (value - means[k]) ** 2 / rows.length));
  for (let k = 0; k < width; k += 1) scales[k] = Math.sqrt(scales[k]) || 1;
  const scaled = rows.map((row) => row.map((value, k) => (value - means[k]) / scales[k]));
  const weights = new Array(width).fill(0);
  let bias = 0;
  for (let round = 0; round < rounds; round += 1) {
    const gradient = new Array(width).fill(0);
    let gradientBias = 0;
    scaled.forEach((row, index) => {
      let z = bias;
      for (let k = 0; k < width; k += 1) z += weights[k] * row[k];
      const error = 1 / (1 + Math.exp(-z)) - labels[index];
      gradientBias += error;
      for (let k = 0; k < width; k += 1) gradient[k] += error * row[k];
    });
    bias -= (rate * gradientBias) / rows.length;
    for (let k = 0; k < width; k += 1) {
      weights[k] -= rate * (gradient[k] / rows.length + l2 * weights[k]);
    }
  }
  return {
    weights,
    score: (row) => {
      let z = bias;
      for (let k = 0; k < width; k += 1) z += (weights[k] * (row[k] - means[k])) / scales[k];
      return z;
    },
  };
}

/** Tuning pairs only: series folds inside tuning, so a score is never of a pair it was fitted on. */
async function hybrid() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const corpus = await loadCorpus();
  const { truth } = corpus;
  const store = readStore(path.join(CACHE, "embed"), args.configs.split(",")[0]);
  const features = await hybridFeatures(corpus, store);
  const pairs = corpus.pairs.filter(
    (pair) => pair.split === "tune" && (pair.category.startsWith("scenario") || pair.category === "mixed")
  );
  const scenario = pairs.filter((pair) => pair.category.startsWith("scenario"));
  const series = [
    ...new Set(pairs.flatMap((pair) => [truth.seriesOf(pair.a), truth.seriesOf(pair.b)])),
  ].sort();
  const foldOf = new Map(series.map((name, index) => [name, index % 5]));
  const names = Object.keys(features.get(pairs[0].key));
  const single = (name) => scoreLib.auc(scenario, (pair) => features.get(pair.key)[name]);
  console.log(`${pairs.length} tuning pairs. One signal alone, AUC on scenario pairs:`);
  for (const name of names) console.log(`  ${name.padEnd(22)} ${single(name)?.toFixed(3)}`);
  const crossValidated = (subset) => {
    const held = new Map();
    for (let fold = 0; fold < 5; fold += 1) {
      const train = pairs.filter(
        (pair) => foldOf.get(truth.seriesOf(pair.a)) !== fold && foldOf.get(truth.seriesOf(pair.b)) !== fold
      );
      const test = pairs.filter(
        (pair) => foldOf.get(truth.seriesOf(pair.a)) === fold || foldOf.get(truth.seriesOf(pair.b)) === fold
      );
      const fit = fitLogistic(
        train.map((pair) => subset.map((name) => features.get(pair.key)[name])),
        train.map((pair) => (pair.linked ? 1 : 0))
      );
      for (const pair of test) {
        const value = fit.score(subset.map((name) => features.get(pair.key)[name]));
        held.set(pair.key, (held.get(pair.key) ?? 0) + value);
      }
    }
    const sorted = [...held.values()].sort((a, b) => a - b);
    const grid = Array.from({ length: 200 }, (_, index) => sorted[Math.floor((index * sorted.length) / 200)]);
    const auc = scoreLib.auc(scenario, (pair) => held.get(pair.key));
    let bar = null;
    for (const threshold of grid) {
      const r = ratesOf(scenario, (pair) => held.get(pair.key) >= threshold, scoreLib);
      if ((r.precision ?? 0) >= 0.9 && (r.falseLinks ?? 1) <= 0.25 && (!bar || r.recall > bar.recall)) {
        bar = r;
      }
    }
    return { auc, bar };
  };
  const show = (name, subset) => {
    const { auc, bar } = crossValidated(subset);
    console.log(
      `  ${name.padEnd(34)} AUC ${auc.toFixed(3)}  at the bar ${bar ? `P ${bar.precision.toFixed(3)} R ${bar.recall.toFixed(3)} FL ${bar.falseLinks.toFixed(3)}` : "none"}`
    );
  };
  console.log("\nCross-validated inside tuning:");
  const cross = names.filter((name) => /-(excerpt|gist|name)$/.test(name));
  show("content", ["content"]);
  show("content + names", ["content", "nameDevice", "nameModel"]);
  show("content + bm25 gist", ["content", "bm25Gist"]);
  show("content + tf-idf", ["content", "tfidfTopic", "tfidfMeeting"]);
  show("content + shared terms", ["content", "sharedTerms"]);
  show("content + people + recency", ["content", "samePeople", "recency"]);
  if (cross.length) show("content + cross-encoders", ["content", ...cross]);
  show("everything but people", names.filter((name) => name !== "samePeople"));
  show("everything", names);
}

// ---------------------------------------------------------------------------
// The cloud and writing-model linkers, on round 1's fixed sample.

const BASE_RUN = "anthropic_claude-opus-5-5_think_medium";

function linkerRun(name) {
  const dir = path.join(CACHE, "linker", name);
  const calls = new Map();
  for (const file of fs.readdirSync(dir)) {
    const value = readJson(path.join(dir, file));
    if (value) calls.set(value.id, value);
  }
  return { name, calls };
}

/** Every sampled pair, from the run all others are paired with. */
function samplePairs(corpus) {
  const base = linkerRun(BASE_RUN);
  const byKey = new Map(corpus.pairs.map((pair) => [pair.key, pair]));
  const out = [];
  for (const call of base.calls.values()) {
    for (const other of call.candidates) {
      out.push({ call: call.id, other, pair: byKey.get([call.id, other].sort().join("|")) });
    }
  }
  return out;
}

/** What a run says about a sampled pair, or null when it was not asked. */
function runDecides(run) {
  return (item) => {
    const answer = run.calls.get(item.call);
    if (!answer?.ok) return null;
    return (answer.links ?? []).some((link) => link.id === item.other);
  };
}

/**
 * The sample's scores on one side of the split. Scenario rates are weighted to
 * stand for the whole split: within-series pairs are a census and across-series
 * pairs a sample, as in round 1.
 */
function sampleTable(corpus, scoreLib, methods, split, reference) {
  const { truth } = corpus;
  const items = samplePairs(corpus).filter(
    (item) => (split === "all" || item.pair.split === split) && methods.every((m) => m.decide(item) != null)
  );
  const all = corpus.pairs.filter((pair) => split === "all" || pair.split === split);
  const sampledIn = (category) => items.filter((item) => item.pair.category === category).length;
  const weightOf = (pair) =>
    all.filter((other) => other.category === pair.category).length /
    Math.max(1, sampledIn(pair.category));
  const weightCache = new Map();
  const pairWeight = (pair) => {
    if (!weightCache.has(pair.category)) weightCache.set(pair.category, weightOf(pair));
    return weightCache.get(pair.category);
  };
  const scenario = items.filter((item) => item.pair.category.startsWith("scenario")).map((item) => item.pair);
  const options = { seriesOf: truth.seriesOf, groupOf: truth.groupOf, pairWeight };
  const decided = new Map(
    methods.map((method) => [
      method.name,
      new Map(items.map((item) => [item.pair.key, method.decide(item)])),
    ])
  );
  const rows = [];
  const f = (value) => (value == null ? "  -  " : value.toFixed(2));
  const interval = (value) => (value ? `[${f(value[0])}, ${f(value[1])}]` : "");
  console.log(`${split}: ${items.length} sampled pairs, ${scenario.length} scenario`);
  for (const method of methods) {
    const yes = (pair) => decided.get(method.name).get(pair.key);
    const s = scoreLib.scoreWithIntervals(scenario, yes, options);
    const within = scenario.filter((pair) => pair.category === "scenario-within");
    const across = scenario.filter((pair) => pair.category === "scenario-across");
    const w = scoreLib.rates(scoreLib.confusion(within, yes, pairWeight));
    const a = scoreLib.rates(scoreLib.confusion(across, yes, pairWeight));
    const mixed = items.filter((item) => item.pair.category === "mixed");
    const mixedFalse = mixed.filter((item) => yes(item.pair)).length;
    const nsWithin = items.filter((item) => item.pair.category === "non-scenario-within");
    const row = { name: method.name, scenario: s, within: w, across: a, mixedFalse, mixed: mixed.length };
    console.log(
      `${method.name.padEnd(48)} P ${f(s.precision)} ${interval(s.intervals.precision)} R ${f(s.recall)} ${interval(s.intervals.recall)} FL ${f(s.falseLinks)} ${interval(s.intervals.falseLinks)} | within P ${f(w.precision)} R ${f(w.recall)} across P ${f(a.precision)} R ${f(a.recall)} | mixed ${mixedFalse}/${mixed.length} ns-within ${nsWithin.filter((item) => yes(item.pair)).length}/${nsWithin.length}`
    );
    if (reference && method.name !== reference) {
      const paired = scoreLib.pairedRates(
        scenario,
        yes,
        (pair) => decided.get(reference).get(pair.key),
        options
      );
      row.paired = paired;
      console.log(
        `    minus ${reference}: P ${f(paired.precision.delta)} ${interval(paired.precision.interval)} R ${f(paired.recall.delta)} ${interval(paired.recall.interval)} FL ${f(paired.falseLinks.delta)} ${interval(paired.falseLinks.interval)} BA ${f(paired.balance.delta)} ${interval(paired.balance.interval)}`
      );
    }
    rows.push(row);
  }
  return rows;
}

/** The headings of a summary's `## Threads`, as they stand, at most `limit`. */
function threadHeads(summary, limit = 5) {
  const section = /##\s*Threads\s*\n([\s\S]*?)(?:\n##\s|$)/i.exec(summary)?.[1] ?? "";
  const heads = [];
  for (const line of section.split("\n")) {
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)?.[1];
    if (!bullet) continue;
    const bold = /^\*\*(.+?)\*\*/.exec(bullet)?.[1];
    const head = (bold ?? bullet.split(/[.:]/)[0]).replace(/[:.\s]+$/, "").trim();
    if (head) heads.push(head.slice(0, 90));
    if (heads.length >= limit) break;
  }
  return heads;
}

/**
 * The questions a meeting asked, as the app's cards quote them
 * (`extractQuestionSentence`): the ones with the most content words, at most
 * `limit`, in the order asked.
 */
function questionsAsked(meeting, aide, tracker, limit = 5) {
  const seen = new Set();
  const found = [];
  meeting.conversation.utterances.forEach((utterance, index) => {
    if (!aide.isQuestionCandidate(utterance.text)) return;
    const sentence = aide.extractQuestionSentence(utterance.text);
    const count = tracker.contentWords(sentence).length;
    const key = sentence.toLowerCase();
    if (count < 4 || seen.has(key) || sentence.length > 140) return;
    seen.add(key);
    found.push({ sentence, count, index });
  });
  return found
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** What a conversation is sent as, for each wording of the request. */
const SENT = {
  app: "a short gist and the names of its topics",
  threads: "the gist, the threads it followed and the names of its topics",
  questions: "the gist, questions asked in it and the names of its topics",
  both: "the gist, the threads it followed, questions asked in it and the names of its topics",
  long: "the opening of its summary and the names of its topics",
};

/**
 * The linker with more of each conversation than the app sends: never a
 * transcript, only what the summary holds and the questions it asked. On round
 * 1's calls, so it pairs with the runs of round 1. `--calls` picks the new
 * conversations: tuning meetings, test meetings or all.
 */
async function linker() {
  const spec = args.model;
  const variant = args.variant;
  if (!spec || !SENT[variant]) throw new Error("--model and --variant threads|questions|both|long");
  const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
  const fast = await load("scripts/lib/fast-models.mjs");
  const { ledgerTotal } = fast;
  const onDevice = spec.startsWith("local:") || spec.startsWith("fm:");
  if (onDevice) args.concurrency = "1";
  // Apple's system model through track Y's bridge; a server of the app's own
  // llama.cpp for a GGUF. Run either under the GPU lock.
  const bridge = spec.startsWith("fm:") ? fmBridge() : null;
  if (spec.startsWith("local:")) {
    await fast.startLocalServer(fast.parseSpec(spec).model, {
      binary: args["llama-server"],
      model: args["local-model"],
      port: 18473,
      contextSize: 8192,
    });
  }
  const ask = bridge ? (_, request) => bridge.ask(request) : fast.ask;
  const remote = await load("src/helpers/remoteLinks.mjs");
  const links = await load("src/helpers/conversationLinks.mjs");
  const aide = await load("src/helpers/conversationAide.mjs");
  const tracker = await load("src/helpers/conversationTopics.mjs");
  const { summaryExcerpt } = await load("src/helpers/conversationGroupSort.mjs");
  const meetings = new Map(loadMeetings().map((meeting) => [meeting.id, meeting]));
  const described = (id) => {
    const meeting = meetings.get(id);
    const snapshot = {
      nodes: meeting.nodes.map((node) => ({
        ...node,
        label: meeting.names[node.id]?.name ?? node.label,
      })),
    };
    const chars = variant === "long" ? 900 : remote.GIST_CHARS;
    return {
      gist: summaryExcerpt(meeting.summary, chars),
      topics: remote.linkTopicNames(snapshot, { minTopicMs: links.MIN_LINK_TOPIC_MS }),
      threads: variant === "threads" || variant === "both" ? threadHeads(meeting.summary) : [],
      questions:
        variant === "questions" || variant === "both"
          ? questionsAsked(meeting, aide, tracker)
          : [],
    };
  };
  const block = (title, item) => {
    const lines = [title, `Gist: ${oneLine(item.gist)}`];
    if (item.threads.length) lines.push(`Threads: ${item.threads.map(oneLine).join("; ")}`);
    if (item.questions.length) {
      lines.push(`Questions asked: ${item.questions.map(oneLine).join(" | ")}`);
    }
    const topics = item.topics.length ? item.topics.map(oneLine).join("; ") : "none named";
    lines.push(`Topics: ${topics}`);
    return lines.join("\n");
  };
  const system = remote.LINK_SYSTEM_PROMPT.replace(
    "Each is given only as a short gist and the names of its topics; you never see what was said.",
    `Each is given only as ${SENT[variant]}; you never see what was said.`
  );
  if (system === remote.LINK_SYSTEM_PROMPT && variant !== "app") {
    throw new Error("The app's prompt has changed");
  }
  const base = linkerRun(BASE_RUN);
  const calls = [...base.calls.values()].filter(
    (call) => args.calls === "all" || splitOfMeeting(call.id) === args.calls
  );
  const seededOrder = (id) => {
    let state = [...id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0 || 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  };
  const slug = `${spec.replace(/[^a-zA-Z0-9.-]+/g, "_")}~${variant}`;
  const dir = path.join(CACHE, "linker", slug);
  fs.mkdirSync(dir, { recursive: true });
  let next = 0;
  let failed = 0;
  const work = async () => {
    while (next < calls.length) {
      const call = calls[next];
      next += 1;
      const file = path.join(dir, `${call.id}.json`);
      if (fs.existsSync(file)) continue;
      const random = seededOrder(call.id);
      const order = call.candidates
        .map((id) => ({ id, order: random() }))
        .sort((a, b) => a.order - b.order);
      const keys = new Map();
      const blocks = order.map((item, index) => {
        const key = remote.candidateKey(index);
        keys.set(key, item.id);
        return block(key, described(item.id));
      });
      const text = [
        block("New conversation", described(call.id)),
        "",
        "Earlier conversations",
        "",
        blocks.join("\n\n"),
      ].join("\n");
      const answer = await ask(spec, {
        system,
        user: text,
        schema: remote.LINK_SCHEMA,
        maxTokens: onDevice ? 1500 : 16000,
        timeoutMs: 240_000,
        purpose: `link-eval-2:linker:${variant}`,
      });
      const parsed = answer.ok ? remote.parseLinkAnswer(answer.text, keys) : null;
      if (!parsed) failed += 1;
      fs.writeFileSync(
        file,
        JSON.stringify({
          id: call.id,
          candidates: call.candidates,
          ok: Boolean(parsed),
          links: parsed ?? [],
          text: answer.ok ? answer.text : null,
          error: answer.ok ? null : answer.error,
          usage: answer.usage,
          cost: answer.cost,
          ms: answer.ms,
        })
      );
    }
  };
  try {
    await Promise.all(Array.from({ length: Number(args.concurrency) }, work));
  } finally {
    fast.stopLocalServers();
    bridge?.close();
  }
  console.log(
    `${slug}: ${calls.length} calls, ${failed} unreadable, $${ledgerTotal().toFixed(3)} in the ledger`
  );
}

/** `fm-bridge serve`: one JSON line in, one out, on this computer. The linker's schema, in its subset. */
function fmBridge() {
  const child = spawn(FM_BRIDGE, ["serve"], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  lines.on("line", (line) => waiting.shift()?.(line));
  const schemaOf = (schema) => {
    const items = schema.schema.properties.links.items;
    return {
      type: "object",
      order: ["links"],
      required: ["links"],
      properties: {
        links: {
          type: "array",
          maxItems: MAX_LINKS,
          items: {
            type: "object",
            order: Object.keys(items.properties),
            required: items.required,
            properties: items.properties,
          },
        },
      },
    };
  };
  let serial = 0;
  return {
    ask: ({ system, user, schema, maxTokens }) =>
      new Promise((resolve) => {
        serial += 1;
        const started = performance.now();
        waiting.push((line) => {
          const reply = JSON.parse(line);
          const ms = reply.ms ?? performance.now() - started;
          resolve(
            reply.ok
              ? { ok: true, text: reply.text, ms, cost: 0, usage: { input: reply.inputTokens } }
              : { ok: false, error: `${reply.error}: ${reply.detail ?? ""}`, ms, cost: 0 }
          );
        });
        child.stdin.write(
          `${JSON.stringify({
            id: String(serial),
            system,
            prompt: user,
            temperature: 0,
            maxTokens,
            greedy: true,
            schema: schemaOf(schema),
          })}\n`
        );
      }),
    close: () => child.stdin.end(),
  };
}

/** Linker runs against Claude Opus 5.5 at medium, on one side of the split. */
async function cloud() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const corpus = await loadCorpus();
  const names = args.runs.split(",");
  const methods = names.map((name) => {
    const run = linkerRun(name);
    return { name, decide: runDecides(run) };
  });
  const rows = sampleTable(corpus, scoreLib, methods, args.split, names[0]);
  fs.writeFileSync(
    path.join(CACHE, "results", `cloud-${args.split}.json`),
    JSON.stringify(rows.map(({ name, scenario, paired, mixedFalse }) => ({ name, scenario, paired, mixedFalse })))
  );
}

const COMMANDS = { texts, screen, explore, cloud, linker, hybrid, "rerank-texts": rerankTexts };

if (!COMMANDS[command]) {
  console.error(`Usage: node scripts/link-eval-2.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
await COMMANDS[command]();
