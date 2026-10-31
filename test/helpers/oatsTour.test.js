const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The tour at the end of setup (asked for by the product owner, 2026-10-29):
// a slide show of Oats' own components, taken out of their pages, with the
// example conversation Home offers. Since 2026-10-30 the components can be
// used ("interactable directly"), and nothing in the tour is saved or sent.
// The data each slide gets is a pure helper (src/helpers/oatsTour.mjs), tested
// here against the bundled example itself. The slides are the demo pieces
// (src/components/demo/), and what they may reach is pinned by walking their
// imports: no store, no main process, no storage, no network. The rest needs a
// DOM, so it is pinned at source level: the tour moves only when asked, an
// arrow on a slide's control is that control's, and setup is saved before the
// tour opens.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from > -1 && to > -1, `could not find ${start} … ${end}`);
  return source.slice(from, to);
};

const TOUR = read("src/components/onboarding/OatsTour.tsx");
const FLOW = read("src/components/OnboardingFlow.tsx");
const RAIL = read("src/components/conversation/ConversationSignalRail.tsx");
const LIVE_RAIL = read("src/components/conversation/LiveSignalRail.tsx");
const FLOW_CARD = read("src/components/conversation/ConversationFlow.tsx");
const LIVE_FLOW = read("src/components/conversation/LiveConversationFlow.tsx");
const REVIEW = read("src/components/conversation/ConversationReview.tsx");
const TRANSCRIPT = read("src/components/conversation/Transcript.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const DEMO = Object.fromEntries(
  ["DemoFlow", "DemoQuestions", "DemoShape", "DemoVoices", "DemoOpen"].map((name) => [
    name,
    read(`src/components/demo/${name}.tsx`),
  ])
);
const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

