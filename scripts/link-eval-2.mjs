#!/usr/bin/env node
// Round 2 of the link benchmark (docs/link-eval.md, "Round 2"). Reads what
// `scripts/link-eval.mjs` cached (snapshots, names, gists) and adds to it.
//
//   node scripts/link-eval-2.mjs texts --out texts.json     every text to embed
//
// Nothing of Oats' users is read or sent. The bar and the split were written
// before these runs; `--split tune` reads tuning pairs only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { fmBridge } from "./lib/fm-bridge.mjs";
import { bothInTest, splitOfMeeting, splitOfPair } from "./lib/link-split.mjs";
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
    orders: { type: "string", default: "12" },
    methods: { type: "string" },
    "links-module": { type: "string" },
    judges: { type: "string", default: "anthropic:claude-sonnet-5-5+openai:gpt-6.1-sol@low" },
  },
});

const command = positionals[0];
const DIR = annotationsDir(args.ami);
const CACHE = args.cache;
const NAMES = topicNames(DIR);
const NAMING_MODEL = "openai_gpt-5.6-luna_none";
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
  // While tuning, the board holds tuning meetings only: test meetings take no part.
  const kept = corpus.meetings.filter(
    (meeting) => args.split !== "tune" || splitOfMeeting(meeting.id) === "tune"
  );
  return kept.map((meeting) => ({
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
  const grid = Array.from({ length: 160 }, (_, index) => Math.round((0.2 + index * 0.005) * 1000) / 1000);
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
      const thresholds = Array.from({ length: 12 }, (_, index) =>
        Math.round((points.best.threshold - 0.02 + index * 0.01) * 1000) / 1000
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

/**
 * The board's history in `count` other orders: the series shuffled, each series'
 * meetings still in a row and in order. The board is greedy, so what it links
 * depends on what came first, and one order is one draw. Seeded.
 */
function historyOrders(board, truth, count) {
  const series = [...new Set(board.map((item) => truth.seriesOf(item.id)))];
  return Array.from({ length: count }, (_, index) => {
    let state = (20261105 + index * 7919) >>> 0;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const shuffled = series
      .map((name) => ({ name, key: random() }))
      .sort((a, b) => a.key - b.key)
      .map((item) => item.name);
    const rank = new Map(shuffled.map((name, position) => [name, position]));
    const sorted = [...board].sort(
      (a, b) =>
        rank.get(truth.seriesOf(a.id)) - rank.get(truth.seriesOf(b.id)) ||
        a.id.localeCompare(b.id)
    );
    return sorted.map((item, position) => ({ ...item, createdAt: T0 + position * DAY_MS }));
  });
}

/** How often each pair is linked, over the orders of the history: `a|b` to a share. */
function linkShares(orders, draw) {
  const counts = new Map();
  for (const board of orders) {
    for (const key of draw(board).keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) counts.set(key, count / orders.length);
  return counts;
}

function softRow(pairsBy, shares, threshold, scoreLib) {
  const yes = (pair) => shares.get(pair.key) ?? 0;
  const r = ratesOf(pairsBy.scenario, yes, scoreLib);
  const mixed = pairsBy.mixed.reduce((sum, pair) => sum + yes(pair), 0);
  const within = pairsBy.within.reduce((sum, pair) => sum + yes(pair), 0);
  return {
    threshold,
    precision: r.precision,
    recall: r.recall,
    falseLinks: r.falseLinks,
    mixed: Math.round(mixed * 10) / 10,
    nsWithin: Math.round(within * 10) / 10,
  };
}

/**
 * Average-linkage clustering of topic vectors: the subjects do not depend on
 * the order of the history. One pass gives every threshold: the merges are
 * kept with their score, and a threshold keeps those at or above it.
 */
function dendrogram(vectors) {
  const n = vectors.length;
  const similarity = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const value = dot(vectors[i], vectors[j]);
      similarity[i][j] = value;
      similarity[j][i] = value;
    }
  }
  const size = new Array(n).fill(1);
  const alive = new Set(Array.from({ length: n }, (_, index) => index));
  const merges = [];
  while (alive.size > 1) {
    let best = -Infinity;
    let a = -1;
    let b = -1;
    const list = [...alive];
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const value = similarity[list[x]][list[y]];
        if (value > best) {
          best = value;
          a = list[x];
          b = list[y];
        }
      }
    }
    if (best < 0.3) break;
    merges.push({ a, b, score: best });
    alive.delete(b);
    for (const other of alive) {
      if (other === a) continue;
      const value =
        (similarity[a][other] * size[a] + similarity[b][other] * size[b]) / (size[a] + size[b]);
      similarity[a][other] = value;
      similarity[other][a] = value;
    }
    size[a] += size[b];
  }
  return merges;
}

/** The subjects of a dendrogram cut at a threshold, as pairs of conversations linked. */
function cutDendrogram(merges, count, threshold, owners) {
  const parent = Array.from({ length: count }, (_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (const { a, b, score } of merges) if (score >= threshold) parent[find(b)] = find(a);
  const groups = new Map();
  for (let index = 0; index < count; index += 1) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(owners[index]);
  }
  return coMembers([...groups.values()].map((ids) => ({ conversationIds: [...ids], label: "" })));
}

/**
 * The board's expected behaviour on one side of the split, over `--orders`
 * orders of the history, for the app's greedy subjects and for order-free
 * clustering.
 */
async function curve() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const corpus = await loadCorpus();
  const split = args.split;
  const pairsBy = {
    scenario: inSplit(corpus.pairs, split, "scenario"),
    mixed: inSplit(corpus.pairs, split, "mixed"),
    within: inSplit(corpus.pairs, split, "non-scenario-within"),
  };
  const f = (value) => (value == null ? " -  " : value.toFixed(3));
  const show = (row) =>
    console.log(
      `  t ${row.threshold.toFixed(3)} P ${f(row.precision)} R ${f(row.recall)} FL ${f(row.falseLinks)} mixed ${row.mixed} ns-within ${row.nsWithin}`
    );
  for (const spec of args.configs.split(",")) {
    const [config, dims, from, to, step] = spec.split(":");
    const store = readStore(path.join(CACHE, "embed"), config, {
      dims: dims ? Number(dims) : undefined,
    });
    const topics = topicVectors(corpus, store);
    const grid = [];
    for (let value = Number(from); value <= Number(to) + 1e-9; value += Number(step)) {
      grid.push(Math.round(value * 1000) / 1000);
    }
    const board = boardOf(corpus, topics, "device");
    const orders = historyOrders(board, corpus.truth, Number(args.orders));
    const vectorOf = (text) => store.get(text);
    console.log(`${spec}: the app's greedy subjects over ${orders.length} orders`);
    for (const threshold of grid) {
      const shares = linkShares(orders, (item) =>
        coMembers(
          corpus.links.meaningThreads(item, { vectorOf, contentThreshold: threshold }).subjects
        )
      );
      show(softRow(pairsBy, shares, threshold, scoreLib));
    }
    const kept = new Set(board.map((item) => item.id));
    const flat = [...topics]
      .filter(([id]) => kept.has(id))
      .flatMap(([id, list]) =>
        list.filter((topic) => topic.content).map((topic) => ({ id, vector: topic.content }))
      );
    const merges = dendrogram(flat.map((item) => item.vector));
    console.log(`${spec}: average linkage, no order (${flat.length} topics)`);
    for (const threshold of grid) {
      const linked = cutDendrogram(
        merges,
        flat.length,
        threshold,
        flat.map((item) => item.id)
      );
      show(softRow(pairsBy, new Map([...linked.keys()].map((key) => [key, 1])), threshold, scoreLib));
    }
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
  const ask = bridge
    ? (_, request) => bridge.ask({ ...request, schema: bridgeSchema(request.schema) })
    : fast.ask;
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

/** The linker's schema in the bridge's subset of JSON Schema. */
function bridgeSchema(schema) {
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

// ---------------------------------------------------------------------------
// The test read: one pass over named methods, each over the same orders of the
// history, against main.

/**
 * A board method's shares. `spec` is `greedy:<config[:dims]>:<threshold>`,
 * `linkage:<config[:dims]>:<threshold>`, or `stored:<threshold>`: the vectors
 * the record holds, as the app reads them.
 */
async function boardShares(corpus, spec, orderCount) {
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const parts = spec.split(":");
  const kind = parts[0];
  const threshold = Number(parts.at(-1));
  if (kind === "stored") {
    const store = readStore(path.join(CACHE, "embed"), "minilm");
    const board = corpus.meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.id,
      createdAt: meeting.createdAt,
      snapshot: { nodes: meeting.nodes },
    }));
    const orders = historyOrders(board, corpus.truth, orderCount);
    return linkShares(orders, (item) =>
      coMembers(
        corpus.links.meaningThreads(item, {
          vectorOf: (text) => store.get(text),
          contentThreshold: threshold,
        }).subjects
      )
    );
  }
  const config = parts[1];
  const dims = parts.length === 4 ? Number(parts[2]) : undefined;
  const store = readStore(path.join(CACHE, "embed"), config, { dims });
  const topics = topicVectors(corpus, store);
  if (kind === "greedy") {
    const board = boardOf(corpus, topics, "device");
    const orders = historyOrders(board, corpus.truth, orderCount);
    return linkShares(orders, (item) =>
      coMembers(
        corpus.links.meaningThreads(item, {
          vectorOf: (text) => store.get(text),
          contentThreshold: threshold,
        }).subjects
      )
    );
  }
  const flat = [...topics].flatMap(([id, list]) =>
    list.filter((topic) => topic.content).map((topic) => ({ id, vector: topic.content }))
  );
  const merges = dendrogram(flat.map((item) => item.vector));
  const linked = cutDendrogram(
    merges,
    flat.length,
    threshold,
    flat.map((item) => item.id)
  );
  return new Map([...linked.keys()].map((key) => [key, 1]));
}

/** Every named board method on the test pairs, each paired with the first. */
async function finalBoards() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const corpus = await loadCorpus();
  const { truth } = corpus;
  const specs = args.methods.split("+");
  const orderCount = Number(args.orders);
  const split = args.split;
  const scenario = inSplit(corpus.pairs, split, "scenario");
  const mixed = inSplit(corpus.pairs, split, "mixed");
  const within = inSplit(corpus.pairs, split, "non-scenario-within");
  const strict = scenario.filter(bothInTest);
  const options = { seriesOf: truth.seriesOf, groupOf: truth.groupOf };
  const f = (value) => (value == null ? "  -  " : value.toFixed(3));
  const iv = (value) => (value ? `[${value[0].toFixed(3)}, ${value[1].toFixed(3)}]` : "");
  const out = [];
  const shares = new Map();
  console.log(`${split}: ${scenario.length} scenario pairs, ${strict.length} with both in test series`);
  for (const spec of specs) {
    const linked = await boardShares(corpus, spec, orderCount);
    shares.set(spec, linked);
    const yes = (pair) => linked.get(pair.key) ?? 0;
    const s = scoreLib.scoreWithIntervals(scenario, yes, options);
    const w = ratesOf(scenario.filter((pair) => pair.category === "scenario-within"), yes, scoreLib);
    const a = ratesOf(scenario.filter((pair) => pair.category === "scenario-across"), yes, scoreLib);
    const b = ratesOf(strict, yes, scoreLib);
    const mixedFalse = mixed.reduce((sum, pair) => sum + yes(pair), 0);
    const nsWithin = within.reduce((sum, pair) => sum + yes(pair), 0);
    console.log(
      `${spec.padEnd(26)} P ${f(s.precision)} ${iv(s.intervals.precision)} R ${f(s.recall)} ${iv(s.intervals.recall)} FL ${f(s.falseLinks)} ${iv(s.intervals.falseLinks)}\n` +
        `${"".padEnd(26)} within P ${f(w.precision)} R ${f(w.recall)} FL ${f(w.falseLinks)}; across P ${f(a.precision)} R ${f(a.recall)} FL ${f(a.falseLinks)}; both in test P ${f(b.precision)} R ${f(b.recall)} FL ${f(b.falseLinks)}; mixed ${mixedFalse.toFixed(1)}/${mixed.length}; ns-within ${nsWithin.toFixed(1)}/${within.length}`
    );
    const row = { spec, scenario: s, within: w, across: a, strict: b, mixedFalse, mixed: mixed.length, nsWithin };
    if (spec !== specs[0]) {
      const reference = shares.get(specs[0]);
      const paired = scoreLib.pairedRates(scenario, yes, (pair) => reference.get(pair.key) ?? 0, options);
      row.paired = paired;
      console.log(
        `${"".padEnd(26)} minus main: P ${f(paired.precision.delta)} ${iv(paired.precision.interval)} R ${f(paired.recall.delta)} ${iv(paired.recall.interval)} FL ${f(paired.falseLinks.delta)} ${iv(paired.falseLinks.interval)} BA ${f(paired.balance.delta)} ${iv(paired.balance.interval)}`
      );
    }
    out.push(row);
  }
  fs.writeFileSync(path.join(CACHE, "results", `final-boards-${split}.json`), JSON.stringify(out));
}

