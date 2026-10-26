// Topic tracking with a fast model in the loop: the experimental variants of
// `scripts/topic-loop-eval.mjs`.
//
//   V2 "turns"   every few seconds, the model places the new lines: the current
//                topic, an earlier one (a return), or a new one it names.
//   V3 "window"  every 45 s or so, the model re-cuts the last few minutes and
//                names what it finds, reconciled with what is shown (stable ids).
//   V4 "hybrid"  the on-device tracker proposes changes of subject cheaply; the
//                model confirms, places and names them, and checks a topic that
//                ran long without a proposal.
//   VF "finish"  at Finish, the model cuts and names the whole record at once.
//
// Each is written like `helpers/topicNamer.mjs`: the model is behind `ask`, the
// clock behind `now`, `setTimer` and `clearTimer`, so the replay drives it on a
// virtual clock. `snapshot()` has the tracker's node shape
// (`{ id, label, utteranceIds, firstAt, lastAt, state }`), so the lanes, the
// graph and the scores read it unchanged.

import { parseTopicName, sameName } from "../../src/helpers/topicNaming.mjs";

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

export const countWords = (text) => oneLine(text).split(" ").filter(Boolean).length;

function clip(text, max) {
  const line = oneLine(text);
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const NAME_RULES =
  "A name has 2 to 5 words, says specifically what the part is about (the thing, question, problem or decision), is in sentence case in the language spoken, has no quotation marks, and is not generic (not Discussion, Meeting, Update, Introduction, Small talk).";

/** Shared state of the model-driven variants: topics, and which topic each line is in. */
class TopicBook {
  constructor() {
    /** @type {Map<string, {id: string, name: string, gist: string, namedWords: number, utteranceIds: string[], firstAt: number, lastAt: number, returns: number}>} */
    this.topics = new Map();
    /** @type {Map<string, string>} line id -> topic id */
    this.topicOf = new Map();
    this.lines = [];
    this.byId = new Map();
    this.currentId = null;
    this.nextId = 1;
  }

  addLine(utterance) {
    const line = {
      id: String(utterance.id),
      text: oneLine(utterance.text),
      at: utterance.at,
      words: countWords(utterance.text),
      index: this.lines.length,
    };
    this.lines.push(line);
    this.byId.set(line.id, line);
    return line;
  }

  create(name, gist, at) {
    const id = String(this.nextId++);
    this.topics.set(id, {
      id,
      name,
      gist: oneLine(gist).slice(0, 120),
      namedWords: 0,
      utteranceIds: [],
      firstAt: at,
      lastAt: at,
      returns: 0,
    });
    return id;
  }

  words(id) {
    const topic = this.topics.get(id);
    if (!topic) return 0;
    let total = 0;
    for (const lineId of topic.utteranceIds) total += this.byId.get(lineId)?.words ?? 0;
    return total;
  }

  /** Puts lines in a topic, taking them out of the one they were in. */
  place(lineIds, topicId) {
    const topic = this.topics.get(topicId);
    if (!topic) return;
    for (const lineId of lineIds) {
      const before = this.topicOf.get(lineId);
      if (before === topicId) continue;
      if (before) {
        const old = this.topics.get(before);
        if (old) old.utteranceIds = old.utteranceIds.filter((id) => id !== lineId);
      }
      this.topicOf.set(lineId, topicId);
      topic.utteranceIds.push(lineId);
    }
    topic.utteranceIds.sort((a, b) => this.byId.get(a).index - this.byId.get(b).index);
    const lines = topic.utteranceIds.map((id) => this.byId.get(id));
    topic.firstAt = lines[0]?.at ?? topic.firstAt;
    topic.lastAt = lines.at(-1)?.at ?? topic.lastAt;
  }

  /** The topics as the prompt lists them: the current one and the ones talked about most recently. */
  listed(limit = 10, now = null) {
    const topics = [...this.topics.values()].filter((topic) => topic.utteranceIds.length);
    topics.sort((a, b) => b.lastAt - a.lastAt);
    const picked = topics.slice(0, limit);
    picked.sort((a, b) => Number(a.id) - Number(b.id));
    return picked.map((topic) => {
      const gist = topic.gist ? ` | ${topic.gist}` : "";
      const minutes = Math.max(0, topic.lastAt - topic.firstAt) / 60_000;
      const ago =
        now !== null && topic.id !== this.currentId
          ? `, last ${minutesText((now - topic.lastAt) / 60_000)} ago`
          : "";
      return `${topic.id} | ${topic.name}${gist} | ${minutesText(minutes)}${ago}${topic.id === this.currentId ? " | CURRENT" : ""}`;
    });
  }

  /** How long the current topic has run without a break, in minutes. */
  currentRun() {
    let first = null;
    for (let index = this.lines.length - 1; index >= 0; index -= 1) {
      const line = this.lines[index];
      const topic = this.topicOf.get(line.id);
      if (topic === undefined) continue;
      if (topic !== this.currentId) break;
      first = line.at;
    }
    const last = this.lines.at(-1)?.at ?? first;
    return first === null ? 0 : Math.max(0, last - first) / 60_000;
  }

  snapshot(now, { final = false } = {}) {
    const nodes = [];
    for (const topic of this.topics.values()) {
      if (!topic.utteranceIds.length) continue;
      nodes.push({
        id: topic.id,
        label: topic.name,
        words: [],
        durationMs: Math.max(0, topic.lastAt - topic.firstAt),
        utteranceIds: [...topic.utteranceIds],
        firstAt: topic.firstAt,
        lastAt: topic.lastAt,
        returns: topic.returns,
        state: !final && topic.id === this.currentId ? "live" : "open",
      });
    }
    nodes.sort((a, b) => a.firstAt - b.firstAt);
    const edges = [];
    let previous = null;
    for (const line of this.lines) {
      const topic = this.topicOf.get(line.id);
      if (!topic) continue;
      if (previous && previous !== topic) {
        const existing = edges.find((edge) => edge.from === previous && edge.to === topic);
        if (existing) existing.weight += 1;
        else edges.push({ from: previous, to: topic, weight: 1, kind: "new" });
      }
      previous = topic;
    }
    return { nodes, edges };
  }

  /** A model name checked as the app checks one (`parseTopicName`), or null. */
  checkedName(raw, { except = null, excerpt = [] } = {}) {
    const others = [...this.topics.values()]
      .filter((topic) => topic.id !== except)
      .map((topic) => topic.name);
    return parseTopicName(oneLine(raw), { others, excerpt });
  }

  /** The topic that already has this name, if any: a "new" topic named like an old one is a return. */
  namedLike(raw) {
    for (const topic of this.topics.values()) if (sameName(topic.name, raw)) return topic.id;
    return null;
  }
}

/**
 * Folds runs of lines shorter than `minWords` words into the topic around
 * them: the run before (or, for the first, the one after; or `before`, the
 * topic of the line before these). A model that cuts too finely makes a
 * topic of every aside, and the lanes would flick between topics every few
 * seconds; one that cuts coarsely is not changed. `keepLast` leaves the last
 * run alone: it may be a topic that has only begun.
 *
 * @param {string[]} labels A topic key per line.
 * @param {number[]} weights Words per line.
 * @returns {string[]}
 */
export function smoothRuns(labels, weights, minWords, { before = null, keepLast = false } = {}) {
  const out = [...labels];
  for (let guard = 0; guard < out.length; guard += 1) {
    const runs = [];
    for (let index = 0; index < out.length; index += 1) {
      const last = runs.at(-1);
      if (last && last.label === out[index]) {
        last.to = index;
        last.words += weights[index] ?? 0;
      } else runs.push({ label: out[index], from: index, to: index, words: weights[index] ?? 0 });
    }
    if (runs.length < 2 && !(before && runs[0]?.label !== before)) break;
    let shortest = -1;
    runs.forEach((run, index) => {
      if (keepLast && index === runs.length - 1) return;
      if (run.words >= minWords) return;
      if (index === 0 && runs.length === 1) return;
      if (shortest < 0 || run.words < runs[shortest].words) shortest = index;
    });
    if (shortest < 0) break;
    const run = runs[shortest];
    const previous = shortest > 0 ? runs[shortest - 1].label : before;
    const next = runs[shortest + 1]?.label ?? null;
    const target = previous ?? next;
    if (target === null || target === run.label) break;
    for (let index = run.from; index <= run.to; index += 1) out[index] = target;
  }
  return out;
}

function minutesText(minutes) {
  return minutes < 1 ? "under a minute" : `${Math.round(minutes)} min`;
}

function stats() {
  return {
    calls: 0,
    ok: 0,
    failed: 0,
    malformed: 0,
    ms: [],
    kinds: {},
    renames: 0,
    unusableNames: 0,
  };
}

function recordCall(stats, kind, result, malformed) {
  stats.calls += 1;
  stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;
  if (!result?.ok) stats.failed += 1;
  else if (malformed) stats.malformed += 1;
  else stats.ok += 1;
  if (Number.isFinite(result?.ms)) stats.ms.push(result.ms);
}

// ---------------------------------------------------------------------------
// V2: the model places the new lines every few seconds.

export const TURNS_SYSTEM = [
  "You keep the topic list of a live conversation up to date, a few lines at a time. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "You get TOPICS (id | name | what it covers | how long it ran), CURRENT (the topic the conversation is on and how long it has run), RECENT (the last lines already placed, with their topic id) and NEW (new lines, numbered).",
  "",
  "Place the new lines as segments, in order: each segment has the number of its first line and a topic, and runs until the next segment. The first segment starts at line 1. Most of the time there is one segment, in the current topic. A segment's topic is:",
  '- the current topic\'s id, when the lines continue its subject, answer something in it, or are an aside, a joke, filler or a backchannel ("yeah", "okay");',
  "- an earlier topic's id, when the conversation goes back to that subject;",
  '- "new", when the conversation moves on to a different subject: the next agenda item, another problem, another part of the plan;',
  '- "?", only for the last segment, when its lines may start a new subject but you cannot tell yet. They come back in the next request with what follows.',
  "",
  "A topic usually holds 2 to 10 minutes of talk: one subject, problem, decision or agenda item. A single remark or a short aside is not a topic. When the current topic has run long, check whether the conversation has in fact moved on to something else.",
  "",
  `When you start a topic, give it a name and a gist (one line, at most 12 words, of what it covers). ${NAME_RULES}`,
  'Rename the current topic only when its name no longer fits what it has become; then fill "rename".',
  "",
  'Reply with JSON only: {"segments": [{"from": 1, "topic": "4"}, {"from": 3, "topic": "new"}], "new_topic": {"name": "...", "gist": "..."} or null, "rename": {"name": "...", "gist": "..."} or null}',
].join("\n");

const NAME_AND_GIST = {
  anyOf: [
    {
      type: "object",
      properties: { name: { type: "string" }, gist: { type: "string" } },
      required: ["name", "gist"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
};

export const TURNS_SCHEMA = {
  name: "topic_lines",
  schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "integer" }, topic: { type: "string" } },
          required: ["from", "topic"],
          additionalProperties: false,
        },
      },
      new_topic: NAME_AND_GIST,
      rename: NAME_AND_GIST,
    },
    required: ["segments", "new_topic", "rename"],
    additionalProperties: false,
  },
};

