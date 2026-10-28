// Live topics with a fast model in the loop ("V4", docs/fast-models.md).
//
// The on-device tracker finds topics with no model, but it draws a change of
// subject only once it can no longer move: a median of 3.9 minutes after the
// room moved on, on 24 AMI meetings. Here a second on-device tracker, set to
// propose early and often, proposes changes; a fast model decides each one
// (the same subject, a new topic, or a return to an earlier one) and names
// the new topic. The flow card shows the result. Measured on the 24 meetings
// (docs/fast-models.md): live Pk 0.255 with OpenAI's gpt-5.6-terra and 0.268
// with Anthropic's claude-opus-5-5 against main's 0.356, a change shown after
// about 1.3 minutes instead of 3.9, about 41 requests an hour. Each provider's
// model and its settings are in topicModels.mjs.
//
// The rules, each for a reason:
//
// - **The instant answer.** Every line shows at once in the topic the room is
//   on. A model's answer only moves the lines since a change it confirmed, or
//   names a topic.
// - **A confirmed change moves its lines in one step.** The model confirms a
//   change a median 1.3 minutes after it happened, so the lines from the change
//   on, shown in the old topic until then, all go to the new (or earlier)
//   topic at once: 12 to 14 moves an hour, of 6 to 7 lines older than 30 s
//   each, and one taken back in 50 hours of replay (main's tracker moves 206
//   such lines an hour). Keeping lines older than 30 s in place instead would
//   land every cut late and cost all the gain: live Pk 0.376 to 0.394
//   (docs/fast-models.md).
// - **At most 3,000 characters of the conversation per request**
//   (`MAX_EXCERPT_CHARS`): the lines nearest the proposed change, and the
//   topics' names. Never audio, never the rest of the transcript.
// - **One request at a time**, a timeout on each, the least reasoning or
//   effort the model was measured best at (topicModels.mjs).
// - **A failure changes nothing.** An error, a timeout or an answer that is not
//   the asked JSON leaves the view as the on-device decision put it, and the
//   next request waits 10 s, then 20 s. Three in a row end the loop for the
//   recording (`disabled`), and so does a writing model that is no longer the
//   provider's (`ready`): the flow card goes back to the on-device tracker's
//   view, named by #121 (topicNamingRunner.ts).
// - **Names, once.** A topic the model started is named in the same answer; the
//   first topic of a conversation is named once it holds 40 words; a topic is
//   renamed only when it grew two and a half times since its name. Until then
//   a topic shows its on-device name.
//
// The record is not this view: at Finish the conversation keeps the on-device
// tracker's cut, and the names given here carry over to the record's topics
// that still hold the lines they were given from (`namesFor`); #121's final
// pass names only the record's topics that carry none.
//
// Pure and DOM-free: the model is behind `ask`, the clock behind `now`,
// `setTimer` and `clearTimer`, so it runs under node:test and in the replay
// (`scripts/topic-loop-eval.mjs`) exactly as in the app.

import { ConversationTopicTracker, contentWords } from "./conversationTopics.mjs";
import { countWords } from "./recordingCounters.mjs";
import { nameStillFits, parseTopicName, sameName } from "./topicNaming.mjs";
import { topicModelIds, topicProvider } from "./topicModels.mjs";

/**
 * OpenAI's models for the check, in order of preference: the first this key
 * can use. Each provider's list, with its settings, is in topicModels.mjs.
 */
export const FAST_MODELS = topicModelIds("openai", "check");

/** The most of the conversation one request carries, in characters. */
export const MAX_EXCERPT_CHARS = 3000;

/** One line's share of a request, so a monologue cannot fill it alone. */
export const LINE_CHARS = 240;

/** Lines before and after a proposed change that a request may carry. */
export const BEFORE_LINES = 8;
export const AFTER_LINES = 14;

/** A topic that ran this many words with no proposal is checked once more. */
export const CHECK_AFTER_WORDS = 250;

/** The lines a check of a long topic reads: its last ones. */
export const MAX_CHECK_LINES = 40;

/** The first topic is named once it holds this many words. */
export const FIRST_NAME_WORDS = 40;

/** A topic is renamed only once it holds this many times the words it was named from. */
export const RENAME_GROWTH = 2.5;

/** How long the room must be quiet, or a proposal settle, before a request. */
export const SETTLE_MS = 1_500;