// ---------------------------------------------------------------------------
// The whole path a cloud user gets, which round 1 did not measure: the app
// chooses the candidates (`chooseCandidates`, at most 12, by name vectors), the
// model answers (`buildLinkPrompt`), and the board draws the answer
// (`linkThreads` with checks). In the corpus' order, as if every conversation
// had been summarized by that provider.

async function appPath() {
  const spec = args.model;
  const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
  const { ask, ledgerTotal } = await load("scripts/lib/fast-models.mjs");
  const remote = await load("src/helpers/remoteLinks.mjs");
  const { readStore } = await load("scripts/lib/embed-store.mjs");
  const { summaryExcerpt } = await load("src/helpers/conversationGroupSort.mjs");
  const corpus = await loadCorpus();
  const { links } = corpus;
  const store = readStore(path.join(CACHE, "embed"), "minilm");
  const vectorOf = (text) => store.get(text);
  const board = corpus.meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.id,
    createdAt: meeting.createdAt,
    snapshot: {
      nodes: meeting.nodes.map((node) => ({ ...node, label: nameOf(meeting, node, "model") })),
    },
  }));
  const described = new Map(
    corpus.meetings.map((meeting, index) => [
      meeting.id,
      {
        gist: summaryExcerpt(meeting.summary, remote.GIST_CHARS),
        topics: remote.linkTopicNames(board[index].snapshot, {
          minTopicMs: links.MIN_LINK_TOPIC_MS,
        }),
      },
    ])
  );
  const slug = spec.replace(/[^a-zA-Z0-9.-]+/g, "_");
  const dir = path.join(CACHE, "app-path", slug);
  fs.mkdirSync(dir, { recursive: true });
  let next = 1;
  const work = async () => {
    while (next < board.length) {
      const index = next;
      next += 1;
      const current = board[index];
      const file = path.join(dir, `${current.id}.json`);
      if (fs.existsSync(file)) continue;
      const candidates = remote.chooseCandidates(current, board.slice(0, index), { vectorOf });
      if (!candidates.length) {
        fs.writeFileSync(file, JSON.stringify({ candidates: [], links: [], ok: true }));
        continue;
      }
      const prompt = remote.buildLinkPrompt({
        current: described.get(current.id),
        earlier: candidates.map((id) => ({ id, ...described.get(id) })),
      });
      const answer = await ask(spec, {
        system: prompt.system,
        user: prompt.text,
        schema: remote.LINK_SCHEMA,
        maxTokens: 4000,
        timeoutMs: 90_000,
        purpose: "link-eval-2:app-path",
      });
      const parsed = answer.ok ? remote.parseLinkAnswer(answer.text, prompt.keys) : null;
      fs.writeFileSync(
        file,
        JSON.stringify({ candidates, links: parsed ?? [], ok: Boolean(parsed), cost: answer.cost })
      );
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, work));
  console.log(`${slug}: ${board.length} conversations, $${ledgerTotal().toFixed(3)} in the ledger`);
}