export class TurnsLoop {
  constructor({
    ask,
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
    onChange = () => {},
    batchMs = 12_000,
    batchWords = 30,
    maxWaitMs = 25_000,
    recentLines = 10,
    lineChars = 280,
    renameGrowth = 2,
    minRunWords = 40,
  }) {
    Object.assign(this, { ask, now, setTimer, clearTimer, onChange });
    Object.assign(this, {
      batchMs,
      batchWords,
      maxWaitMs,
      recentLines,
      lineChars,
      renameGrowth,
      minRunWords,
    });
    this.book = new TopicBook();
    this.pending = [];
    this.deferred = new Set();
    this.running = false;
    this.timer = null;
    this.lastCallAt = -Infinity;
    this.stats = stats();
  }

  onUtterance(utterance) {
    const line = this.book.addLine(utterance);
    // The instant answer: the line shows in the topic the room is on until
    // the model places it.
    if (this.book.currentId) this.book.place([line.id], this.book.currentId);
    this.pending.push(line);
    this._schedule();
  }

  _pendingWords() {
    return this.pending.reduce((total, line) => total + line.words, 0);
  }

  _schedule() {
    if (this.running || !this.pending.length) return;
    const now = this.now();
    const oldest = this.pending[0].at;
    let due = Math.max(this.lastCallAt + this.batchMs, now);
    if (this._pendingWords() < this.batchWords) due = Math.max(due, oldest + this.maxWaitMs);
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(
      () => {
        this.timer = null;
        void this._run();
      },
      Math.max(0, due - now)
    );
  }

