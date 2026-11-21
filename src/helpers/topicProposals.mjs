// Early cuts and grey marks share the detector's evidence. Times are seconds
// of conversation, as in TopicChangeDetector.
import { CHANGE_RULE, changeScore, gapFeatures } from "./topicChange.mjs";

export const PROPOSAL_RULE = Object.freeze({
  slice: 15,
  schedule: Object.freeze([30]),
  threshold: 0.45,
  cap: 1,
  confirm: 20,
  expiresAfter: 65,
  maxFadesPerHour: 3,
});

const HOUR_S = 3600;
export const EARLY_READ_S = 15;
export const EARLY_CUT_SCORE = 0.45;
export const GREY_FLOOR = 0.4;
export const APPROVAL_CONFIDENCE = 0.8;

/** The text window that the candidate dump and the live judge read. */
export function approvalWindow(turns, g, textAt, lag = EARLY_READ_S) {
  const at = turns[g].start;
  let from = g;
  let to = g;
  while (from > 0 && turns[from - 1].start >= at - 90) from--;
  while (to < turns.length && turns[to].start < at + lag) to++;
  const lines = (start, end) => turns.slice(start, end).map((turn, i) => textAt(turn, start + i));
  return { before: lines(from, g), after: lines(g, to) };
}

export function proposalScore(detector, g, lag, learnedScore = undefined) {
  const features = gapFeatures(detector.turns, g, { lag, firstSeen: detector.firstSeen });
  return features.E30 === 0 ? 0 : (learnedScore ?? changeScore(features));
}

/** @typedef {{ id: string, startId: string, at: number, state: "grey" | "solid" | "faded", since: number }} Proposal */
/** @typedef {{ newSubject: boolean, confidence: number }} Verdict */
/** @typedef {{ before: string[], after: string[] }} ApprovalWindow */
/** @typedef {{ ask: (window: ApprovalWindow, isOpen: () => boolean) => Promise<Verdict | null>,
 *   text: (id: string) => string, active: () => boolean, now: () => number }} TopicProposalJudge */

export class TopicProposals {
  /**
   * The score and transition hooks let the replay reuse scores across rules
   * and retain a history without keeping it in the live session.
   * @param {Pick<import("./topicChange.mjs").TopicChangeDetector, "turns" | "firstSeen" | "cuts"> &
   *   Partial<Pick<import("./topicChange.mjs").TopicChangeDetector, "commitEarlyCut">>} detector
   * @param {{ rule?: Partial<Omit<typeof PROPOSAL_RULE, "schedule">> & { schedule?: ReadonlyArray<number | string> },
   *   startedAt?: number,
   *   greyFloor?: number,
   *   onCut?: (g: number, now: number, source: "early" | "reread" | "judge") => void,
   *   onGrey?: (mark: Proposal, g: number) => void,
   *   judge?: TopicProposalJudge,
   *   score?: (g: number, lag: number) => number,
   *   onChange?: (mark: Proposal) => void }} [options]
   */
  constructor(
    detector,
    {
      rule = {},
      startedAt = 0,
      greyFloor,
      onCut,
      onGrey,
      judge,
      score = (g, lag) => proposalScore(detector, g, lag),
      onChange,
    } = {}
  ) {
    this.detector = detector;
    this.startedAt = startedAt;
    this.rule = { ...PROPOSAL_RULE, ...rule };
    this.score = score;
    this.greyFloor = greyFloor;
    this.onCut = onCut;
    this.onGrey = onGrey;
    this.judge = judge;
    this.onChange = onChange;
    /** @type {Proposal[]} */
    this.marks = [];
    this.taken = new Set();
    this.fades = [];
    this.first = 1;
    this.nextCut = 0;
    this.lastTick = 0;
    this.reads = new Map();
    this.openIndex = null;
  }

  /** @param {number} index @param {"solid" | "faded"} state @param {number} since */
  _resolve(index, state, since) {
    const mark = { ...this.marks[index], state, since };
    this.marks[index] = mark;
    this.openIndex = null;
    this.onChange?.(mark);
  }

