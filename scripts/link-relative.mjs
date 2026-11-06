#!/usr/bin/env node
// Links scored relative to a history (docs/link-eval.md, round 2).
//
// An absolute cosine cannot work when a whole history shares one subject: with
// every meeting recognized, the board at 0.78 links nearly everything. This
// tries scoring a pair against the history it sits in, with no new model and no
// network, on histories sampled at a given size:
//
//   node scripts/link-relative.mjs icsi                  tracker topics for ICSI
//   node scripts/link-relative.mjs sweep --pool tune-one --size 20
//   node scripts/link-relative.mjs read --pool test-one --size 20 --methods "a+b"
//
// `--app-module <file>` reads the app's rule from another worktree, for the method
// `app:<t>`: its board as a person sees it, a pair linked when one chip holds both;
// `app-edges:<t>` counts only the edges it draws. `greedy-chips:<t>` is this
// worktree's rule read the same way as `app:<t>`.
//
// Pools: `one` is a history of AMI scenario meetings, one product throughout, the
// worst case. `mixed` is AMI series, the non-scenario meetings and ICSI meetings
// together. `heard-*` is AMI as Apple Speech heard it. tune and test keep the
// split of `lib/link-split.mjs`; ICSI groups Bed and Bns tune, Bmr and Bro test.
//
// ICSI (CC BY 4.0) is read through track T's export. It is not approved for any
// key: nothing here sends a text anywhere.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { amiMeetingIds, annotationsDir, topicNames } from "./lib/topic-corpus.mjs";
import { splitOfMeeting } from "./lib/link-split.mjs";
import { groupOf, meetingSubjects, seriesOf, truthPairs } from "./lib/link-truth.mjs";
import {
  decodeTopicVector,
  encodeTopicVector,
  isLinkableTopic,
  meaningThreads,
} from "../src/helpers/conversationLinks.mjs";
import { ConversationTopicTracker } from "../src/helpers/conversationTopics.mjs";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ami: { type: "string", default: path.join(os.homedir(), "oats-asr-cache", "AMI") },
    cache: { type: "string", default: path.join(os.homedir(), ".cache", "oats", "link-eval") },
    icsi: {
      type: "string",
      default: path.join(os.homedir(), "oats-asr-cache", "fidelity-2", "topics", "data-icsi"),
    },
    pool: { type: "string", default: "tune-one" },
    size: { type: "string", default: "20" },
    histories: { type: "string", default: "24" },
    methods: { type: "string" },
    spread: { type: "boolean", default: false },
    "app-module": { type: "string" },
  },
});

const candidate = args["app-module"] ? await import(path.resolve(args["app-module"])) : null;

const CACHE = args.cache;
const DIR = annotationsDir(args.ami);
const NAMES = topicNames(DIR);

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// ICSI as the tracker reads it: topics and one stored vector each.

function icsi() {
  const out = path.join(CACHE, "icsi");
  fs.mkdirSync(out, { recursive: true });
  const ids = fs
    .readdirSync(args.icsi)
    .filter((file) => /^B[a-z]{2}\d+\.json$/.test(file))
    .map((file) => file.replace(".json", ""));
  for (const id of ids) {
    const file = path.join(out, `${id}.json`);
    if (fs.existsSync(file)) continue;
    const { utterances } = readJson(path.join(args.icsi, `${id}.json`));
    const bytes = fs.readFileSync(path.join(args.icsi, `${id}.minilm.f32`));
    const vectors = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const tracker = new ConversationTopicTracker();
    utterances.forEach((utterance, index) => {
      tracker.onUtterance({ id: utterance.id, text: utterance.text, at: Number(utterance.at) });
      tracker.addVectors({
        utterances: [[utterance.id, vectors.slice(index * 384, (index + 1) * 384)]],
      });
    });
    const end = Number(utterances.at(-1).at);
    fs.writeFileSync(
      file,
      JSON.stringify({ id, snapshot: tracker.snapshot(end, { final: true }) })
    );
  }
  console.log(`${ids.length} ICSI meetings`);
}

// ---------------------------------------------------------------------------
// Meetings and what is true of their pairs.

