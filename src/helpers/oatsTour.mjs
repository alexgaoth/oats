// The tour at the end of setup: which slides it shows, and the data each
// slide's component is given.
//
// Every slide renders one of the app's own components, taken out of its page,
// with the bundled example conversation (`sampleConversations/
// launch-readiness-review.json`): the same conversation Home offers until the
// first recording, so what the tour shows is what the person can open next.
// Nothing here touches a store, the database or the main process. The slides
// are the demo pieces (`components/demo/`), and the tour that shows them is
// `components/onboarding/OatsTour.tsx`.
//
// Pure and DOM-free, so the slides' data is pinned against the example itself
// (test/helpers/oatsTour.test.js), and a change to the example cannot leave a
// slide empty without a test failing.

import { parseMoments } from "./conversationMoments.mjs";
import { questionMoments } from "./conversationReview.mjs";
import { placeSampleConversation } from "./sampleConversations.mjs";

/**
 * The slides, in the order a conversation meets them: two things that happen
 * while people talk, then three that are there afterwards.
 *
 *   topics    — the flow card: topics found and named as the subject moves
 *   questions — the question cards: each question, then how it ended
 *   shape     — the contour: how the conversation sounded, with its marks
 *   voices    — talk time: the voices one microphone told apart
 *   open      — the review: what nobody answered, above the summary
 */
export const TOUR_SLIDES = ["topics", "questions", "shape", "voices", "open"];

/**
 * The slide that Back, Next or an arrow key lands on. The tour stops at both
 * ends: it does not wrap, because the last slide is where it is finished.
 *
 * @param {number} index The slide shown.
 * @param {number} delta -1 for back, 1 for next.
 * @param {number} [count] How many slides there are.
 */
export function tourStep(index, delta, count = TOUR_SLIDES.length) {
  const last = Math.max(0, count - 1);
  const next = Math.trunc(index) + Math.sign(delta);
  return Math.min(last, Math.max(0, Number.isFinite(next) ? next : 0));
}

/**
 * Which way an arrow key moves the tour: 1, -1, or 0 when the key is not the
 * tour's.
 *
 * The slides can be used, so an arrow belongs to the tour only while the focus
 * is on the tour's own controls (Skip, Back, Next, Start, a dot) or on nothing.
 * On a control in a slide it is that control's: the Lanes / Graph switch
 * moves between its choices with the arrows, and a row, a voice or a card
 * keeps its place. A key some control already handled, or one held with a
 * modifier, is never the tour's either.
 *
 * @param {{ key: string, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, defaultPrevented?: boolean }} event
 * @param {"none" | "tour" | "slide" | "other"} focus Where the focus is.
 * @returns {-1 | 0 | 1}
 */
export function tourArrow(event, focus) {
  if (!event || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return 0;
  if (focus !== "none" && focus !== "tour") return 0;
  return event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
}

/**
 * The topic snapshot as the reading view reads a stored one: a topic that was
 * current when recording stopped is open, because nothing in a record is
 * being spoken (`readTopicSnapshot` in OatsWorkspace.tsx).
 */
function readSnapshot(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      ...parsed,
      nodes: parsed.nodes.map((node) =>
        node?.state === "live" ? { ...node, state: "open" } : node
      ),
    };
  } catch {
    return null;
  }
}

/**
 * @typedef {object} TourConversation
 * @property {string} title
 * @property {number} startedAt
 * @property {import("../stores/meetingRecordingStore").TranscriptSegment[]} segments
 * @property {import("../types/conversationEvents").ConversationTopicSnapshot | null} snapshot
 * @property {import("../types/conversationEvents").ConversationTopicNode[]} topics
 * @property {Array<{ id: string, at: number, note: string }>} moments
 * @property {string | null} loudness The stored per-second loudness, as stored.
 * @property {import("../types/conversationEvents").ConversationEvent[]} events
 */

