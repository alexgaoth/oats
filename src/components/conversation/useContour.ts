import { useEffect, useMemo, useState } from "react";
import { buildContour, contourStrip } from "../../helpers/conversationContour.mjs";
import { buildConversationGraph, responseReason } from "../../helpers/conversationGraph";
import {
  getConversationTopicSnapshot,
  useMeetingRecordingStore,
} from "../../stores/meetingRecordingStore";
import type { ContourData } from "./ConversationContour";
import type {
  ConversationEvent,
  ConversationTopicNode,
  ConversationTopicSnapshot,
} from "../../types/conversationEvents";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";

/**
 * The stable empty arrays for call sites with nothing to pass.
 *
 * A `topics = []` **default parameter** allocates a fresh array on every
 * render, which silently makes the `useMemo` below — and `useContourStrip`'s
 * memo above it — dead for every two-argument caller. Measured in a
 * **production build** against the Intelligence list's own cap of 100
 * conversations: one keystroke in the recall input rebuilt 100 contours and
 * issued 200 canvas draws; with these constants it is 3–6ms and no redraws.
 * (A dev build exaggerates both sides — 148–172ms against 27ms — because the
 * self-time is dominated by `jsxDEV`. Budget against the production figures.)
 *
 * Import these rather than writing `[]` at a new call site; that is exactly how
 * the memo died the first time.
 */
const NO_TOPICS: ConversationTopicNode[] = [];
const NO_CONTOUR_TOPICS: ReturnType<typeof topicsForContour> = [];
export const NO_EVENTS: ConversationEvent[] = [];
const NO_MOMENTS: { id: string; at: number; note: string }[] = [];

// Adapters between what Oats stores and what the contour model wants. They live
// here rather than in the model so the model stays pure ESM that `node:test` can
// import with no TypeScript build — the same arrangement as the topic tracker.

/**
 * A topic becomes a return arc only when the tracker says the room actually
 * came back to it (`returns > 0`). Deriving that from duration instead would
 * draw an arc over every subject that simply took a while.
 */
function topicsForContour(nodes: ConversationTopicNode[]) {
  return nodes.map((node) => ({
    id: String(node.id),
    label: node.label,
    state: node.state,
    startedAt: node.firstAt,
    lastTouchedAt: node.returns > 0 ? node.lastAt : node.firstAt,
  }));
}

function utterancesFor(segments: TranscriptSegment[]) {
  return segments.map((segment) => ({
    id: segment.id,
    text: segment.text,
    timestamp: segment.timestamp,
  }));
}

/**
 * The live contour, during a recording.
 *
 * Rebuilt when a finalized utterance arrives (~5s in local mode) or a question
 * card changes — not on a timer and not per frame. The one time-driven part is
 * the trailing edge: while somebody is talking the window keeps growing, so the
 * right-hand end advances even when nothing new has been said. That is a
 * once-every-15-seconds redraw of a static canvas, not an animation.
 */
export function useLiveContour(startedAt: number | null): ContourData {
  const segments = useMeetingRecordingStore((state) => state.segments);
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const moments = useMeetingRecordingStore((state) => state.moments);
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  const [edge, setEdge] = useState(() => Date.now());

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setEdge(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [recording]);

  return useMemo(() => {
    const snapshot = recording
      ? (getConversationTopicSnapshot() as ConversationTopicSnapshot | null)
      : null;
    return buildContour({
      utterances: utterancesFor(segments),
      questions: cards,
      topics: snapshot?.nodes ? topicsForContour(snapshot.nodes) : NO_CONTOUR_TOPICS,
      moments,
      // Both ends of the window are the *session*, never the transcript.
      //
      // Continuing a recent conversation seeds up to half an hour of previous
      // segments into the store, and letting the trace default to the first of
      // those made it span the old conversation plus the dead gap between them:
      // an hour-wide window, flat for two thirds of its length, with everything
      // said since the press crushed into a sliver at the right edge — while
      // the clock beside it read 1:30. The contour and the clock have to be
      // measuring the same sitting.
      startedAt: startedAt ?? undefined,
      // `Date.now()` as well as the edge tick: a mark is pressed *now*, past the
      // last tick, and a window that stopped short would drop its caret.
      now: recording ? Math.max(edge, Date.now()) : undefined,
    }) as ContourData;
  }, [segments, cards, moments, recording, edge, startedAt]);
}

/**
 * The §4 outcome a persisted response records.
 *
 * The same mapping `ConversationGraph` uses, so the contour, the graph and the
 * rail cannot disagree about what a question came to. A question with no
 * response event at all never got a verdict, which is `asked`; a response whose
 * reason is none of the settled ones is a denial, and terracotta.
 */
function storedOutcome(reason: string | null, hasResponse: boolean): string {
  if (!hasResponse) return "asked";
  if (reason === "answered") return "answered";
  if (reason === "uncertain_response") return "uncertain";
  if (reason === "silence") return "silence";
  return "denied";
}

/**
 * The contour of a conversation that is already on disk.
 *
 * Questions come from the persisted event graph rather than from live cards,
 * because the cards do not outlive the recording — the record does.
 */
export function useStoredContour(
  segments: TranscriptSegment[],
  events: ConversationEvent[],
  topics: ConversationTopicNode[] = NO_TOPICS,
  moments: { id: string; at: number; note: string }[] = NO_MOMENTS
): ContourData {
  return useMemo(() => {
    const questions = buildConversationGraph(events)
      .filter((node) => node.question)
      .map((node) => ({
        id: node.key,
        question: node.question?.text ?? "",
        state: storedOutcome(responseReason(node.response), Boolean(node.response)),
        createdAt: node.question?.createdAt ?? node.createdAt,
        groupKey: node.key,
        occurrence: 1,
      }))
      .filter((question) => Number.isFinite(question.createdAt));
    return buildContour({
      utterances: utterancesFor(segments),
      questions,
      topics: topicsForContour(topics),
      moments,
    }) as ContourData;
  }, [segments, events, topics, moments]);
}

/** The miniature beside a conversation in the Intelligence list. */
export function useContourStrip(segments: TranscriptSegment[], events: ConversationEvent[]) {
  const contour = useStoredContour(segments, events);
  return useMemo(() => contourStrip(contour, 24) as ContourData, [contour]);
}