const toTopics = (nodes, names = {}) =>
  nodes
    .filter((node) => isLinkableTopic(node))
    .map((node) => ({
      vector: decodeTopicVector(node.vector),
      label: String(names[node.id]?.name ?? node.label).trim(),
      words: node.words ?? [],
    }))
    .filter((topic) => topic.vector);

function amiMeetings(source) {
  const dir =
    source === "manual" ? CACHE : path.join(CACHE, "recognition", `apple-speech__${source}`);
  return amiMeetingIds(DIR).flatMap((id) => {
    const stored = readJson(path.join(dir, "snapshots", `${id}.json`));
    if (!stored) return [];
    const names = readJson(path.join(dir, "names", "openai_gpt-5.6-luna_none", `${id}.json`), {});
    const topics = toTopics(stored.snapshot.nodes, names);
    return topics.length
      ? [{ id, group: groupOf(id), series: seriesOf(id), split: splitOfMeeting(id), topics }]
      : [];
  });
}

function icsiMeetings() {
  const dir = path.join(CACHE, "icsi");
  return fs.readdirSync(dir).flatMap((file) => {
    const id = file.replace(".json", "");
    const family = id.slice(0, 3);
    const topics = toTopics(readJson(path.join(dir, file)).snapshot.nodes);
    if (!topics.length) return [];
    return [
      {
        id,
        group: "icsi",
        series: family,
        split: ["Bed", "Bns"].includes(family) ? "tune" : "test",
        topics,
      },
    ];
  });
}

/** Gold of two meetings: true, false, or null when the corpus does not say. */
function truthOf() {
  const ids = amiMeetingIds(DIR);
  const byMeeting = new Map(ids.map((id) => [id, meetingSubjects(DIR, id, NAMES)]));
  const linked = new Map(truthPairs(ids, byMeeting, {}).map((pair) => [pair.key, pair.linked]));
  return (a, b) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (linked.has(key)) return linked.get(key);
    // ICSI: two meetings of one research group have no labels for a shared subject.
    if (a.group === "icsi" && b.group === "icsi" && a.series === b.series) return null;
    return false;
  };
}

function poolOf(name) {
  const [split, kind] = name.split("-");
  const inSplit = (item) => split === "all" || item.split === split;
  if (kind === "one") {
    return amiMeetings("manual").filter((item) => item.group === "scenario" && inSplit(item));
  }
  if (kind === "heard" || kind === "steady") {
    return amiMeetings(kind === "heard" ? "quiet-room" : "steady-sound").filter(inSplit);
  }
  if (kind === "mixed") {
    return [...amiMeetings("manual").filter(inSplit), ...icsiMeetings().filter(inSplit)];
  }
  throw new Error(`Unknown pool ${name}`);
}