/** A request that takes longer than this is not waited for. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Failures in a row that end the loop for the recording. */
export const MAX_FAILURES = 3;

/** After a failure, no request for this long, times the failures in a row: a blip is waited out. */
export const RETRY_AFTER_MS = 10_000;

/** A ceiling, never reached in the measurements (40 to 50 an hour). */
export const MAX_REQUESTS_PER_HOUR = 120;

/** A topic nobody came back to for this long has gone cold (as the tracker). */
export const DROP_AFTER_MS = 180_000;

/**
 * The proposer: the on-device tracker drawing a cut once about 20 content
 * words have followed it, at a lower bar than the flow card's. On 6 tuning
 * meetings it proposed 72% of the real changes, a median 1.5 min after them;
 * half its proposals are wrong, which is what the model is for.
 */
export const PROPOSER_SCALE = Object.freeze({
  settleSpan: 20,
  settlePersist: 0,
  settleWindowMin: 15,
  settleMinWords: 40,
  cut: 0.5,
  minDepth: 0.08,
});

const NAME_RULES =
  "A name has 2 to 5 words, says specifically what the part is about (the thing, question, problem or decision), is in sentence case in the language spoken, has no quotation marks, and is not generic (not Discussion, Meeting, Update, Introduction, Small talk).";

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

/**
 * Whether the live topic check runs for a writing route: OpenAI's or
 * Anthropic's own API, chosen as the writing model (topicModels.mjs). Every
 * other provider, a custom endpoint, a server of the person's own and a model
 * on this computer keep #121's names.
 *
 * @param {{ mode?: string, config?: { provider?: string } } | null | undefined} route
 */
export function loopRouteFor(route) {
  return topicProvider(route) !== null;
}

/**
 * The fast model this key can use: the first of `models` that `available`
 * says yes to. `available(model)` resolves true or false, or null when that
 * could not be told (offline, a server error). `settled` is false when an
 * answer was unknown, so the caller asks again next time instead of keeping a
 * no for the session.
 *
 * @param {(model: string) => Promise<boolean | null>} available
 * @returns {Promise<{ model: string | null, settled: boolean }>}
 */
export async function chooseFastModel(available, models = FAST_MODELS) {
  for (const model of models) {
    let answer = null;
    try {
      answer = await available(model);
    } catch {
      answer = null;
    }
    if (answer === true) return { model, settled: true };
    if (answer !== false) return { model: null, settled: false };
  }
  return { model: null, settled: true };
}

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

/**
 * The JSON object in a model's answer: as is, in a code fence, or between the
 * outermost braces. Null when there is none.
 */
export function readJson(text) {
  const raw = String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const tries = [raw];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fence) tries.push(fence[1]);
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) tries.push(raw.slice(first, last + 1));
  for (const candidate of tries) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  return null;
}

/**
 * The lines a request quotes around a change: the ones nearest to it first,
 * alternating after and before, until `budget` characters (each line clipped
 * to `lineChars`) or the counts are reached. Returned in conversation order.
 *
 * @template {{ text: string }} L
 * @param {L[]} before Lines before the change, oldest first.
 * @param {L[]} after Lines from the change on, oldest first.
 * @returns {{ before: L[], after: L[], chars: number }}
 */
export function excerptAround(
  before,
  after,
  { budget = MAX_EXCERPT_CHARS, lineChars = LINE_CHARS } = {}
) {
  const keptBefore = [];
  const keptAfter = [];
  let chars = 0;
  let a = 0;
  let b = before.length - 1;
  // After the change first: it is what the request is about.
  for (let turn = 0; a < after.length || b >= 0; turn += 1) {
    const takeAfter = a < after.length && (turn % 2 === 0 || b < 0);
    const line = takeAfter ? after[a] : before[b];
    const size = clip(line.text, lineChars).length;
    if (chars + size > budget) {
      // One side is full: keep filling the other.
      if (takeAfter) a = after.length;
      else b = -1;
      continue;
    }
    chars += size;
    if (takeAfter) keptAfter.push(after[a++]);
    else keptBefore.unshift(before[b--]);
  }
  return { before: keptBefore, after: keptAfter, chars };
}

function race(work, ms, setTimer, clearTimer) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => reject(new Error("timed out")), Math.max(0, ms));
  });
  return Promise.race([work, timeout]).finally(() => clearTimer(timer));
}

