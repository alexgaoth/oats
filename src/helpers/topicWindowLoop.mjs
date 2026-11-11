// Live topics with the writing model on this computer: every 2 minutes it
// re-cuts the last 6 minutes ("V3 window", docs/fast-models.md).
//
// The live topic check of topicLoop.mjs runs with OpenAI's and Anthropic's
// models only. With Gemma 4 E4B, the writing model on a Mac with 16 GB or
// more, the on-device tracker alone draws few changes while recording: within
// 10 s of a real change it finds 3-6% of them on talks and two-person videos
// heard by the app, and 18% on AMI meetings. Here the writing model gets the
// last few minutes as numbered lines, each with the topic it is shown under,
// and gives the topic of every line: it can move a cut, start a topic, or go
// back to an earlier one. Lines before the window stay where they are.
//
// Measured with Gemma 4 E4B (scripts/topic-loop-eval.mjs --variant v3), live
// view at the end, a cut within 10 s of a real change: talks 41% of cuts real
// and 44% of changes found, two-person 31% and 37%, meetings 21% and 39%
// (on-device tracker: 100% and 3%, 30% and 4%, 30% and 18%). A change shows a
// median 1.4 to 1.9 minutes after it happened. About 45 requests an hour,
// 3.5 s each (p95 13 s) on an Apple M-series Mac with 48 GB.
//
// Everything else is LiveTopicLoop's: a line shows at once in the topic the
// room is on, the view and the names carried to the record (`snapshot`,
// `namesFor`), one request at a time with a timeout, and the loop ends after
// three failures in a row or when the writing model is no longer ready (the
// flow card then goes back to the on-device tracker's view).
//
// A topic without a usable name is shown to the model as "-", as lines no
// topic holds: its next answer gives those lines a new key and a name, and
// the topic takes that name (no new id).

import { FIRST_NAME_WORDS, LINE_CHARS, LiveTopicLoop } from "./topicLoop.mjs";
import { sameName } from "./topicNaming.mjs";
import { readSegments, smoothRuns } from "./topicRecordCut.mjs";

/** How often the window is cut again, at most. */
export const WINDOW_STRIDE_MS = 120_000;

/** How far back the window reaches. */
export const WINDOW_MS = 360_000;

/** Lines and words a window holds at most. */
export const WINDOW_MAX_LINES = 100;
export const WINDOW_MAX_WORDS = 1500;

/** Words said since the last request before another goes out. */
export const WINDOW_MIN_NEW_WORDS = 25;

/** A run of fewer words joins the topic around it (the last run is kept: it may have just begun). */
export const WINDOW_MIN_RUN_WORDS = 40;

/** A named topic is renamed only when it has grown this many times since its name. */
export const WINDOW_RENAME_GROWTH = 2;

/** An answer of a model on this computer can take a while while it also transcribes. */
export const WINDOW_TIMEOUT_MS = 60_000;

const NAME_RULES =
  "A name has 2 to 5 words, says specifically what the part is about (the thing, question, problem or decision), is in sentence case in the language spoken, has no quotation marks, and is not generic (not Discussion, Meeting, Update, Introduction, Small talk).";

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

const KEYED = {
  type: "array",
  items: {
    type: "object",
    properties: { key: { type: "string" }, name: { type: "string" }, gist: { type: "string" } },
    required: ["key", "name", "gist"],
    additionalProperties: false,
  },
};

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
      new: KEYED,
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

const oneLine = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