  _prompt(batch) {
    const book = this.book;
    const placed = book.lines.filter(
      (line) => line.index < batch[0].index && book.topicOf.has(line.id)
    );
    const recent = placed.slice(-this.recentLines);
    const topics = book.listed(10, this.now());
    const current = book.currentId ? book.topics.get(book.currentId) : null;
    const lines = [
      `TOPICS:${topics.length ? "" : " none yet (the first line starts the first topic)"}`,
      ...topics,
      "",
      `CURRENT: ${current ? `${current.id} | ${current.name}, for ${minutesText(book.currentRun())} so far` : "none"}`,
      "",
      "RECENT:",
      ...(recent.length
        ? recent.map((line) => `[${book.topicOf.get(line.id)}] ${clip(line.text, this.lineChars)}`)
        : ["(none)"]),
      "",
      "NEW:",
      ...batch.map((line, index) => `${index + 1}. ${clip(line.text, this.lineChars)}`),
    ];
    return lines.join("\n");
  }

  async _run() {
    if (this.running || !this.pending.length) return;
    this.running = true;
    const batch = this.pending.slice();
    const started = this.now();
    let changed = false;
    try {
      const result = await this.ask({
        kind: "turns",
        system: TURNS_SYSTEM,
        user: this._prompt(batch),
        schema: TURNS_SCHEMA,
        maxTokens: 300,
      });
      const applied = result?.ok ? this._apply(batch, result.json) : null;
      recordCall(this.stats, "turns", result, result?.ok && applied === null);
      if (result?.ok && applied === null && (this.stats.samples ??= []).length < 4) {
        this.stats.samples.push({ lines: batch.length, answer: result.text.slice(0, 400) });
      }
      changed = applied !== null;
      if (!result?.ok || applied === null) {
        // A failure changes nothing: the lines stay where the instant answer put them.
        for (const line of batch) {
          if (!this.book.topicOf.has(line.id)) this._fallbackPlace(line);
        }
        this.pending = this.pending.filter((line) => !batch.includes(line));
      }
    } finally {
      this.running = false;
      this.lastCallAt = started;
    }
    if (changed) this.onChange();
    this._schedule();
  }

  /** Places a line that has no topic yet: the current one, or a first topic named from its words. */
  _fallbackPlace(line) {
    if (!this.book.currentId) this.book.currentId = this.book.create("Untitled", "", line.at);
    this.book.place([line.id], this.book.currentId);
  }

  /** Applies one answer. Returns null when it is malformed (nothing changes). */
  _apply(batch, json) {
    const book = this.book;
    const starts = (Array.isArray(json?.segments) ? json.segments : [])
      .map((segment) => ({ from: Number(segment?.from), topic: oneLine(segment?.topic) }))
      .filter(
        (segment) =>
          Number.isInteger(segment.from) &&
          segment.from >= 1 &&
          segment.from <= batch.length &&
          segment.topic
      )
      .sort((a, b) => a.from - b.from);
    if (!starts.length) return null;
    starts[0].from = 1;
    // One answer per line, from the segments; "?" only in the last one.
    let answers = batch.map((_, index) => {
      let topic = starts[0].topic;
      for (const segment of starts) if (segment.from - 1 <= index) topic = segment.topic;
      return topic;
    });
    if (this.minRunWords > 0) {
      // A switch that holds fewer words than a topic needs is an aside: inside
      // the batch it folds into the topic around it; at its end it waits for
      // the next batch ("?"), once.
      const weights = batch.map((line) => line.words);
      answers = smoothRuns(answers, weights, this.minRunWords, {
        before: book.currentId,
        keepLast: true,
      });
      let tail = answers.length;
      while (tail > 0 && answers[tail - 1] === answers.at(-1)) tail -= 1;
      const tailWords = weights.slice(tail).reduce((total, words) => total + words, 0);
      if (
        book.currentId &&
        answers.at(-1) !== book.currentId &&
        answers.at(-1) !== "?" &&
        tailWords < this.minRunWords &&
        !batch.slice(tail).some((line) => this.deferred.has(line.id))
      ) {
        for (let index = tail; index < answers.length; index += 1) answers[index] = "?";
      }
    }
    for (let index = 0; index < answers.length; index += 1) {
      if (answers[index] === "?" && answers.slice(index).some((answer) => answer !== "?")) {
        answers[index] = book.currentId ?? "new";
      }
    }
    // "?" counts only as a trailing run, and a line is deferred once.
    let deferFrom = answers.length;
    while (deferFrom > 0 && answers[deferFrom - 1] === "?") deferFrom -= 1;
    const deferred = [];
    for (let index = deferFrom; index < answers.length; index += 1) {
      if (this.deferred.has(batch[index].id)) answers[index] = book.currentId ?? "new";
      else deferred.push(batch[index]);
    }
    this.stats.deferred = (this.stats.deferred ?? 0) + deferred.length;
    const decided = batch.slice(0, batch.length - deferred.length);
    let newId = null;
    const needsNew = answers.slice(0, decided.length).includes("new") || !book.currentId;
    if (needsNew) {
      const raw = json?.new_topic?.name;
      const excerpt = decided.map((line) => line.text);
      const same = raw ? book.namedLike(raw) : null;
      if (same) {
        newId = same;
      } else {
        const name = raw ? book.checkedName(raw, { excerpt }) : null;
        if (!name) this.stats.unusableNames += 1;
        newId = book.create(
          name ?? clip(raw || "Untitled", 48),
          json?.new_topic?.gist ?? "",
          decided[0]?.at ?? this.now()
        );
        book.topics.get(newId).namedWords = 0;
      }
    }
    let current = book.currentId;
    for (let index = 0; index < decided.length; index += 1) {
      const line = decided[index];
      let target = answers[index];
      if (target === "new" || (target === "?" && !current)) target = newId;
      else if (target === "?" || !book.topics.has(target)) target = current ?? newId;
      if (!target) return null;
      if (
        target !== current &&
        current &&
        target !== newId &&
        book.topics.get(target)?.utteranceIds.length
      ) {
        book.topics.get(target).returns += 1;
      }
      book.place([line.id], target);
      current = target;
    }
    book.currentId = current;
    // Deferred lines stay shown in the current topic and come back next time.
    for (const line of deferred) {
      this.deferred.add(line.id);
      if (current) book.place([line.id], current);
    }
    this.pending = [...deferred, ...this.pending.filter((line) => !batch.includes(line))];
    if (newId && book.topics.get(newId)) book.topics.get(newId).namedWords = book.words(newId);
    // A rename of the current topic, once it has grown since it was named.
    const rename = json?.rename;
    const topic = current ? book.topics.get(current) : null;
    if (rename?.name && topic && current !== newId) {
      const words = book.words(current);
      const name = book.checkedName(rename.name, {
        except: current,
        excerpt: topic.utteranceIds.slice(-10).map((id) => book.byId.get(id)?.text ?? ""),
      });
      if (
        name &&
        !sameName(name, topic.name) &&
        words >= Math.max(40, topic.namedWords * this.renameGrowth)
      ) {
        topic.name = name;
        topic.gist = oneLine(rename.gist ?? topic.gist).slice(0, 120);
        topic.namedWords = words;
        this.stats.renames += 1;
      }
    }
    return true;
  }

