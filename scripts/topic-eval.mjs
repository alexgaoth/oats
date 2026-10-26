#!/usr/bin/env node
// The topic benchmark: replays transcripts through the conversation topic
// tracker the way the recording store feeds it, and scores what comes out.
//
//   node scripts/topic-eval.mjs --ami <dir> [--split test|tune|all] [--demo]
//     [--transcript file.json ...] [--tracker file.mjs] [--name label]
//     [--vectors] [--judge] [--show-labels] [--json out.json]
//
// Sources
//   --ami DIR         the AMI meeting corpus' manual annotations
//                     (ami_public_manual_1.6.2, CC BY 4.0), unzipped: the
//                     folder with words/, topics/ and ontologies/, or the one
//                     above it holding annotations/. Each meeting is replayed as a
//                     room hears it: every voice's words in time order, cut
//                     into utterances at pauses of 400 ms or at 20 s, as
//                     `speechSegmenter.mjs` cuts a room.
//   --split           `test` is the corpus' standard test meetings (ES2004,
//                     IS1009, TS3003); `tune` is every other meeting with
//                     topics, for choosing parameters; `all` is both.
//   --meetings a,b    only these AMI meetings.
//   --demo            the demo conversations (demo/fixtures and the bundled
//                     example): their stored transcripts, replayed.
//   --transcript F    a stored transcript (a note's JSON segment array).
//                     Private by default: only aggregate numbers are printed,
//                     never its words or labels, unless --show-labels.
//
// What is scored
//   Segmentation (AMI only): Pk and WindowDiff over words against the human
//   top-level topic segmentation, k = half the mean reference segment length.
//   Lower is better; 0 is perfect. A return to an earlier topic counts as a
//   boundary, as it does in the reference. Two baselines are printed beside
//   the tracker: one topic for the whole meeting, and the reference's number
//   of topics cut evenly.
//   Count: topics shown (nodes), runs (stretches of one topic), against the
//   reference's top-level segments.
//   Labels: the share with a stopword, contraction, filler or bare number
//   (judged by this file's own lists, not the tracker's), the share that are
//   a phrase actually said in the topic, the share repeated within one
//   conversation, and (AMI only, --judge) an OpenAI rating from 1 to 5 of each
//   label against the human description of the part of the meeting it names.
//   The judge never sees anything but AMI: --transcript and --demo sources are
//   never sent anywhere.
//
// --judge reads OPENAI_API_KEY from the environment and caches every rating in
// ~/.cache/oats/topic-eval/judge-cache.json, so a rerun costs nothing.
// --vectors also hands the tracker sentence vectors as the app does
// (topicVectors.mjs): each turn and the phrases it asks for, embedded by
// all-MiniLM-L6-v2 here, the way the app's ONNX worker embeds them, from
// --model-dir (default: the app's own lookup). Cached in
// ~/.cache/oats/topic-eval/vectors. Local only.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

const { values: args } = parseArgs({
  strict: isMain,
  options: {
    ami: { type: "string" },
    split: { type: "string", default: "test" },
    meetings: { type: "string" },
    demo: { type: "boolean", default: false },
    transcript: { type: "string", multiple: true, default: [] },
    tracker: { type: "string", default: path.join(ROOT, "src/helpers/conversationTopics.mjs") },
    name: { type: "string" },
    judge: { type: "boolean", default: false },
    "judge-model": { type: "string", default: "gpt-4.1-mini-2025-04-14" },
    "show-labels": { type: "boolean", default: false },
    fine: { type: "boolean", default: false },
    json: { type: "string" },
    quiet: { type: "boolean", default: false },
    vectors: { type: "boolean", default: false },
    "model-dir": { type: "string" },
  },
});

// ---------------------------------------------------------------------------
// AMI

const AMI_TEST = ["ES2004", "IS1009", "TS3003"];
const PAUSE_S = 0.4;
const MAX_UTTERANCE_S = 20;
// Any fixed epoch: the tracker only compares times with each other.
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function decodeXml(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attributes(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g))
    out[match[1]] = decodeXml(match[2]);
  return out;
}

function topicNames(dir) {
  const file = path.join(dir, "ontologies", "default-topics.xml");
  const names = new Map();
  if (!fs.existsSync(file)) return names;
  for (const match of fs.readFileSync(file, "latin1").matchAll(/<topicname\b([^>]*)>/g)) {
    const attrs = attributes(match[1]);
    if (attrs["nite:id"]) names.set(attrs["nite:id"], attrs.name);
  }
  return names;
}

// Every element of one speaker's words file, in file order, so that the
// topic file's `id(a)..id(b)` ranges can be resolved by position.
function speakerElements(dir, meeting, speaker) {
  const xml = fs.readFileSync(path.join(dir, "words", `${meeting}.${speaker}.words.xml`), "latin1");
  const elements = [];
  const pattern = /<([a-zA-Z]+)\b([^>]*?)(\/>|>([^<]*)<\/\1>)/g;
  let lastTime = 0;
  for (const match of xml.matchAll(pattern)) {
    const attrs = attributes(match[2]);
    const id = attrs["nite:id"];
    if (!id) continue;
    const start = Number.parseFloat(attrs.starttime);
    const end = Number.parseFloat(attrs.endtime);
    const element = {
      id,
      kind: match[1],
      speaker,
      start: Number.isFinite(start) ? start : lastTime,
      end: Number.isFinite(end) ? end : Number.isFinite(start) ? start : lastTime,
      text: match[1] === "w" ? decodeXml(match[4] ?? "").trim() : "",
      punc: attrs.punc === "true",
      trunc: attrs.trunc === "true",
    };
    lastTime = Math.max(lastTime, element.end);
    elements.push(element);
  }
  return elements;
}

