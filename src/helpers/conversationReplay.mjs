// The example conversation played back: what the live view shows at any moment
// of it, for the replay on the site (`components/demo/DemoReplay.tsx`).
//
// A recording builds the map as it goes: the line grows, a topic gets its row
// when it is raised, and a question's mark appears when it is asked and fills
// in when the room answers. The example is stored finished, so this works
// backwards from the record: a moment `at` (ms from the first words) keeps the
// turns said by then, the topics raised by then with the turns they held by
// then, and each question as it stood then. Nothing here is invented: every
// value is the record's own, cut at a moment.
//
// Pure and DOM-free, pinned by test/helpers/conversationReplay.test.js.

import { OUTCOME_FILL } from "./conversationContour.mjs";
import { topicLanes } from "./topicLanes.mjs";

/** The whole conversation plays in this long (ms), well under a minute. */
export const REPLAY_MS = 40_000;

/** A scrubber step, in ms of the conversation. */
export const REPLAY_STEP_MS = 5_000;

/**
 * When the room made each move between topics. The record's edges carry no
 * time, and they are its own, so each takes the time the record gives its
 * target: a move to a new topic is made when that topic is raised, and a
 * return when the lanes say the room came back. A return the lanes merged away
 * has no time of its own, and shows only at the end, with the record.
 */
function movesOf(edges, nodes, returnsAt) {
  const firstAt = new Map(nodes.map((node) => [node.id, node.firstAt]));
  const used = new Map();
  return edges.map((edge) => {
    if (edge?.kind !== "return") return { edge, at: firstAt.get(edge?.to) ?? Infinity };
    const index = used.get(edge.to) ?? 0;
    used.set(edge.to, index + 1);
    return { edge, at: returnsAt.get(edge.to)?.[index] ?? Infinity };
  });
}

/**
 * What a replay of one conversation needs, worked out once: when it starts
 * and ends, its turns in order, which topic each turn was placed in, when
 * each topic came back, when the room made each move between topics, and when
 * each question was asked and settled.
 *
 * @param {import("./oatsTour.mjs").TourConversation} conversation
 */
export function replayTimeline(conversation) {
  const segments = (conversation?.segments ?? [])
    .filter((segment) => Number.isFinite(segment?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const nodes = Array.isArray(conversation?.snapshot?.nodes) ? conversation.snapshot.nodes : [];
  // The finished lanes say when the room came back to each topic: a return is
  // the line climbing back to a row, blips already merged.
  const lanes = topicLanes({ snapshot: conversation?.snapshot ?? null, segments });
  const start = segments.length ? segments[0].timestamp : 0;
  const end = segments.length ? Math.max(lanes.end, segments[segments.length - 1].timestamp) : 0;
  const returnsAt = new Map();
  for (const item of lanes.returns) {
    const at = lanes.start + item.at * lanes.span;
    returnsAt.set(item.topic, [...(returnsAt.get(item.topic) ?? []), at]);
  }
  const timeOf = new Map(segments.map((segment) => [String(segment.id), segment.timestamp]));
  const events = Array.isArray(conversation?.events) ? conversation.events : [];
  const edges = Array.isArray(conversation?.snapshot?.edges) ? conversation.snapshot.edges : [];
  return {
    start,
    end,
    duration: Math.max(0, end - start),
    segments,
    nodes,
    edges,
    moves: movesOf(edges, nodes, returnsAt),
    timeOf,
    returnsAt,
    events: [...events].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id),
  };
}

/**
 * The turns said by `now` (epoch ms). The list keeps its identity while no new
 * turn arrives, so a frame between turns re-renders nothing that reads it.
 */
function segmentsUntil(timeline, now, previous) {
  let count = 0;
  while (count < timeline.segments.length && timeline.segments[count].timestamp <= now) count += 1;
  if (previous && previous.length === count) return previous;
  return timeline.segments.slice(0, count);
}

/**
 * The topic snapshot as the live view held it at `now`: the topics raised by
 * then, each with the turns placed in it by then, its time on the subject
 * counted the same share as its turns, and the returns made by then. The topic
 * the room is on is live; the others are open, as during a recording. At the
 * end the record's own snapshot is returned, states and all.
 */
function snapshotAt(timeline, now, live) {
  const nodes = [];
  for (const node of timeline.nodes) {
    if (!Number.isFinite(node?.firstAt) || node.firstAt > now) continue;
    const all = Array.isArray(node.utteranceIds) ? node.utteranceIds : [];
    const said = all.filter((id) => (timeline.timeOf.get(String(id)) ?? Infinity) <= now);
    if (!said.length) continue;
    const lastAt = said.reduce(
      (last, id) => Math.max(last, timeline.timeOf.get(String(id)) ?? last),
      node.firstAt
    );
    const returns = (timeline.returnsAt.get(node.id) ?? []).filter((at) => at <= now).length;
    nodes.push({
      ...node,
      utteranceIds: said,
      lastAt,
      durationMs: Math.round(((node.durationMs ?? 0) * said.length) / Math.max(1, all.length)),
      returns,
      state: node.id === live ? "live" : "open",
    });
  }
  const raised = new Set(nodes.map((node) => node.id));
  const edges = timeline.moves
    .filter(({ edge, at }) => at <= now && raised.has(edge.from) && raised.has(edge.to))
    .map(({ edge }) => edge);
  return { nodes, edges };
}

/** The topic the room was on at `now`: the one its last placed turn was in. */
function topicAt(timeline, segments) {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const id = String(segments[index].id);
    const node = timeline.nodes.find((candidate) =>
      (candidate.utteranceIds ?? []).some((utterance) => String(utterance) === id)
    );
    if (node) return node.id;
  }
  return null;
}

