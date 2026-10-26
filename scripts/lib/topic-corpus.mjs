// Conversations to replay through topic trackers, and the scores against the
// AMI meeting corpus' human topic segmentation (CC BY 4.0, manual annotations
// 1.6.2). The AMI reading, the per-utterance reference and Pk / WindowDiff are
// the topic benchmark's (`scripts/topic-eval.mjs` in #123), kept the same so the
// numbers compare; the far-field recognition output and the human segments for
// the name judge are added here.
//
// A conversation is `{ id, source, utterances, topics?, words? }`. An utterance
// is `{ id, text, start, end, at, refTop?, refFine? }`: start and end in
// seconds of the recording, `at` the moment the app would have the finalized
// text (milliseconds on the replay clock), and per word of `text` the reference
// topic ids.

import fs from "node:fs";
import path from "node:path";

import { topicExcerpt } from "../../src/helpers/topicNaming.mjs";

export const AMI_TEST = ["ES2004", "IS1009", "TS3003"];
const PAUSE_S = 0.4;
const MAX_UTTERANCE_S = 20;
/** What a finalized segment waits for its text after the speech ends, on the replay clock. */
export const FINAL_DELAY_MS = 500;

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

export function annotationsDir(ami) {
  return fs.existsSync(path.join(ami, "annotations", "topics"))
    ? path.join(ami, "annotations")
    : ami;
}

export function topicNames(dir) {
  const file = path.join(dir, "ontologies", "default-topics.xml");
  const names = new Map();
  if (!fs.existsSync(file)) return names;
  for (const match of fs.readFileSync(file, "latin1").matchAll(/<topicname\b([^>]*)>/g)) {
    const attrs = attributes(match[1]);
    if (attrs["nite:id"]) names.set(attrs["nite:id"], attrs.name);
  }
  return names;
}

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

export function topicDescription(topic) {
  return (topic?.description || topic?.type || "other").trim();
}

/** The words a room hears, in time order, each with its top-level and finest reference topic. */
export function loadAmiWords(dir, meeting, names) {
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
  let carry = words.find((word) => word.top)?.top ?? null;
  let carryFine = words.find((word) => word.fine)?.fine ?? null;
  for (const word of words) {
    if (word.top) carry = word.top;
    else word.top = carry;
    if (word.fine) carryFine = word.fine;
    else word.fine = carryFine;
  }
  return { words, topics };
}

/** An AMI meeting from its manual transcript, cut at pauses as the segmenter cuts a room. */
export function amiReference(dir, meeting, names) {
  const { words, topics } = loadAmiWords(dir, meeting, names);
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
    words,
    utterances: utterances.map((utterance, index) => {
      const end = Math.max(...utterance.words.map((word) => word.end));
      return {
        id: `${meeting}-${index + 1}`,
        text: utterance.words.map((word) => word.text).join(" "),
        start: utterance.start,
        end,
        at: Math.round(end * 1000) + FINAL_DELAY_MS,
        refTop: utterance.words.map((word) => word.top),
        refFine: utterance.words.map((word) => word.fine),
      };
    }),
  };
}

/**
 * An AMI meeting as the app transcribed it from the far-field microphone
 * (`scripts/room-replay.js`, #122): one utterance per segment with text, and
 * for each of its words the reference topic of the reference words said in the
 * segment's time (the nearest reference word when none was).
 */
export function amiRecognized(dir, meeting, names, segments) {
  const { words, topics } = loadAmiWords(dir, meeting, names);
  const mids = words.map((word) => (word.start + word.end) / 2);
  const nearest = (time) => {
    let lo = 0;
    let hi = mids.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mids[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(mids[lo - 1] - time) < Math.abs(mids[lo] - time)) lo -= 1;
    return words[lo];
  };
  const utterances = [];
  for (const segment of segments) {
    const text = String(segment.text ?? "").trim();
    if (!text) continue;
    const inside = words.filter(
      (word, index) => mids[index] >= segment.start && mids[index] <= segment.end
    );
    const top =
      mostCommon(inside.map((word) => word.top)) ?? nearest((segment.start + segment.end) / 2)?.top;
    const fine =
      mostCommon(inside.map((word) => word.fine)) ??
      nearest((segment.start + segment.end) / 2)?.fine;
    const count = text.split(/\s+/).filter(Boolean).length;
    utterances.push({
      id: `${meeting}-s${segment.index ?? utterances.length}`,
      text,
      start: segment.start,
      end: segment.end,
      at: Math.round(segment.end * 1000) + FINAL_DELAY_MS,
      refTop: new Array(count).fill(top ?? null),
      refFine: new Array(count).fill(fine ?? null),
    });
  }
  return { id: meeting, source: "ami-asr", split: "test", topics, words, utterances };
}