/**
 * The example conversation, held the way the reading view holds a stored one:
 * placed in time as the in-app example is (`placeSampleConversation`), its
 * stored columns read back, and its question events in the order
 * `listConversationEvents` returns them.
 *
 * The events carry `noteId: 0`: the example is not in the database, and no
 * slide may write to one.
 *
 * @param {object} fixture The bundled example (a sample fixture).
 * @param {{ now?: number }} [options]
 * @returns {TourConversation}
 */
export function tourConversation(fixture, { now = Date.now() } = {}) {
  const placed = placeSampleConversation(fixture, { now });
  const snapshot = readSnapshot(placed.note.conversation_topics);
  let segments = [];
  try {
    const parsed = JSON.parse(String(placed.note.transcript ?? "[]"));
    if (Array.isArray(parsed)) segments = parsed;
  } catch {
    segments = [];
  }
  return {
    title: String(placed.note.title ?? ""),
    startedAt: placed.startedAt,
    segments,
    snapshot,
    topics: snapshot?.nodes ?? [],
    moments: parseMoments(placed.note.conversation_marks),
    loudness:
      typeof placed.note.conversation_loudness === "string"
        ? placed.note.conversation_loudness
        : null,
    events: placed.events
      .map((event) => ({ ...event, noteId: 0 }))
      .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id),
  };
}

/**
 * When the questions slide's cards change, in ms after the slide appears:
 * two questions already settled, then a third is asked, then its reply
 * settles it. Under reduced motion the slide shows the last step at once.
 */
export const CARD_STEP_MS = [0, 600, 2200];

/** The step with every card settled. */
export const LAST_CARD_STEP = CARD_STEP_MS.length - 1;

/**
 * The three questions the questions slide shows: two the room answered, then
 * the first one after them that nobody could answer. That is the moment a
 * card is for. Without such a run, the last three questions asked.
 */
function cardQuestions(moments) {
  for (let index = 2; index < moments.length; index += 1) {
    if (
      moments[index].outcome === "denied" &&
      moments[index - 1].outcome === "answered" &&
      moments[index - 2].outcome === "answered"
    ) {
      return moments.slice(index - 2, index + 1);
    }
  }
  return moments.slice(-3);
}

/**
 * The questions slide's cards at one step of `CARD_STEP_MS`, in the shape the
 * question rail takes (`ConversationCard`).
 *
 * Each card is aged as it was in the conversation, counted back from `now`:
 * the third is asked now, and the two before it were asked as long before it
 * as they were in the room. The third has no verdict until the last step, and
 * then the same card takes it, as a live card does. Nothing was searched and
 * no card has a suggestion to search with: the slide sends nothing anywhere.
 *
 * @param {TourConversation} conversation
 * @param {{ now: number, step?: number }} options
 * @returns {import("../types/conversationEvents").ConversationCard[]}
 */
export function tourCards(conversation, { now, step = LAST_CARD_STEP }) {
  const questions = new Map(
    conversation.events
      .filter((event) => event.kind === "question")
      .map((event) => [event.id, event])
  );
  const chosen = cardQuestions(questionMoments(conversation.events, conversation.segments));
  if (!chosen.length) return [];
  const asked = chosen[chosen.length - 1].at;
  const shown = step >= 1 ? chosen : chosen.slice(0, -1);
  return shown.map((moment, index) => {
    const event = questions.get(moment.id);
    const newest = index === chosen.length - 1;
    const settled = !newest || step >= LAST_CARD_STEP;
    // The rail calls a question with no verdict "asked"; the review calls it "open".
    const outcome = moment.outcome === "open" ? "asked" : moment.outcome;
    return {
      id: `tour-${moment.key}`,
      question: String(event?.text ?? "").trim(),
      state: settled ? outcome : "asked",
      groupKey: String(event?.metadata?.groupKey ?? moment.key),
      occurrence: Number(event?.metadata?.occurrence) || 1,
      searched: false,
      suggestionId: null,
      createdAt: now - Math.max(0, asked - moment.at),
    };
  });
}