/**
 * The conversation at a moment of the replay.
 *
 * @param {ReturnType<typeof replayTimeline>} timeline
 * @param {number} at ms from the first words, 0 to `timeline.duration`
 * @param {{ segments?: any[] }} [previous] the last frame, to keep lists that did not change
 */
export function replayFrame(timeline, at, previous) {
  const offset = Math.min(timeline.duration, Math.max(0, Number(at) || 0));
  const now = timeline.start + offset;
  const finished = offset >= timeline.duration;
  const segments = segmentsUntil(timeline, now, previous?.segments);
  const live = topicAt(timeline, segments);
  return {
    at: offset,
    now,
    finished,
    segments,
    events: timeline.events.filter((event) => event.createdAt <= now),
    snapshot: finished
      ? { nodes: timeline.nodes, edges: timeline.edges }
      : snapshotAt(timeline, now, live),
  };
}

/**
 * The finished contour, cut at a moment: the line up to it (one point placed
 * exactly at the cut, so it grows smoothly), the topic notches and marked
 * moments before it, and each question asked by then, open until its reply.
 * The axis stays the whole conversation, so the line grows left to right and
 * never rescales.
 *
 * @param {any} contour the finished conversation's contour (`buildContour`)
 * @param {ReturnType<typeof replayTimeline>} timeline
 * @param {number} at ms from the first words
 */
export function replayContour(contour, timeline, at) {
  if (!contour || contour.empty || !(contour.span > 0)) return contour;
  const now = timeline.start + Math.min(timeline.duration, Math.max(0, Number(at) || 0));
  const cut = Math.min(1, Math.max(0, (now - contour.start) / contour.span));
  if (cut >= 1) return contour;
  const points = contour.points.filter((point) => point.x <= cut);
  const next = contour.points.find((point) => point.x > cut);
  const last = points[points.length - 1];
  if (last && next && last.x < cut) {
    const share = (cut - last.x) / (next.x - last.x);
    points.push({
      x: cut,
      y: last.y + (next.y - last.y) * share,
      quiet: last.quiet && next.quiet,
    });
  }
  // A mark is its question (`q<id>`, `buildConversationGraph`); it is settled
  // once a reply came by now, and until then it is a question still open.
  const settledAt = new Map();
  for (const event of timeline.events) {
    if (event.kind !== "response" || event.parentEventId == null) continue;
    const key = `q${event.parentEventId}`;
    settledAt.set(key, Math.max(settledAt.get(key) ?? -Infinity, event.createdAt));
  }
  const asOfNow = (mark) => {
    const when = settledAt.get(mark.id);
    return when !== undefined && when <= now
      ? mark
      : { ...mark, state: "asked", fill: OUTCOME_FILL.asked };
  };
  return {
    ...contour,
    points: points.length > 1 ? points : [],
    empty: points.length < 2,
    marks: contour.marks.filter((mark) => mark.x <= cut).map(asOfNow),
    shifts: contour.shifts.filter((shift) => shift.x <= cut),
    returns: [],
    moments: (contour.moments ?? []).filter((moment) => moment.x <= cut),
  };
}

/**
 * Where a playing replay is after `elapsed` ms of wall time from `at`: the
 * whole conversation in `REPLAY_MS`, stopping at its end.
 */
export function replayAdvance(timeline, at, elapsed) {
  if (!(timeline.duration > 0)) return 0;
  const speed = timeline.duration / REPLAY_MS;
  return Math.min(timeline.duration, Math.max(0, at + Math.max(0, elapsed) * speed));
}
