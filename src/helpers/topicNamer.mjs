// When the writing model is asked to name a conversation's topics: during a
// recording, as topics grow, and once more when it ends, for the record.
//
// The prompt, the reading of the answer and the rule for when a topic needs a
// name are in `topicNaming.mjs`; this decides when requests go out. The model
// itself is behind `ask`, and whether it may be used behind `ready`, so this
// runs under node:test with stubs and in the renderer with the real route
// (`stores/topicNamingRunner.ts`).
//
// The rules, each for a reason:
//
// - **One request at a time.** On this computer the writing model answers one
//   request at a time, and the question classifier, the context check and the
//   summary wait in the same line (`oneAtATime.js`). A provider bills each one.
// - **Settled first.** A request waits until no turn has landed for
//   `settleMs`, and never more than `maxSettleMs`, so it reads a topic between
//   turns rather than in the middle of one.
// - **The topic the room is on goes first**, then topics with no name in the
//   order they were raised, then the ones that grew.
// - **The topic the room is on is read up to a change the tracker proposed.**
//   The tracker draws a change of subject only once enough talk has followed
//   it, and until then the next subject's turns are shown in the live topic.
//   When the room comes back to a topic and then moves on, a rename read from
//   all of the live topic's turns is read from the next subject, and the name
//   stays after the cut is drawn (`nameStillFits`). So a request quotes, and
//   the naming rules count (`topicNeedsName`), only the live topic's turns
//   before a change the tracker proposes in it (`namedTurnIds`).
// - **A name never goes back.** A topic shows its on-device name until the
//   model's arrives, and that name until a newer one arrives. Nothing on screen
//   changes while a request is out, and a failure changes nothing at all.
// - **Failures back off.** A topic whose request failed is asked again only
//   once it has grown by half. Three failures in a row end naming for the
//   recording: a model that is not answering will not start in the middle of
//   a meeting, and asking on would only fill its queue.
// - **The end names what is left**, within a time budget: smaller topics, and
//   topics that grew since their last name (`finish`).

import { countWords } from "./recordingCounters.mjs";
import {
  applyTopicNames,
  buildTopicNamePrompt,
  isNameableTopic,
  nameStillFits,
  parseTopicName,
  sameName,
  topicNeedsName,
} from "./topicNaming.mjs";

/** A name that takes longer than this is not waited for. */
export const NAME_TIMEOUT_MS = 20_000;

/** How long no turn must land before a request goes out. */
export const SETTLE_MS = 2_500;

/** The longest a topic that needs a name waits for the room to pause. */
export const MAX_SETTLE_MS = 10_000;

/** The pause between one name arriving and the next request. */
export const NEXT_GAP_MS = 500;

/** How long to wait before asking again whether the model is ready. */
export const NOT_READY_BACKOFF_MS = 60_000;

/** A topic whose request failed is asked again once it holds this many times the words. */
export const RETRY_GROWTH = 1.5;

/** Failures in a row that end naming for the recording. */
export const MAX_FAILURES = 3;

/** The most the end of a conversation spends on names. */
export const FINAL_BUDGET_MS = 30_000;

function race(work, ms, setTimer, clearTimer, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => reject(new Error(message)), Math.max(0, ms));
  });
  return Promise.race([work, timeout]).finally(() => clearTimer(timer));
}

/**
 * The ids of the turns a topic is named from, in the order said: all of its
 * turns, except in the topic the room is on when the tracker proposes a
 * change of subject in it that it has not drawn yet (`unsettledFrom`). Then
 * only the turns before the change: the ones from it on may still go to the
 * next topic.
 */
export function namedTurnIds(node) {
  const ids = Array.isArray(node?.utteranceIds) ? node.utteranceIds : [];
  if (node?.unsettledFrom == null) return ids;
  const from = ids.findIndex((id) => String(id) === String(node.unsettledFrom));
  return from >= 0 ? ids.slice(0, from) : ids;
}

