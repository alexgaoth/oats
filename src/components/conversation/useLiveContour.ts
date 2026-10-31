import { useEffect, useMemo, useRef, useState } from "react";
import {
  LIVE_BUCKET_MS,
  buildContour,
  buildLiveContour,
} from "../../helpers/conversationContour.mjs";
import { addLevelSample } from "../../helpers/conversationLoudness.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import type { ContourData } from "./ConversationContour";
import type { ConversationTopicSnapshot } from "../../types/conversationEvents";
import { NO_CONTOUR_TOPICS, topicsForContour, utterancesFor } from "./useContour";

// The contour while a conversation is recorded: the recording store's words,
// questions, marks, topics and microphone level, rolled once a second. A
// stored conversation's contour reads no store (`useContour.ts`).

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
