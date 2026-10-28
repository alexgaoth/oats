// Source pins for the Global conversations board: what its components must
// keep doing that a pure test cannot reach without a DOM. Each names the
// behaviour it protects; the arithmetic behind them is tested directly in
// boardLayout, arcGeometry, linkedHighlight, boardPersistence and
// subjectThreads.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

test("Conversations switches between List and Global, and the old map's name is gone", () => {
  const workspace = read("src/components/OatsWorkspace.tsx");
  assert.match(workspace, /t\("oats\.global\.view\.global"\)/);
  assert.match(workspace, /t\("oats\.global\.title"\)/);
  assert.doesNotMatch(workspace, /lifetime\./, "no string of the old map is asked for");
  assert.doesNotMatch(workspace, /LifetimeGraph/);
  const english = JSON.parse(read("src/locales/en/translation.json"));
  assert.equal(english.oats.global.title, "Global conversations");
  assert.equal(english.lifetime, undefined, "the old map's strings are removed, not left dead");
  assert.ok(!JSON.stringify(english).includes("keep coming back to"));
});

test("the board's dots are 2 px squares in the middle of each cell, crisp on device pixels", () => {
  const board = read("src/components/global/Board.tsx");
  assert.match(board, /shape-rendering='crispEdges'/);
  assert.match(board, /%3Crect x='11' y='11' width='2' height='2'\/%3E/);
  assert.match(board, /backgroundColor: "var\(--color-border\)"/, "in the rule grey, both themes");
  assert.match(board, /boardRoom\(width, height\)/, "the room is the tested helper's");
  assert.match(board, /dotField\(room\)/, "and so is where the dots go");
  assert.match(board, /top: MARGIN \* GRID/, "the cards start two cells down");
});

test("an open question is drawn with the one question mark, ringed in honey when lit", () => {
  const widget = read("src/components/global/OpenQuestionsWidget.tsx");
  assert.match(widget, /import \{ StateMark \} from "\.\.\/conversation\/ConversationSignalRail";/);
  assert.match(widget, /<StateMark state=\{row\.state\} className="" \/>/);
  assert.match(
    widget,
    /honey && "ring-2 ring-primary"/,
    "lit as a chart lights a dot: a honey ring"
  );
  assert.match(widget, /t\("questionCard\.state\.denied"\)/, "nobody knew is said, not only drawn");
});