function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** A history of `size` meetings, whole series first, as a team's calendar would hold them. */
function sampleHistory(pool, size, seed) {
  const random = seeded(seed);
  const bySeries = new Map();
  for (const item of pool) {
    if (!bySeries.has(item.series)) bySeries.set(item.series, []);
    bySeries.get(item.series).push(item);
  }
  // Each group of the pool takes its share, so a mixed history stays mixed.
  const series = [...bySeries.keys()]
    .map((name) => ({ name, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((item) => item.name);
  const out = [];
  while (out.length < Math.min(size, pool.length)) {
    for (const name of series) {
      const left = bySeries.get(name);
      // Up to four meetings of a series together, as a team holds them; one at a
      // time (`--spread`) gives a history of strangers.
      for (let taken = 0; taken < (args.spread ? 1 : 4); taken += 1) {
        if (!left.length || out.length >= size) break;
        out.push(left.splice(Math.floor(random() * left.length), 1)[0]);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Similarity of every two topics in a history, and what each method does to it.

const dot = (a, b) => {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return total;
};

function unit(values) {
  const norm = Math.sqrt(dot(values, values)) || 1;
  return Float32Array.from(values, (value) => value / norm);
}

function meanOf(vectors) {
  const sum = new Float64Array(vectors[0].length);
  for (const vector of vectors) for (let k = 0; k < sum.length; k += 1) sum[k] += vector[k];
  return sum.map((value) => value / vectors.length);
}

/** The history's top direction, by power iteration on the uncentred vectors. */
function topComponent(vectors) {
  let u = unit(meanOf(vectors));
  for (let round = 0; round < 12; round += 1) {
    const next = new Float64Array(u.length);
    for (const vector of vectors) {
      const along = dot(vector, u);
      for (let k = 0; k < next.length; k += 1) next[k] += along * vector[k];
    }
    u = unit(next);
  }
  return u;
}

const TRANSFORMS = {
  abs: (vectors) => vectors,
  centre: (vectors) => {
    const mean = meanOf(vectors);
    return vectors.map((vector) => unit(vector.map((value, k) => value - mean[k])));
  },
  pc: (vectors) => {
    const u = topComponent(vectors);
    return vectors.map((vector) => {
      const along = dot(vector, u);
      return unit(vector.map((value, k) => value - along * u[k]));
    });
  },
};

/** Each topic of a history, flat, with the conversation it belongs to. */
function flatten(history) {
  return history.flatMap((meeting, owner) => meeting.topics.map((topic) => ({ ...topic, owner })));
}

function matrixOf(topics, kind) {
  const vectors = TRANSFORMS[kind](topics.map((topic) => topic.vector));
  const n = topics.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const value = dot(vectors[i], vectors[j]);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }
  return matrix;
}

/** Cross-domain similarity local scaling: a hub's score falls by how alike everything is to it. */
function csls(topics, matrix, k) {
  const n = topics.length;
  const reach = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const near = [];
    for (let j = 0; j < n; j += 1) {
      if (topics[j].owner !== topics[i].owner) near.push(matrix[i][j]);
    }
    near.sort((a, b) => b - a);
    const taken = near.slice(0, k);
    reach[i] = taken.length ? taken.reduce((sum, value) => sum + value, 0) / taken.length : 0;
  }
  const out = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) out[i][j] = 2 * matrix[i][j] - reach[i] - reach[j];
  }
  return out;
}

/** Words a history shares count for little: cosine of two topics' words, weighted by rarity here. */
function idfMatrix(topics) {
  const bags = topics.map(
    (topic) =>
      new Set([
        ...topic.words,
        ...topic.label
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length > 2),
      ])
  );
  const spread = new Map();
  for (const bag of bags) {
    for (const word of bag) spread.set(word, (spread.get(word) ?? 0) + 1);
  }
  const weight = (word) => Math.log((topics.length + 1) / spread.get(word));
  const norms = bags.map((bag) =>
    Math.sqrt([...bag].reduce((sum, word) => sum + weight(word) ** 2, 0))
  );
  const n = topics.length;
  const out = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let shared = 0;
      for (const word of bags[i]) if (bags[j].has(word)) shared += weight(word) ** 2;
      const value = norms[i] && norms[j] ? shared / (norms[i] * norms[j]) : 0;
      out[i][j] = value;
      out[j][i] = value;
    }
  }
  return out;
}

/** A threshold from this history's own scores: each topic's best match elsewhere, mean + z sd. */
function ownThreshold(topics, matrix, z) {
  const best = topics.map((topic, i) => {
    let top = -Infinity;
    topics.forEach((other, j) => {
      if (other.owner !== topic.owner && matrix[i][j] > top) top = matrix[i][j];
    });
    return top;
  });
  const usable = best.filter(Number.isFinite);
  if (!usable.length) return Infinity;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const sd = Math.sqrt(usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length);
  return mean + z * sd;
}