/** What the app path draws, read on one side of the split. No cost: the answers are cached. */
async function appPathScore() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const corpus = await loadCorpus();
  const store = readStore(path.join(CACHE, "embed"), "minilm");
  const vectorOf = (text) => store.get(text);
  const board = corpus.meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.id,
    createdAt: meeting.createdAt,
    snapshot: {
      nodes: meeting.nodes.map((node) => ({ ...node, label: nameOf(meeting, node, "model") })),
    },
  }));
  const split = args.split;
  const scenario = inSplit(corpus.pairs, split, "scenario");
  const mixed = inSplit(corpus.pairs, split, "mixed");
  const within = inSplit(corpus.pairs, split, "non-scenario-within");
  const f = (value) => (value == null ? " -  " : value.toFixed(3));
  for (const name of args.runs.split("+")) {
    const checks = new Map();
    let asked = 0;
    let linkedCount = 0;
    for (const meeting of corpus.meetings) {
      const value = readJson(path.join(CACHE, "app-path", name, `${meeting.id}.json`));
      if (!value) continue;
      asked += value.candidates.length;
      linkedCount += value.links.length;
      if (value.candidates.length) checks.set(meeting.id, value);
    }
    const report = (label, subjects) => {
      const linked = coMembers(subjects);
      const r = ratesOf(scenario, (pair) => linked.has(pair.key), scoreLib);
      const sizes = subjects.map((subject) => subject.conversationIds.length).sort((a, b) => b - a);
      console.log(
        `${name} ${label.padEnd(24)}: asked ${asked}, linked ${linkedCount}; P ${f(r.precision)} R ${f(r.recall)} FL ${f(r.falseLinks)} mixed ${mixed.filter((pair) => linked.has(pair.key)).length}/${mixed.length} ns-within ${within.filter((pair) => linked.has(pair.key)).length}/${within.length}; subjects ${sizes.slice(0, 8).join(" ")} (${subjects.length} in all)`
      );
    };
    report("today", corpus.links.linkThreads(board, { vectorOf, checks }).subjects);
    // Only what the model said: each link is an edge on a subject it named, and
    // subjects are one when their names are alike. No topic carries a link on.
    const { createEmbedder } = await import(
      pathToFileURL(path.join(ROOT, "scripts/lib/minilm.mjs")).href
    );
    const embedder = await createEmbedder({ cacheDir: path.join(CACHE, "vectors"), threads: 2 });
    const pairsOfLinks = [];
    for (const [id, check] of checks) {
      for (const link of check.links) pairsOfLinks.push({ a: id, b: link.id, subject: link.subject });
    }
    const names = [...new Set(pairsOfLinks.map((item) => item.subject))];
    const embedded = await embedder.embed(names);
    const vectors = new Map(names.map((subject, index) => [subject, embedded[index]]));
    // The app's fixed code, from its own worktree (`--links-module`): every
    // conversation summarized by this provider, as the run assumes.
    if (args["links-module"]) {
      const fixed = await import(pathToFileURL(path.resolve(args["links-module"])).href);
      const onRoute = board.map((item) => ({ ...item, summaryRoute: "providers:same" }));
      const both = (text) => vectors.get(text) ?? vectorOf(text);
      for (const subjectThreshold of [0.6, 0.65, 0.7, 0.75, 0.8]) {
        report(
          `the fix, ${subjectThreshold}`,
          fixed.linkThreads(onRoute, { vectorOf: both, checks, subjectThreshold }).subjects
        );
      }
      report(
        "the fix, routes not known",
        fixed.linkThreads(board, { vectorOf: both, checks }).subjects
      );
    }
    for (const threshold of [0.6, 0.7, 0.8, 0.9, 1.01]) {
      const groups = [];
      for (const item of pairsOfLinks) {
        const vector = vectors.get(item.subject);
        let best = null;
        let bestScore = threshold;
        for (const group of groups) {
          const score = dot(group.mean, vector) / (Math.sqrt(dot(group.mean, group.mean)) || 1);
          if (score >= bestScore) {
            best = group;
            bestScore = score;
          }
        }
        if (!best) {
          best = {
            mean: new Float64Array(vector.length),
            ids: new Set(),
            label: item.subject,
          };
          groups.push(best);
        }
        for (let k = 0; k < vector.length; k += 1) best.mean[k] += vector[k];
        best.ids.add(item.a);
        best.ids.add(item.b);
      }
      report(
        `by subject name, ${threshold}`,
        groups.map((group) => ({ label: group.label, conversationIds: [...group.ids] }))
      );
    }
  }
}