  snapshot(now = this.now(), options) {
    return this.book.snapshot(now, options);
  }

  stop() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  /** The end: the lines still waiting are placed (one last request), then nothing more. */
  async finish() {
    this.stop();
    while (this.running) await new Promise((resolve) => setImmediate(resolve));
    if (this.pending.length) {
      for (const line of this.pending) this.deferred.add(line.id);
      await this._run();
      this.stop();
    }
    for (const line of this.book.lines)
      if (!this.book.topicOf.has(line.id)) this._fallbackPlace(line);
    return this.snapshot(this.now(), { final: true });
  }
}

// ---------------------------------------------------------------------------
// V3: every 45 s, the model re-cuts the last few minutes.

export const WINDOW_SYSTEM = [
  "You keep the topics of a live conversation up to date. About once a minute you get its last few minutes and check where its topics start and end. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "You get TOPICS (id | name | what it covers | how long it ran) and LINES: the last few minutes, numbered, each with the id of the topic it is shown under now. Lines before these are settled and not shown.",
  "",
  "Give the topic of every line as segments, in order: each segment has the number of its first line and a topic, and runs until the next segment. The first segment starts at line 1. A topic is an existing id, when the lines continue or go back to it, or a key new1, new2 for a topic that starts in these lines; give each new key a name and a gist (one line, at most 12 words).",
  "",
  "Rules:",
  "- A topic usually holds 2 to 10 minutes of talk: one subject, problem, decision or agenda item. A short aside, a joke or one remark stays in the topic around it.",
  "- Cut where the conversation moves on to a different subject, even when what is shown now has no cut there. Where what is shown is right, keep it: the same ids, the same boundaries.",
  "- When the last few lines may start a new subject but you cannot tell yet, keep them in the topic before them: you will see them again with what follows.",
  `- ${NAME_RULES}`,
  '- Rename a topic only when its name no longer fits what it has become: put it in "rename".',
  "",
  'Reply with JSON only: {"segments": [{"from": 1, "topic": "4"}, {"from": 18, "topic": "new1"}], "new": [{"key": "new1", "name": "...", "gist": "..."}], "rename": [{"id": "4", "name": "...", "gist": "..."}]}',
].join("\n");

export const WINDOW_SCHEMA = {
  name: "topic_window",
  schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "integer" }, topic: { type: "string" } },
          required: ["from", "topic"],
          additionalProperties: false,
        },
      },
      new: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            gist: { type: "string" },
          },
          required: ["key", "name", "gist"],
          additionalProperties: false,
        },
      },
      rename: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            gist: { type: "string" },
          },
          required: ["id", "name", "gist"],
          additionalProperties: false,
        },
      },
    },
    required: ["segments", "new", "rename"],
    additionalProperties: false,
  },
};

export class WindowLoop {
  constructor({
    ask,
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
    onChange = () => {},
    strideMs = 45_000,
    minNewWords = 25,
    windowMs = 240_000,
    maxLines = 70,
    maxWords = 800,
    lineChars = 240,
    renameGrowth = 2,
    minRunWords = 40,
  }) {
    Object.assign(this, { ask, now, setTimer, clearTimer, onChange });
    Object.assign(this, {
      strideMs,
      minNewWords,
      windowMs,
      maxLines,
      maxWords,
      lineChars,
      renameGrowth,
      minRunWords,
    });
    this.book = new TopicBook();
    this.running = false;
    this.timer = null;
    this.lastCallAt = -Infinity;
    this.wordsSinceCall = 0;
    this.stats = stats();
  }

  onUtterance(utterance) {
    const line = this.book.addLine(utterance);
    if (this.book.currentId) this.book.place([line.id], this.book.currentId);
    this.wordsSinceCall += line.words;
    this._schedule();
  }

  _schedule() {
    if (this.running || this.timer !== null) return;
    const now = this.now();
    // The first cut comes once there is something to cut; then every stride.
    const first = this.lastCallAt === -Infinity;
    if (first && this.wordsSinceCall < this.minNewWords) return;
    const due = first ? now : Math.max(now, this.lastCallAt + this.strideMs);
    this.timer = this.setTimer(
      () => {
        this.timer = null;
        // Not enough said since the last cut: the next line schedules again.
        if (this.wordsSinceCall >= this.minNewWords || first) void this._run();
      },
      Math.max(0, due - now)
    );
  }