test("a conversation opened from the board comes back to the board", () => {
  const workspace = read("src/components/OatsWorkspace.tsx");
  // The reading view opens from either view, so Escape returns to the one it
  // came from rather than always to the list.
  assert.match(workspace, /if \(reading && selected\) \{/);
  const opened = workspace.slice(workspace.indexOf("<GlobalConversations"));
  assert.doesNotMatch(opened.slice(0, 400), /setView\("list"\)/);
});

test("pointing redraws the canvases straight from the shared highlight, not through React", () => {
  for (const file of [
    "src/components/notes/ForceGraph.tsx",
    "src/components/global/ArcTimeline.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /highlight\.subscribe\(\(\) => drawRef\.current\(\)\)/, file);
    assert.doesNotMatch(
      source,
      /useState<number \| null>\(null\);\s*\/\/[^\n]*hover|\[hovered\w*, setHovered\w*\] = useState/,
      `${file} keeps what is pointed at out of React state`
    );
  }
});

test("nothing animates at rest: frames are asked for only by a settle or a scroll", () => {
  const graph = read("src/components/notes/ForceGraph.tsx");
  const frames = [...graph.matchAll(/requestAnimationFrame\(/g)].length;
  assert.equal(frames, 2, "the settle's first frame and its next tick, nothing else");
  const settle = graph.slice(graph.indexOf("const settle = useCallback("));
  assert.ok(settle.indexOf("requestAnimationFrame(tick)") > -1);

  const timeline = read("src/components/global/ArcTimeline.tsx");
  const timelineFrames = [...timeline.matchAll(/requestAnimationFrame\(/g)];
  assert.equal(timelineFrames.length, 1);
  const onScroll = timeline.slice(timeline.indexOf("const onScroll = () => {"));
  assert.ok(onScroll.indexOf("requestAnimationFrame(") < 400, "only a scroll redraws the timeline");
});

test("keyboard focus points at a conversation the way the pointer does", () => {
  for (const file of [
    "src/components/notes/ForceGraph.tsx",
    "src/components/global/ArcTimeline.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /onFocus=\{\(\) => \{[^}]*setHover\(/s, file);
    assert.match(source, /onBlur=\{\(\) => setHover\(null\)\}/, file);
  }
});

test("the tabs are the conversation groups, read from the one group store", () => {
  const board = read("src/components/global/GlobalConversations.tsx");
  assert.match(board, /const \{ groups \} = useConversationGroups\(\);/);
  assert.match(board, /from "\.\.\/\.\.\/stores\/conversationGroupStore"/);
  assert.match(board, /boardTabs\(groups\)/, "the tabs are made from the groups as data");
  // A seeded group is named in the reader's language, as everywhere else.
  assert.match(board, /groupDisplayName\(item\.group, t\)/);
  // An older conversation the note store does not hold follows a deleted group.
  const data = read("src/components/global/useBoardData.ts");
  assert.match(data, /onConversationGroupsChanged/);
});

test("labels sit on plates in the surface colour, never cut at the canvas edge", () => {
  const graph = read("src/components/notes/ForceGraph.tsx");
  assert.match(graph, /const x = Math\.min\(width - half, Math\.max\(half, node\.x\)\);/);
  // Drawn by the chart style's plate, in the colour of what the canvas sits on.
  assert.match(
    graph,
    /const plated = surface === palette\.card \? palette : \{ \.\.\.palette, card: surface \};/
  );
  assert.match(graph, /drawPlateText\(ctx, label\.text, label\.x, label\.y, plated,/);
});

test("a focused card moves with the arrow keys and resizes with shift, and only the card itself", () => {
  const board = read("src/components/global/Board.tsx");
  assert.match(board, /if \(event\.target !== event\.currentTarget \|\| !room\.cols\) return;/);
  assert.match(board, /event\.shiftKey\s*\? grow\(/);
  assert.match(board, /: nudge\(/);
  assert.match(board, /tabIndex=\{0\}\s*onKeyDown=\{\(event\) => onCardKey\(event, widget\)\}/);
  // Said aloud, since a card that moved makes no sound.
  assert.match(board, /aria-live="polite" role="status"/);
});

test("Add lists every widget, disables those on the board, and the new card takes the focus", () => {
  const view = read("src/components/global/GlobalConversations.tsx");
  assert.match(view, /WIDGET_TYPES\.map\(\(type\) =>/);
  assert.match(view, /disabled=\{there\}/);
  assert.match(
    view,
    /onSelectAfterClose=\{\(event\) => \{\s*event\.preventDefault\(\);\s*board\.current\?\.add\(type\);/
  );
  const board = read("src/components/global/Board.tsx");
  assert.match(board, /card\.focus\(\{ preventScroll: true \}\)/);
});

test("an open question opens its conversation at the turn it was asked in", () => {
  const workspace = read("src/components/OatsWorkspace.tsx");
  const opened = workspace.slice(
    workspace.indexOf("<GlobalConversations"),
    workspace.indexOf("<GlobalConversations") + 500
  );
  assert.match(opened, /setTab\(segmentId \? "transcript" : "summary"\)/);
  assert.match(opened, /setLandedOnSegment\(segmentId \?\? null\)/);
});

test("the subjects and the open questions light with the rest of the board", () => {
  const widgets = read("src/components/global/widgets.tsx");
  // A chip lights for its own subject and for a conversation that carries it.
  assert.match(widgets, /state\.hoveredSubject === subject\.label \|\|/);
  assert.match(widgets, /subject\.conversationIds\.includes\(state\.hoveredConversationId\)/);
  // A question's ring takes honey from the board's one highlight, so a day or
  // a subject pointed at elsewhere lights it too.
  const questions = read("src/components/global/OpenQuestionsWidget.tsx");
  assert.match(questions, /useSyncExternalStore\(\s*highlight\.subscribe,/);
  assert.match(questions, /markTone\(highlight\.get\(\), id\) === "focus"/);
  // Each row holds its own subscription: pointing re-renders only the rows
  // whose ring changes, never the whole list.
  assert.match(questions, /const QuestionRow = memo\(function QuestionRow/);
});

test("a label forced on top covers the labels it lands on whole, never leaving a fragment", () => {
  const graph = read("src/components/notes/ForceGraph.tsx");
  const named = graph.slice(graph.indexOf("const named = focusNodes.map("));
  assert.match(named, /if \(scene\.labels\.get\(label\.id\) === label\) continue;/);
  assert.match(named, /boxesOverlap\(label\.box, other\.box\)/);
  assert.ok(
    named.indexOf("coverLabel(") < named.indexOf("paintLabels(ctx, named"),
    "the labels underneath are covered before the forced one is drawn"
  );
});

test("the board links by meaning when it can, and by words when it cannot", () => {
  const data = read("src/components/global/useBoardData.ts");
  assert.match(
    data,
    /ready && vectorOf \? meaningThreads\(withTopics, \{ vectorOf \}\) : subjectThreads\(withTopics\)/,
    "words until the vectors are there, and whenever they cannot be"
  );
  const board = read("src/components/global/GlobalConversations.tsx");
  assert.match(board, /const meaning = useTopicVectors\(conversations\);/);
  assert.match(board, /useTabGraph\(inTab, meaning\)/);
  const vectors = read("src/components/global/topicVectors.ts");
  assert.match(
    vectors,
    /state\.preferredLanguage === "en"/,
    "the bundled model reads English: another language links by words"
  );
  assert.match(
    vectors,
    /window\.electronAPI\?\.embedTexts/,
    "the vectors are the app's own model's"
  );
  assert.doesNotMatch(vectors, /fetch\(/, "and nothing leaves the computer");
});