/** The test read of the app's path: today's board against the fix, with paired intervals. */
async function appPathFinal() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { readStore } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/embed-store.mjs")).href
  );
  const { createEmbedder } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/minilm.mjs")).href
  );
  const fixed = await import(pathToFileURL(path.resolve(args["links-module"])).href);
  const corpus = await loadCorpus();
  const store = readStore(path.join(CACHE, "embed"), "minilm");
  const board = corpus.meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.id,
    createdAt: meeting.createdAt,
    summaryRoute: "providers:same",
    snapshot: {
      nodes: meeting.nodes.map((node) => ({ ...node, label: nameOf(meeting, node, "model") })),
    },
  }));
  const split = args.split;
  const scenario = inSplit(corpus.pairs, split, "scenario");
  const mixed = inSplit(corpus.pairs, split, "mixed");
  const within = inSplit(corpus.pairs, split, "non-scenario-within");
  const options = { seriesOf: corpus.truth.seriesOf, groupOf: corpus.truth.groupOf };
  const embedder = await createEmbedder({ cacheDir: path.join(CACHE, "vectors"), threads: 2 });
  const f = (value) => (value == null ? "  -  " : value.toFixed(3));
  const iv = (value) => (value ? `[${value[0].toFixed(3)}, ${value[1].toFixed(3)}]` : "");
  const out = [];
  for (const name of args.runs.split("+")) {
    const checks = new Map();
    for (const meeting of corpus.meetings) {
      const value = readJson(path.join(CACHE, "app-path", name, `${meeting.id}.json`));
      if (value?.candidates.length) checks.set(meeting.id, value);
    }
    const subjects = [
      ...new Set([...checks.values()].flatMap((check) => check.links.map((link) => link.subject))),
    ];
    const embedded = await embedder.embed(subjects);
    const vectors = new Map(subjects.map((text, index) => [text, embedded[index]]));
    const vectorOf = (text) => vectors.get(text) ?? store.get(text);
    const drawnToday = corpus.links.linkThreads(board, { vectorOf: store.get, checks }).subjects;
    const drawnFix = fixed.linkThreads(board, { vectorOf, checks }).subjects;
    const today = coMembers(drawnToday);
    const fix = coMembers(drawnFix);
    const line = (label, linked, drawn) => {
      const yes = (pair) => linked.has(pair.key);
      const s = scoreLib.scoreWithIntervals(scenario, yes, options);
      const top = Math.max(0, ...drawn.map((subject) => subject.conversationIds.length));
      console.log(
        `${name} ${label.padEnd(6)} P ${f(s.precision)} ${iv(s.intervals.precision)} R ${f(s.recall)} ${iv(s.intervals.recall)} FL ${f(s.falseLinks)} ${iv(s.intervals.falseLinks)} mixed ${mixed.filter(yes).length}/${mixed.length} ns-within ${within.filter(yes).length}/${within.length} largest subject ${top} of ${board.length}, ${drawn.length} subjects`
      );
      return s;
    };
    const a = line("today", today, drawnToday);
    const b = line("fix", fix, drawnFix);
    const paired = scoreLib.pairedRates(
      scenario,
      (pair) => fix.has(pair.key),
      (pair) => today.has(pair.key),
      options
    );
    console.log(
      `  fix minus today: P ${f(paired.precision.delta)} ${iv(paired.precision.interval)} R ${f(paired.recall.delta)} ${iv(paired.recall.interval)} FL ${f(paired.falseLinks.delta)} ${iv(paired.falseLinks.interval)} BA ${f(paired.balance.delta)} ${iv(paired.balance.interval)}`
    );
    out.push({ name, today: a, fix: b, paired });
  }
  fs.writeFileSync(path.join(CACHE, "results", `app-path-${split}.json`), JSON.stringify(out));
}