export class TopicNamer {
  /**
   * @param {{
   *   ask: (prompt: { system: string, text: string }) => Promise<string>,
   *   ready?: () => Promise<boolean> | boolean,
   *   onChange?: () => void,
   *   live?: boolean,
   *   now?: () => number,
   *   setTimer?: (fn: () => void, ms: number) => unknown,
   *   clearTimer?: (timer: unknown) => void,
   *   timeoutMs?: number,
   *   settleMs?: number,
   *   maxSettleMs?: number,
   *   log?: (event: string, detail?: Record<string, unknown>) => void,
   * }} options
   *   `ask` sends one prompt to the writing model and resolves to its answer.
   *   `ready` says whether the model may be used now; nothing is sent when it
   *   says no. `onChange` is called when a topic's shown name changes, so the
   *   snapshot can be published again. `live` false names nothing while
   *   recording, only at the end.
   */
  constructor({
    ask,
    ready = () => true,
    onChange = () => {},
    live = true,
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(/** @type {any} */ (timer)),
    timeoutMs = NAME_TIMEOUT_MS,
    settleMs = SETTLE_MS,
    maxSettleMs = MAX_SETTLE_MS,
    log = () => {},
  }) {
    this.ask = ask;
    this.ready = ready;
    this.onChange = onChange;
    this.live = live;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timeoutMs = timeoutMs;
    this.settleMs = settleMs;
    this.maxSettleMs = maxSettleMs;
    this.log = log;

    /**
     * The names given, by topic id. `held` marks a name the live topic check
     * gave (`stores/topicNamingRunner.ts`), which this never asks for again.
     *
     * @type {Map<number, { name: string, words: number, namings: number, utteranceIds: string[], held?: boolean }>}
     */
    this.names = new Map();
    /** @type {Map<number, { words: number, final: boolean }>} */
    this.failed = new Map();
    this.snapshot = null;
    this.segments = [];
    this.timer = null;
    this.waitingSince = null;
    this.running = false;
    /** @type {Promise<unknown> | null} */
    this.inFlight = null;
    this.stopped = false;
    this.disabled = false;
    this.failures = 0;
    this.notReadyUntil = 0;
    this.stats = {
      requests: 0,
      named: 0,
      unusable: 0,
      failed: 0,
      ms: /** @type {number[]} */ ([]),
    };

    this._indexed = null;
    this._indexedLength = 0;
    this._byId = new Map();
    this._wordCounts = new WeakMap();
  }

  /** The snapshot with the model's names on its topics. */
  apply(snapshot) {
    return applyTopicNames(snapshot, this.names);
  }

  /**
   * The tracker's latest snapshot (unnamed) and the transcript's segments, on
   * every turn. Schedules a request when a topic needs a name.
   */
  observe(snapshot, segments) {
    this.snapshot = snapshot ?? null;
    this.segments = Array.isArray(segments) ? segments : [];
    if (!this.live || this.stopped || this.disabled || this.running) return;
    if (this.now() < this.notReadyUntil) return;
    if (!this._next(false)) return;
    this._schedule(this.settleMs);
  }