function parseTopics(dir, meeting, names) {
  const xml = fs.readFileSync(path.join(dir, "topics", `${meeting}.topic.xml`), "latin1");
  const roots = [];
  const stack = [];
  for (const match of xml.matchAll(/<(\/?)(topic|nite:pointer|nite:child)\b([^>]*?)\/?>/g)) {
    const closing = match[1] === "/";
    const tag = match[2];
    const attrs = attributes(match[3]);
    if (tag === "topic" && !closing) {
      const topic = {
        id: attrs["nite:id"],
        description: attrs.description || attrs.other_description || "",
        type: "",
        children: [],
        subtopics: [],
        parent: stack.at(-1) ?? null,
      };
      if (topic.parent) topic.parent.subtopics.push(topic);
      else roots.push(topic);
      stack.push(topic);
      if (/\/>\s*$/.test(match[0])) stack.pop();
    } else if (tag === "topic" && closing) {
      stack.pop();
    } else if (tag === "nite:pointer" && stack.length) {
      const ref = /#id\(([^)]+)\)/.exec(attrs.href || "");
      if (ref) stack.at(-1).type = names.get(ref[1]) || "";
    } else if (tag === "nite:child" && stack.length) {
      stack.at(-1).children.push(attrs.href || "");
    }
  }
  return roots;
}

function topicDescription(topic) {
  return (topic.description || topic.type || "other").trim();
}

function loadAmiMeeting(dir, meeting, names) {
  const speakers = fs
    .readdirSync(path.join(dir, "words"))
    .filter((file) => file.startsWith(`${meeting}.`) && file.endsWith(".words.xml"))
    .map((file) => file.split(".")[1]);
  const elementsBySpeaker = new Map();
  const positionById = new Map();
  for (const speaker of speakers) {
    const elements = speakerElements(dir, meeting, speaker);
    elementsBySpeaker.set(speaker, elements);
    elements.forEach((element, index) => positionById.set(element.id, { speaker, index }));
  }

  // Each element's top-level and finest topic.
  const topOf = new Map();
  const fineOf = new Map();
  const roots = parseTopics(dir, meeting, names);
  const topics = new Map();
  const visit = (topic, root) => {
    topics.set(topic.id, topic);
    for (const href of topic.children) {
      const match = /#id\(([^)]+)\)(?:\.\.id\(([^)]+)\))?/.exec(href);
      if (!match) continue;
      const from = positionById.get(match[1]);
      const to = positionById.get(match[2] || match[1]);
      if (!from || !to || from.speaker !== to.speaker) continue;
      const elements = elementsBySpeaker.get(from.speaker);
      for (let index = from.index; index <= to.index; index += 1) {
        topOf.set(elements[index].id, root.id);
        fineOf.set(elements[index].id, topic.id);
      }
    }
    for (const sub of topic.subtopics) visit(sub, root);
  };
  for (const root of roots) visit(root, root);

  // The words a room hears, in time order. Punctuation stays on the word it
  // follows; truncated words and non-speech events are not words.
  const words = [];
  for (const elements of elementsBySpeaker.values()) {
    let previous = null;
    for (const element of elements) {
      if (element.kind !== "w") continue;
      if (element.punc) {
        if (previous) previous.text += element.text;
        continue;
      }
      if (element.trunc || !element.text) {
        previous = null;
        continue;
      }
      previous = {
        speaker: element.speaker,
        start: element.start,
        end: Math.max(element.end, element.start),
        text: element.text,
        top: topOf.get(element.id) ?? null,
        fine: fineOf.get(element.id) ?? null,
      };
      words.push(previous);
    }
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  // A word no topic covers belongs to the topic around it.
  let carry = words.find((word) => word.top)?.top ?? null;
  let carryFine = words.find((word) => word.fine)?.fine ?? null;
  for (const word of words) {
    if (word.top) carry = word.top;
    else word.top = carry;
    if (word.fine) carryFine = word.fine;
    else word.fine = carryFine;
  }

  // Cut where the room goes quiet, as the segmenter does.
  const utterances = [];
  let current = null;
  let lastEnd = -Infinity;
  for (const word of words) {
    const pause = word.start - lastEnd;
    if (!current || pause >= PAUSE_S || word.end - current.start > MAX_UTTERANCE_S) {
      current = { start: word.start, words: [] };
      utterances.push(current);
    }
    current.words.push(word);
    lastEnd = Math.max(lastEnd, word.end);
  }
  return {
    id: meeting,
    source: "ami",
    split: AMI_TEST.some((prefix) => meeting.startsWith(prefix)) ? "test" : "tune",
    topics,
    utterances: utterances.map((utterance, index) => {
      const counts = new Map();
      for (const word of utterance.words)
        counts.set(word.speaker, (counts.get(word.speaker) ?? 0) + 1);
      return {
        id: `${meeting}-${index + 1}`,
        text: utterance.words.map((word) => word.text).join(" "),
        at: T0 + Math.round(utterance.start * 1000),
        speaker: [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0],
        refTop: utterance.words.map((word) => word.top),
        refFine: utterance.words.map((word) => word.fine),
      };
    }),
  };
}

function amiMeetingIds(dir) {
  return fs
    .readdirSync(path.join(dir, "topics"))
    .filter((file) => file.endsWith(".topic.xml"))
    .map((file) => file.replace(/\.topic\.xml$/, ""))
    .filter((meeting) =>
      fs.readdirSync(path.join(dir, "words")).some((file) => file.startsWith(`${meeting}.`))
    )
    .sort();
}

// ---------------------------------------------------------------------------
// Stored transcripts (a note's segments) and the demo conversations

function segmentsOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return segmentsOf(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object") {
    return segmentsOf(value.transcript ?? value.note?.transcript ?? value.segments ?? []);
  }
  return [];
}