/** Average linkage over a matrix: conversations that share a cluster cut at `threshold`. */
function clusterLinks(topics, matrix, threshold) {
  const n = topics.length;
  const sim = matrix.map((row) => Float64Array.from(row));
  const size = new Array(n).fill(1);
  const parent = Array.from({ length: n }, (_, index) => index);
  const alive = new Set(parent);
  while (alive.size > 1) {
    let best = -Infinity;
    let a = -1;
    let b = -1;
    const list = [...alive];
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const value = sim[list[x]][list[y]];
        if (value > best) {
          best = value;
          a = list[x];
          b = list[y];
        }
      }
    }
    if (best < threshold) break;
    alive.delete(b);
    parent[b] = a;
    for (const other of alive) {
      if (other === a) continue;
      const value = (sim[a][other] * size[a] + sim[b][other] * size[b]) / (size[a] + size[b]);
      sim[a][other] = value;
      sim[other][a] = value;
    }
    size[a] += size[b];
  }
  const find = (index) => {
    let at = index;
    while (parent[at] !== at) at = parent[at];
    return at;
  };
  const groups = new Map();
  topics.forEach((topic, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(topic.owner);
  });
  const linked = new Set();
  for (const owners of groups.values()) {
    const list = [...owners].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) linked.add(`${list[i]}|${list[j]}`);
    }
  }
  return linked;
}

/** Conversations linked by a topic pair each is the other's nearest, among `k`. */
function mutualLinks(topics, matrix, k, floor) {
  const n = topics.length;
  const nearest = topics.map((topic, i) => {
    const others = [];
    for (let j = 0; j < n; j += 1) {
      if (topics[j].owner !== topic.owner) others.push(j);
    }
    return new Set(others.sort((x, y) => matrix[i][y] - matrix[i][x]).slice(0, k));
  });
  const linked = new Set();
  for (let i = 0; i < n; i += 1) {
    for (const j of nearest[i]) {
      if (i < j && nearest[j].has(i) && matrix[i][j] >= floor) {
        const [a, b] = [topics[i].owner, topics[j].owner].sort((x, y) => x - y);
        linked.add(`${a}|${b}`);
      }
    }
  }
  return linked;
}

/** A candidate build's board, by what was said, with the names a person would see. */
function candidateBoard(history, threshold, rule = candidate, share = 0) {
  const board = history.map((meeting, index) => ({
    id: index,
    title: String(index),
    createdAt: index,
    snapshot: {
      nodes: meeting.topics.map((topic, at) => ({
        id: at,
        label: topic.label,
        durationMs: 60_000,
        words: topic.words,
        vector: rule.encodeTopicVector(topic.vector),
      })),
    },
  }));
  const topics = board.reduce((sum, item) => sum + item.snapshot.nodes.length, 0);
  return rule.meaningThreads(board, {
    vectorOf: () => null,
    contentThreshold: threshold,
    // A count, or a share of the history's topics and never under the app's own.
    ...(share >= 1 ? { neighbours: share } : {}),
    ...(share > 0 && share < 1
      ? { neighbours: Math.max(3, Math.round(share * (topics - 1))) }
      : {}),
  });
}

/**
 * Two meetings are linked when one chip holds both. A person points at a name, so
 * subjects with one name are one chip whichever rule drew them (`linkedHighlight`).
 */
function chipLinks(subjects) {
  const byName = new Map();
  for (const subject of subjects) {
    if (!byName.has(subject.label)) byName.set(subject.label, new Set());
    for (const id of subject.conversationIds) byName.get(subject.label).add(id);
  }
  const linked = new Set();
  for (const ids of byName.values()) {
    const list = [...ids].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) linked.add(`${list[i]}|${list[j]}`);
    }
  }
  return linked;
}

const candidateLinks = (history, threshold, share) =>
  chipLinks(candidateBoard(history, threshold, candidate, share).subjects);

function candidateEdges(history, threshold, share) {
  const { edges } = candidateBoard(history, threshold, candidate, share);
  return new Set(
    edges.map((edge) => `${Math.min(edge.from, edge.to)}|${Math.max(edge.from, edge.to)}`)
  );
}

/**
 * Mutual pairs joined into subjects, as the board would have to draw them: two
 * conversations are linked when any chain of mutual topics joins them.
 */