  /** The lines of the window: the last few minutes, at most `maxLines` and `maxWords`. */
  _window(final = false) {
    const lines = this.book.lines;
    const end = this.now();
    const out = [];
    let words = 0;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!final && end - line.at > this.windowMs && out.length >= 3) break;
      if (out.length >= this.maxLines || words + line.words > this.maxWords) {
        if (out.length) break;
      }
      out.unshift(line);
      words += line.words;
    }
    return out;
  }

  _prompt(window) {
    const book = this.book;
    const topics = book.listed(10, this.now());
    const span = Math.max(0, (window.at(-1)?.at ?? 0) - (window[0]?.at ?? 0)) / 60_000;
    return [
      `TOPICS:${topics.length ? "" : " none yet"}`,
      ...topics,
      "",
      `LINES (the last ${minutesText(span)}):`,
      ...window.map(
        (line, index) =>
          `${index + 1}. [${book.topicOf.get(line.id) ?? "-"}] ${clip(line.text, this.lineChars)}`
      ),
    ].join("\n");
  }

  async _run({ final = false } = {}) {
    if (this.running) return;
    const window = this._window(final);
    if (!window.length) return;
    this.running = true;
    this.wordsSinceCall = 0;
    const started = this.now();
    let changed = false;
    try {
      const result = await this.ask({
        kind: final ? "window-final" : "window",
        system: WINDOW_SYSTEM,
        user: this._prompt(window),
        schema: WINDOW_SCHEMA,
        maxTokens: 600,
      });
      const applied = result?.ok ? this._apply(window, result.json) : null;
      recordCall(this.stats, "window", result, result?.ok && applied === null);
      changed = Boolean(applied);
      if (applied === null) {
        for (const line of window) {
          if (!this.book.topicOf.has(line.id)) this._fallbackPlace(line);
        }
      }
    } finally {
      this.running = false;
      this.lastCallAt = started;
    }
    if (changed) this.onChange();
    if (!final) this._schedule();
  }

  _fallbackPlace(line) {
    if (!this.book.currentId) this.book.currentId = this.book.create("Untitled", "", line.at);
    this.book.place([line.id], this.book.currentId);
  }

  _apply(window, json) {
    const book = this.book;
    const segments = Array.isArray(json?.segments) ? json.segments : null;
    if (!segments?.length) return null;
    const starts = segments
      .map((segment) => ({ from: Number(segment.from), topic: oneLine(segment.topic) }))
      .filter(
        (segment) =>
          Number.isInteger(segment.from) && segment.from >= 1 && segment.from <= window.length
      )
      .sort((a, b) => a.from - b.from);
    if (!starts.length) return null;
    starts[0].from = 1;
    if (this.minRunWords > 0) {
      // Short runs fold into the topic around them; the last may be a topic just begun.
      const labels = window.map((_, index) => {
        let topic = starts[0].topic;
        for (const segment of starts) if (segment.from - 1 <= index) topic = segment.topic;
        return topic;
      });
      const previousLine = book.lines[window[0].index - 1];
      const smoothed = smoothRuns(
        labels,
        window.map((line) => line.words),
        this.minRunWords,
        {
          before: previousLine ? (book.topicOf.get(previousLine.id) ?? null) : null,
          keepLast: true,
        }
      );
      starts.length = 0;
      smoothed.forEach((topic, index) => {
        if (!index || topic !== smoothed[index - 1]) starts.push({ from: index + 1, topic });
      });
    }
    const fresh = new Map();
    for (const item of Array.isArray(json?.new) ? json.new : []) {
      if (item?.key) fresh.set(oneLine(item.key), item);
    }
    const created = new Map();
    const resolve = (key, lines) => {
      if (book.topics.has(key)) return key;
      if (created.has(key)) return created.get(key);
      const item = fresh.get(key);
      const raw = item?.name ?? "";
      const same = raw ? book.namedLike(raw) : null;
      if (same) {
        created.set(key, same);
        return same;
      }
      const name = raw ? book.checkedName(raw, { excerpt: lines.map((line) => line.text) }) : null;
      if (!name) this.stats.unusableNames += 1;
      // A key with no name is a topic the model did not describe: keep the lines where they are.
      if (!raw) return null;
      const id = book.create(name ?? clip(raw, 48), item?.gist ?? "", lines[0]?.at ?? this.now());
      created.set(key, id);
      return id;
    };
    let current = null;
    for (let index = 0; index < starts.length; index += 1) {
      const from = starts[index].from - 1;
      const to = (starts[index + 1]?.from ?? window.length + 1) - 1;
      const lines = window.slice(from, to);
      if (!lines.length) continue;
      const target = resolve(starts[index].topic, lines);
      if (!target) continue;
      if (
        current &&
        target !== current &&
        book.topics.get(target)?.utteranceIds.some((id) => book.byId.get(id).index < lines[0].index)
      ) {
        book.topics.get(target).returns += 1;
      }
      book.place(
        lines.map((line) => line.id),
        target
      );
      current = target;
    }
    if (current) book.currentId = current;
    for (const id of created.values()) {
      const topic = book.topics.get(id);
      if (topic && !topic.namedWords) topic.namedWords = book.words(id);
    }
    for (const item of Array.isArray(json?.rename) ? json.rename : []) {
      const topic = book.topics.get(oneLine(item?.id));
      if (!topic || created.has(topic.id) || !item?.name) continue;
      const words = book.words(topic.id);
      const name = book.checkedName(item.name, {
        except: topic.id,
        excerpt: topic.utteranceIds.slice(-10).map((id) => book.byId.get(id)?.text ?? ""),
      });
      if (
        name &&
        !sameName(name, topic.name) &&
        words >= Math.max(40, topic.namedWords * this.renameGrowth)
      ) {
        topic.name = name;
        topic.gist = oneLine(item.gist ?? topic.gist).slice(0, 120);
        topic.namedWords = words;
        this.stats.renames += 1;
      }
    }
    for (const line of window) if (!book.topicOf.has(line.id)) this._fallbackPlace(line);
    return true;
  }

  snapshot(now = this.now(), options) {
    return this.book.snapshot(now, options);
  }

  stop() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  /** The end: one last cut of the last few minutes, so the tail is settled. */
  async finish() {
    this.stop();
    while (this.running) await new Promise((resolve) => setImmediate(resolve));
    if (this.wordsSinceCall > 0) await this._run({ final: true });
    for (const line of this.book.lines)
      if (!this.book.topicOf.has(line.id)) this._fallbackPlace(line);
    return this.snapshot(this.now(), { final: true });
  }
}