function storedConversation(id, value, { source, private: isPrivate }) {
  const segments = segmentsOf(value).filter((segment) => String(segment?.text || "").trim());
  let clock = T0;
  return {
    id,
    source,
    private: isPrivate,
    utterances: segments.map((segment, index) => {
      const at = Number.isFinite(segment.timestamp) ? segment.timestamp : (clock += 5000);
      return {
        id: String(segment.id ?? `u${index + 1}`),
        text: String(segment.text),
        at,
        speaker: segment.speaker ?? null,
      };
    }),
  };
}

function demoConversations() {
  const files = [
    ...fs
      .readdirSync(path.join(ROOT, "demo/fixtures"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(ROOT, "demo/fixtures", file)),
    path.join(ROOT, "src/helpers/sampleConversations/launch-readiness-review.json"),
  ];
  return files.map((file) =>
    storedConversation(path.basename(file, ".json"), JSON.parse(fs.readFileSync(file, "utf8")), {
      source: "demo",
      private: false,
    })
  );
}

// ---------------------------------------------------------------------------
// Replay

async function loadTracker(file) {
  return import(pathToFileURL(path.resolve(file)).href);
}

// As `trackConversationTopic` in meetingRecordingStore.ts: one utterance in,
// then the graph and the stack read, after every finalized utterance; the
// record is the final snapshot.
async function replay(module, conversation, { embedder = null } = {}) {
  const tracker = new module.ConversationTopicTracker();
  let spent = 0;
  let worst = 0;
  // What the flow card drew after each utterance: where its topic changes
  // were, as the utterance each one starts at.
  const live = [];
  for (const utterance of conversation.utterances) {
    let before = performance.now();
    tracker.onUtterance({ id: utterance.id, text: utterance.text, at: utterance.at });
    let took = performance.now() - before;
    if (embedder && typeof tracker.addVectors === "function") {
      // As the feeder does, but with no wait: the turn and the phrases asked.
      const phrases = tracker.phrasesToEmbed(47);
      const vectors = await embedder.embed([
        utterance.text,
        ...phrases.map((phrase) => phrase.text),
      ]);
      before = performance.now();
      tracker.addVectors({
        utterances: [[utterance.id, vectors[0]]],
        phrases: phrases.map((phrase, index) => [phrase.key, vectors[index + 1]]),
      });
      took += performance.now() - before;
    }
    before = performance.now();
    const shown = tracker.snapshot(utterance.at);
    tracker.openThreads(utterance.at);
    took += performance.now() - before;
    spent += took;
    worst = Math.max(worst, took);
    live.push({ at: utterance.at, changes: changesOf(conversation, shown) });
  }
  const end = conversation.utterances.at(-1)?.at ?? T0;
  const snapshot = tracker.snapshot(end, { final: true });
  return {
    tracker,
    snapshot,
    live,
    timing: {
      totalMs: spent,
      worstMs: worst,
      perUtteranceMs: spent / Math.max(1, conversation.utterances.length),
    },
  };
}

// The moments a snapshot's topic changes: utterance id -> time.
function changesOf(conversation, snapshot) {
  const topicOf = new Map();
  for (const node of snapshot.nodes) {
    for (const id of node.utteranceIds) topicOf.set(String(id), node.id);
  }
  const changes = new Map();
  let previous = null;
  for (const utterance of conversation.utterances) {
    // A turn placed nowhere (a backchannel, or one still held) changes nothing.
    const topic = topicOf.get(utterance.id);
    if (topic == null) continue;
    if (previous != null && topic !== previous) changes.set(utterance.id, utterance.at);
    previous = topic;
  }
  return changes;
}

// Every utterance's topic. One the tracker set aside (too short to place)
// belongs to the topic the room was on, which is how the lanes draw it.
function assignment(conversation, snapshot) {
  const topicOf = new Map();
  for (const node of snapshot.nodes) {
    for (const id of node.utteranceIds) topicOf.set(String(id), node.id);
  }
  const labels = conversation.utterances.map((utterance) => topicOf.get(utterance.id) ?? null);
  const first = labels.find((label) => label != null) ?? 0;
  let carry = first;
  return labels.map((label) => {
    if (label != null) carry = label;
    return carry;
  });
}

// ---------------------------------------------------------------------------
// Segmentation metrics

function boundariesOf(labels) {
  const out = new Uint8Array(labels.length);
  for (let index = 1; index < labels.length; index += 1) {
    out[index] = labels[index] !== labels[index - 1] ? 1 : 0;
  }
  return out;
}

function segmentCount(labels) {
  let count = labels.length ? 1 : 0;
  for (let index = 1; index < labels.length; index += 1)
    if (labels[index] !== labels[index - 1]) count += 1;
  return count;
}

// Pk (Beeferman et al., 1999) and WindowDiff (Pevzner and Hearst, 2002) over
// one label per word.
function pkWindowDiff(reference, hypothesis) {
  const n = reference.length;
  const k = Math.max(2, Math.round(n / segmentCount(reference) / 2));
  if (n <= k) return { pk: 0, windowDiff: 0, k };
  const refB = boundariesOf(reference);
  const hypB = boundariesOf(hypothesis);
  const refPrefix = new Int32Array(n + 1);
  const hypPrefix = new Int32Array(n + 1);
  for (let index = 0; index < n; index += 1) {
    refPrefix[index + 1] = refPrefix[index] + refB[index];
    hypPrefix[index + 1] = hypPrefix[index] + hypB[index];
  }
  let pkErrors = 0;
  let wdErrors = 0;
  for (let index = 0; index + k < n; index += 1) {
    // Boundaries strictly after `index` and up to `index + k`.
    const refBetween = refPrefix[index + k + 1] - refPrefix[index + 1];
    const hypBetween = hypPrefix[index + k + 1] - hypPrefix[index + 1];
    if (refBetween > 0 !== hypBetween > 0) pkErrors += 1;
    if (refBetween !== hypBetween) wdErrors += 1;
  }
  return { pk: pkErrors / (n - k), windowDiff: wdErrors / (n - k), k };
}

// Topic changes the tracker drew that are within a minute of one the
// annotators drew, one to one: the readable companion to Pk.
const BOUNDARY_TOLERANCE_MS = 60_000;

function boundaryMatches(conversation, wordReference, perUtterance) {
  const reference = [];
  let word = 0;
  for (const utterance of conversation.utterances) {
    reference.push(wordReference[word]);
    word += utterance.refTop.length;
  }
  const times = conversation.utterances.map((utterance) => utterance.at);
  const changes = (labels) =>
    labels.flatMap((label, index) => (index && label !== labels[index - 1] ? [times[index]] : []));
  const drawn = changes(perUtterance);
  const real = changes(reference);
  const used = new Set();
  let hits = 0;
  for (const at of drawn) {
    let best = -1;
    real.forEach((other, index) => {
      const distance = Math.abs(other - at);
      if (used.has(index) || distance > BOUNDARY_TOLERANCE_MS) return;
      if (best < 0 || distance < Math.abs(real[best] - at)) best = index;
    });
    if (best >= 0) {
      used.add(best);
      hits += 1;
    }
  }
  return { hits, drawn: drawn.length, real: real.length };
}

// How the flow card behaved while the meeting was "recorded": its topic
// changes at the end against the reference (as for the record), how often it
// took back a change older than three minutes, and how long after a real
// topic change it first drew one within a minute of it.
const OLD_CHANGE_MS = 3 * 60_000;

function liveBehaviour(conversation, wordReference, live) {
  const reference = [];
  let word = 0;
  for (const utterance of conversation.utterances) {
    reference.push(wordReference[word]);
    word += utterance.refTop.length;
  }
  const real = [];
  conversation.utterances.forEach((utterance, index) => {
    if (index && reference[index] !== reference[index - 1]) real.push(utterance.at);
  });
  let takenBack = 0;
  const lags = [];
  const found = new Set();
  live.forEach((step, index) => {
    const before = index ? live[index - 1].changes : new Map();
    for (const [id, at] of before) {
      if (!step.changes.has(id) && step.at - at > OLD_CHANGE_MS) takenBack += 1;
    }
    real.forEach((at, which) => {
      if (found.has(which)) return;
      for (const drawn of step.changes.values()) {
        if (Math.abs(drawn - at) <= BOUNDARY_TOLERANCE_MS) {
          found.add(which);
          lags.push(Math.max(0, step.at - at));
          break;
        }
      }
    });
  });
  const last = live.at(-1).changes;
  const drawn = [...last.values()];
  const used = new Set();
  let hits = 0;
  for (const at of drawn) {
    const match = real.findIndex(
      (other, index) => !used.has(index) && Math.abs(other - at) <= BOUNDARY_TOLERANCE_MS
    );
    if (match >= 0) {
      used.add(match);
      hits += 1;
    }
  }
  const minutes = (conversation.utterances.at(-1).at - conversation.utterances[0].at) / 60_000 || 1;
  return {
    hits,
    drawn: drawn.length,
    real: real.length,
    takenBackPerHour: (takenBack / minutes) * 60,
    lags,
  };
}

function evenLabels(n, parts) {
  return Array.from({ length: n }, (_, index) =>
    Math.min(parts - 1, Math.floor((index * parts) / n))
  );
}

// ---------------------------------------------------------------------------
// Label checks. These lists are the benchmark's own, kept apart from the
// tracker's, so a tracker cannot pass by sharing its stopwords with the test.

const FUNCTION_WORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being
  below between both but by can could did do does doing down during each few for from further had
  has have having he her here hers herself him himself his how i if in into is it its itself me
  more most my myself no nor not of off on once only or other our ours ourselves out over own same
  she should so some such than that the their theirs them themselves then there these they this
  those through to too under until up very was we were what when where which while who whom why
  will with would you your yours yourself yourselves also just even still really very much many
  lot lots get got gets getting go goes going went gone make makes made making take took say said
  says think thought know knew want wanted need needed see saw look looking come came coming put
  let lets like maybe one ones thing things something anything nothing everything someone way kind
  sort bit yes no not now then well`.split(/\s+/)
);
const FILLERS = new Set(
  `um uh uhm umm erm er ah oh eh hm hmm mm mmm mhm mm-hmm uh-huh huh yeah yep yup yea ya okay ok
  alright right sure cool nice wow hey hi hello bye thanks thank please sorry basically actually
  literally obviously probably definitely totally exactly honestly seriously anyway anyways
  whatever stuff guess gonna wanna gotta kinda sorta wait mean guys`.split(/\s+/)
);
const FUNCTION_CONTRACTION =
  /^(it|that|there|here|what|who|where|how|he|she|let|this|why|when)'s$|n't$|'(re|ve|ll|d|m)$|'$/;

function labelTokens(label) {
  return String(label || "")
    .toLocaleLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, ""))
    .filter(Boolean);
}

function labelFlaws(label) {
  const tokens = labelTokens(label);
  return {
    stopword: tokens.some((token) => FUNCTION_WORDS.has(token)),
    contraction: tokens.some((token) => FUNCTION_CONTRACTION.test(token)),
    filler: tokens.some((token) => FILLERS.has(token)),
    number: tokens.some((token) => /^\d+([.,]\d+)*%?$/.test(token)),
  };
}

// Words compared as said: case folded, and a possessive "'s" taken off, so
// "the company's roadmap" says "company".
function saidTokens(text) {
  return labelTokens(text).map((token) => token.replace(/'s$/, ""));
}

function saidInTopic(label, text) {
  const tokens = saidTokens(label);
  if (!tokens.length) return false;
  return ` ${saidTokens(text).join(" ")} `.includes(` ${tokens.join(" ")} `);
}

// ---------------------------------------------------------------------------
// The judge (AMI only)

const JUDGE_VERSION = 2;
const JUDGE_CACHE = path.join(os.homedir(), ".cache", "oats", "topic-eval", "judge-cache.json");
let judgeCache = null;

function loadJudgeCache() {
  if (judgeCache) return judgeCache;
  try {
    judgeCache = JSON.parse(fs.readFileSync(JUDGE_CACHE, "utf8"));
  } catch {
    judgeCache = {};
  }
  return judgeCache;
}

function saveJudgeCache() {
  fs.mkdirSync(path.dirname(JUDGE_CACHE), { recursive: true });
  fs.writeFileSync(JUDGE_CACHE, JSON.stringify(judgeCache));
}

function judgeKey(model, item) {
  return crypto
    .createHash("sha1")
    .update(`${JUDGE_VERSION}\n${model}\n${item.description}\n${item.excerpt}\n${item.label}`)
    .digest("hex");
}

const JUDGE_PROMPT = `You rate short topic labels that a note-taking app shows for parts of a meeting.
Each item gives the description a human annotator wrote for that part of the meeting, a few sentences said in it, and the label (one to three words) the app shows for it.
The description often names an agenda item ("industrial designer presentation", "discussion"), while a good label may name the subject actually discussed in it ("battery", "button layout"). Both are fine.
Rate how well the label tells a reader what that part of the meeting was about:
5 = names its subject (synonyms and narrower wording are fine)
4 = names something central to it, and is informative
3 = related but vague, generic, or about a side detail
2 = barely related
1 = unrelated, or filler and function words that name nothing
Judge meaning, not wording. Return JSON: {"ratings": [{"i": <item number>, "score": <1 to 5>}]}`;

async function judgeRatings(items, model) {
  const cache = loadJudgeCache();
  const missing = items.filter((item) => cache[judgeKey(model, item)] == null);
  const key = process.env.OPENAI_API_KEY;
  for (let start = 0; start < missing.length && key; start += 25) {
    const batch = missing.slice(start, start + 25);
    const body = {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: JUDGE_PROMPT },
        {
          role: "user",
          content: batch
            .map(
              (item, index) =>
                `${index + 1}. Description: ${item.description}\n   Said: ${item.excerpt}\n   Label: ${item.label}`
            )
            .join("\n"),
        },
      ],
    };
    let parsed = null;
    for (let attempt = 0; attempt < 3 && !parsed; attempt += 1) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`judge HTTP ${response.status}`);
        const json = await response.json();
        parsed = JSON.parse(json.choices[0].message.content);
      } catch (error) {
        if (attempt === 2) console.error(`judge failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    for (const rating of parsed?.ratings ?? []) {
      const item = batch[Number(rating.i) - 1];
      const score = Number(rating.score);
      if (item && score >= 1 && score <= 5) cache[judgeKey(model, item)] = score;
    }
    saveJudgeCache();
  }
  return items.map((item) => cache[judgeKey(model, item)] ?? null);
}