export class LiveTopicLoop {
  /**
   * @param {{
   *   ask: (request: { kind: string, system: string, user: string,
   *     schema: { name: string, schema: object }, maxTokens: number }) => Promise<string>,
   *   ready?: () => Promise<boolean> | boolean,
   *   onChange?: () => void,
   *   now?: () => number,
   *   setTimer?: (fn: () => void, ms: number) => unknown,
   *   clearTimer?: (timer: unknown) => void,
   *   log?: (event: string, detail?: Record<string, unknown>) => void,
   *   timeoutMs?: number,
   *   proposer?: { onUtterance: Function, snapshot: Function } | null,
   * }} options
   *   `ask` sends one request to the fast model and resolves to its answer's
   *   text. `ready` says whether the model may be asked now; when it says no,
   *   nothing is sent and the loop ends (`disabled`). `onChange` is called
   *   when what the view shows changed after an answer (a cut, a name, the
   *   loop ending), so it can be published.
   */
  constructor({
    ask,
    ready = () => true,
    onChange = () => {},
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(/** @type {any} */ (timer)),
    log = () => {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    excerptChars = MAX_EXCERPT_CHARS,
    checkAfterWords = CHECK_AFTER_WORDS,
    proposer = null,
  }) {
    Object.assign(this, { ask, ready, onChange, now, setTimer, clearTimer, log, timeoutMs });
    Object.assign(this, { excerptChars, checkAfterWords });
    this.proposer = proposer ?? new ConversationTopicTracker({ now, scale: { ...PROPOSER_SCALE } });

    /** @type {Array<{ id: string, text: string, at: number, words: number, index: number }>} */
    this.lines = [];
    this.byId = new Map();
    /** @type {Map<string, any>} */
    this.topics = new Map();
    /** @type {Map<string, string>} line id -> topic id */
    this.topicOf = new Map();
    this.currentId = null;
    this.nextId = 1;
    this.resolvedLines = new Set();

    this.proposals = [];
    this.seenStarts = new Set();
    this.lastDecidedIndex = -1;
    this.wordsSinceCheck = 0;
    this.running = false;
    /** A request given up on (timed out) that has not settled yet: none goes out beside it. */
    this.outstanding = null;
    this.timer = null;
    this.stopped = false;
    this.disabled = false;
    this.failures = 0;
    this.retryAt = 0;
    this.requestTimes = [];
    /** Lines quoted in at least one request: how much of the conversation left. */
    this.sentIds = new Set();
    this.stats = {
      requests: 0,
      answered: 0,
      failed: 0,
      malformed: 0,
      cuts: 0,
      returns: 0,
      renames: 0,
      named: 0,
      unusableNames: 0,
      kinds: /** @type {Record<string, number>} */ ({}),
      ms: /** @type {number[]} */ ([]),
    };
  }

  // --- Lines in.

  /** A finalized line: shown at once in the topic the room is on. */
  onUtterance(utterance) {
    const text = oneLine(utterance?.text);
    if (!text || this.byId.has(String(utterance.id))) return;
    const line = {
      id: String(utterance.id),
      text,
      // When it was said, for durations, as the tracker counts them.
      at: Number.isFinite(utterance.at) ? utterance.at : this.now(),
      words: countWords(text),
      index: this.lines.length,
    };
    this.lines.push(line);
    this.byId.set(line.id, line);
    if (!this.currentId) this.currentId = this._create(line.at);
    this._place([line], this.currentId);
    this.wordsSinceCheck += line.words;
    this.proposer.onUtterance({ id: line.id, text, at: line.at });
    this._propose();
    this._schedule();
  }

  /** A question asked on a line was answered: its topic reached a conclusion. */
  resolveTopicForUtterance(utteranceId) {
    const id = String(utteranceId ?? "");
    if (!this.byId.has(id)) return false;
    this.resolvedLines.add(id);
    return true;
  }

  /** No more requests: a new recording has its own loop. */
  stop() {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  // --- The view.

  /**
   * The topics as the flow card draws them, in the tracker's shape. A topic the
   * model has not named shows the on-device name of the topic that holds most
   * of its lines in `device` (the on-device tracker's snapshot).
   */
  snapshot(at = this.now(), { device = null } = {}) {
    const deviceOf = new Map();
    for (const node of device?.nodes ?? []) {
      for (const id of node.utteranceIds ?? []) deviceOf.set(String(id), node);
    }
    const runs = this._runs();
    const nodes = [];
    for (const topic of this.topics.values()) {
      if (!topic.utteranceIds.length) continue;
      const deviceLabel = this._deviceLabel(topic, deviceOf);
      const own = runs.filter((run) => run.topic === topic.id);
      let durationMs = 0;
      for (const run of own) {
        for (let index = run.from + 1; index <= run.to; index += 1) {
          const gap = this.lines[index].at - this.lines[index - 1].at;
          if (gap > 0) durationMs += Math.min(gap, DROP_AFTER_MS);
        }
      }
      nodes.push({
        id: Number(topic.id),
        label: topic.name ?? deviceLabel,
        ...(topic.name ? { deviceLabel } : {}),
        words: this._topWords(topic),
        durationMs,
        utteranceIds: [...topic.utteranceIds],
        firstAt: topic.firstAt,
        lastAt: topic.lastAt,
        returns: Math.max(0, own.length - 1),
        state:
          topic.id === this.currentId
            ? "live"
            : topic.utteranceIds.some((id) => this.resolvedLines.has(id))
              ? "resolved"
              : at - topic.lastAt >= DROP_AFTER_MS
                ? "dropped"
                : "open",
      });
    }
    nodes.sort((a, b) => a.firstAt - b.firstAt);
    const edges = [];
    const entered = new Set(runs[0] ? [runs[0].topic] : []);
    for (let index = 1; index < runs.length; index += 1) {
      const from = Number(runs[index - 1].topic);
      const to = Number(runs[index].topic);
      const kind = entered.has(runs[index].topic) ? "return" : "new";
      entered.add(runs[index].topic);
      const existing = edges.find((edge) => edge.from === from && edge.to === to);
      if (existing) existing.weight += 1;
      else edges.push({ from, to, weight: 1, kind });
    }
    return { nodes, edges };
  }

  /**
   * The names given here, for another cut of the same conversation (the
   * record): each goes to the topic of `snapshot` that holds most of the lines
   * it was given from, while that topic still holds at least half of them
   * (`nameStillFits`), and no two topics get one name. `held` tells #121's
   * namer not to ask for these topics again.
   *
   * @returns {Map<any, { name: string, words: number, namings: number, utteranceIds: string[], held?: boolean }>}
   */
  namesFor(snapshot) {
    const candidates = [];
    for (const topic of this.topics.values()) {
      if (!topic.name || !topic.namedIds.length) continue;
      const named = new Set(topic.namedIds);
      let best = null;
      let bestHeld = 0;
      for (const node of snapshot?.nodes ?? []) {
        let held = 0;
        for (const id of node.utteranceIds ?? []) if (named.has(String(id))) held += 1;
        if (held > bestHeld) {
          best = node;
          bestHeld = held;
        }
      }
      if (!best || !nameStillFits(best, { utteranceIds: topic.namedIds })) continue;
      candidates.push({ node: best, topic, share: bestHeld / named.size, held: bestHeld });
    }
    // Where two names fit one topic, the one given from more of its lines.
    candidates.sort((a, b) => b.share - a.share || b.held - a.held);
    const names = new Map();
    for (const { node, topic } of candidates) {
      if (names.has(node.id)) continue;
      if ([...names.values()].some((record) => sameName(record.name, topic.name))) continue;
      names.set(node.id, {
        name: topic.name,
        words: topic.namedWords,
        namings: topic.namings,
        utteranceIds: [...topic.namedIds],
        held: true,
      });
    }
    return names;
  }

  // --- Internals: the topics.

  _create(at) {
    const id = String(this.nextId++);
    this.topics.set(id, {
      id,
      name: null,
      gist: "",
      namedWords: 0,
      namedIds: [],
      namings: 0,
      utteranceIds: [],
      firstAt: at,
      lastAt: at,
    });
    return id;
  }

  _place(lines, topicId) {
    const topic = this.topics.get(topicId);
    if (!topic) return;
    for (const line of lines) {
      const before = this.topicOf.get(line.id);
      if (before === topicId) continue;
      if (before) {
        const old = this.topics.get(before);
        old.utteranceIds = old.utteranceIds.filter((id) => id !== line.id);
        this._bounds(old);
      }
      this.topicOf.set(line.id, topicId);
      topic.utteranceIds.push(line.id);
    }
    topic.utteranceIds.sort((a, b) => this.byId.get(a).index - this.byId.get(b).index);
    this._bounds(topic);
  }

  _bounds(topic) {
    const first = this.byId.get(topic.utteranceIds[0]);
    const last = this.byId.get(topic.utteranceIds.at(-1));
    if (first) topic.firstAt = first.at;
    if (last) topic.lastAt = last.at;
  }

  _words(topic) {
    let total = 0;
    for (const id of topic.utteranceIds) total += this.byId.get(id)?.words ?? 0;
    return total;
  }

  _name(topic, raw, gist, excerpt) {
    const others = [...this.topics.values()]
      .filter((other) => other.id !== topic.id && other.name)
      .map((other) => other.name);
    const name = parseTopicName(oneLine(raw), { others, excerpt });
    if (!name) {
      this.stats.unusableNames += 1;
      return false;
    }
    topic.name = name;
    topic.gist = clip(gist ?? topic.gist ?? "", 120);
    topic.namedWords = this._words(topic);
    topic.namedIds = [...topic.utteranceIds];
    topic.namings += 1;
    this.stats.named += 1;
    return true;
  }

  /** The topic another topic's name says it is: a "new" topic named like an old one is a return. */
  _namedLike(raw) {
    for (const topic of this.topics.values())
      if (topic.name && sameName(topic.name, raw)) return topic.id;
    return null;
  }

  _runs() {
    const runs = [];
    this.lines.forEach((line, index) => {
      const topic = this.topicOf.get(line.id);
      if (!topic) return;
      const last = runs.at(-1);
      if (last && last.topic === topic) last.to = index;
      else runs.push({ topic, from: index, to: index });
    });
    return runs;
  }

  _currentRunMinutes() {
    let first = null;
    for (let index = this.lines.length - 1; index >= 0; index -= 1) {
      if (this.topicOf.get(this.lines[index].id) !== this.currentId) break;
      first = this.lines[index].at;
    }
    const last = this.lines.at(-1)?.at ?? first;
    return first === null ? 0 : Math.max(0, last - first) / 60_000;
  }

  _deviceLabel(topic, deviceOf) {
    const votes = new Map();
    for (const id of topic.utteranceIds) {
      const node = deviceOf.get(id);
      if (node?.label) votes.set(node.label, (votes.get(node.label) ?? 0) + 1);
    }
    let best = null;
    let most = 0;
    for (const [label, count] of votes) {
      if (count > most) {
        best = label;
        most = count;
      }
    }
    if (best) return best;
    const proposed = this.proposer.snapshot(this.now()).nodes ?? [];
    const last = topic.utteranceIds.at(-1);
    return proposed.find((node) => node.utteranceIds?.includes(last))?.label ?? "…";
  }

  _topWords(topic) {
    const counts = new Map();
    for (const id of topic.utteranceIds) {
      for (const word of contentWords(this.byId.get(id)?.text ?? "")) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word]) => word);
  }

