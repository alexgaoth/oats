import { parseMoments, momentSegment } from "./conversationMoments.mjs";
import { buildReview } from "./conversationReview.mjs";
import { foldText } from "./searchFold.mjs";

function parse(raw, fallback) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw ?? fallback);
  } catch {
    return fallback;
  }
}

/** Stored evidence only. Comparing never asks a model to infer a difference. */
export function comparisonEvidence(note, events = []) {
  const rawSegments = parse(note?.transcript, []);
  const segments = (Array.isArray(rawSegments) ? rawSegments : [])
    .map((segment, index) =>
      segment && typeof segment.text === "string"
        ? { ...segment, id: String(segment.id ?? `legacy-${index}`) }
        : null
    )
    .filter(Boolean);
  const snapshot = parse(note?.conversation_topics, {});
  const topics = (Array.isArray(snapshot?.nodes) ? snapshot.nodes : [])
    .filter((topic) => topic && typeof topic.label === "string" && topic.label.trim())
    .map((topic) => ({
      label: topic.label.trim(),
      description: typeof topic.description === "string" ? topic.description : "",
    }));
  const marks = parseMoments(note?.conversation_marks).map((mark) => {
    const segment = momentSegment(mark, segments);
    return {
      id: mark.id,
      note: mark.note,
      quote: segment?.text ?? "",
      segmentId: segment?.id ?? null,
    };
  });
  const questions = buildReview({ events }).unresolved.filter(
    (question) => question.outcome !== "uncertain"
  );
  return {
    topics,
    marks,
    questions,
    questionsKnown: Number.isInteger(note?.open_questions) || events.length > 0,
  };
}

/** An identical label, not a claim that two discussions mean the same thing. */
export function sharedTopicLabels(left, right) {
  const labels = new Set(right.map((topic) => foldText(topic.label.trim())));
  return new Set(
    left.map((topic) => foldText(topic.label.trim())).filter((label) => labels.has(label))
  );
}