// A few of a topic's sentences for the judge: its longest turns, in the order
// said, up to about 80 words. Chosen without looking at the label.
function excerptOf(texts) {
  const ranked = texts
    .map((text, index) => ({ text: text.trim(), index, words: text.split(/\s+/).length }))
    .filter((item) => item.text)
    .sort((a, b) => b.words - a.words || a.index - b.index);
  const picked = [];
  let words = 0;
  for (const item of ranked) {
    if (words >= 80) break;
    const take = item.text.split(/\s+/).slice(0, 40).join(" ");
    picked.push({ ...item, text: take });
    words += Math.min(40, item.words);
  }
  return picked
    .sort((a, b) => a.index - b.index)
    .map((item) => `"${item.text}"`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Scoring one conversation

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function scoreConversation(conversation, snapshot, { fine, live = null }) {
  const perUtterance = assignment(conversation, snapshot);
  const textOf = new Map(
    conversation.utterances.map((utterance) => [utterance.id, utterance.text])
  );
  const nodes = snapshot.nodes.map((node) => {
    const text = node.utteranceIds.map((id) => textOf.get(String(id)) ?? "").join(" ");
    return { node, text, flaws: labelFlaws(node.label), said: saidInTopic(node.label, text) };
  });
  const labelCounts = new Map();
  for (const { node } of nodes) labelCounts.set(node.label, (labelCounts.get(node.label) ?? 0) + 1);

  const result = {
    id: conversation.id,
    source: conversation.source,
    split: conversation.split ?? null,
    utterances: conversation.utterances.length,
    nodes: snapshot.nodes.length,
    runs: segmentCount(perUtterance),
    returns: snapshot.edges.filter((edge) => edge.kind === "return").length,
    labels: nodes.map(({ node, flaws, said }) => ({
      id: node.id,
      label: node.label,
      utterances: node.utteranceIds.length,
      flawed: flaws.stopword || flaws.contraction || flaws.filler || flaws.number,
      flaws,
      said,
      duplicate: labelCounts.get(node.label) > 1,
    })),
  };

  if (conversation.source === "ami") {
    const refKey = fine ? "refFine" : "refTop";
    // An utterance takes the topic most of its words are in. Word by word,
    // overlapping speech flips between two topics at every boundary and makes
    // dozens of one-word reference segments that no annotator meant; by
    // utterance, a meeting has as many segments as top-level topics.
    const reference = conversation.utterances.flatMap((utterance) => {
      const topic = mostCommon(utterance[refKey]);
      return utterance[refKey].map(() => topic);
    });
    const hypothesis = conversation.utterances.flatMap((utterance, index) =>
      utterance[refKey].map(() => perUtterance[index])
    );
    const refSegments = segmentCount(reference);
    result.words = reference.length;
    result.refSegments = refSegments;
    result.refTopics = new Set(
      reference.map((id) => topicDescription(conversation.topics.get(id) ?? {}))
    ).size;
    Object.assign(result, pkWindowDiff(reference, hypothesis));
    result.boundaries = boundaryMatches(conversation, reference, perUtterance);
    if (live?.length) result.live = liveBehaviour(conversation, reference, live);
    const one = pkWindowDiff(reference, new Array(reference.length).fill(0));
    const even = pkWindowDiff(reference, evenLabels(reference.length, refSegments));
    result.baselines = {
      oneTopic: { pk: one.pk, windowDiff: one.windowDiff },
      even: { pk: even.pk, windowDiff: even.windowDiff },
    };
    // What each label names: the reference topic most of its words were in.
    const utteranceById = new Map(
      conversation.utterances.map((utterance) => [utterance.id, utterance])
    );
    for (const label of result.labels) {
      const node = snapshot.nodes.find((candidate) => candidate.id === label.id);
      const tops = node.utteranceIds.flatMap((id) => utteranceById.get(String(id))?.refTop ?? []);
      const fines = node.utteranceIds.flatMap((id) => utteranceById.get(String(id))?.refFine ?? []);
      const top = conversation.topics.get(mostCommon(tops));
      const fineTopic = conversation.topics.get(mostCommon(fines));
      const topText = top ? topicDescription(top) : "other";
      const fineText = fineTopic && fineTopic !== top ? topicDescription(fineTopic) : "";
      label.description =
        fineText && fineText !== topText ? `${topText} (sub-topic: ${fineText})` : topText;
      label.words = tops.length;
      label.excerpt = excerptOf(
        node.utteranceIds.map((id) => utteranceById.get(String(id))?.text ?? "")
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Aggregation and printing

const mean = (values) => {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
};
const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : Number.NaN;
};
const fmt = (value, digits = 3) => (value == null ? "n/a" : value.toFixed(digits));
const pct = (value) => (value == null ? "n/a" : `${(value * 100).toFixed(0)}%`);

function aggregate(results) {
  const labels = results.flatMap((result) => result.labels);
  const judged = labels.filter((label) => Number.isFinite(label.judge));
  const weight = judged.reduce((sum, label) => sum + (label.words || 1), 0);
  const ami = results.filter((result) => result.source === "ami");
  return {
    conversations: results.length,
    pk: mean(ami.map((result) => result.pk)),
    windowDiff: mean(ami.map((result) => result.windowDiff)),
    oneTopicPk: mean(ami.map((result) => result.baselines.oneTopic.pk)),
    oneTopicWd: mean(ami.map((result) => result.baselines.oneTopic.windowDiff)),
    evenPk: mean(ami.map((result) => result.baselines.even.pk)),
    evenWd: mean(ami.map((result) => result.baselines.even.windowDiff)),
    nodes: mean(results.map((result) => result.nodes)),
    runs: mean(results.map((result) => result.runs)),
    returns: mean(results.map((result) => result.returns)),
    refSegments: mean(ami.map((result) => result.refSegments)),
    refTopics: mean(ami.map((result) => result.refTopics)),
    countError: mean(ami.map((result) => Math.abs(result.nodes - result.refTopics))),
    boundaryPrecision:
      ami.reduce((sum, result) => sum + result.boundaries.hits, 0) /
      Math.max(
        1,
        ami.reduce((sum, result) => sum + result.boundaries.drawn, 0)
      ),
    boundaryRecall:
      ami.reduce((sum, result) => sum + result.boundaries.hits, 0) /
      Math.max(
        1,
        ami.reduce((sum, result) => sum + result.boundaries.real, 0)
      ),
    runError: mean(ami.map((result) => Math.abs(result.runs - result.refSegments))),
    livePrecision:
      ami.reduce((sum, result) => sum + (result.live?.hits ?? 0), 0) /
      Math.max(
        1,
        ami.reduce((sum, result) => sum + (result.live?.drawn ?? 0), 0)
      ),
    liveRecall:
      ami.reduce((sum, result) => sum + (result.live?.hits ?? 0), 0) /
      Math.max(
        1,
        ami.reduce((sum, result) => sum + (result.live?.real ?? 0), 0)
      ),
    liveTakenBack: mean(ami.map((result) => result.live?.takenBackPerHour)),
    liveFound:
      ami.reduce((sum, result) => sum + (result.live?.lags.length ?? 0), 0) /
      Math.max(
        1,
        ami.reduce((sum, result) => sum + (result.live?.real ?? 0), 0)
      ),
    liveLagMinutes: median(ami.flatMap((result) => result.live?.lags ?? [])) / 60_000,
    labels: labels.length,
    flawed: mean(labels.map((label) => (label.flawed ? 1 : 0))),
    stopword: mean(labels.map((label) => (label.flaws.stopword ? 1 : 0))),
    contraction: mean(labels.map((label) => (label.flaws.contraction ? 1 : 0))),
    filler: mean(labels.map((label) => (label.flaws.filler ? 1 : 0))),
    number: mean(labels.map((label) => (label.flaws.number ? 1 : 0))),
    said: mean(labels.map((label) => (label.said ? 1 : 0))),
    duplicate: mean(labels.map((label) => (label.duplicate ? 1 : 0))),
    judge: judged.length ? mean(judged.map((label) => label.judge)) : null,
    judgeWeighted: judged.length
      ? judged.reduce((sum, label) => sum + label.judge * (label.words || 1), 0) / weight
      : null,
    judgeGood: judged.length ? mean(judged.map((label) => (label.judge >= 4 ? 1 : 0))) : null,
    perUtteranceMs: mean(results.map((result) => result.timing?.perUtteranceMs)),
    worstMs: Math.max(0, ...results.map((result) => result.timing?.worstMs ?? 0)),
  };
}

function printAggregate(name, group, summary) {
  const lines = [
    `## ${name}: ${group} (${summary.conversations} conversations, ${summary.labels} labels)`,
  ];
  if (summary.pk != null) {
    lines.push(
      `Pk ${fmt(summary.pk)}  WindowDiff ${fmt(summary.windowDiff)}   ` +
        `(one topic: ${fmt(summary.oneTopicPk)} / ${fmt(summary.oneTopicWd)}, ` +
        `even cut at the reference count: ${fmt(summary.evenPk)} / ${fmt(summary.evenWd)})`
    );
    lines.push(
      `topic changes within a minute of a real one: precision ${pct(summary.boundaryPrecision)}, ` +
        `recall ${pct(summary.boundaryRecall)}`
    );
    lines.push(
      `live: precision ${pct(summary.livePrecision)}, recall ${pct(summary.liveRecall)}, ` +
        `changes older than 3 min taken back ${fmt(summary.liveTakenBack, 1)} an hour, ` +
        `real changes drawn ${pct(summary.liveFound)} after a median ${fmt(summary.liveLagMinutes, 1)} min`
    );
    lines.push(
      `topics ${fmt(summary.nodes, 1)} (reference ${fmt(summary.refTopics, 1)} distinct, ` +
        `|error| ${fmt(summary.countError, 1)})  runs ${fmt(summary.runs, 1)} ` +
        `(reference ${fmt(summary.refSegments, 1)} segments, |error| ${fmt(summary.runError, 1)})  ` +
        `returns ${fmt(summary.returns, 1)}`
    );
  } else {
    lines.push(
      `topics ${fmt(summary.nodes, 1)}  runs ${fmt(summary.runs, 1)}  returns ${fmt(summary.returns, 1)}`
    );
  }
  lines.push(
    `labels flawed ${pct(summary.flawed)} (stopword ${pct(summary.stopword)}, contraction ` +
      `${pct(summary.contraction)}, filler ${pct(summary.filler)}, number ${pct(summary.number)})  ` +
      `said ${pct(summary.said)}  repeated ${pct(summary.duplicate)}`
  );
  if (summary.judge != null) {
    lines.push(
      `judge ${fmt(summary.judge, 2)} / 5 (word-weighted ${fmt(summary.judgeWeighted, 2)}, ` +
        `rated 4 or 5: ${pct(summary.judgeGood)})`
    );
  }
  lines.push(
    `time per utterance ${fmt(summary.perUtteranceMs, 2)} ms (worst single utterance ${fmt(summary.worstMs, 1)} ms)`
  );
  console.log(lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sentence vectors (--vectors): all-MiniLM-L6-v2 through onnxruntime-node,
// tokenized, pooled and normalized as src/workers/onnxWorker.js does it.

const VECTOR_CACHE = path.join(os.homedir(), ".cache", "oats", "topic-eval", "vectors");

async function createEmbedder(modelDir) {
  const require = createRequire(path.join(ROOT, "package.json"));
  const ort = require("onnxruntime-node");
  const candidates = [
    modelDir,
    path.join(ROOT, "resources", "bin", "all-MiniLM-L6-v2"),
    path.join(os.homedir(), ".cache", "oats", "embedding-models", "all-MiniLM-L6-v2"),
  ].filter(Boolean);
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, "model.onnx")));
  if (!dir) throw new Error("all-MiniLM-L6-v2 not found: run node scripts/download-minilm.js");
  const vocab = new Map(
    Object.entries(
      JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf8")).model.vocab
    )
  );
  const session = await ort.InferenceSession.create(path.join(dir, "model.onnx"), {
    intraOpNumThreads: 4,
    executionMode: "sequential",
  });
  const MAX = 256;
  const tokenize = (text) => {
    const ids = [vocab.get("[CLS]") ?? 101];
    for (const word of text.toLowerCase().match(/[a-z0-9]+|[^\s\w]/g) || []) {
      if (ids.length >= MAX - 1) break;
      if (vocab.has(word)) {
        ids.push(vocab.get(word));
        continue;
      }
      let start = 0;
      while (start < word.length && ids.length < MAX - 1) {
        let end = word.length;
        let piece = null;
        while (end > start) {
          const candidate = start === 0 ? word.slice(start, end) : `##${word.slice(start, end)}`;
          if (vocab.has(candidate)) {
            piece = vocab.get(candidate);
            break;
          }
          end -= 1;
        }
        if (piece == null) {
          ids.push(vocab.get("[UNK]") ?? 100);
          start += 1;
        } else {
          ids.push(piece);
          start = end;
        }
      }
    }
    ids.push(vocab.get("[SEP]") ?? 102);
    return ids;
  };
  const embedOne = async (text) => {
    const ids = tokenize(text);
    const n = ids.length;
    const out = await session.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
      token_type_ids: new ort.Tensor("int64", new BigInt64Array(n), [1, n]),
    });
    const data = (out.last_hidden_state ?? out.output_0).data;
    const dimension = data.length / n;
    const vector = new Float32Array(dimension);
    for (let token = 0; token < n; token += 1) {
      for (let index = 0; index < dimension; index += 1)
        vector[index] += data[token * dimension + index] / n;
    }
    return vector;
  };
  fs.mkdirSync(VECTOR_CACHE, { recursive: true });
  return {
    async embed(texts) {
      const vectors = [];
      for (const text of texts) {
        const file = path.join(
          VECTOR_CACHE,
          `${crypto.createHash("sha1").update(text).digest("hex")}.bin`
        );
        if (fs.existsSync(file)) {
          const buffer = fs.readFileSync(file);
          vectors.push(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
          continue;
        }
        const vector = await embedOne(text);
        fs.writeFileSync(file, Buffer.from(vector.buffer));
        vectors.push(vector);
      }
      return vectors;
    },
  };
}

async function main() {
  const conversations = [];
  if (args.ami) {
    // The corpus folder or its annotations folder.
    const dir = fs.existsSync(path.join(args.ami, "annotations", "topics"))
      ? path.join(args.ami, "annotations")
      : args.ami;
    const names = topicNames(dir);
    let ids = amiMeetingIds(dir);
    if (args.meetings) {
      const wanted = new Set(args.meetings.split(",").map((id) => id.trim()));
      ids = ids.filter((id) => wanted.has(id));
    }
    for (const id of ids) {
      const meeting = loadAmiMeeting(dir, id, names);
      if (!args.meetings && args.split !== "all" && meeting.split !== args.split) continue;
      if (meeting.utterances.length) conversations.push(meeting);
    }
  }
  if (args.demo) conversations.push(...demoConversations());
  for (const file of args.transcript) {
    conversations.push(
      storedConversation(path.basename(file), JSON.parse(fs.readFileSync(file, "utf8")), {
        source: "transcript",
        private: !args["show-labels"],
      })
    );
  }
  if (!conversations.length) {
    console.error("Nothing to score: pass --ami DIR, --demo or --transcript FILE.");
    process.exit(2);
  }

  const name = args.name || path.relative(ROOT, path.resolve(args.tracker));
  const module = await loadTracker(args.tracker);
  const embedder = args.vectors ? await createEmbedder(args["model-dir"]) : null;
  const results = [];
  for (const conversation of conversations) {
    const { snapshot, live, timing } = await replay(module, conversation, { embedder });
    const result = scoreConversation(conversation, snapshot, { fine: args.fine, live });
    result.timing = timing;
    result.private = !!conversation.private;
    results.push(result);
  }

  if (args.judge) {
    const items = results
      .filter((result) => result.source === "ami")
      .flatMap((result) => result.labels.map((label) => ({ label, result })));
    const ratings = await judgeRatings(
      items.map(({ label }) => ({
        description: label.description,
        excerpt: label.excerpt,
        label: label.label,
      })),
      args["judge-model"]
    );
    items.forEach(({ label }, index) => {
      label.judge = ratings[index];
    });
  }

  const groups = new Map();
  for (const result of results) {
    const key = result.source === "ami" ? `AMI ${result.split}` : result.source;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  const summaries = {};
  for (const [group, list] of groups) {
    summaries[group] = aggregate(list);
    printAggregate(name, group, summaries[group]);
  }

  if (!args.quiet) {
    for (const result of results) {
      if (result.private) continue;
      const scores =
        result.source === "ami"
          ? ` Pk ${fmt(result.pk)} WD ${fmt(result.windowDiff)} ref ${result.refSegments}`
          : "";
      console.log(`${result.id}${scores} topics ${result.nodes} runs ${result.runs}`);
      for (const label of result.labels) {
        const marks = [
          label.flawed ? "flawed" : "",
          label.said ? "" : "unsaid",
          label.duplicate ? "repeated" : "",
        ]
          .filter(Boolean)
          .join(",");
        const judge = Number.isFinite(label.judge) ? ` judge ${label.judge}` : "";
        const about = label.description ? `  [${label.description}]` : "";
        console.log(
          `   ${String(label.utterances).padStart(4)}  ${label.label}${marks ? ` (${marks})` : ""}${judge}${about}`
        );
      }
    }
  }

  if (args.json) {
    const safe = results.map((result) =>
      result.private
        ? {
            ...result,
            labels: result.labels.map(({ label: _label, description: _d, ...rest }) => rest),
          }
        : result
    );
    fs.writeFileSync(args.json, JSON.stringify({ name, summaries, results: safe }, null, 2));
  }
}

export {
  aggregate,
  amiMeetingIds,
  assignment,
  createEmbedder,
  demoConversations,
  judgeRatings,
  labelFlaws,
  loadAmiMeeting,
  pkWindowDiff,
  replay,
  saidInTopic,
  scoreConversation,
  storedConversation,
  topicNames,
};

if (isMain) await main();
