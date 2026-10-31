import { useMemo } from "react";
import { buildContour, contourStrip } from "../../helpers/conversationContour.mjs";
import { buildConversationGraph, responseReason } from "../../helpers/conversationGraph";
import { decodeLoudness } from "../../helpers/conversationLoudness.mjs";
import type { ContourData } from "./ConversationContour";
import type { ConversationEvent, ConversationTopicNode } from "../../types/conversationEvents";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";

// The contour of a stored conversation, and the strip in the list. No store is
// read here: the live contour, which follows the recording, is
// `useLiveContour.ts`. So the demo pieces (`components/demo/`) can draw a
// conversation's contour outside the app.

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
export const NO_CONTOUR_TOPICS: ReturnType<typeof topicsForContour> = [];
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
export function topicsForContour(nodes: ConversationTopicNode[]) {
  return nodes.map((node) => ({
    id: String(node.id),
    label: node.label,
    state: node.state,
    startedAt: node.firstAt,
    lastTouchedAt: node.returns > 0 ? node.lastAt : node.firstAt,
  }));
}

export function utterancesFor(segments: TranscriptSegment[]) {
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