// ---------------------------------------------------------------------------
// V4: the on-device tracker proposes, the model decides and names.

export const CHECK_SYSTEM = [
  "You check the topics of a live conversation. A cheap detector thinks the subject may have changed. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "You get TOPICS (id | name | what it covers | how long it ran), CURRENT (the topic the conversation is on and how long it has run), BEFORE (its last lines, numbered B1, B2, ...) and AFTER (the lines since the possible change, numbered A1, A2, ...).",
  "",
  'Answer "new" when the conversation moves on to a different subject in AFTER: the next agenda item, another problem, another part of the plan. Give "at", the number of the A line where it starts, a name and a gist (one line, at most 12 words).',
  'Answer "return" when AFTER goes back to an earlier topic: give its id in "topic" and "at".',
  'Answer "same" when AFTER is more of the subject of BEFORE, or an aside, a joke or small talk within it.',
  "",
  'A topic usually holds 2 to 10 minutes of talk: one subject, problem, decision or agenda item. When the current topic has run long, look hard for where it moved on. Also answer "rename" with a better name when the current topic\'s name no longer fits it, otherwise null.',
  NAME_RULES,
  "",
  'Reply with JSON only: {"decision": "same" | "new" | "return", "at": 1, "topic": null or "3", "name": null or "...", "gist": null or "...", "rename": null or "..."}',
].join("\n");

export const CHECK_SCHEMA = {
  name: "topic_check",
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["same", "new", "return"] },
      at: { type: "integer" },
      topic: { anyOf: [{ type: "string" }, { type: "null" }] },
      name: { anyOf: [{ type: "string" }, { type: "null" }] },
      gist: { anyOf: [{ type: "string" }, { type: "null" }] },
      rename: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: ["decision", "at", "topic", "name", "gist", "rename"],
    additionalProperties: false,
  },
};

export const FIRST_NAME_SYSTEM = [
  "You name the topic a live conversation is on. The lines come from speech recognition: expect errors, filler and half sentences.",
  NAME_RULES,
  'Reply with JSON only: {"name": "...", "gist": "one line, at most 12 words, of what it covers"}',
].join("\n");

export const FIRST_NAME_SCHEMA = {
  name: "topic_name",
  schema: {
    type: "object",
    properties: { name: { type: "string" }, gist: { type: "string" } },
    required: ["name", "gist"],
    additionalProperties: false,
  },
};

export class HybridLoop {
  /**
   * @param {object} options
   * @param {any} options.tracker An on-device tracker (`ConversationTopicTracker`): its live
   *   snapshots propose where the subject changes.
   */
  constructor({
    ask,
    tracker,
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
    onChange = () => {},
    firstNameWords = 40,
    checkAfterWords = 250,
    beforeLines = 8,
    afterLines = 14,
    maxCheckLines = 40,
    lineChars = 240,
    renameGrowth = 2.5,
    settleMs = 1_500,
  }) {
    Object.assign(this, { ask, tracker, now, setTimer, clearTimer, onChange });
    Object.assign(this, {
      firstNameWords,
      checkAfterWords,
      beforeLines,
      afterLines,
      maxCheckLines,
      lineChars,
      renameGrowth,
      settleMs,
    });
    this.book = new TopicBook();
    this.running = false;
    this.timer = null;
    this.proposals = [];
    this.seenStarts = new Set();
    this.wordsSinceCheck = 0;
    this.stats = stats();
    this.stats.proposals = 0;
    this.stats.periodic = 0;
  }

  onUtterance(utterance) {
    const line = this.book.addLine(utterance);
    if (!this.book.currentId) {
      this.book.currentId = this.book.create("…", "", line.at);
      this.book.topics.get(this.book.currentId).unnamed = true;
    }
    this.book.place([line.id], this.book.currentId);
    this.wordsSinceCheck += line.words;
    this.tracker.onUtterance({ id: line.id, text: utterance.text, at: utterance.at });
    this._propose();
    this._schedule();
  }

  /** New places where the tracker's live view starts a run, after the last decided change. */
  _propose() {
    const snapshot = this.tracker.snapshot(this.now());
    const topicOf = new Map();
    for (const node of snapshot.nodes)
      for (const id of node.utteranceIds) topicOf.set(String(id), node.id);
    let previous = null;
    const decidedIndex = this.lastDecidedIndex ?? -1;
    for (const line of this.book.lines) {
      const topic = topicOf.get(line.id);
      if (topic == null) continue;
      if (
        previous != null &&
        topic !== previous &&
        !this.seenStarts.has(line.id) &&
        line.index > decidedIndex
      ) {
        this.seenStarts.add(line.id);
        this.proposals.push(line);
        this.stats.proposals += 1;
      }
      previous = topic;
    }
  }