// ---------------------------------------------------------------------------
// What recognition costs. The eight meetings a recognizer heard replace their
// manual selves on the board, and every pair that touches one is scored with
// the same pair on manual text. Eight meetings alone make 28 pairs, so each is
// also paired with the other 131, which stay manual: one side as the app would
// hear it. Written by `link-eval.mjs snapshots|names|gists --replay`.

/** Meetings as a recognizer left them: snapshot, names and summary, from `--cache`. */
function recognizedMeetings(replay) {
  const dir = path.join(CACHE, "recognition", replay);
  const out = new Map();
  for (const file of fs.readdirSync(path.join(dir, "snapshots"))) {
    const id = file.replace(/\.json$/, "");
    out.set(id, {
      nodes: readJson(path.join(dir, "snapshots", file)).snapshot.nodes,
      names: readJson(path.join(dir, "names", NAMING_MODEL, file), {}),
      summary: readJson(path.join(dir, "gists", NAMING_MODEL, file))?.summary ?? "",
    });
  }
  return out;
}

async function recognitionBoards() {
  const scoreLib = await import(pathToFileURL(path.join(ROOT, "scripts/lib/link-score.mjs")).href);
  const { createEmbedder } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/minilm.mjs")).href
  );
  const corpus = await loadCorpus();
  const embedder = await createEmbedder({ cacheDir: path.join(CACHE, "vectors"), threads: 2 });
  const threshold = Number(args.center);
  const boardWith = (replaced) =>
    corpus.meetings.map((meeting) => {
      const source = replaced?.get(meeting.id) ?? meeting;
      return {
        id: meeting.id,
        title: meeting.id,
        createdAt: meeting.createdAt,
        snapshot: {
          nodes: source.nodes.map((node) => ({
            ...node,
            label: String(source.names?.[node.id]?.name ?? node.label).trim(),
          })),
        },
      };
    });
  const drawOver = async (board) => {
    const texts = [...new Set(board.flatMap((item) => item.snapshot.nodes.map((node) => node.label)))];
    const embedded = await embedder.embed(texts);
    const vectors = new Map(texts.map((text, index) => [text, embedded[index]]));
    return linkShares(historyOrders(board, corpus.truth, Number(args.orders)), (item) =>
      coMembers(
        corpus.links.meaningThreads(item, {
          vectorOf: (text) => vectors.get(text) ?? null,
          contentThreshold: threshold,
        }).subjects
      )
    );
  };
  const manualShares = await drawOver(boardWith(null));
  const heard = new Set(recognizedMeetings(args.runs.split("+")[0]).keys());
  const touching = corpus.pairs.filter((pair) => heard.has(pair.a) || heard.has(pair.b));
  const scenario = touching.filter((pair) => pair.category.startsWith("scenario"));
  const mixed = touching.filter((pair) => pair.category === "mixed");
  const options = { seriesOf: corpus.truth.seriesOf, groupOf: corpus.truth.groupOf };
  const f = (value) => (value == null ? "  -  " : value.toFixed(3));
  const iv = (value) => (value ? `[${value[0].toFixed(3)}, ${value[1].toFixed(3)}]` : "");
  const line = (label, shares) => {
    const yes = (pair) => shares.get(pair.key) ?? 0;
    const s = scoreLib.scoreWithIntervals(scenario, yes, options);
    console.log(
      `${label.padEnd(30)} P ${f(s.precision)} ${iv(s.intervals.precision)} R ${f(s.recall)} ${iv(s.intervals.recall)} FL ${f(s.falseLinks)} ${iv(s.intervals.falseLinks)} mixed ${mixed.reduce((sum, pair) => sum + yes(pair), 0).toFixed(1)}/${mixed.length}`
    );
    return yes;
  };
  console.log(`${scenario.length} scenario pairs touch the ${heard.size} meetings`);
  const manual = line("manual text", manualShares);
  for (const replay of args.runs.split("+")) {
    const shares = await drawOver(boardWith(recognizedMeetings(replay)));
    const yes = line(replay, shares);
    const paired = scoreLib.pairedRates(scenario, yes, manual, options);
    console.log(
      `  minus manual: P ${f(paired.precision.delta)} ${iv(paired.precision.interval)} R ${f(paired.recall.delta)} ${iv(paired.recall.interval)} FL ${f(paired.falseLinks.delta)} ${iv(paired.falseLinks.interval)} BA ${f(paired.balance.delta)} ${iv(paired.balance.interval)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Typed relations: can a model say how two linked conversations relate? Two
// judges read the transcript of the two topics and pick a type, each blind to
// the other. If they do not agree, the types do not hold on this corpus, and
// no model can be scored against them. A model that reads what the cloud check
// reads (names and gists) is then scored against both.

const RELATION_TYPES = ["continues", "depends_on", "conflicts", "same_open_question", "other"];

const RELATION_RULES = [
  "- continues: the later one picks up the same subject and moves it on.",
  "- depends_on: what the later one does or decides on this subject rests on an answer or decision in the earlier one.",
  "- conflicts: the later one contradicts or reverses what the earlier one held on this subject.",
  "- same_open_question: the same question is open in both, and neither settles it.",
  "- other: none of these, or the two only touch the same words.",
].join("\n");

const RELATION_SCHEMA = {
  name: "relation",
  schema: {
    type: "object",
    properties: { type: { type: "string", enum: RELATION_TYPES } },
    required: ["type"],
    additionalProperties: false,
  },
};

const RELATION_JUDGE = [
  "You read lines from two meetings of one team, the earlier first. They were linked because both are on one subject. The lines come from a transcript of speech: expect filler and half sentences.",
  "",
  "Say how the later meeting relates to the earlier one on that subject. Pick one:",
  RELATION_RULES,
  "",
  'Reply with JSON only: {"type":"continues"}',
].join("\n");

const RELATION_MODEL = [
  "You get two conversations of one team, the earlier first. Each is given only as a short gist and the names of its topics; you never see what was said. They were linked because both are on one subject.",
  "",
  "Say how the later conversation relates to the earlier one on that subject. Pick one:",
  RELATION_RULES,
  "",
  'Reply with JSON only: {"type":"continues"}',
].join("\n");

/** Cohen's kappa between two lists of labels. */
function kappa(a, b) {
  const labels = [...new Set([...a, ...b])];
  const n = a.length;
  let same = 0;
  for (let index = 0; index < n; index += 1) if (a[index] === b[index]) same += 1;
  const share = (list, label) => list.filter((value) => value === label).length / n;
  const chance = labels.reduce((sum, label) => sum + share(a, label) * share(b, label), 0);
  return { agreement: same / n, kappa: chance < 1 ? (same / n - chance) / (1 - chance) : 0, n };
}

/** Within-series links of Claude Opus 5.5 on tuning meetings, judged and typed. */
async function relations() {
  const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
  const { ask, ledgerTotal } = await load("scripts/lib/fast-models.mjs");
  const remote = await load("src/helpers/remoteLinks.mjs");
  const links = await load("src/helpers/conversationLinks.mjs");
  const { topicExcerpt } = await load("src/helpers/topicNaming.mjs");
  const { summaryExcerpt } = await load("src/helpers/conversationGroupSort.mjs");
  const { seriesOf } = await load("scripts/lib/link-truth.mjs");
  const meetings = new Map(loadMeetings().map((meeting) => [meeting.id, meeting]));
  const base = linkerRun(BASE_RUN);
  const items = [];
  for (const call of base.calls.values()) {
    if (args.split !== "all" && splitOfMeeting(call.id) !== args.split) continue;
    for (const link of call.links) {
      if (seriesOf(link.id) !== seriesOf(call.id)) continue;
      if (args.split !== "all" && splitOfMeeting(link.id) !== args.split) continue;
      items.push({ later: call.id, earlier: link.id, ...link });
    }
  }
  const named = (meeting, node) => String(meeting.names[node.id]?.name ?? node.label).trim();
  const topicLines = (id, name) => {
    const meeting = meetings.get(id);
    const wanted = String(name).trim().toLowerCase();
    const nodes = meeting.nodes.filter((node) => links.isLinkableTopic(node));
    const node =
      nodes.find((other) => named(meeting, other).toLowerCase() === wanted) ??
      nodes.find((other) => {
        const label = named(meeting, other).toLowerCase();
        return label.includes(wanted) || wanted.includes(label);
      }) ??
      nodes[0];
    return topicExcerpt(
      node.utteranceIds.map((utterance) => meeting.turns.get(String(utterance)) ?? ""),
      { budget: 1600 }
    )
      .map((line) => `- ${line}`)
      .join("\n");
  };
  const describe = (id) => {
    const meeting = meetings.get(id);
    const snapshot = {
      nodes: meeting.nodes.map((node) => ({ ...node, label: named(meeting, node) })),
    };
    const topics = remote.linkTopicNames(snapshot, { minTopicMs: links.MIN_LINK_TOPIC_MS });
    return `Gist: ${oneLine(summaryExcerpt(meeting.summary, 300))}\nTopics: ${topics.join("; ")}`;
  };
  const dir = path.join(CACHE, "relations");
  fs.mkdirSync(dir, { recursive: true });
  const typeBy = async (spec, kind) => {
    const out = new Array(items.length).fill(null);
    let next = 0;
    const slug = spec.replace(/[^a-zA-Z0-9.-]+/g, "_");
    const work = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        const file = path.join(dir, `${slug}~${kind}~${item.later}~${item.earlier}.json`);
        const stored = readJson(file);
        if (stored) {
          out[index] = stored.type;
          continue;
        }
        const user =
          kind === "judge"
            ? `Subject: ${item.subject}\n\nEARLIER MEETING\n${topicLines(item.earlier, item.earlierTopic)}\n\nLATER MEETING\n${topicLines(item.later, item.topic)}`
            : `Subject: ${item.subject}\n\nEarlier conversation\n${describe(item.earlier)}\n\nLater conversation\n${describe(item.later)}`;
        const answer = await ask(spec, {
          system: kind === "judge" ? RELATION_JUDGE : RELATION_MODEL,
          user,
          schema: RELATION_SCHEMA,
          maxTokens: 600,
          timeoutMs: 120_000,
          parseJson: true,
          purpose: `link-eval-2:relations:${kind}`,
        });
        out[index] = RELATION_TYPES.includes(answer.json?.type) ? answer.json.type : "other";
        fs.writeFileSync(file, JSON.stringify({ type: out[index] }));
      }
    };
    await Promise.all(Array.from({ length: 6 }, work));
    return out;
  };
  const judges = args.judges.split("+");
  const first = await typeBy(judges[0], "judge");
  const second = await typeBy(judges[1], "judge");
  const models = await Promise.all(args.runs.split("+").map((spec) => typeBy(spec, "model")));
  const spread = (list) => {
    const counts = {};
    for (const value of list) counts[value] = (counts[value] ?? 0) + 1;
    return JSON.stringify(counts);
  };
  const f = ({ agreement, kappa: k, n }) => `agreement ${agreement.toFixed(2)} kappa ${k.toFixed(2)} (n ${n})`;
  console.log(`${items.length} within-series links on ${args.split}; $${ledgerTotal().toFixed(3)} in the ledger`);
  console.log(`judge 1 ${spread(first)}\njudge 2 ${spread(second)}`);
  console.log(`judge 1 against judge 2: ${f(kappa(first, second))}`);
  args.runs.split("+").forEach((spec, index) => {
    console.log(`${spec} ${spread(models[index])}`);
    console.log(`  against judge 1: ${f(kappa(models[index], first))}; judge 2: ${f(kappa(models[index], second))}`);
  });
}

const COMMANDS = {
  texts,
  screen,
  explore,
  curve,
  cloud,
  linker,
  hybrid,
  relations,
  "final-boards": finalBoards,
  "app-path": appPath,
  "app-path-score": appPathScore,
  "app-path-final": appPathFinal,
  "recognition-boards": recognitionBoards,
  "rerank-texts": rerankTexts,
};

if (!COMMANDS[command]) {
  console.error(`Usage: node scripts/link-eval-2.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
await COMMANDS[command]();
