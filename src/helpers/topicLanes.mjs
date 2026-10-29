// The lanes: how a conversation moved between its topics, drawn as one row per
// topic and one line for the room (`components/conversation/TopicLanes.tsx`,
// in the flow card while recording and in the reading view's Connections tab).
//
// Pure and DOM-free so the geometry can be pinned. The component owns pixels
// and nothing else.
//
// **The line is made of speech.** Each topic in the snapshot lists the
// utterances the tracker placed in it, and each utterance has a moment. Read in
// time order, those utterances say which topic the room was on at every moment
// it spoke: a *run* is a stretch of them on one topic. The line runs along a
// topic's row for its run and bends to the next row where the next run starts.
// A run that climbs to a row the line has already visited is a **return**, the
// mark the old graph drew as a honey dash.
//
// **Runs are contiguous.** The room is on a topic until it moves to another, so
// a run lasts until the next one starts, across pauses and the short turns the
// tracker places nowhere ("Hmm.", "Okay."). Only the line's two ends come from
// the edges of speech: it starts at the first placed utterance, and it ends at
// the end of the window (the last words of a finished conversation, or now).
//
// **Blips merge into their neighbours.** The tracker can place a turn or two on
// another topic and come straight back. Drawn, that is a spike in the line that
// says nothing, so a run shorter than `MIN_RUN_MS` gives its time to the run
// before it. Three exceptions keep the picture honest: a topic's longest run is
// never a blip (its row would otherwise have no line through it); the run the
// room is on now is never a blip while recording (it is short because it has
// only just started); and a return the tracker counted is never a blip. A
// two-minute conversation returns in a few seconds, and the line must show
// every return the tracker saw: for a topic it came back to `returns` times,
// that many of its returning runs (the longest) are kept.

import { isKeptTopic } from "./liveThreadMap.mjs";

/** A run shorter than this is a blip, unless it is all its topic has. */
export const MIN_RUN_MS = 20_000;

/** One row's height in px, shared by the rows and the line drawn over them. */
export const LANE_ROW_PX = 30;

/** Half the width of a bend from one row to the next, in px. */
export const LANE_BEND_PX = 7;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** How long a segment took to say, when its place in the recording is known. */
function spokenMs(segment) {
  const { startMs, endMs } = segment ?? {};
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? endMs - startMs
    : 0;
}

/**
 * The lanes of one conversation.
 *
 * `snapshot` is the topic tracker's snapshot (nodes with id, label, state,
 * firstAt, lastAt, durationMs, returns, utteranceIds). `segments` are the
 * transcript's segments (id, timestamp, and startMs/endMs when known).
 *
 * `start` and `end` bound the time axis, in epoch ms. A recording passes its
 * start and now; a finished conversation passes neither and gets its first
 * words to its last. `live` says the conversation is being recorded: the run
 * at the end is then where the room is now, and the line runs on to `end`.
 *
 *   rows    — the topics worth showing (`isKeptTopic`), in the order raised
 *   runs    — `{ topic, from, to }`, time on one topic as fractions of the axis
 *   returns — `{ topic, previous, at }`, each run that comes back to a row
 *   now     — while recording, the topic the line ends on; otherwise null
 *
 * A row's `back` counts the returns to it. A topic whose utterances are not in
 * `segments` keeps its row and gets no run: when the room was on it is not
 * known, and the line does not guess.
 *
 * @param {{ snapshot?: { nodes?: any[] } | null, segments?: any[] | null,
 *   start?: number, end?: number, live?: boolean, minRunMs?: number }} [input]
 * @returns {{ rows: Array<{ id: number, label: string, state: string,
 *   durationMs: number, back: number }>,
 *   runs: Array<{ topic: number, from: number, to: number }>,
 *   returns: Array<{ topic: number, previous: number, at: number }>,
 *   now: number | null, start: number, end: number, span: number, empty: boolean }}
 */