function mutualSubjects(topics, matrix, k, floor) {
  const n = topics.length;
  const nearest = topics.map((topic, i) => {
    const others = [];
    for (let j = 0; j < n; j += 1) if (topics[j].owner !== topic.owner) others.push(j);
    return new Set(others.sort((x, y) => matrix[i][y] - matrix[i][x]).slice(0, k));
  });
  const parent = Array.from({ length: n }, (_, index) => index);
  const find = (index) => {
    let at = index;
    while (parent[at] !== at) {
      parent[at] = parent[parent[at]];
      at = parent[at];
    }
    return at;
  };
  for (let i = 0; i < n; i += 1) {
    for (const j of nearest[i]) {
      if (i < j && nearest[j].has(i) && matrix[i][j] >= floor) parent[find(j)] = find(i);
    }
  }
  const groups = new Map();
  topics.forEach((topic, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(topic.owner);
  });
  const linked = new Set();
  for (const owners of groups.values()) {
    const list = [...owners].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) linked.add(`${list[i]}|${list[j]}`);
    }
  }
  return linked;
}

/** The app's board at one threshold, in the order of this history. */
function greedyLinks(history, threshold) {
  const board = history.map((meeting, index) => ({
    id: index,
    title: String(index),
    createdAt: index,
    snapshot: {
      nodes: meeting.topics.map((topic, at) => ({
        id: at,
        label: `${index}-${at}`,
        durationMs: 60_000,
        words: topic.words,
        vector: encodeTopicVector(topic.vector),
      })),
    },
  }));
  const { subjects } = meaningThreads(board, {
    vectorOf: () => null,
    contentThreshold: threshold,
  });
  const linked = new Set();
  for (const subject of subjects) {
    const list = [...subject.conversationIds].sort((a, b) => a - b);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) linked.add(`${list[i]}|${list[j]}`);
    }
  }
  return linked;
}

/**
 * A method's links in a history. Spec, by `:`:
 *   greedy:<t>                the app's rule
 *   link:<abs|centre|pc>:<t>  average linkage, at a fixed threshold
 *   csls:<abs|centre|pc>:<k>:<t>
 *   idf:<t>                   words a history shares count for little
 *   blend:<kind>:<weight>:<t> a cosine and the words, together
 *   own:<kind>:<z>            a threshold from this history's own scores
 *   own-floor:<kind>:<z>:<f>  the same, never under an absolute floor
 *   mutual:<kind>:<k>:<floor> mutual nearest topics, over a floor
 *   mutual-subjects:<kind>:<k>:<floor>  the same, chained into subjects
 *   mutual-share:<kind>:<share>:<least>:<floor>  mutual, k a share of the history's topics
 *   app:<t>[:<k>], app-edges:<t>[:<k>]  a candidate build of the app's rule
 *                             (`--app-module`), with k neighbours, or under 1 a share of
 *                             the history's topics
 *   greedy-chips:<t>          the app's rule, a pair linked when one chip holds both
 */
function linksOf(spec, history) {
  const [kind, ...rest] = spec.split(":");
  if (kind === "greedy") return greedyLinks(history, Number(rest[0]));
  if (kind === "app") return candidateLinks(history, Number(rest[0]), Number(rest[1] ?? 0));
  if (kind === "greedy-chips") {
    return chipLinks(
      candidateBoard(history, Number(rest[0]), { encodeTopicVector, meaningThreads }).subjects
    );
  }
  if (kind === "app-edges") return candidateEdges(history, Number(rest[0]), Number(rest[1] ?? 0));
  const topics = flatten(history);
  if (kind === "link") {
    return clusterLinks(topics, matrixOf(topics, rest[0]), Number(rest[1]));
  }
  if (kind === "csls") {
    const matrix = csls(topics, matrixOf(topics, rest[0]), Number(rest[1]));
    return clusterLinks(topics, matrix, Number(rest[2]));
  }
  if (kind === "idf") return clusterLinks(topics, idfMatrix(topics), Number(rest[0]));
  if (kind === "blend") {
    const cosine = matrixOf(topics, rest[0]);
    const words = idfMatrix(topics);
    const weight = Number(rest[1]);
    const matrix = cosine.map((row, i) =>
      row.map((value, j) => (1 - weight) * value + weight * words[i][j])
    );
    return clusterLinks(topics, matrix, Number(rest[2]));
  }
  if (kind === "own" || kind === "own-floor") {
    const matrix = matrixOf(topics, rest[0]);
    const threshold = ownThreshold(topics, matrix, Number(rest[1]));
    const floor = kind === "own-floor" ? Number(rest[2]) : -Infinity;
    return clusterLinks(topics, matrix, Math.max(threshold, floor));
  }
  if (kind === "mutual-subjects") {
    return mutualSubjects(topics, matrixOf(topics, rest[0]), Number(rest[1]), Number(rest[2]));
  }
  if (kind === "mutual") {
    return mutualLinks(topics, matrixOf(topics, rest[0]), Number(rest[1]), Number(rest[2]));
  }
  if (kind === "mutual-share") {
    const k = Math.max(Number(rest[2]), Math.round(Number(rest[1]) * (topics.length - 1)));
    return mutualLinks(topics, matrixOf(topics, rest[0]), k, Number(rest[3]));
  }
  throw new Error(`Unknown method ${spec}`);
}