  _schedule() {
    if (this.running || this.timer !== null) return;
    const current = this.book.topics.get(this.book.currentId);
    const needsName = current?.unnamed && this.book.words(current.id) >= this.firstNameWords;
    const needsCheck = this.proposals.length > 0 || this.wordsSinceCheck >= this.checkAfterWords;
    if (!needsName && !needsCheck) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this._run();
    }, this.settleMs);
  }

  _lineText(line) {
    return clip(line.text, this.lineChars);
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    let changed = false;
    try {
      const book = this.book;
      const current = book.topics.get(book.currentId);
      if (current?.unnamed) {
        if (book.words(current.id) >= this.firstNameWords) changed = await this._nameFirst(current);
      } else if (this.proposals.length) {
        const at = this.proposals.shift();
        changed = await this._check(at, "proposal");
        // Proposals inside the lines just checked are answered by that check.
        const decided = this.lastDecidedIndex ?? -1;
        this.proposals = this.proposals.filter((line) => line.index > decided);
      } else if (this.wordsSinceCheck >= this.checkAfterWords) {
        changed = await this._check(null, "periodic");
      }
    } finally {
      this.running = false;
    }
    if (changed) this.onChange();
    this._schedule();
  }

  async _nameFirst(topic) {
    const lines = topic.utteranceIds.map((id) => this.book.byId.get(id)).slice(-30);
    const result = await this.ask({
      kind: "name",
      system: FIRST_NAME_SYSTEM,
      user: ["What was said:", ...lines.map((line) => `- ${this._lineText(line)}`)].join("\n"),
      schema: FIRST_NAME_SCHEMA,
      maxTokens: 120,
    });
    const name =
      result?.ok && result.json?.name
        ? this.book.checkedName(result.json.name, {
            except: topic.id,
            excerpt: lines.map((line) => line.text),
          })
        : null;
    recordCall(this.stats, "name", result, result?.ok && !name);
    if (!name) {
      if (result?.ok) this.stats.unusableNames += 1;
      return false;
    }
    topic.name = name;
    topic.gist = oneLine(result.json.gist ?? "").slice(0, 120);
    topic.namedWords = this.book.words(topic.id);
    topic.unnamed = false;
    return true;
  }

  /** One check: at a proposed change (`at` is its first line), or over a topic that ran long. */
  async _check(at, kind) {
    const book = this.book;
    const current = book.topics.get(book.currentId);
    if (!current) return false;
    const lines = current.utteranceIds.map((id) => book.byId.get(id));
    let before;
    let after;
    // A proposal for a line that is no longer in the current topic was decided already.
    if (at && !lines.includes(at)) return false;
    if (at) {
      const index = lines.indexOf(at);
      before = lines.slice(Math.max(0, index - this.beforeLines), index);
      after = lines.slice(index, index + this.afterLines);
    } else {
      // A periodic check: the last lines of the topic, split at its middle.
      const recent = lines.slice(-this.maxCheckLines);
      const half = Math.max(1, Math.floor(recent.length / 3));
      before = recent.slice(0, half);
      after = recent.slice(half);
      this.stats.periodic += 1;
    }
    this.wordsSinceCheck = 0;
    if (!after.length) return false;
    const topics = book.listed(10, this.now());
    const user = [
      "TOPICS:",
      ...topics,
      "",
      `CURRENT: ${current.id} | ${current.name}, for ${minutesText(book.currentRun())} so far`,
      "",
      "BEFORE:",
      ...(before.length
        ? before.map((line, index) => `B${index + 1}. ${this._lineText(line)}`)
        : ["(none)"]),
      "",
      "AFTER:",
      ...after.map((line, index) => `A${index + 1}. ${this._lineText(line)}`),
    ].join("\n");
    const result = await this.ask({
      kind,
      system: CHECK_SYSTEM,
      user,
      schema: CHECK_SCHEMA,
      maxTokens: 200,
    });
    const json = result?.json;
    const valid = result?.ok && json && ["same", "new", "return"].includes(json.decision);
    recordCall(this.stats, kind, result, result?.ok && !valid);
    if (!valid) return false;
    this.lastDecidedIndex = after.at(-1).index;
    let changed = false;
    if (json.decision === "new" || json.decision === "return") {
      const from = Math.min(Math.max(1, Number(json.at) || 1), after.length) - 1;
      const moving = after.slice(from);
      // Everything since the change moves, the lines after AFTER too.
      const rest = current.utteranceIds
        .map((id) => book.byId.get(id))
        .filter((line) => line.index >= moving[0].index);
      let target = null;
      if (
        json.decision === "return" &&
        json.topic &&
        book.topics.has(String(json.topic)) &&
        String(json.topic) !== current.id
      ) {
        target = String(json.topic);
      } else if (json.decision === "new") {
        const same = json.name ? book.namedLike(json.name) : null;
        if (same && same !== current.id) target = same;
        else {
          const name = json.name
            ? book.checkedName(json.name, { excerpt: rest.map((line) => line.text) })
            : null;
          if (!name) this.stats.unusableNames += 1;
          target = book.create(name ?? clip(json.name || "…", 48), json.gist ?? "", rest[0].at);
          if (!name) book.topics.get(target).unnamed = true;
        }
      }
      if (target) {
        book.place(
          rest.map((line) => line.id),
          target
        );
        if (json.decision === "return") book.topics.get(target).returns += 1;
        book.currentId = target;
        const topic = book.topics.get(target);
        if (!topic.namedWords) topic.namedWords = book.words(target);
        changed = true;
      }
    }
    if (json.rename) {
      const topic =
        book.topics.get(changed ? book.currentId : current.id) === current ? current : null;
      const words = topic ? book.words(topic.id) : 0;
      if (topic && words >= Math.max(this.firstNameWords, topic.namedWords * this.renameGrowth)) {
        const name = book.checkedName(json.rename, {
          except: topic.id,
          excerpt: topic.utteranceIds.slice(-10).map((id) => book.byId.get(id)?.text ?? ""),
        });
        if (name && !sameName(name, topic.name)) {
          topic.name = name;
          topic.namedWords = words;
          topic.unnamed = false;
          this.stats.renames += 1;
          changed = true;
        }
      }
    }
    return changed;
  }

  /** Topics the model has not named yet show the on-device tracker's name: the instant answer. */
  snapshot(now = this.now(), options) {
    const snapshot = this.book.snapshot(now, options);
    if (!snapshot.nodes.some((node) => this.book.topics.get(node.id)?.unnamed)) return snapshot;
    const device = this.tracker.snapshot(now);
    const labelOf = new Map();
    for (const node of device.nodes)
      for (const id of node.utteranceIds) labelOf.set(String(id), node.label);
    for (const node of snapshot.nodes) {
      if (!this.book.topics.get(node.id)?.unnamed) continue;
      const last = [...node.utteranceIds].reverse().find((id) => labelOf.has(id));
      node.label = (last && labelOf.get(last)) || node.label;
      node.deviceNamed = true;
    }
    return snapshot;
  }

  stop() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  async finish() {
    this.stop();
    while (this.running) await new Promise((resolve) => setImmediate(resolve));
    const book = this.book;
    for (const topic of [...book.topics.values()]) {
      if (topic.unnamed && book.words(topic.id) >= 20) await this._nameFirst(topic);
    }
    return this.snapshot(this.now(), { final: true });
  }
}