export function topicLanes({
  // Every parameter has a default so TypeScript infers the shape from the
  // pattern (see `buildThreadMap`).
  snapshot = null,
  segments = null,
  start = Number.NaN,
  end = Number.NaN,
  live = false,
  minRunMs = MIN_RUN_MS,
} = {}) {
  const nodes = (Array.isArray(snapshot?.nodes) ? snapshot.nodes : [])
    .filter(isKeptTopic)
    .sort((a, b) => (a.firstAt ?? 0) - (b.firstAt ?? 0) || a.id - b.id);

  const topicOf = new Map();
  for (const node of nodes) {
    for (const id of Array.isArray(node.utteranceIds) ? node.utteranceIds : []) {
      topicOf.set(String(id), node.id);
    }
  }

  const timed = (Array.isArray(segments) ? segments : []).filter((segment) =>
    Number.isFinite(segment?.timestamp)
  );
  const lo = Number.isFinite(start)
    ? start
    : timed.reduce((first, segment) => Math.min(first, segment.timestamp), Infinity);
  const hi = Number.isFinite(end)
    ? end
    : timed.reduce(
        (last, segment) => Math.max(last, segment.timestamp + spokenMs(segment)),
        -Infinity
      );
  const known = Number.isFinite(lo) && Number.isFinite(hi);
  const span = known ? Math.max(1, hi - lo) : 0;

  // The placed utterances inside the window, in the order they were said.
  // Speech outside the window is dropped rather than clamped onto its edge,
  // as the contour drops it: a resumed recording's earlier sitting is not
  // this sitting's first minute.
  const placed = known
    ? timed
        .filter((segment) => topicOf.has(String(segment.id)))
        .filter((segment) => segment.timestamp >= lo && segment.timestamp <= hi)
        .map((segment) => ({ at: segment.timestamp, topic: topicOf.get(String(segment.id)) }))
        .sort((a, b) => a.at - b.at)
    : [];

  // Stretches on one topic, then made contiguous.
  const stretches = [];
  for (const utterance of placed) {
    const last = stretches[stretches.length - 1];
    if (last && last.topic === utterance.topic) continue;
    stretches.push({ topic: utterance.topic, startAt: utterance.at, endAt: utterance.at });
  }
  for (let i = 0; i < stretches.length; i += 1) {
    stretches[i].endAt = i + 1 < stretches.length ? stretches[i + 1].startAt : hi;
  }

  // Each topic's longest stretch, which is never a blip.
  const longest = new Map();
  for (const stretch of stretches) {
    const best = longest.get(stretch.topic);
    if (!best || stretch.endAt - stretch.startAt > best.endAt - best.startAt) {
      longest.set(stretch.topic, stretch);
    }
  }
  // The returns the tracker counted: for each topic, that many of the stretches
  // that come back to it, the longest first.
  const counted = new Map(nodes.map((node) => [node.id, Math.max(0, node.returns ?? 0)]));
  const comebacks = new Map();
  const reached = new Set();
  for (const stretch of stretches) {
    if (reached.has(stretch.topic)) {
      comebacks.set(stretch.topic, [...(comebacks.get(stretch.topic) ?? []), stretch]);
    }
    reached.add(stretch.topic);
  }
  const counts = new Set();
  for (const [topic, list] of comebacks) {
    const byLength = [...list].sort((a, b) => b.endAt - b.startAt - (a.endAt - a.startAt));
    for (const stretch of byLength.slice(0, counted.get(topic) ?? 0)) counts.add(stretch);
  }

  const merged = [];
  let carried = null;
  for (const [index, stretch] of stretches.entries()) {
    const run = { ...stretch };
    // A leading blip's time goes to the run after it.
    if (carried !== null) {
      run.startAt = carried;
      carried = null;
    }
    const previous = merged[merged.length - 1];
    const blip =
      run.endAt - run.startAt < minRunMs &&
      longest.get(stretch.topic) !== stretch &&
      !counts.has(stretch) &&
      !(live && index === stretches.length - 1);
    if (blip) {
      if (previous) previous.endAt = run.endAt;
      else carried = run.startAt;
      continue;
    }
    if (previous && previous.topic === run.topic) {
      previous.endAt = run.endAt;
      continue;
    }
    merged.push(run);
  }

  const at = (time) => clamp01((time - lo) / span);
  const runs = merged.map((run) => ({
    topic: run.topic,
    from: at(run.startAt),
    to: at(run.endAt),
  }));

  const returns = [];
  const visited = new Set();
  for (const [index, run] of runs.entries()) {
    if (visited.has(run.topic)) {
      returns.push({ topic: run.topic, previous: runs[index - 1].topic, at: run.from });
    }
    visited.add(run.topic);
  }

  const back = new Map();
  for (const item of returns) back.set(item.topic, (back.get(item.topic) ?? 0) + 1);

  return {
    rows: nodes.map((node) => ({
      id: node.id,
      label: String(node.label),
      state: node.state,
      durationMs: node.durationMs ?? 0,
      back: back.get(node.id) ?? 0,
    })),
    runs,
    returns,
    now: live && runs.length ? runs[runs.length - 1].topic : null,
    start: known ? lo : 0,
    end: known ? hi : 0,
    span,
    empty: nodes.length === 0,
  };
}

/**
 * The run that holds a moment (epoch ms), so a question can sit on the topic
 * the room was on when it was asked. A run holds its start and not its end,
 * because the turn that starts a run is that run's first words: a question
 * that moves the room to a topic sits on the topic it moved to. A moment
 * before the line starts or after it ends belongs to the nearest run. Null
 * when there is no line.
 *
 * @param {{ runs?: Array<{ topic: number, from: number, to: number }>, start?: number,
 *   span?: number } | null | undefined} lanes
 * @param {number} time
 */
export function runAt(lanes, time) {
  const runs = Array.isArray(lanes?.runs) ? lanes.runs : [];
  if (!runs.length || !Number.isFinite(time) || !(lanes.span > 0)) return null;
  const x = (time - lanes.start) / lanes.span;
  let nearest = runs[0];
  let distance = Infinity;
  for (const [index, run] of runs.entries()) {
    const last = index === runs.length - 1;
    if (x >= run.from && (x < run.to || (last && x === run.to))) return run;
    const gap = x < run.from ? run.from - x : x - run.to;
    if (gap < distance) {
      nearest = run;
      distance = gap;
    }
  }
  return nearest;
}

