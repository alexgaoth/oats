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