  _listed() {
    const now = this.now();
    const topics = [...this.topics.values()].filter((topic) => topic.utteranceIds.length);
    topics.sort((a, b) => b.lastAt - a.lastAt);
    return topics
      .slice(0, 10)
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((topic) => {
        const gist = topic.gist ? ` | ${topic.gist}` : "";
        const minutes = Math.max(0, topic.lastAt - topic.firstAt) / 60_000;
        const ago =
          topic.id === this.currentId
            ? " | CURRENT"
            : `, last ${minutesText((now - topic.lastAt) / 60_000)} ago`;
        return `${topic.id} | ${topic.name ?? "(not named yet)"}${gist} | ${minutesText(minutes)}${ago}`;
      });
  }

  // --- Internals: proposals and requests.

  /** Places where the proposer's live view starts a new run, after what was decided. */
  _propose() {
    const snapshot = this.proposer.snapshot(this.now());
    const topicOf = new Map();
    for (const node of snapshot.nodes ?? []) {
      for (const id of node.utteranceIds ?? []) topicOf.set(String(id), node.id);
    }
    let previous = null;
    for (const line of this.lines) {
      const topic = topicOf.get(line.id);
      if (topic == null) continue;
      if (
        previous != null &&
        topic !== previous &&
        !this.seenStarts.has(line.id) &&
        line.index > this.lastDecidedIndex
      ) {
        this.seenStarts.add(line.id);
        this.proposals.push(line);
      }
      previous = topic;
    }
  }