// ---------------------------------------------------------------------------
// Scores over sampled histories: every pair of every history counted.

function scoreOne(history, linked, truth) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0, unrelated: 0, unrelatedLinked: 0, unknownLinked: 0 };
  for (let i = 0; i < history.length; i += 1) {
    for (let j = i + 1; j < history.length; j += 1) {
      const gold = truth(history[i], history[j]);
      const yes = linked.has(`${i}|${j}`);
      if (gold === null) {
        if (yes) counts.unknownLinked += 1;
        continue;
      }
      // Across corpora, or across groups: the meetings have nothing in common.
      const unrelated = history[i].group !== history[j].group;
      if (unrelated) {
        counts.unrelated += 1;
        if (yes) counts.unrelatedLinked += 1;
      }
      if (gold && yes) counts.tp += 1;
      else if (gold) counts.fn += 1;
      else if (yes) counts.fp += 1;
      else counts.tn += 1;
    }
  }
  return counts;
}

const add = (into, from) => {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
  return into;
};

function ratesOf(counts) {
  const precision = counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : null;
  const recall = counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : null;
  const falseLinks = counts.fp + counts.tn ? counts.fp / (counts.fp + counts.tn) : null;
  const unrelated = counts.unrelated ? counts.unrelatedLinked / counts.unrelated : null;
  return { precision, recall, falseLinks, unrelated };
}

const f = (value) => (value == null ? "  -  " : value.toFixed(3));

function rowOf(spec, histories, truth) {
  const perHistory = histories.map((history) => scoreOne(history, linksOf(spec, history), truth));
  const total = perHistory.reduce((sum, counts) => add(sum, counts), {});
  return { spec, perHistory, total, ...ratesOf(total) };
}

function printRow(row) {
  console.log(
    `${row.spec.padEnd(28)} P ${f(row.precision)} R ${f(row.recall)} FL ${f(row.falseLinks)} unrelated ${f(row.unrelated)} (${row.total.unrelatedLinked ?? 0}/${row.total.unrelated ?? 0}) group links ${row.total.unknownLinked ?? 0}`
  );
}

function historiesOf() {
  const pool = poolOf(args.pool);
  const size = Number(args.size);
  // A history as big as its pool can be drawn once only.
  const count = size >= pool.length ? 1 : Number(args.histories);
  return {
    pool,
    histories: Array.from({ length: count }, (_, index) =>
      sampleHistory(pool, size, 20261105 + index * 7919)
    ),
  };
}

function describe(pool, histories) {
  const pairs = histories.reduce((sum, list) => sum + (list.length * (list.length - 1)) / 2, 0);
  console.log(
    `${args.pool}: ${pool.length} meetings, ${histories.length} histories of ${histories[0].length}, ${pairs} pairs`
  );
}

const SWEEP = [
  "greedy:0.78",
  "greedy:0.84",
  "greedy:0.88",
  "link:abs:0.74",
  "link:abs:0.8",
  "link:abs:0.86",
  ...[0.1, 0.2, 0.3, 0.4, 0.5].map((t) => `link:centre:${t}`),
  ...[0.1, 0.2, 0.3, 0.4, 0.5].map((t) => `link:pc:${t}`),
  ...[0, 0.05, 0.1, 0.15].map((t) => `csls:abs:5:${t}`),
  ...[0.1, 0.2, 0.3].map((t) => `csls:centre:5:${t}`),
  ...[0.1, 0.2, 0.3].map((t) => `idf:${t}`),
  ...[0.3, 0.4, 0.5].map((t) => `blend:centre:0.5:${t}`),
  ...[0, 0.5, 1, 1.5].map((z) => `own:abs:${z}`),
  ...[0, 0.5, 1].map((z) => `own:centre:${z}`),
  ...[0.5, 1].map((z) => `own-floor:abs:${z}:0.78`),
  "mutual:abs:1:0.78",
  "mutual:abs:3:0.78",
  "mutual:centre:1:0.2",
  "mutual:centre:3:0.2",
];