/**
 * Which topic each question belongs to: the one the room was on when it was
 * asked, which is the row its mark sits on. A question the tracker placed
 * nowhere (a short turn) still belongs to the stretch it was asked in. With no
 * line to read (a transcript whose turns match no topic), a question belongs
 * to the topic its turn was placed in, as the graph has always read it.
 *
 * @param {{ runs?: Array<{ topic: number, from: number, to: number }>, start?: number,
 *   span?: number } | null | undefined} lanes
 * @param {Array<{ id: unknown, at: number, segmentIds?: unknown[] }> | null | undefined} moments
 *   From `questionMoments`.
 * @param {{ nodes?: any[] } | null | undefined} snapshot
 * @returns {Map<unknown, number>} question id → topic id
 */
export function questionTopics(lanes, moments, snapshot) {
  const placed = new Map();
  for (const node of Array.isArray(snapshot?.nodes) ? snapshot.nodes : []) {
    for (const id of Array.isArray(node?.utteranceIds) ? node.utteranceIds : []) {
      placed.set(String(id), node.id);
    }
  }
  const line = Array.isArray(lanes?.runs) && lanes.runs.length > 0;
  const topics = new Map();
  for (const moment of Array.isArray(moments) ? moments : []) {
    const topic = line
      ? (runAt(lanes, moment.at)?.topic ?? null)
      : ((moment.segmentIds ?? []).map((id) => placed.get(String(id))).find((id) => id != null) ??
        null);
    if (topic != null) topics.set(moment.id, topic);
  }
  return topics;
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * The room's line as an SVG path, in px: along a run's row while the room is
 * on it, then a smooth S-bend to the next run's row, centred on the moment the
 * room moved.
 *
 * Each bend is a cubic whose two control points sit at the switch x, one on
 * each row, so the line leaves and arrives level. It is `bend` px wide on each
 * side of the switch, narrower where a run is too short to hold it, so the
 * line always moves forward in time and never doubles back.
 *
 * `rows` maps a topic id to its row index; a run on a topic with no row is
 * skipped. Null when there is nothing to draw.
 *
 * @param {{ runs?: Array<{ topic: number, from: number, to: number }>,
 *   rows?: Map<number, number>, width?: number, rowHeight?: number, bend?: number }} [input]
 * @returns {string | null}
 */
export function lanePath({
  runs = [],
  rows = new Map(),
  width = 0,
  rowHeight = LANE_ROW_PX,
  bend = LANE_BEND_PX,
} = {}) {
  if (!(width > 0)) return null;
  const drawn = (Array.isArray(runs) ? runs : []).filter((run) => rows.has(run.topic));
  if (!drawn.length) return null;
  const x = (fraction) => clamp01(fraction) * width;
  const y = (run) => rows.get(run.topic) * rowHeight + rowHeight / 2;
  const half = (run) => (x(run.to) - x(run.from)) / 2;

  const first = drawn[0];
  let d = `M ${round(x(first.from))} ${round(y(first))}`;
  for (let i = 1; i < drawn.length; i += 1) {
    const before = drawn[i - 1];
    const after = drawn[i];
    const at = x(after.from);
    const h = Math.max(0, Math.min(bend, half(before), half(after)));
    d += ` L ${round(at - h)} ${round(y(before))}`;
    d += ` C ${round(at)} ${round(y(before))} ${round(at)} ${round(y(after))} ${round(at + h)} ${round(y(after))}`;
  }
  const last = drawn[drawn.length - 1];
  d += ` L ${round(x(last.to))} ${round(y(last))}`;
  return d;
}

/**
 * The lanes' height in whole rows, when the card they sit in is what caps them.
 *
 * While recording, the lanes keep the topic now in view, and now is usually the
 * last row, so a height that is not a whole number of rows slices the first
 * row instead. In the Detailed composition the card is capped and the lanes get
 * whatever it leaves them: measured at 1440x900, 24:03 into the demo, seven
 * rows in 194px, scrolled 16px, "launch date" cut through its label. In whole
 * rows the first one scrolls away entire, and the caption still counts it.
 *
 * `room` is the height the card leaves the lanes, `need` the rows' height, and
 * `cap` the lanes' own limit, whose half row is the deliberate cue that there
 * is more (`LANE_ROWS_SHOWN` in TopicLanes.tsx). Null when the rows fit, or
 * when that limit is what stops them. Never under one row: now stays in view.
 *
 * @param {{ room: number, need: number, cap: number, rowHeight?: number }} input
 * @returns {number | null}
 */
export function wholeLanes({ room, need, cap, rowHeight = LANE_ROW_PX }) {
  if (need <= room + 0.5 || room >= cap - 0.5) return null;
  return Math.max(1, Math.floor((room + 0.5) / rowHeight)) * rowHeight;
}