function clip(text, max) {
  const line = oneLine(text);
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function minutesText(minutes) {
  return minutes < 1 ? "under a minute" : `${Math.round(minutes)} min`;
}

/** The window loop proposes nothing: the model reads the window itself. */
const NO_PROPOSER = Object.freeze({
  onUtterance() {},
  snapshot: () => ({ nodes: [], edges: [] }),
});

export class WindowTopicLoop extends LiveTopicLoop {
  /**
   * The options of LiveTopicLoop (`ask` resolves to the answer's text), and
   * the window's: `strideMs`, `windowMs`, `maxLines`, `maxWords`,
   * `minNewWords`, `minRunWords`, `renameGrowth`, `lineChars`.
   *
   * @param {ConstructorParameters<typeof LiveTopicLoop>[0] & {
   *   strideMs?: number, windowMs?: number, maxLines?: number, maxWords?: number,
   *   minNewWords?: number, minRunWords?: number, renameGrowth?: number, lineChars?: number,
   * }} options
   */
  constructor({
    strideMs = WINDOW_STRIDE_MS,
    windowMs = WINDOW_MS,
    maxLines = WINDOW_MAX_LINES,
    maxWords = WINDOW_MAX_WORDS,
    minNewWords = WINDOW_MIN_NEW_WORDS,
    minRunWords = WINDOW_MIN_RUN_WORDS,
    renameGrowth = WINDOW_RENAME_GROWTH,
    lineChars = LINE_CHARS,
    timeoutMs = WINDOW_TIMEOUT_MS,
    ...options
  }) {
    super({ ...options, timeoutMs, proposer: NO_PROPOSER });
    Object.assign(this, {
      strideMs,
      windowMs,
      maxLines,
      maxWords,
      minNewWords,
      minRunWords,
      renameGrowth,
      lineChars,
    });
    this.lastCallAt = -Infinity;
  }

  _propose() {}

  _due() {
    if (this.wordsSinceCheck < this.minNewWords) return null;
    return this.now() - this.lastCallAt >= this.strideMs ? "window" : null;
  }

  async _run() {
    if (this.stopped || this.disabled || this.running || this.outstanding) return;
    if (!this._due()) return;
    if (!this._underCeiling()) {
      this.log("ceiling");
      return;
    }
    this.running = true;
    let changed = false;
    try {
      // The writing model is no longer the one chosen: nothing more is sent.
      if (!(await this.ready())) {
        this._giveUp("not-ready");
        return;
      }
      changed = await this._recut();
    } finally {
      this.running = false;
    }
    if (changed && !this.stopped) {
      try {
        this.onChange();
      } catch (error) {
        this.log("publish-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this._schedule();
  }

  /** The last few minutes: at most `maxLines` lines and `maxWords` words, at least 3 lines. */
  _window() {
    const end = this.now();
    const out = [];
    let words = 0;
    for (let index = this.lines.length - 1; index >= 0; index -= 1) {
      const line = this.lines[index];
      if (end - line.at > this.windowMs && out.length >= 3) break;
      if (out.length && (out.length >= this.maxLines || words + line.words > this.maxWords)) break;
      out.unshift(line);
      words += line.words;
    }
    return out;
  }

  /** The topic id a line shows to the model: "-" for a topic with no name yet. */
  _shownId(line) {
    const id = this.topicOf.get(line.id);
    return id && this.topics.get(id)?.name ? id : "-";
  }

  _prompt(window) {
    const now = this.now();
    const named = [...this.topics.values()].filter(
      (topic) => topic.name && topic.utteranceIds.length
    );
    named.sort((a, b) => b.lastAt - a.lastAt);
    const topics = named
      .slice(0, 10)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((topic) => {
        const gist = topic.gist ? ` | ${topic.gist}` : "";
        const minutes = Math.max(0, topic.lastAt - topic.firstAt) / 60_000;
        const ago =
          topic.id === this.currentId
            ? " | CURRENT"
            : `, last ${minutesText((now - topic.lastAt) / 60_000)} ago`;
        return `${topic.id} | ${topic.name}${gist} | ${minutesText(minutes)}${ago}`;
      });
    const span = Math.max(0, window.at(-1).at - window[0].at) / 60_000;
    return [
      `TOPICS:${topics.length ? "" : " none yet"}`,
      ...topics,
      "",
      `LINES (the last ${minutesText(span)}):`,
      ...window.map(
        (line, index) => `${index + 1}. [${this._shownId(line)}] ${clip(line.text, this.lineChars)}`
      ),
    ].join("\n");
  }

  async _recut() {
    const window = this._window();
    if (!window.length) return false;
    this.wordsSinceCheck = 0;
    this.lastCallAt = this.now();
    for (const line of window) this.sentIds.add(line.id);
    const json = await this._request(
      "window",
      WINDOW_SYSTEM,
      this._prompt(window),
      WINDOW_SCHEMA,
      600
    );
    if (!json || this.stopped) return false;
    const changed = this._apply(window, json);
    if (changed === null) {
      this.stats.malformed += 1;
      return false;
    }
    return changed;
  }

  /**
   * The answer on the window: each line to its segment's topic. Null when it
   * has no usable segment; else whether what is shown changed.
   */
  _apply(window, json) {
    let starts = readSegments(json, window.length);
    if (!starts) return null;
    if (this.minRunWords > 0) {
      const labels = window.map(() => starts[0].topic);
      for (const start of starts) labels.fill(start.topic, start.from - 1);
      const previous = this.lines[window[0].index - 1];
      const smoothed = smoothRuns(
        labels,
        window.map((line) => line.words),
        this.minRunWords,
        { before: previous ? (this.topicOf.get(previous.id) ?? null) : null, keepLast: true }
      );
      starts = [];
      smoothed.forEach((topic, index) => {
        if (!index || topic !== smoothed[index - 1]) starts.push({ from: index + 1, topic });
      });
    }
    const fresh = new Map();
    for (const item of Array.isArray(json.new) ? json.new : []) {
      const key = oneLine(item?.key);
      if (key) fresh.set(key, item);
    }
    const created = new Map();
    const targets = new Set();
    let named = false;
    const resolve = (key, lines) => {
      if (this.topics.has(key)) return key;
      if (created.has(key)) return created.get(key);
      const item = fresh.get(key);
      const raw = oneLine(item?.name);
      // A key with no name is a topic the model did not describe: the lines stay where they are.
      if (!raw) return null;
      const same = this._namedLike(raw);
      if (same) {
        created.set(key, same);
        return same;
      }
      const holder = this.topics.get(this.topicOf.get(lines[0].id) ?? "");
      const id =
        holder && !holder.name && !targets.has(holder.id) ? holder.id : this._create(lines[0].at);
      created.set(key, id);
      if (id !== holder?.id) this.stats.cuts += 1;
      named =
        this._nameNew(
          this.topics.get(id),
          raw,
          item?.gist,
          lines.map((line) => line.text),
          lines.map((line) => line.id)
        ) || named;
      return id;
    };
    let changed = false;
    let current = null;
    for (let index = 0; index < starts.length; index += 1) {
      const to = (starts[index + 1]?.from ?? window.length + 1) - 1;
      const lines = window.slice(starts[index].from - 1, to);
      if (!lines.length) continue;
      const target = resolve(starts[index].topic, lines);
      if (!target) continue;
      if (lines.some((line) => this.topicOf.get(line.id) !== target)) changed = true;
      this._place(lines, target);
      targets.add(target);
      current = target;
    }
    if (current && current !== this.currentId) {
      this.currentId = current;
      changed = true;
    }
    if (named) changed = true;
    for (const item of Array.isArray(json.rename) ? json.rename : []) {
      const topic = this.topics.get(oneLine(item?.id));
      if (!topic || !topic.utteranceIds.length || !item?.name) continue;
      if ([...created.values()].includes(topic.id)) continue;
      const excerpt = topic.utteranceIds.slice(-10).map((id) => this.byId.get(id)?.text ?? "");
      if (topic.name) {
        const words = this._words(topic);
        if (words < Math.max(FIRST_NAME_WORDS, topic.namedWords * this.renameGrowth)) continue;
        const previous = topic.name;
        if (this._name(topic, item.name, item.gist ?? topic.gist, excerpt)) {
          if (!sameName(previous, topic.name)) {
            this.stats.renames += 1;
            changed = true;
          }
        }
      } else if (this._name(topic, item.name, item.gist, excerpt)) changed = true;
    }
    return changed;
  }
}