  _due() {
    const current = this.topics.get(this.currentId);
    if (current && !current.name && this._words(current) >= FIRST_NAME_WORDS) return "name";
    if (this.proposals.length) return "proposal";
    if (this.wordsSinceCheck >= this.checkAfterWords) return "periodic";
    return null;
  }

  _schedule() {
    if (this.stopped || this.disabled || this.running || this.timer !== null) return;
    if (this.outstanding || this.now() < this.retryAt || !this._due()) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this._run();
    }, SETTLE_MS);
  }

  _underCeiling() {
    const hourAgo = this.now() - 3_600_000;
    this.requestTimes = this.requestTimes.filter((at) => at > hourAgo);
    return this.requestTimes.length < MAX_REQUESTS_PER_HOUR;
  }

  async _run() {
    if (this.stopped || this.disabled || this.running || this.outstanding) return;
    const kind = this._due();
    if (!kind) return;
    if (!this._underCeiling()) {
      this.log("ceiling");
      return;
    }
    this.running = true;
    let changed = false;
    try {
      // The writing model is no longer this provider's: nothing more is sent.
      if (!(await this.ready())) {
        this._giveUp("not-ready");
        return;
      }
      if (kind === "name") changed = await this._nameCurrent();
      else if (kind === "proposal") {
        const at = this.proposals.shift();
        changed = await this._check(at, "proposal");
        this.proposals = this.proposals.filter((line) => line.index > this.lastDecidedIndex);
      } else changed = await this._check(null, "periodic");
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

  /** One request; resolves to the parsed JSON, or null when it failed or was not JSON. */
  async _request(kind, system, user, schema, maxTokens) {
    this.stats.requests += 1;
    this.stats.kinds[kind] = (this.stats.kinds[kind] ?? 0) + 1;
    this.requestTimes.push(this.now());
    const started = this.now();
    const work = Promise.resolve().then(() => this.ask({ kind, system, user, schema, maxTokens }));
    // Until it settles, even after a timeout, no other request goes out.
    this.outstanding = work;
    const settled = () => {
      if (this.outstanding !== work) return;
      this.outstanding = null;
      this._schedule();
    };
    work.then(settled, settled);
    let text;
    try {
      text = await race(work, this.timeoutMs, this.setTimer, this.clearTimer);
    } catch (error) {
      this.stats.failed += 1;
      this.log("failed", {
        kind,
        ms: this.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      this._failed();
      return null;
    }
    this.stats.ms.push(this.now() - started);
    const json = readJson(text);
    if (!json) {
      this.stats.malformed += 1;
      this.log("malformed", { kind });
      this._failed();
      return null;
    }
    this.failures = 0;
    this.stats.answered += 1;
    return json;
  }

  _failed() {
    this.failures += 1;
    this.retryAt = this.now() + RETRY_AFTER_MS * this.failures;
    if (this.failures >= MAX_FAILURES) this._giveUp("failures");
  }

  /** The loop ends for the recording; the view goes back to the on-device tracker's. */
  _giveUp(reason) {
    if (this.disabled) return;
    this.disabled = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.proposals = [];
    this.log("gave-up", { reason, failures: this.failures });
    try {
      this.onChange();
    } catch {}
  }

  async _nameCurrent() {
    const topic = this.topics.get(this.currentId);
    if (!topic || topic.name) return false;
    const lines = topic.utteranceIds.map((id) => this.byId.get(id));
    const { before: kept } = excerptAround(lines, [], { budget: this.excerptChars });
    for (const line of kept) this.sentIds.add(line.id);
    const json = await this._request(
      "name",
      FIRST_NAME_SYSTEM,
      ["What was said:", ...kept.map((line) => `- ${clip(line.text, LINE_CHARS)}`)].join("\n"),
      FIRST_NAME_SCHEMA,
      120
    );
    if (!json?.name || topic.name || !this.topics.has(topic.id)) return false;
    return this._name(
      topic,
      json.name,
      json.gist,
      kept.map((line) => line.text)
    );
  }

  /** One check: at a proposed change (`at` is its first line), or over a topic that ran long. */
  async _check(at, kind) {
    const current = this.topics.get(this.currentId);
    if (!current) return false;
    const lines = current.utteranceIds.map((id) => this.byId.get(id));
    // A proposal for a line no longer in the current topic was decided already.
    if (at && !lines.includes(at)) return false;
    let before;
    let after;
    if (at) {
      const index = lines.indexOf(at);
      before = lines.slice(Math.max(0, index - BEFORE_LINES), index);
      after = lines.slice(index, index + AFTER_LINES);
    } else {
      const recent = lines.slice(-MAX_CHECK_LINES);
      const third = Math.max(1, Math.floor(recent.length / 3));
      before = recent.slice(0, third);
      after = recent.slice(third);
    }
    this.wordsSinceCheck = 0;
    ({ before, after } = excerptAround(before, after, { budget: this.excerptChars }));
    if (!after.length) return false;
    const user = [
      "TOPICS:",
      ...this._listed(),
      "",
      `CURRENT: ${current.id} | ${current.name ?? "(not named yet)"}, for ${minutesText(this._currentRunMinutes())} so far`,
      "",
      "BEFORE:",
      ...(before.length
        ? before.map((line, index) => `B${index + 1}. ${clip(line.text, LINE_CHARS)}`)
        : ["(none)"]),
      "",
      "AFTER:",
      ...after.map((line, index) => `A${index + 1}. ${clip(line.text, LINE_CHARS)}`),
    ].join("\n");
    for (const line of [...before, ...after]) this.sentIds.add(line.id);
    const json = await this._request(kind, CHECK_SYSTEM, user, CHECK_SCHEMA, 200);
    if (!json) return false;
    if (!["same", "new", "return"].includes(json.decision)) {
      this.stats.malformed += 1;
      return false;
    }
    this.lastDecidedIndex = Math.max(this.lastDecidedIndex, after.at(-1).index);
    if (this.stopped || !this.topics.has(current.id)) return false;
    let changed = false;
    if (json.decision === "new" || json.decision === "return") {
      changed = this._move(current, after, json);
    }
    if (json.rename && this.currentId === current.id && current.name) {
      const words = this._words(current);
      if (words >= Math.max(FIRST_NAME_WORDS, current.namedWords * RENAME_GROWTH)) {
        const previous = current.name;
        const excerpt = current.utteranceIds.slice(-10).map((id) => this.byId.get(id)?.text ?? "");
        if (
          this._name(current, json.rename, current.gist, excerpt) &&
          !sameName(previous, current.name)
        ) {
          this.stats.renames += 1;
          changed = true;
        }
      }
    }
    return changed;
  }

  /**
   * A change of subject at AFTER's line `json.at`: the lines from there on go
   * to the new (or returned) topic in one step, and the conversation goes on
   * there.
   */
  _move(current, after, json) {
    const from = Math.min(Math.max(1, Number(json.at) || 1), after.length) - 1;
    const start = after[from];
    const rest = current.utteranceIds
      .map((id) => this.byId.get(id))
      .filter((line) => line.index >= start.index);
    let target = null;
    let returned = false;
    if (json.decision === "return") {
      const id = oneLine(json.topic);
      if (id && id !== current.id && this.topics.get(id)?.utteranceIds.length) {
        target = id;
        returned = true;
      }
    } else {
      const same = json.name ? this._namedLike(json.name) : null;
      if (same && same !== current.id) {
        target = same;
        returned = true;
      } else {
        target = this._create(start.at);
        // Named from the lines from the change on, which the record (cut again
        // at Finish) may also hold. An unusable name leaves the topic on its
        // on-device name.
        if (json.name) {
          this._nameNew(
            this.topics.get(target),
            json.name,
            json.gist,
            rest.slice(0, AFTER_LINES).map((line) => line.text),
            rest.map((line) => line.id)
          );
        } else {
          this.stats.unusableNames += 1;
        }
      }
    }
    if (!target) return false;
    this._place(rest, target);
    this.currentId = target;
    if (returned) this.stats.returns += 1;
    else this.stats.cuts += 1;
    return true;
  }

  _nameNew(topic, raw, gist, excerpt, namedIds) {
    const others = [...this.topics.values()]
      .filter((other) => other.id !== topic.id && other.name)
      .map((other) => other.name);
    const name = parseTopicName(oneLine(raw), { others, excerpt });
    if (!name) {
      this.stats.unusableNames += 1;
      return false;
    }
    topic.name = name;
    topic.gist = clip(gist ?? "", 120);
    topic.namedIds = namedIds.map(String);
    topic.namedWords = namedIds.reduce(
      (total, id) => total + (this.byId.get(String(id))?.words ?? 0),
      0
    );
    topic.namings += 1;
    this.stats.named += 1;
    return true;
  }
}