// ---------------------------------------------------------------------------
// VF: the whole record, cut and named at Finish.

export const RECORD_SYSTEM = [
  "You divide the transcript of a recorded conversation into its topics. The lines come from speech recognition: expect errors, filler and half sentences. Who said a line is not known.",
  "",
  "Give the topics as segments, in order: each segment has the number of its first line, runs until the next segment, and has a topic key (T1, T2, ...). When the conversation goes back to an earlier topic, use that topic's key again. Give each key a name and a gist (one line, at most 12 words).",
  "",
  "A topic usually holds 2 to 10 minutes of talk: one subject, problem, decision or agenda item. A short aside, a joke or one remark stays in the topic around it. The request says how long the conversation lasted.",
  NAME_RULES,
  "",
  'Reply with JSON only: {"segments": [{"from": 1, "topic": "T1"}, {"from": 57, "topic": "T2"}], "topics": [{"key": "T1", "name": "...", "gist": "..."}]}',
].join("\n");

export const RECORD_SCHEMA = {
  name: "topic_record",
  schema: {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: { from: { type: "integer" }, topic: { type: "string" } },
          required: ["from", "topic"],
          additionalProperties: false,
        },
      },
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            gist: { type: "string" },
          },
          required: ["key", "name", "gist"],
          additionalProperties: false,
        },
      },
    },
    required: ["segments", "topics"],
    additionalProperties: false,
  },
};

/**
 * Lines for the record: utterances joined until a line holds `minWords` words
 * (and at most `maxWords`), so a long meeting is a few hundred numbered lines.
 */
export function recordLines(utterances, { minWords = 14, maxWords = 45 } = {}) {
  const lines = [];
  let current = null;
  for (const utterance of utterances) {
    const words = countWords(utterance.text);
    if (!current || current.words >= minWords || current.words + words > maxWords) {
      current = { ids: [], text: "", words: 0 };
      lines.push(current);
    }
    current.ids.push(String(utterance.id));
    current.text = current.text
      ? `${current.text} ${oneLine(utterance.text)}`
      : oneLine(utterance.text);
    current.words += words;
  }
  return lines;
}

/**
 * Cuts and names a whole record with one request (`ask`), or with several when
 * it is longer than `chunkWords` (each chunk sees the topics found before it).
 * Resolves to a snapshot, or null when the model gave nothing usable.
 */
export async function cutRecord({
  ask,
  utterances,
  chunkWords = 9000,
  lineChars = 400,
  minRunWords = 60,
}) {
  const lines = recordLines(utterances);
  const chunks = [];
  let chunk = [];
  let words = 0;
  for (const line of lines) {
    if (chunk.length && words + line.words > chunkWords) {
      chunks.push(chunk);
      chunk = [];
      words = 0;
    }
    chunk.push(line);
    words += line.words;
  }
  if (chunk.length) chunks.push(chunk);
  const book = new TopicBook();
  for (const utterance of utterances) book.addLine(utterance);
  const keyToId = new Map();
  const stat = stats();
  for (const part of chunks) {
    const known = [...book.topics.values()].map((topic) => {
      const key = [...keyToId.entries()].find(([, id]) => id === topic.id)?.[0];
      return `${key} | ${topic.name} | ${topic.gist}`;
    });
    const first = book.byId.get(part[0].ids[0])?.at ?? 0;
    const last = book.byId.get(part.at(-1).ids.at(-1))?.at ?? first;
    const user = [
      ...(known.length
        ? ["TOPICS FOUND BEFORE THESE LINES (reuse their keys for a return):", ...known, ""]
        : []),
      `LINES (${minutesText((last - first) / 60_000)} of conversation):`,
      ...part.map((line, index) => `${index + 1}. ${clip(line.text, lineChars)}`),
    ].join("\n");
    const result = await ask({
      kind: "record",
      system: RECORD_SYSTEM,
      user,
      schema: RECORD_SCHEMA,
      maxTokens: 4000,
      timeoutMs: 120_000,
    });
    const segments = Array.isArray(result?.json?.segments) ? result.json.segments : null;
    recordCall(stat, "record", result, result?.ok && !segments?.length);
    if (!segments?.length) {
      // This stretch stays in the topic before it.
      const last = [...book.topics.values()].at(-1);
      const id = last?.id ?? book.create("Conversation", "", 0);
      book.place(
        part.flatMap((line) => line.ids),
        id
      );
      continue;
    }
    const names = new Map();
    for (const item of Array.isArray(result.json.topics) ? result.json.topics : []) {
      if (item?.key) names.set(oneLine(item.key), item);
    }
    const starts = segments
      .map((segment) => ({ from: Number(segment.from), topic: oneLine(segment.topic) }))
      .filter(
        (segment) =>
          Number.isInteger(segment.from) && segment.from >= 1 && segment.from <= part.length
      )
      .sort((a, b) => a.from - b.from);
    if (!starts.length) continue;
    starts[0].from = 1;
    for (let index = 0; index < starts.length; index += 1) {
      const from = starts[index].from - 1;
      const to = (starts[index + 1]?.from ?? part.length + 1) - 1;
      const slice = part.slice(from, to);
      if (!slice.length) continue;
      const key = starts[index].topic;
      let id = keyToId.get(key);
      if (!id) {
        const item = names.get(key);
        const ids = slice.flatMap((line) => line.ids);
        const raw = item?.name ?? key;
        const name = book.checkedName(raw, { excerpt: slice.map((line) => line.text) });
        if (!name) stat.unusableNames += 1;
        id = book.create(name ?? clip(raw, 48), item?.gist ?? "", book.byId.get(ids[0])?.at ?? 0);
        keyToId.set(key, id);
      }
      book.place(
        slice.flatMap((line) => line.ids),
        id
      );
    }
  }
  if (minRunWords > 0) {
    const labels = book.lines.map((line) => book.topicOf.get(line.id) ?? null);
    const smoothed = smoothRuns(
      labels,
      book.lines.map((line) => line.words),
      minRunWords
    );
    smoothed.forEach((topic, index) => {
      if (topic && topic !== labels[index]) book.place([book.lines[index].id], topic);
    });
  }
  return { snapshot: book.snapshot(0, { final: true }), stats: stat };
}