/** A stored note's segments (the app's transcript JSON). No reference. */
export function storedTranscript(id, value) {
  const segments = (
    Array.isArray(value) ? value : (value?.segments ?? value?.transcript ?? [])
  ).filter((segment) => String(segment?.text ?? "").trim());
  const first = segments.find((segment) => Number.isFinite(segment.timestamp))?.timestamp ?? 0;
  return {
    id,
    source: "stored",
    private: true,
    utterances: segments.map((segment, index) => {
      const endMs = Number.isFinite(segment.endMs)
        ? segment.endMs
        : Number.isFinite(segment.timestamp)
          ? segment.timestamp - first
          : index * 5000;
      const startMs = Number.isFinite(segment.startMs) ? segment.startMs : endMs - 3000;
      return {
        id: String(segment.id ?? `u${index + 1}`),
        text: String(segment.text),
        start: startMs / 1000,
        end: endMs / 1000,
        at: endMs + FINAL_DELAY_MS,
      };
    }),
  };
}

export function amiMeetingIds(dir) {
  const withWords = new Set(
    fs.readdirSync(path.join(dir, "words")).map((file) => file.split(".")[0])
  );
  return fs
    .readdirSync(path.join(dir, "topics"))
    .filter((file) => file.endsWith(".topic.xml"))
    .map((file) => file.replace(/\.topic\.xml$/, ""))
    .filter((meeting) => withWords.has(meeting))
    .sort();
}

export function mostCommon(values) {
  const counts = new Map();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// --- Scores.

export function boundariesOf(labels) {
  const out = new Uint8Array(labels.length);
  for (let index = 1; index < labels.length; index += 1) {
    out[index] = labels[index] !== labels[index - 1] ? 1 : 0;
  }
  return out;
}

export function segmentCount(labels) {
  let count = labels.length ? 1 : 0;
  for (let index = 1; index < labels.length; index += 1)
    if (labels[index] !== labels[index - 1]) count += 1;
  return count;
}

/** Pk (Beeferman et al., 1999) and WindowDiff (Pevzner and Hearst, 2002) over one label per word. */
export function pkWindowDiff(reference, hypothesis) {
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
    const refBetween = refPrefix[index + k + 1] - refPrefix[index + 1];
    const hypBetween = hypPrefix[index + k + 1] - hypPrefix[index + 1];
    if (refBetween > 0 !== hypBetween > 0) pkErrors += 1;
    if (refBetween !== hypBetween) wdErrors += 1;
  }
  return { pk: pkErrors / (n - k), windowDiff: wdErrors / (n - k), k };
}

/** Each utterance's reference topic: the one most of its words are in (`fine`: the innermost sub-topic). */
export function referenceLabels(conversation, { fine = false } = {}) {
  return conversation.utterances.map((utterance) =>
    mostCommon((fine ? utterance.refFine : utterance.refTop) ?? [])
  );
}

/**
 * Every utterance's topic in a snapshot. An utterance no topic holds belongs to
 * the topic before it (the lanes draw it so), or the first topic.
 */
export function assignmentOf(conversation, nodes) {
  const topicOf = new Map();
  for (const node of nodes)
    for (const id of node.utteranceIds ?? []) topicOf.set(String(id), node.id);
  const labels = conversation.utterances.map(
    (utterance) => topicOf.get(String(utterance.id)) ?? null
  );
  let carry = labels.find((label) => label != null) ?? 0;
  return labels.map((label) => {
    if (label != null) carry = label;
    return carry;
  });
}

const BOUNDARY_TOLERANCE_MS = 60_000;

/**
 * Segmentation scores of one assignment (a topic per utterance) against the
 * reference: AMI's top-level topics, and (`fine`) the finest level, where a
 * long "discussion" is cut into the sub-topics it covered.
 */