const locales = fs
  .readdirSync(path.join(root, "src/locales"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let TOUR_SLIDES;
let tourStep;
let tourArrow;
let tourConversation;
let tourCards;
let CARD_STEP_MS;
let LAST_CARD_STEP;
let talkTime;
let topicLanes;
let buildReview;

test.before(async () => {
  ({ TOUR_SLIDES, tourStep, tourArrow, tourConversation, tourCards, CARD_STEP_MS, LAST_CARD_STEP } =
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
    assert.match(views, new RegExp(`\\b${id}: Demo[A-Z][A-Za-z]+,`), `a demo piece for ${id}`);
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

test("an arrow is the tour's only on its own controls or on nothing", () => {
  const right = { key: "ArrowRight" };
  const left = { key: "ArrowLeft" };
  assert.equal(tourArrow(right, "none"), 1);
  assert.equal(tourArrow(right, "tour"), 1);
  assert.equal(tourArrow(left, "none"), -1);
  assert.equal(tourArrow(left, "tour"), -1);
  // On a control in a slide the arrow is that control's (the Lanes / Graph
  // switch moves with it), and anywhere else it is nobody's.
  assert.equal(tourArrow(right, "slide"), 0);
  assert.equal(tourArrow(left, "slide"), 0);
  assert.equal(tourArrow(right, "other"), 0);
  // A key a control already handled, or one with a modifier, is not a step.
  assert.equal(tourArrow({ ...right, defaultPrevented: true }, "none"), 0);
  assert.equal(tourArrow({ ...right, metaKey: true }, "tour"), 0);
  assert.equal(tourArrow({ ...left, altKey: true }, "none"), 0);
  assert.equal(tourArrow({ ...left, ctrlKey: true }, "none"), 0);
  assert.equal(tourArrow({ key: "ArrowDown" }, "none"), 0);
  assert.equal(tourArrow({ key: "Enter" }, "tour"), 0);
  assert.equal(tourArrow(null, "none"), 0);
  // The tour asks it with where the key landed: the stage is a slide's, the
  // rest of the section the tour's own, and the page nobody's.
  assert.match(TOUR, /const delta = tourArrow\(event, focusOf\(event\.target\)\);/);
  const where = between(TOUR, "const focusOf = ", "const onKey = ");
  assert.match(
    where,
    /target === document\.body \|\| target === document\.documentElement\) return "none";/
  );
  assert.match(where, /stageRef\.current\?\.contains\(target\)\) return "slide";/);
  assert.match(where, /sectionRef\.current\?\.contains\(target\)\) return "tour";/);
  assert.ok(where.indexOf('"slide"') < where.indexOf('"tour"'), "the stage is inside the section");
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
  assert.deepEqual(
    CARD_STEP_MS,
    [...CARD_STEP_MS].sort((a, b) => a - b)
  );
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

test("the slides can be used: the stage takes input, and each is the app's own component", () => {
  const tour = code(TOUR);
  assert.doesNotMatch(tour, /\binert\b/, "nothing on the stage is shut off");
  assert.equal((TOUR.match(/<View conversation=\{conversation\} \/>/g) ?? []).length, 1);
  const stage = between(TOUR, "ref={stageRef}", "<ScrollFade");
  assert.match(stage, /<View conversation=\{conversation\} \/>/);
  // Past the stage's foot (the answers, a voice's turns) the stage scrolls.
  assert.match(stage, /overflow-y-auto/);
  assert.match(stage, /onScroll=\{measure\}/);
  assert.match(
    TOUR,
    /import \{ DemoFlow, DemoOpen, DemoQuestions, DemoShape, DemoVoices \} from "\.\.\/demo";/
  );
  // Each piece is the component the app renders, not a copy of it.
  assert.match(DEMO.DemoFlow, /<ConversationFlow\s+snapshot=\{conversation\.snapshot\}/);
  assert.match(
    DEMO.DemoQuestions,
    /<ConversationSignalRail cards=\{cards\} onFocus=\{ignore\} \/>/
  );
  assert.match(DEMO.DemoShape, /<ConversationContour\s/);
  assert.match(DEMO.DemoShape, /<ContourLegend contour=\{contour\}/);
  assert.match(DEMO.DemoVoices, /<TalkTime\s/);
  assert.match(DEMO.DemoVoices, /<TranscriptView\s/);
  assert.match(
    DEMO.DemoOpen,
    /<ConversationReview events=\{conversation\.events\} topics=\{conversation\.topics\} \/>/
  );
  // A slide arrives a little above the middle, with room under it for what a
  // press adds, and stays there: what grows grows downward.
  assert.match(TOUR, /const ROOM_FOR_PRESS = 64;/);
  assert.match(TOUR, /Math\.floor\(\(height - content\.offsetHeight - ROOM_FOR_PRESS\) \/ 2\)/);
  assert.match(stage, /style=\{\{ paddingTop: offset \}\}/);
});

// Every module the tour reaches through its imports, value imports only (an
// `import type` is gone once compiled), from src/.
function importGraph(entry) {
  const seen = new Map();
  const bare = new Set();
  const resolve = (from, spec) => {
    const base = path.resolve(path.dirname(path.join(root, from)), spec);
    for (const candidate of ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]) {
      const file = base + candidate;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return path.relative(root, file);
    }
    throw new Error(`${from}: cannot resolve ${spec}`);
  };
  const visit = (file) => {
    if (seen.has(file)) return;
    const source = read(file);
    seen.set(file, source);
    if (file.endsWith(".json")) return;
    // Comments out first: a JSDoc `import("…")` names a type, not a module.
    const body = code(source);
    const specs = [
      ...body.matchAll(
        /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm
      ),
      ...body.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    for (const spec of specs) {
      if (spec.startsWith(".")) visit(resolve(file, spec));
      else bare.add(spec);
    }
  };
  visit(entry);
  return { files: [...seen.keys()], sources: seen, bare };
}

test("nothing in the tour is saved or sent: no demo module can reach a store, main or the network", () => {
  const graph = importGraph("src/components/onboarding/OatsTour.tsx");
  // The pieces and the components they draw are all in it.
  for (const file of [
    "src/components/demo/DemoFlow.tsx",
    "src/components/demo/DemoQuestions.tsx",
    "src/components/demo/DemoShape.tsx",
    "src/components/demo/DemoVoices.tsx",
    "src/components/demo/DemoOpen.tsx",
    "src/components/conversation/ConversationFlow.tsx",
    "src/components/conversation/ConversationSignalRail.tsx",
    "src/components/conversation/ConversationContour.tsx",
    "src/components/conversation/TalkTime.tsx",
    "src/components/conversation/Transcript.tsx",
    "src/components/conversation/ConversationReview.tsx",
  ]) {
    assert.ok(graph.files.includes(file), `the tour draws ${file}`);
  }
  // No store, and not the workspace or a live wrapper, is reached.
  const reached = graph.files.filter((file) =>
    /src\/stores\/|OatsWorkspace\.tsx|LiveSignalRail|LiveConversationFlow|useLiveContour/.test(file)
  );
  assert.deepEqual(reached, []);
  // No module it reaches names the main process, storage, cookies or the
  // network, or opens a window or another page.
  const reaching =
    /electronAPI|localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|window\.open\(|location\.(href|assign|replace)/;
  const leaks = graph.files
    .filter((file) => !file.endsWith(".json"))
    .filter((file) => reaching.test(code(graph.sources.get(file))));
  assert.deepEqual(leaks, []);
  // Only libraries that draw: React, the icons, i18n and the class helpers.
  assert.deepEqual([...graph.bare].sort(), [
    "@radix-ui/react-slot",
    "class-variance-authority",
    "clsx",
    "lucide-react",
    "react",
    "react-i18next",
    "tailwind-merge",
  ]);
});

test("the pieces are given none of the actions that leave the window, so none is drawn", () => {
  for (const [name, source] of Object.entries(DEMO)) {
    assert.doesNotMatch(
      code(source),
      /onSearch|onDismiss|onOpenSource|onOpenTurn|onRenameSpeaker/,
      `${name} passes no action that leaves the window`
    );
  }
  // The flow card's view is the piece's own state, never the setting.
  assert.match(DEMO.DemoFlow, /useState<ConversationFlowView>\("lanes"\)/);
  assert.match(DEMO.DemoFlow, /view=\{view\}\s+onViewChange=\{setView\}/);
  // A component draws such an action only when it is given one.
  assert.match(RAIL, /\) : onSearch \? \(/, "Search only with onSearch");
  assert.match(RAIL, /onDismiss\?\.\(groupCards\);/, "a dismissal is told, not sent");
  assert.match(RAIL, /onOpenSource && \(source\.kind === "file" \|\| source\.kind === "link"\)/);
  assert.match(
    REVIEW,
    /\{onOpenTurn \? \(\s*<button/,
    "a review row is a place only with onOpenTurn"
  );
  assert.match(REVIEW, /\{item\.reply && onOpenTurn \? \(/);
  assert.match(TRANSCRIPT, /const nameable = Boolean\(onRename && segment\.speaker/);
  assert.match(FLOW_CARD, /onValueChange=\{onViewChange\}/);
  // The tour's cards carry no suggestion to search or dismiss with.
  assert.match(DEMO.DemoQuestions, /tourCards\(conversation, \{ now, step \}\)/);
});

test("the app keeps its actions: the recording's rail and flow card are bound by wrappers", () => {
  assert.match(
    WORKSPACE,
    /<LiveSignalRail onFocus=\{setFocusedGroup\} announceOnly=\{!detailed\} \/>/
  );
  assert.match(WORKSPACE, /<LiveConversationFlow\s/);
  assert.match(LIVE_RAIL, /useMeetingRecordingStore\(\(state\) => state\.questionCards\)/);
  assert.match(LIVE_RAIL, /window\.electronAPI\?\.openConversationSearch\?\.\(\{/);
  assert.match(
    LIVE_RAIL,
    /window\.electronAPI\?\.dismissConversationCard\?\.\(card\.suggestionId\)/
  );
  assert.match(LIVE_RAIL, /openContextFile\?\.\(source\.path\)/);
  assert.match(LIVE_RAIL, /openExternal\?\.\(source\.url\)/);
  assert.match(LIVE_FLOW, /useSettingsStore\(\(s\) => s\.conversationFlowView\)/);
  assert.match(LIVE_FLOW, /onViewChange=\{setView\}/);
  // The reading view still opens turns and names voices.
  assert.match(
    WORKSPACE,
    /<ConversationReview events=\{events\} topics=\{selectedTopics\} onOpenTurn=\{openTurn\} \/>/
  );
  assert.match(
    WORKSPACE,
    /onRenameSpeaker=\{\(speaker, name\) => void renameSpeaker\(speaker, name\)\}/
  );
  assert.match(WORKSPACE, /onPick=\{\(time\) => \{/);
});

test("the tour moves only when asked, and holds still under reduced motion", () => {
  // The slide changes on Back, Next, a dot or an arrow key, and on nothing else.
  const changes = TOUR.match(/setIndex\(/g) ?? [];
  assert.equal(changes.length, 3, "go(), the arrow keys and the dots");
  assert.match(
    TOUR,
    /const go = \(delta: number\) => setIndex\(\(value\) => tourStep\(value, delta, count\)\);/
  );
  assert.match(TOUR, /setIndex\(\(current\) => tourStep\(current, delta, count\)\);/);
  assert.match(TOUR, /onClick=\{\(\) => setIndex\(position\)\}/);
  assert.doesNotMatch(TOUR, /setInterval|setTimeout\(/);
  // The only timers are the questions piece's cards, and not under reduced motion.
  const questions = between(DEMO.DemoQuestions, "export default function DemoQuestions(", "\n}\n");
  assert.match(questions, /useState\(\(\) => \(reduced \? LAST_CARD_STEP : 0\)\)/);
  assert.match(questions, /if \(reduced\) return undefined;/);
  assert.equal((DEMO.DemoQuestions.match(/setTimeout\(/g) ?? []).length, 1);
  assert.match(read("src/components/demo/demoMotion.ts"), /prefers-reduced-motion: reduce/);
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
