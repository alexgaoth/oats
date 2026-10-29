import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIVE_BUCKET_MS,
  buildContour,
  buildLiveContour,
  contourStrip,
} from "../../helpers/conversationContour.mjs";
import { buildConversationGraph } from "../../helpers/conversationGraph";
import { addLevelSample, decodeLoudness } from "../../helpers/conversationLoudness.mjs";
import { questionOutcome } from "../../helpers/questionOutcome.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
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
    // In-room segments carry their exact place in the recording, so the live
    // contour can draw speech for exactly as long as it lasted.
    durationMs:
      Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs)
        ? (segment.endMs as number) - (segment.startMs as number)
        : undefined,
  }));
}

/** Seconds of microphone level kept for the live contour's scale. */
const LEVEL_HISTORY_SECONDS = 660;

/**
 * The microphone level, one RMS per second, for as long as a recording runs.
 *
 * The RMS rather than the peak: the peak of a spoken second is nearly always
 * near the top, so the live line drew every turn as a flat block. The RMS
 * drops for a second that holds a pause or a soft word.
 *
 * Read from the 10Hz level `MeetingRecordingMount` already publishes, through a
 * store subscription rather than a selector: the samples feed the once-a-second
 * redraw and must not re-render anything ten times a second themselves.
 */
function useLevelHistory(recording: boolean) {
  const history = useRef<{ at: number; level: number; sumSq: number; n: number }[]>([]);
  useEffect(() => {
    history.current = [];
    if (!recording) return;
    return useMeetingRecordingStore.subscribe((state, previous) => {
      if (state.currentMicLevel === previous.currentMicLevel) return;
      // The same rule the store keeps the whole recording by, for Finish.
      const list = history.current;
      addLevelSample(list, Date.now(), state.currentMicLevel);
      if (list.length > LEVEL_HISTORY_SECONDS) list.splice(0, list.length - LEVEL_HISTORY_SECONDS);
    });
  }, [recording]);
  return history;
}

/**
 * The live contour, during a recording: the last four minutes, rolling.
 *
 * Rebuilt once a second, on the second boundary, so each redraw moves the
 * trace and every pin exactly one second to the left (`buildLiveContour`).
 * Speech still being transcribed and the microphone level count too, so the
 * right-hand edge moves while somebody is talking, not only when a pause
 * finalizes a segment. One redraw of a static canvas per second, not an
 * animation loop.
 */
export function useLiveContour(startedAt: number | null): ContourData {
  const segments = useMeetingRecordingStore((state) => state.segments);
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const moments = useMeetingRecordingStore((state) => state.moments);
  const recording = useMeetingRecordingStore((state) => state.isRecording);
  const micPartial = useMeetingRecordingStore((state) => state.micPartial);
  const systemPartial = useMeetingRecordingStore((state) => state.systemPartial);
  // The snapshot the store publishes after each utterance. Not the tracker's
  // final snapshot: that one commits the tracker's held turn, and taking it on
  // every utterance meant no change of subject could ever start a topic.
  const topicSnapshot = useMeetingRecordingStore((state) => state.topicSnapshot);
  const levels = useLevelHistory(recording);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!recording) return;
    let interval = 0;
    // Started on the second boundary, so a redraw never lands mid-bucket.
    const align = window.setTimeout(
      () => {
        setNow(Date.now());
        interval = window.setInterval(() => setNow(Date.now()), LIVE_BUCKET_MS);
      },
      LIVE_BUCKET_MS - (Date.now() % LIVE_BUCKET_MS) + 15
    );
    return () => {
      window.clearTimeout(align);
      window.clearInterval(interval);
    };
  }, [recording]);

  return useMemo(() => {
    const snapshot: ConversationTopicSnapshot | null = recording ? topicSnapshot : null;
    const topics = snapshot?.nodes ? topicsForContour(snapshot.nodes) : NO_CONTOUR_TOPICS;
    if (!recording) {
      return buildContour({
        utterances: utterancesFor(segments),
        questions: cards,
        topics,
        moments,
        startedAt: startedAt ?? undefined,
      }) as ContourData;
    }
    // Both the window and the label are this sitting, never the transcript.
    // Continuing a recent conversation seeds up to half an hour of previous
    // segments into the store; nothing before `startedAt` is drawn or counted.
    // `Date.now()` as well as the tick: a mark is pressed *now*, past the last
    // tick, and a window that stopped short would drop its caret.
    const time = Math.max(now, Date.now());
    return buildLiveContour({
      utterances: utterancesFor(segments),
      partials: [micPartial, systemPartial].filter(Boolean),
      levels: levels.current,
      questions: cards,
      topics,
      moments,
      now: time,
      startedAt: startedAt ?? time,
    }) as ContourData;
  }, [
    segments,
    cards,
    moments,
    recording,
    now,
    startedAt,
    topicSnapshot,
    micPartial,
    systemPartial,
    levels,
  ]);
}

/**
 * The contour of a conversation that is already on disk.
 *
 * Questions come from the persisted event graph rather than from live cards,
 * because the cards do not outlive the recording — the record does. Each is
 * read by `questionOutcome`, the rule the review and Connections read too.
 *
 * `loudness` is the note's stored per-second loudness
 * (`notes.conversation_loudness`). It is passed as the stored string, a value
 * that compares equal across renders, and decoded inside the memo, so the
 * decoded seconds are not kept once the contour is built. Without it the
 * height comes from words, as it did before loudness was kept.
 */
export function useStoredContour(
  segments: TranscriptSegment[],
  events: ConversationEvent[],
  topics: ConversationTopicNode[] = NO_TOPICS,
  moments: { id: string; at: number; note: string }[] = NO_MOMENTS,
  loudness: string | null = null
): ContourData {
  return useMemo(() => {
    const questions = buildConversationGraph(events)
      .filter((node) => node.question)
      .map((node) => ({
        id: node.key,
        question: node.question?.text ?? "",
        state: questionOutcome(node),
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
      levels: decodeLoudness(loudness),
    }) as ContourData;
  }, [segments, events, topics, moments, loudness]);
}

/** The miniature beside a conversation in the Intelligence list. */
export function useContourStrip(
  segments: TranscriptSegment[],
  events: ConversationEvent[],
  loudness: string | null = null
) {
  const contour = useStoredContour(segments, events, NO_TOPICS, NO_MOMENTS, loudness);
  return useMemo(() => contourStrip(contour, 24) as ContourData, [contour]);
}
