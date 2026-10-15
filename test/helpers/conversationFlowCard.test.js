const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The flow card on the recording screen: Lanes (default) or Graph, drawn by
// the chart rules (DESIGN.md §6). Source-level: the card needs a browser to
// render, and the geometry under it is pinned in topicLanes.test.js and
// liveThreadMap.test.js.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const FLOW = read("src/components/conversation/ConversationFlow.tsx");
const LANES = read("src/components/conversation/TopicLanes.tsx");
const TEXT = read("src/components/conversation/flowText.ts");
const CSS = read("src/index.css");
const STORE = read("src/stores/settingsStore.ts");
const CHART_STYLE = read("src/components/charts/chartStyle.ts");

const locales = fs
  .readdirSync(path.join(__dirname, "../../src/locales"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

test("the card offers Lanes and Graph, and nothing chooses for the person", () => {
  assert.match(FLOW, /options=\{flowViewOptions\(t\)\}/);
  assert.match(
    TEXT,
    /\{ value: "lanes", label: t\("oats\.flow\.mode\.lanes"\), icon: LanesGlyph \}/
  );
  assert.match(TEXT, /\{ value: "graph", label: t\("oats\.flow\.mode\.graph"\), icon: Network \}/);
  assert.doesNotMatch(FLOW + TEXT, /value: "auto"|value: "stack"/);
  // Auto's rule, its hysteresis and its captions are gone, and so is the stack.
  for (const gone of ["chooseFlowView", "suitableView", "flowShape", "stackItems", "captionFor"]) {
    assert.ok(!FLOW.includes(gone), gone);
  }
  assert.doesNotMatch(FLOW, /STACK_LIMIT|showMore|showFewer|stackLabel/);
  assert.match(STORE, /export type ConversationFlowView = "lanes" \| "graph";/);
  assert.match(STORE, /conversationFlowView: resolveFlowView\(/);
});

test("the caption states facts about the picture under it", () => {
  assert.match(FLOW, /const caption = flowCaption\(/);
  assert.match(TEXT, /t\("oats\.flow\.caption\.topics", \{ count: topics \}\)/);
  assert.match(TEXT, /t\("oats\.flow\.caption\.returns", \{ count: returns \}\)/);
  assert.match(TEXT, /t\("oats\.flow\.caption\.topicsReturns",/);
});

test("every locale has the two views and the caption, pluralised, and none of the old keys", () => {
  assert.equal(locales.length, 10);
  for (const locale of locales) {
    const flow = JSON.parse(read(`src/locales/${locale}/translation.json`)).oats.flow;
    assert.deepEqual(Object.keys(flow.mode), ["lanes", "graph"], locale);
    assert.ok(flow.lanesLabel, `${locale} lanesLabel`);
    for (const key of ["topics_one", "topics_other", "returns_one", "returns_other"]) {
      assert.match(flow.caption[key] ?? "", /\{\{count\}\}/, `${locale} caption.${key}`);
    }
    assert.match(flow.caption.topicsReturns, /\{\{topics\}\}.*\{\{returns\}\}/, locale);
    assert.deepEqual(
      Object.keys(flow.caption).filter((key) => !/^(topics|returns)_|^topicsReturns$/.test(key)),
      [],
      `${locale}: Auto's captions are gone`
    );
    for (const gone of ["stackLabel", "showFewer", "showMore_one", "showMore_other"]) {
      assert.equal(flow[gone], undefined, `${locale} ${gone}`);
    }
  }
  const ru = JSON.parse(read("src/locales/ru/translation.json")).oats.flow.caption;
  for (const key of ["topics_few", "topics_many", "returns_few", "returns_many"]) {
    assert.ok(ru[key], `ru caption.${key}`);
  }
});

// ------------------------------------------------------------ the lanes

test("each row is a button: the label, the minutes, and its state for a screen reader", () => {
  assert.match(LANES, /<button[\s\S]*?type="button"[\s\S]*?aria-pressed=\{isSelected\}/);
  assert.match(LANES, /onClick=\{\(\) => onSelect\(row\.id\)\}/);
  assert.match(LANES, /isSelected && "bg-muted hover:bg-muted"/);
  assert.match(LANES, /"truncate text-\[13px\]"/);
  assert.match(LANES, /text-right text-\[13px\] tabular-nums text-muted-foreground/);
  assert.match(LANES, /<span className="sr-only">\{name\}<\/span>/);
  // The topic now: medium weight, and no Now badge (the line's honey end says
  // it); its state is still in the row's name for a screen reader.
  assert.match(LANES, /isNow && "font-medium text-foreground"/);
  assert.doesNotMatch(LANES, /<Badge/);
  assert.match(LANES, /stateLabel\(t, isNow \? "live"/);
  // The stack's dividers.
  assert.match(LANES, /index > 0 && "border-t border-border"/);
});

test("one 1.5px quiet line over the rows' middle column, kept on them while the card glides", () => {
  assert.match(LANES, /grid-cols-\[fit-content\(min\(13rem,30%\)\)_minmax\(0,1fr\)_max-content\]/);
  assert.match(LANES, /col-span-full grid grid-cols-subgrid/);
  assert.match(LANES, /className="pointer-events-none relative col-start-2"/);
  // The chart module's weights (DESIGN.md §6), not a number of its own.
  assert.match(CHART_STYLE, /export const CHART = \{ line: 1\.5, rule: 1, dot: 4, ring: 2,/);
  assert.match(LANES, /import \{ CHART \} from "\.\.\/charts\/chartStyle";/);
  assert.match(LANES, /strokeWidth=\{CHART\.line\}/);
  assert.doesNotMatch(LANES, /LINE_PX/);
  assert.match(LANES, /stroke="var\(--color-muted-foreground\)"/);
  assert.match(LANES, /strokeLinecap="round"/);
  assert.match(LANES, /vectorEffect="non-scaling-stroke"/);
  assert.match(LANES, /viewBox=\{`0 0 \$\{width\} \$\{height\}`\}/);
  assert.match(LANES, /preserveAspectRatio="none"/);
  assert.match(LANES, /new ResizeObserver/);
  assert.doesNotMatch(LANES, /strokeDasharray|strokeOpacity/);
});

test("the line ends at now in honey, and questions sit on their topic in the shared marks", () => {
  assert.match(
    LANES,
    /const now =\s*live && last && rowOf\.has\(last\.topic\) \? \{ x: last\.to, row: rowOf\.get\(last\.topic\) \} : null;/
  );
  // The one dot: `CHART.dot` across in a `CHART.ring` ring of the card colour.
  assert.match(LANES, /rounded-full bg-primary"/);
  assert.match(LANES, /width: CHART\.dot \* 2,\s*height: CHART\.dot \* 2,/);
  assert.match(LANES, /boxShadow: `0 0 0 \$\{CHART\.ring\}px var\(--color-card\)`/);
  assert.match(LANES, /const run = runAt\(lanes, question\.at\);/);
  // A mark sits on a disc of the card colour, so the line never runs through
  // an open ring.
  assert.match(LANES, /rounded-full bg-card"[\s\S]*?padding: CHART\.ring \}\}[\s\S]*?<StateMark/);
});

test("past eight rows the card scrolls inside, and the topic now stays in view", () => {
  assert.match(LANES, /export const LANE_ROWS_SHOWN = 8;/);
  assert.match(FLOW, /maxHeight: \(LANE_ROWS_SHOWN \+ 0\.5\) \* LANE_ROW_PX/);
  assert.match(LANES, /scroller\.scrollTop = top \+ LANE_ROW_PX - scroller\.clientHeight/);
});

test("the line draws itself once, and not under reduced motion", () => {
  assert.match(LANES, /className="oats-lanes-draw absolute inset-0"/);
  assert.match(
    CSS,
    /\.oats-lanes-draw \{\s*animation: oats-lanes-draw var\(--motion-slow\) var\(--ease-oats\) backwards;\s*\}/
  );
  assert.match(
    CSS,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.oats-lanes-draw \{\s*animation: none;\s*\}\s*\}/
  );
});

// ------------------------------------------------------------ the graph

test("every link is 1.5px and solid: a return in ink, a move on in the quiet grey", () => {
  assert.match(FLOW, /strokeWidth=\{CHART\.line\}/);
  assert.doesNotMatch(FLOW, /LINE_PX/);
  assert.match(FLOW, /const reach = CHART\.dot \+ CHART\.ring \+ EDGE_GAP_PX;/);
  assert.match(
    FLOW,
    /link\.kind === "return"\s*\? "var\(--color-foreground\)"\s*: "var\(--color-muted-foreground\)"/
  );
  assert.doesNotMatch(FLOW, /strokeDasharray|strokeOpacity|var\(--color-primary\)/);
});

test("every dot is one size in a card ring: honey now, a ring when dropped, quiet otherwise", () => {
  assert.match(FLOW, /live: "bg-primary",/);
  assert.match(FLOW, /open: "bg-muted-foreground",/);
  assert.match(FLOW, /resolved: "bg-muted-foreground",/);
  assert.match(FLOW, /dropped: "border-\[1\.5px\] border-muted-foreground bg-card",/);
  assert.match(FLOW, /"inline-block shrink-0 rounded-full ring-2"/);
  assert.match(FLOW, /style=\{\{ width: CHART\.dot \* 2, height: CHART\.dot \* 2 \}\}/);
  assert.doesNotMatch(FLOW, /bg-success|ring-primary\/20|dotSize\(point\)/);
});

// A ResizeObserver's first report waits for the page to render, so a window
// that is not being drawn never sent it and the graph drew no edges at all.
test("the graph measures its box before the first paint, then on resize", () => {
  const graph = FLOW.slice(FLOW.indexOf("function FlowGraph("));
  assert.match(
    graph,
    /useLayoutEffect\(\(\) => \{\s*const element = box\.current;[\s\S]*?element\.getBoundingClientRect\(\);\s*measure\(width, height\);\s*const observer = new ResizeObserver/
  );
});

test("labels sit on plates in the card colour, placed clear of each other's words", () => {
  assert.match(FLOW, /"bg-card font-medium text-foreground hover:bg-muted"/);
  assert.match(FLOW, /"bg-card text-muted-foreground hover:bg-muted hover:text-foreground"/);
  assert.match(FLOW, /plateX: BUTTON_PAD_X_PX,\s*plateY: PLATE_Y_PX,/);
  assert.doesNotMatch(FLOW, /hover:bg-muted\/60/, "a plate is opaque, even under the pointer");
});