export function segmentationScores(conversation, perUtterance) {
  const top = segmentationAgainst(conversation, perUtterance, referenceLabels(conversation));
  const fine = segmentationAgainst(
    conversation,
    perUtterance,
    referenceLabels(conversation, { fine: true })
  );
  return {
    ...top,
    fine: {
      pk: fine.pk,
      windowDiff: fine.windowDiff,
      refRuns: fine.refRuns,
      oneTopic: fine.oneTopic,
    },
  };
}

function segmentationAgainst(conversation, perUtterance, refUtterance) {
  const reference = [];
  const hypothesis = [];
  conversation.utterances.forEach((utterance, index) => {
    for (let word = 0; word < (utterance.refTop?.length ?? 0); word += 1) {
      reference.push(refUtterance[index]);
      hypothesis.push(perUtterance[index]);
    }
  });
  const scores = pkWindowDiff(reference, hypothesis);
  const times = conversation.utterances.map((utterance) => utterance.start * 1000);
  const changes = (labels) =>
    labels.flatMap((label, index) => (index && label !== labels[index - 1] ? [times[index]] : []));
  const drawn = changes(perUtterance);
  const real = changes(refUtterance);
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
  const one = pkWindowDiff(reference, new Array(reference.length).fill(0));
  return {
    pk: scores.pk,
    windowDiff: scores.windowDiff,
    k: scores.k,
    words: reference.length,
    topics: new Set(perUtterance).size,
    runs: segmentCount(perUtterance),
    refRuns: segmentCount(refUtterance),
    refTopics: new Set(refUtterance.map((id) => topicDescription(conversation.topics?.get(id))))
      .size,
    boundaryHits: hits,
    boundaryDrawn: drawn.length,
    boundaryReal: real.length,
    oneTopic: { pk: one.pk, windowDiff: one.windowDiff },
  };
}

/**
 * The human topic segments of a meeting: runs of utterances with one reference
 * top-level topic, with the annotators' description and the share of each
 * sub-topic, for the name judge.
 */
export function humanSegments(conversation, { minWords = 40 } = {}) {
  const ref = referenceLabels(conversation);
  const runs = [];
  conversation.utterances.forEach((utterance, index) => {
    const last = runs.at(-1);
    if (last && last.top === ref[index]) last.to = index;
    else runs.push({ top: ref[index], from: index, to: index });
  });
  return runs
    .map((run, order) => {
      const utterances = conversation.utterances.slice(run.from, run.to + 1);
      const words = utterances.reduce(
        (total, utterance) => total + utterance.text.split(/\s+/).length,
        0
      );
      const top = conversation.topics?.get(run.top);
      const fines = new Map();
      for (const utterance of utterances) {
        for (const fine of utterance.refFine ?? []) {
          if (fine && fine !== run.top) fines.set(fine, (fines.get(fine) ?? 0) + 1);
        }
      }
      const total = [...fines.values()].reduce((sum, count) => sum + count, 0);
      const subtopics = [...fines.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => ({
          label: topicDescription(conversation.topics?.get(id)),
          share: total ? count / total : 0,
        }))
        .filter((item) => item.share >= 0.15);
      return {
        key: `${conversation.id}#${order}`,
        order,
        from: run.from,
        to: run.to,
        words,
        start: utterances[0].start,
        end: utterances.at(-1).end,
        label: topicDescription(top),
        subtopics,
        utteranceIds: utterances.map((utterance) => utterance.id),
      };
    })
    .filter((segment) => segment.words >= minWords);
}

/**
 * What the judge reads of a human segment: the reference words said in its
 * time (the manual transcript, also for a recognized meeting), cut at pauses,
 * then the app's own excerpt rule (`topicExcerpt`) within `budget` characters.
 */
export function segmentExcerpt(conversation, segment, { budget = 3000 } = {}) {
  const words = (conversation.words ?? []).filter(
    (word) => word.start >= segment.start - 0.25 && word.start <= segment.end + 0.25
  );
  const turns = [];
  let current = null;
  let lastEnd = -Infinity;
  for (const word of words) {
    if (!current || word.start - lastEnd >= PAUSE_S || word.end - current.start > MAX_UTTERANCE_S) {
      current = { start: word.start, text: "" };
      turns.push(current);
    }
    current.text = current.text ? `${current.text} ${word.text}` : word.text;
    lastEnd = Math.max(lastEnd, word.end);
  }
  return topicExcerpt(
    turns.map((turn) => turn.text),
    { budget }
  );
}
