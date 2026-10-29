const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The tour at the end of setup (asked for by the product owner, 2026-10-29):
// a slide show of Oats' own components, taken out of their pages, with the
// example conversation Home offers. The data each slide gets is a pure helper
// (src/helpers/oatsTour.mjs), tested here against the bundled example itself;
// the component needs a DOM, so its rules are pinned at source level: the
// slides cannot act, the tour moves only when asked, and setup is saved
// before it opens.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from > -1 && to > -1, `could not find ${start} … ${end}`);
  return source.slice(from, to);
};

const TOUR = read("src/components/onboarding/OatsTour.tsx");
const FLOW = read("src/components/OnboardingFlow.tsx");
const RAIL = read("src/components/conversation/ConversationSignalRail.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

const locales = fs
  .readdirSync(path.join(root, "src/locales"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let TOUR_SLIDES;
let tourStep;
let tourConversation;
let tourCards;
let CARD_STEP_MS;
let LAST_CARD_STEP;
let talkTime;
let topicLanes;
let buildReview;

test.before(async () => {
  ({ TOUR_SLIDES, tourStep, tourConversation, tourCards, CARD_STEP_MS, LAST_CARD_STEP } =
    await import("../../src/helpers/oatsTour.mjs"));
  ({ talkTime } = await import("../../src/helpers/talkTime.mjs"));
  ({ topicLanes } = await import("../../src/helpers/topicLanes.mjs"));
  ({ buildReview } = await import("../../src/helpers/conversationReview.mjs"));
});

const NOW = Date.parse("2026-10-29T12:00:00Z");

test("four to six slides, each with a view and its words in every locale", () => {
  assert.deepEqual(TOUR_SLIDES, ["topics", "questions", "shape", "voices", "open"]);
  assert.ok(TOUR_SLIDES.length >= 4 && TOUR_SLIDES.length <= 6);
  const views = between(TOUR, "const VIEWS", "};");
  for (const id of TOUR_SLIDES) {
    assert.match(views, new RegExp(`\\b${id}: [A-Z][A-Za-z]+Slide,`), `a view for ${id}`);
    assert.match(TOUR, new RegExp(`t\\("onboarding\\.tour\\.${id}\\.title"\\)`), `${id} title`);
    assert.match(TOUR, new RegExp(`t\\("onboarding\\.tour\\.${id}\\.body"\\)`), `${id} body`);
  }
  for (const locale of locales) {
    const tour = require(`../../src/locales/${locale}/translation.json`).onboarding.tour;
    for (const id of TOUR_SLIDES) {
      assert.ok(tour[id].title.trim() && tour[id].body.trim(), `${locale} ${id}`);
    }
    for (const control of ["skip", "back", "next", "start", "label", "announce"]) {
      assert.ok(tour[control].trim(), `${locale} ${control}`);
    }
  }
});

test("Back and Next stop at both ends, and never land between slides", () => {
  assert.equal(tourStep(0, -1), 0);
  assert.equal(tourStep(0, 1), 1);
  assert.equal(tourStep(3, 1), 4);
  assert.equal(tourStep(4, 1), 4, "the last slide is where the tour is finished, not wrapped");
  assert.equal(tourStep(2, -1), 1);
  assert.equal(tourStep(1, 5), 2, "an arrow moves one slide however it is counted");
  assert.equal(tourStep(0, 1, 1), 0);
});

test("the example is read the way the reading view reads a stored conversation", () => {
  const conversation = tourConversation(example, { now: NOW });
  assert.equal(conversation.title, example.note.title);
  assert.equal(conversation.segments.length, example.note.transcript.length);
  assert.ok(conversation.segments.every((segment) => segment.id != null));
  // Placed as Home's copy would be: ended at least 45 minutes before now.
  assert.ok(conversation.startedAt < NOW);
  assert.ok(conversation.topics.length >= 4, "enough topics for the flow card");
  assert.ok(conversation.topics.every((topic) => topic.state !== "live"));
  assert.equal(conversation.moments.length, example.note.conversation_marks.length);
  assert.equal(typeof conversation.loudness, "string");
  // Every event, oldest first, and none of them belongs to a real note.
  assert.equal(conversation.events.length, example.events.length);
  for (let index = 1; index < conversation.events.length; index += 1) {
    assert.ok(conversation.events[index - 1].createdAt <= conversation.events[index].createdAt);
  }
  assert.ok(conversation.events.every((event) => event.noteId === 0));
});

test("no slide is empty with the bundled example", () => {
  const conversation = tourConversation(example, { now: NOW });
  const lanes = topicLanes({ snapshot: conversation.snapshot, segments: conversation.segments });
  assert.equal(lanes.empty, false);
  assert.ok(lanes.rows.length >= 4 && lanes.rows.length <= 8, "the lanes fit without scrolling");
  assert.ok(lanes.returns.length > 0, "the line comes back to a topic at least once");
  const talk = talkTime(conversation.segments);
  assert.ok(talk.speakers.length >= 2, "talk time draws only from two voices");
  const review = buildReview({ events: conversation.events, topics: conversation.topics });
  assert.equal(review.empty, false);
  assert.ok(review.unresolved.length > 0);
  assert.equal(tourCards(conversation, { now: NOW }).length, 3);
});

test("the cards: two answered, then one asked, then the reply settles that same card", () => {
  const conversation = tourConversation(example, { now: NOW });
  assert.deepEqual(CARD_STEP_MS, [...CARD_STEP_MS].sort((a, b) => a - b));
  assert.equal(CARD_STEP_MS[0], 0);
  assert.equal(LAST_CARD_STEP, CARD_STEP_MS.length - 1);

  const first = tourCards(conversation, { now: NOW, step: 0 });
  const asked = tourCards(conversation, { now: NOW, step: 1 });
  const settled = tourCards(conversation, { now: NOW, step: LAST_CARD_STEP });
  assert.deepEqual(
    first.map((card) => card.state),
    ["answered", "answered"]
  );
  assert.deepEqual(
    asked.map((card) => card.state),
    ["answered", "answered", "asked"]
  );
  assert.deepEqual(
    settled.map((card) => card.state),
    ["answered", "answered", "denied"]
  );
  // One card, not a second one: the verdict lands on the card already shown.
  assert.equal(asked[2].id, settled[2].id);
  assert.deepEqual(
    settled.slice(0, 2).map((card) => card.id),
    first.map((card) => card.id)
  );
  // Asked now, the others as long before it as they were in the room.
  assert.equal(settled[2].createdAt, NOW);
  assert.ok(settled[0].createdAt < settled[1].createdAt && settled[1].createdAt < NOW);
  // Three questions as they were asked, one after another, each its own group.
  const asks = conversation.events.filter((event) => event.kind === "question");
  const at = settled.map((card) => asks.findIndex((event) => event.text.trim() === card.question));
  assert.ok(at.every((index) => index >= 0));
  assert.deepEqual(at, [at[0], at[0] + 1, at[0] + 2]);
  assert.equal(new Set(settled.map((card) => card.groupKey)).size, 3);
  // Nothing was searched, and no card carries a suggestion to search with.
  assert.ok(settled.every((card) => card.searched === false && card.suggestionId === null));
});

test("no slide can act: the stage is inert and the tour calls nothing", () => {
  // The one box every slide is drawn in takes no click, key or focus.
  assert.match(TOUR, /<div\s+ref=\{stageRef\}\s+inert\s/);
  assert.equal((TOUR.match(/<View conversation=\{conversation\} \/>/g) ?? []).length, 1);
  const stage = between(TOUR, "ref={stageRef}", "<ScrollFade");
  assert.match(stage, /<View conversation=\{conversation\} \/>/);
  // No main process, no store writes, no settings: data comes in as props.
  assert.doesNotMatch(TOUR, /electronAPI/);
  assert.doesNotMatch(TOUR, /use[A-Z][A-Za-z]*Store|stores\//);
  assert.doesNotMatch(TOUR, /localStorage|sessionStorage/);
  // The rail is given the example's cards rather than reading the recording's.
  assert.match(TOUR, /<ConversationSignalRail cards=\{cards\} onFocus=\{ignore\} \/>/);
  assert.match(RAIL, /cards\?: ConversationCard\[\];/);
  assert.match(RAIL, /const cards = givenCards \?\? recordingCards;/);
  // The flow card is the stored one, with no past conversations' subjects.
  assert.match(TOUR, /<ConversationFlow\s+snapshot=\{conversation\.snapshot\}/);
  assert.match(TOUR, /suggestions=\{NO_SUGGESTIONS\}/);
  // The reading view's own components, not copies of them.
  assert.match(TOUR, /import \{ ConversationReview, TalkTime \} from "\.\.\/OatsWorkspace";/);
  assert.match(WORKSPACE, /^export function ConversationReview\(\{/m);
  assert.match(WORKSPACE, /^export function TalkTime\(\{/m);
});

test("the tour moves only when asked, and holds still under reduced motion", () => {
  // The slide changes on Back, Next, a dot or an arrow key, and on nothing else.
  const changes = TOUR.match(/setIndex\(/g) ?? [];
  assert.equal(changes.length, 3, "go(), the arrow keys and the dots");
  assert.match(TOUR, /const go = \(delta: number\) => setIndex\(\(value\) => tourStep\(value, delta, count\)\);/);
  assert.match(TOUR, /setIndex\(\(current\) => tourStep\(current, delta, count\)\);/);
  assert.match(TOUR, /onClick=\{\(\) => setIndex\(position\)\}/);
  assert.match(TOUR, /event\.key === "ArrowRight" \? 1 : event\.key === "ArrowLeft" \? -1 : 0/);
  assert.doesNotMatch(TOUR, /setInterval/);
  // The only timers are the questions slide's cards, and not under reduced motion.
  const questions = between(TOUR, "function QuestionsSlide(", "\n}\n");
  assert.match(questions, /useState\(\(\) => \(reduced \? LAST_CARD_STEP : 0\)\)/);
  assert.match(questions, /if \(reduced\) return undefined;/);
  assert.equal((TOUR.match(/setTimeout\(/g) ?? []).length, 1);
  assert.match(TOUR, /prefers-reduced-motion: reduce/);
  // Slides arrive with the app's own entrance, which reduced motion turns off.
  assert.match(TOUR, /className="oats-enter/);
  // Start on the last slide, Skip before it: both end the tour.
  assert.match(TOUR, /onClick=\{last \? onDone : \(\) => go\(1\)\}/);
  assert.match(TOUR, /\{last \? t\("onboarding\.tour\.start"\) : t\("onboarding\.tour\.next"\)\}/);
  assert.match(TOUR, /variant="ghost"\s+onClick=\{onDone\}/);
});

test("setup is saved before the tour opens, and leaving the tour enters the app", () => {
  const finish = between(FLOW, "const finishOnboarding = useCallback(", "\n  );\n");
  const saved = finish.indexOf("const saved = await saveSettings();");
  const touring = finish.indexOf("setTouring(true);");
  assert.ok(saved > -1 && touring > saved, "the tour opens only after setup is saved");
  assert.doesNotMatch(finish, /onComplete\(/);
  assert.match(
    FLOW,
    /<OatsTour onDone=\{\(\) => onComplete\(\{ openSettings: openSettingsOnCompleteRef\.current \}\)\} \/>/
  );
  // Its own chunk, fetched while setup is on screen.
  assert.match(FLOW, /const loadTour = \(\) => import\("\.\/onboarding\/OatsTour"\);/);
  assert.match(FLOW, /const OatsTour = React\.lazy\(loadTour\);/);
});