  /** Call as soon as the detector draws a cut, even between proposal ticks. */
  observeCuts(now) {
    const { turns, cuts } = this.detector;
    for (; this.nextCut < cuts.length; this.nextCut += 1) {
      const at = turns[cuts[this.nextCut]].start;
      for (let i = 0; i < this.marks.length; i += 1) {
        const mark = this.marks[i];
        if (
          mark.state === "grey" &&
          (this.greyFloor === undefined || now < mark.at + this.rule.expiresAfter) &&
          Math.abs(mark.at - at) <= this.rule.confirm
        ) {
          this._resolve(i, "solid", now);
        }
      }
    }
  }

  /**
   * Read at most once per slice. `landedThrough` is the time before which
   * every turn has arrived, not the time the wall clock says was heard.
   * If a call is late, do not invent past marks from today's evidence.
   */
  advance(now, landedThrough = now) {
    if (this.greyFloor !== undefined) return this._advanceBands(now, landedThrough);
    this.observeCuts(now);
    const { slice, cap, expiresAfter, confirm, schedule, threshold } = this.rule;
    const tick = Math.floor((now - this.startedAt) / slice);
    if (tick <= this.lastTick) return;
    this.lastTick = tick;
    this.marks = this.marks.filter((mark) => mark.state === "grey" || now - mark.since < slice);
    for (let i = 0; i < this.marks.length; i += 1) {
      const mark = this.marks[i];
      if (mark.state === "grey" && now >= mark.at + expiresAfter) {
        this._resolve(i, "faded", now);
        this.fades.push(now);
      }
    }
    while (this.fades.length && this.fades[0] <= now - HOUR_S) this.fades.shift();
    if (this.fades.length >= this.rule.maxFadesPerHour) return;
    const open = this.marks.filter((mark) => mark.state === "grey");
    if (open.length >= cap) return;

    const { turns, cuts } = this.detector;
    while (this.first < turns.length && turns[this.first].start <= now - expiresAfter) {
      this.taken.delete(this.first++);
    }
    const lastCut = turns[cuts.at(-1)];
    let best = null;
    for (let g = this.first; g < turns.length; g += 1) {
      const turn = turns[g];
      const at = turn.start;
      if (at > now) break;
      if (this.taken.has(g)) continue;
      if (lastCut && at - lastCut.start < CHANGE_RULE.spacing) continue;
      if (cuts.some((cut) => Math.abs(turns[cut].start - at) <= confirm)) continue;
      if (open.some((mark) => Math.abs(mark.at - at) < slice)) continue;
      let score = null;
      for (const entry of schedule) {
        // The replay also measures shorter reads that require an opening cue.
        const gated = typeof entry === "string";
        if (gated && !(turn.cues.phnext || turn.cues.phlets)) continue;
        const lag = gated ? Number(entry.slice(1)) : entry;
        if (at + lag > landedThrough || turn.end > now) continue;
        score = this.score(g, lag);
      }
      if (!(score >= threshold)) continue;
      if (!best || score > best.score) best = { g, score };
    }
    if (!best) return;
    const turn = turns[best.g];
    /** @type {Proposal} */
    const mark = {
      id: `proposal-${turn.id}`,
      startId: turn.id,
      at: turn.start,
      state: "grey",
      since: now,
    };
    this.taken.add(best.g);
    this.marks.push(mark);
    this.onChange?.(mark);
  }

  _clear(g) {
    const { turns, cuts } = this.detector;
    const last = turns[cuts.at(-1)];
    const at = turns[g].start;
    return !last || (at - last.start >= CHANGE_RULE.spacing && at - last.start > this.rule.confirm);
  }

  _ready(g, lag, landedThrough) {
    const { turns } = this.detector;
    const end = turns[g].start + lag;
    if (end > landedThrough) return false;
    for (let i = g; i < turns.length && turns[i].start < end; i++) {
      if (!turns[i].vector) return false;
    }
    return true;
  }

  _commit(g, now, source) {
    if (!this._clear(g) || !this.detector.commitEarlyCut?.(g, this.rule.confirm)) return false;
    this.observeCuts(now);
    this.onCut?.(g, now, source);
    return true;
  }

