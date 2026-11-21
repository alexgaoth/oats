// An early mark is a view of the detector's evidence, not a cut. Times here
// are seconds of conversation, as in TopicChangeDetector.
import { CHANGE_RULE, changeScore, gapFeatures } from "./topicChange.mjs";

export const PROPOSAL_RULE = Object.freeze({
  slice: 15,
  schedule: Object.freeze([30]),
  threshold: 0.45,
  cap: 1,
  confirm: 20,
  expiresAfter: 65,
});

export function proposalScore(detector, g, lag, learnedScore = undefined) {
  const features = gapFeatures(detector.turns, g, { lag, firstSeen: detector.firstSeen });
  return features.E30 === 0 ? 0 : (learnedScore ?? changeScore(features));
}

/** @typedef {{ id: string, startId: string, at: number, state: "grey" | "solid" | "faded", since: number }} Proposal */

export class TopicProposals {
  /**
   * The score and transition hooks let the replay reuse scores across rules
   * and retain a history without keeping it in the live session.
   * @param {Pick<import("./topicChange.mjs").TopicChangeDetector, "turns" | "firstSeen" | "cuts">} detector
   * @param {{ rule?: Partial<Omit<typeof PROPOSAL_RULE, "schedule">> & { schedule?: ReadonlyArray<number | string> },
   *   score?: (g: number, lag: number) => number,
   *   onChange?: (mark: Proposal) => void }} [options]
   */
  constructor(
    detector,
    { rule = {}, score = (g, lag) => proposalScore(detector, g, lag), onChange } = {}
  ) {
    this.detector = detector;
    this.rule = { ...PROPOSAL_RULE, ...rule };
    this.score = score;
    this.onChange = onChange;
    /** @type {Proposal[]} */
    this.marks = [];
    this.taken = new Set();
    this.first = 1;
    this.nextCut = 0;
    this.lastTick = 0;
  }

  /** @param {number} index @param {"solid" | "faded"} state @param {number} since */
  _resolve(index, state, since) {
    const mark = { ...this.marks[index], state, since };
    this.marks[index] = mark;
    this.onChange?.(mark);
  }

  /** Call as soon as the detector draws a cut, even between proposal ticks. */
  observeCuts(now) {
    const { turns, cuts } = this.detector;
    for (; this.nextCut < cuts.length; this.nextCut += 1) {
      const at = turns[cuts[this.nextCut]].start;
      for (let i = 0; i < this.marks.length; i += 1) {
        const mark = this.marks[i];
        if (mark.state === "grey" && Math.abs(mark.at - at) <= this.rule.confirm) {
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
    this.observeCuts(now);
    const { slice, cap, expiresAfter, confirm, schedule, threshold } = this.rule;
    const tick = Math.floor(now / slice);
    if (tick <= this.lastTick) return;
    this.lastTick = tick;
    this.marks = this.marks.filter((mark) => mark.state === "grey" || now - mark.since < slice);
    for (let i = 0; i < this.marks.length; i += 1) {
      const mark = this.marks[i];
      if (mark.state === "grey" && now >= mark.at + expiresAfter) this._resolve(i, "faded", now);
    }
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

  snapshot() {
    return [...this.marks];
  }
}
