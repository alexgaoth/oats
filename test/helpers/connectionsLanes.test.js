const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The reading view's Connections tab: Lanes (default) or the topic graph, one
// selection for both, and the selected topic's questions in the panel below.
// Source-level: the tab needs a browser to render; the lanes' geometry and the
// question assignment are pinned in topicLanes.test.js.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const STORE = read("src/stores/settingsStore.ts");

// ConnectionsView and the graph it shows, as one block of source.
const start = WORKSPACE.indexOf("function ConnectionsView(");
const end = WORKSPACE.indexOf("function useRoomBelow(");
const VIEW = WORKSPACE.slice(start, end);

test("the tab has the flow card's switch, Lanes by default, persisted on its own", () => {
  assert.ok(start > 0 && end > start, "ConnectionsView is found");
  assert.match(VIEW, /<ViewSwitch<ConversationFlowView>/);
  assert.match(VIEW, /options=\{flowViewOptions\(t\)\}/);
  assert.match(VIEW, /const view = useSettingsStore\(\(s\) => s\.connectionsView\);/);
  assert.match(VIEW, /onValueChange=\{setView\}/);
  assert.match(
    STORE,
    /connectionsView: resolveFlowView\(\s*isBrowser \? localStorage\.getItem\("connectionsView"\) : null/
  );
  assert.match(STORE, /setConnectionsView: createStringSetter\("connectionsView"\)/);
  // Above the views, so its indicator can slide between them.
  const control = VIEW.indexOf("<ViewSwitch<ConversationFlowView>");
  assert.ok(control < VIEW.indexOf("<TopicLanes"));
  assert.ok(control < VIEW.indexOf("<ConnectionsGraph"));
});

test("the lanes show the questions and select the topic the graph selects", () => {
  assert.match(VIEW, /view === "lanes" \? \(/);
  assert.match(VIEW, /questions=\{questions\}/);
  assert.match(VIEW, /selected=\{selectedTopic\?\.id \?\? null\}/);
  assert.match(VIEW, /onSelect=\{selectTopic\}/);
  // Pressing the selected row again lets it go.
  assert.match(
    VIEW,
    /current\?\.id === id \? null : \(snapshot\.nodes\.find\(\(node\) => node\.id === id\) \?\? null\)/
  );
  assert.match(VIEW, /questionMoments\(events, segments\)/);
});

test("the graph keeps the topic graph, sized to the room it has when it appears", () => {
  assert.match(
    VIEW,
    /<TopicGraph\s+snapshot=\{snapshot\}\s+selectedId=\{selectedId\}\s+onSelect=\{onSelect\}\s+layoutKey=\{layoutKey\}\s*\/>/
  );
  assert.match(VIEW, /onSelect=\{setSelectedTopic\}/);
  assert.match(VIEW, /layoutKey=\{`oats:topic-layout:\$\{note\.id\}`\}/);
  const graph = VIEW.slice(VIEW.indexOf("function ConnectionsGraph("));
  assert.match(graph, /const graphHeight = useRoomBelow\(graphBox\);/);
});

test("the panel lists the questions on the selected topic's row", () => {
  assert.match(VIEW, /questionTopics\(lanes, moments, snapshot\)/);
  assert.match(
    VIEW,
    /event\.kind === "question" && topicOfQuestion\.get\(event\.id\) === selectedTopic\.id/
  );
  assert.doesNotMatch(VIEW, /selectedTopic\.utteranceIds\.includes/);
});

test("the panel gives the selected topic's time in minutes, as its row does", () => {
  // It said "174s" beside a row that said "3 min".
  assert.match(VIEW, /formatSpan\(selectedTopic\.durationMs, \{ locale: i18n\.language \}\)/);
  assert.doesNotMatch(VIEW, /topicGraph\.seconds/);
});