  _isOpen(mark, now) {
    return now < mark.at + this.rule.expiresAfter && this.marks.includes(mark);
  }

  /** A verdict acts only on the same mark while it is still open. */
  approve(id, verdict, now, confidence = APPROVAL_CONFIDENCE) {
    const mark = this.marks.find((item) => item.id === id && item.state === "grey");
    if (!mark || this.openIndex === null || !this._isOpen(mark, now)) return false;
    if (
      verdict?.newSubject !== true ||
      !Number.isFinite(verdict.confidence) ||
      verdict.confidence < confidence ||
      verdict.confidence > 1
    )
      return false;
    return this._commit(this.openIndex, now, "judge");
  }

  async _ask(mark, g) {
    const judge = this.judge;
    if (!judge) return;
    const isOpen = () => judge.active() && this._isOpen(mark, judge.now());
    if (!isOpen()) return;
    try {
      const window = approvalWindow(this.detector.turns, g, (turn) => judge.text(turn.id));
      const verdict = await judge.ask(window, isOpen);
      if (isOpen()) this.approve(mark.id, verdict, judge.now());
    } catch {
      // A failed judge leaves the mark to the local re-read or detector.
    }
  }

  _advanceBands(now, landedThrough) {
    const { slice, expiresAfter, maxFadesPerHour } = this.rule;
    this.observeCuts(now);
    this.marks = this.marks.filter((mark) => mark.state === "grey" || now - mark.since < slice);
    const open = this.openIndex;
    if (open !== null) {
      const { start } = this.detector.turns[open];
      if (now >= start + expiresAfter) {
        this._resolve(
          this.marks.findIndex((mark) => mark.state === "grey"),
          "faded",
          now
        );
        this.fades.push(now);
      } else if (!this.reads.get(open).checked && this._ready(open, 30, landedThrough)) {
        this.reads.get(open).checked = true;
        if (this.score(open, 30) >= EARLY_CUT_SCORE) this._commit(open, now, "reread");
      }
    }
    const tick = Math.floor((now - this.startedAt) / slice);
    const newTick = tick > this.lastTick;
    if (newTick) this.lastTick = tick;
    while (this.fades.length && this.fades[0] <= now - HOUR_S) this.fades.shift();

    const { turns } = this.detector;
    while (this.first < turns.length && turns[this.first].start <= now - expiresAfter) {
      this.reads.delete(this.first++);
    }
    let best = null;
    for (
      let g = this.first;
      g < turns.length && turns[g].start + EARLY_READ_S <= landedThrough;
      g++
    ) {
      if (!this._clear(g)) continue;
      let read = this.reads.get(g);
      if (!read) {
        if (!this._ready(g, EARLY_READ_S, landedThrough)) continue;
        read = { value: this.score(g, EARLY_READ_S), checked: false, shown: false };
        this.reads.set(g, read);
        if (read.value >= EARLY_CUT_SCORE) {
          this._commit(g, now, "early");
          best = null;
          continue;
        }
      }
      if (
        newTick &&
        !read.shown &&
        read.value >= this.greyFloor &&
        read.value < EARLY_CUT_SCORE &&
        (!best || read.value > best.value)
      )
        best = { g, value: read.value };
    }
    if (!best || this.openIndex !== null || this.fades.length >= maxFadesPerHour) return;
    const g = best.g;
    const turn = turns[g];
    /** @type {Proposal} */
    const mark = {
      id: `proposal-${turn.id}`,
      startId: turn.id,
      at: turn.start,
      state: "grey",
      since: now,
    };
    this.reads.get(g).shown = true;
    this.openIndex = g;
    this.marks.push(mark);
    this.onChange?.(mark);
    this.onGrey?.(mark, g);
    void this._ask(mark, g);
  }

  snapshot() {
    return [...this.marks];
  }

  deadline() {
    return this.openIndex === null
      ? Infinity
      : this.detector.turns[this.openIndex].start + this.rule.expiresAfter;
  }
}