  /** No more requests while recording: a new recording has its own namer. */
  stop() {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  /**
   * The end of the conversation: wait for the request that is out, then name
   * the topics the record still needs named (`topicNeedsName`, final), one at
   * a time, until there are none or `budgetMs` has passed. Resolves to the
   * final snapshot with every name on it.
   *
   * @param {{ nodes?: any[] } | null} snapshot The final snapshot.
   * @param {Array<{ id: unknown, text?: string }>} segments
   * @param {{ budgetMs?: number }} [options]
   */
  async finish(snapshot, segments, { budgetMs = FINAL_BUDGET_MS } = {}) {
    this.stop();
    this.snapshot = snapshot ?? null;
    this.segments = Array.isArray(segments) ? segments : [];
    const deadline = this.now() + budgetMs;
    if (this.inFlight) {
      await race(this.inFlight, deadline - this.now(), this.setTimer, this.clearTimer, "").catch(
        () => undefined
      );
    }
    if (!this.disabled && this.snapshot) {
      let ready = null;
      let failures = 0;
      while (this.now() < deadline) {
        const job = this._next(true);
        if (!job) break;
        if (ready === null) ready = Boolean(await this.ready());
        if (!ready) break;
        const left = deadline - this.now();
        if (left <= 0) break;
        const result = await this._name(job, {
          final: true,
          timeoutMs: Math.min(this.timeoutMs, left),
        });
        failures = result.ok ? 0 : failures + 1;
        if (failures >= 2) break;
      }
    }
    return this.apply(this.snapshot);
  }

  // --- Internals.

  _schedule(delay) {
    const at = this.now();
    if (this.waitingSince === null) this.waitingSince = at;
    const due = Math.min(at + delay, this.waitingSince + this.maxSettleMs);
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(
      () => {
        this.timer = null;
        this.waitingSince = null;
        void this._runLive();
      },
      Math.max(0, due - at)
    );
  }

  async _runLive() {
    if (!this.live || this.stopped || this.disabled || this.running) return;
    if (!this._next(false)) return;
    this.running = true;
    const work = (async () => {
      if (!(await this.ready())) {
        this.notReadyUntil = this.now() + NOT_READY_BACKOFF_MS;
        this.log("not-ready");
        return false;
      }
      // Picked again: the room may have moved on while readiness was read.
      const job = this._next(false);
      if (!job) return false;
      const result = await this._name(job, { final: false, timeoutMs: this.timeoutMs });
      return result.changed;
    })();
    this.inFlight = work;
    let changed = false;
    try {
      changed = Boolean(await work);
    } catch {
      changed = false;
    } finally {
      this.running = false;
      this.inFlight = null;
    }
    if (changed) {
      try {
        this.onChange();
      } catch (error) {
        this.log("publish-failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (this.stopped || this.disabled || this.now() < this.notReadyUntil) return;
    if (this._next(false)) this._schedule(NEXT_GAP_MS);
  }

  _index() {
    // The store replaces its segments on every change; a caller that appends
    // to one array is caught by its length.
    if (this._indexed !== this.segments || this._indexedLength !== this.segments.length) {
      this._indexed = this.segments;
      this._indexedLength = this.segments.length;
      this._byId = new Map();
      for (const segment of this.segments) {
        if (segment && segment.id != null) this._byId.set(String(segment.id), segment);
      }
    }
    return this._byId;
  }

  _words(node, byId) {
    let total = 0;
    for (const id of namedTurnIds(node)) {
      const segment = byId.get(String(id));
      if (!segment) continue;
      let count = this._wordCounts.get(segment);
      if (count === undefined) {
        count = countWords(String(segment.text ?? ""));
        this._wordCounts.set(segment, count);
      }
      total += count;
    }
    return total;
  }

  /** The record of a topic's name, when it still fits the topic. */
  _record(node) {
    const record = this.names.get(node.id) ?? null;
    return record && nameStillFits(node, record) ? record : null;
  }

  /** The model's names of the other topics in the snapshot. */
  _others(id) {
    const names = [];
    for (const node of Array.isArray(this.snapshot?.nodes) ? this.snapshot.nodes : []) {
      if (!node || node.id === id) continue;
      const record = this._record(node);
      if (record) names.push(record.name);
    }
    return names;
  }

  /** The topic to name next, or null when none needs a name. */
  _next(final) {
    const nodes = Array.isArray(this.snapshot?.nodes) ? this.snapshot.nodes : [];
    if (!nodes.length) return null;
    const byId = this._index();
    const jobs = [];
    for (const node of nodes) {
      if (!isNameableTopic(node)) continue;
      const words = this._words(node, byId);
      const record = this._record(node);
      // A name the live topic check gave (topicLoop.mjs `namesFor`) is not
      // asked for again: one request names a topic, not two.
      if (record?.held) continue;
      const need = topicNeedsName({ words, record, final });
      if (!need) continue;
      const failed = this.failed.get(node.id);
      if (failed && (final ? failed.final : words < failed.words * RETRY_GROWTH)) continue;
      jobs.push({ node, words, record, need });
    }
    jobs.sort(
      (a, b) =>
        (final ? 0 : Number(b.node.state === "live") - Number(a.node.state === "live")) ||
        Number(a.need !== "first") - Number(b.need !== "first") ||
        (final ? b.words - a.words : (a.node.firstAt ?? 0) - (b.node.firstAt ?? 0))
    );
    return jobs[0] ?? null;
  }

  /**
   * One request for one topic. Resolves to whether the shown name changed and
   * whether the model answered at all.
   */
  async _name({ node, words, record }, { final, timeoutMs }) {
    const byId = this._index();
    const ids = namedTurnIds(node);
    const turns = ids
      .map((id) => byId.get(String(id))?.text)
      .filter((text) => typeof text === "string" && text.trim());
    const others = this._others(node.id);
    const prompt = buildTopicNamePrompt({ turns, others, current: record?.name ?? null });
    const started = this.now();
    this.stats.requests += 1;
    let answer;
    try {
      answer = await race(
        Promise.resolve().then(() => this.ask({ system: prompt.system, text: prompt.text })),
        timeoutMs,
        this.setTimer,
        this.clearTimer,
        "Topic naming timed out"
      );
    } catch (error) {
      this._failed(node.id, words, final);
      this.stats.failed += 1;
      this.log("failed", {
        topic: node.id,
        final,
        ms: this.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      return { changed: false, ok: false };
    }
    const ms = this.now() - started;
    this.stats.ms.push(ms);
    const name = parseTopicName(answer, { others, excerpt: prompt.excerpt });
    if (!name) {
      this._failed(node.id, words, final);
      this.stats.unusable += 1;
      this.log("unusable", { topic: node.id, final, ms });
      return { changed: false, ok: false };
    }
    this.failures = 0;
    this.failed.delete(node.id);
    const kept = Boolean(record?.name && sameName(record.name, name));
    this.names.set(node.id, {
      name: kept ? record.name : name,
      words,
      namings: (record?.namings ?? 0) + 1,
      // The turns it was read from: `nameStillFits` asks whether the topic
      // still holds them.
      utteranceIds: ids.map(String),
    });
    this.stats.named += 1;
    this.log("named", { topic: node.id, final, ms, words, kept, renamed: Boolean(record) });
    return { changed: !kept, ok: true };
  }

  _failed(id, words, final) {
    this.failed.set(id, { words, final });
    this.failures += 1;
    if (!final && this.failures >= MAX_FAILURES && !this.disabled) {
      this.disabled = true;
      if (this.timer !== null) this.clearTimer(this.timer);
      this.timer = null;
      this.log("gave-up", { failures: this.failures });
    }
  }
}