function sweep() {
  const truth = truthOf();
  const { pool, histories } = historiesOf();
  describe(pool, histories);
  for (const spec of args.methods ? args.methods.split("+") : SWEEP) {
    printRow(rowOf(spec, histories, truth));
  }
}

/** A frozen list on one pool: each against the first, with a bootstrap over histories. */
function read() {
  const truth = truthOf();
  const { pool, histories } = historiesOf();
  describe(pool, histories);
  const rows = args.methods.split("+").map((spec) => rowOf(spec, histories, truth));
  const random = seeded(29);
  for (const row of rows) {
    printRow(row);
    if (row === rows[0] || histories.length < 2) continue;
    const deltas = { precision: [], falseLinks: [], recall: [] };
    for (let sample = 0; sample < 2000; sample += 1) {
      const a = {};
      const b = {};
      for (let k = 0; k < histories.length; k += 1) {
        const at = Math.floor(random() * histories.length);
        add(a, row.perHistory[at]);
        add(b, rows[0].perHistory[at]);
      }
      const left = ratesOf(a);
      const right = ratesOf(b);
      for (const key of Object.keys(deltas)) {
        if (left[key] != null && right[key] != null) deltas[key].push(left[key] - right[key]);
      }
    }
    const interval = (values) => {
      const sorted = [...values].sort((x, y) => x - y);
      return `[${f(sorted[Math.floor(0.025 * sorted.length)])}, ${f(sorted[Math.floor(0.975 * sorted.length)])}]`;
    };
    const delta = (key) => {
      const a = row[key];
      const b = rows[0][key];
      return a == null || b == null ? "-" : (a - b).toFixed(3);
    };
    console.log(
      `    minus ${rows[0].spec}: P ${delta("precision")} ${interval(deltas.precision)} R ${delta("recall")} ${interval(deltas.recall)} FL ${delta("falseLinks")} ${interval(deltas.falseLinks)}`
    );
  }
}

/** What a board shows: its chips, the biggest first, under this rule and the candidate's. */
function chips() {
  const { histories } = historiesOf();
  const size = (list) => list.map((subject) => subject.conversationIds.length);
  const threshold = 0.78;
  const summary = (name, boards) => {
    const counts = boards.map((board) => board.subjects.length);
    const edges = boards.map((board) => board.edges.length);
    const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
    const biggest = boards.map((board) => Math.max(0, ...size(board.subjects)));
    const linked = boards.map(
      (board) => new Set(board.edges.flatMap((edge) => [edge.from, edge.to])).size
    );
    console.log(
      `${name.padEnd(10)} ${mean(counts).toFixed(1)} chips, ${mean(edges).toFixed(1)} edges, biggest ${mean(biggest).toFixed(1)}, ${mean(linked).toFixed(1)} of ${histories[0].length} meetings linked`
    );
  };
  const main = histories.map((history) =>
    candidateBoard(history, threshold, { encodeTopicVector, meaningThreads })
  );
  const next = histories.map((history) => candidateBoard(history, threshold));
  summary("main", main);
  summary("candidate", next);
  const top = (subjects) =>
    subjects
      .slice(0, 10)
      .map((subject) => `${subject.label} ${subject.conversationIds.length}`)
      .join(" | ");
  console.log(`main: ${top(main[0].subjects)}`);
  console.log(`candidate: ${top(next[0].subjects)}`);
}

const COMMANDS = { icsi, sweep, read, chips };
if (!COMMANDS[positionals[0]]) {
  console.error(`Usage: node scripts/link-relative.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
COMMANDS[positionals[0]]();
