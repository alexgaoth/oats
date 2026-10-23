const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// How a summary is shown (src/helpers/summaryMarkdown.mjs): the reading view
// draws task list items as plain list items and the prompt's section headings
// in sentence case, for summaries written before the prompt asked for it as
// well as after; the list preview drops the same markup. Rendered through
// react-markdown itself, with the plugins MarkdownRenderer passes it.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

let summary;
let Markdown;

test.before(async () => {
  summary = await import("../../src/helpers/summaryMarkdown.mjs");
  ({ default: Markdown } = await import("react-markdown"));
});

const render = (markdown) =>
  renderToStaticMarkup(
    React.createElement(
      Markdown,
      { remarkPlugins: [summary.remarkPlainTaskItems, summary.remarkSummaryHeadings] },
      markdown
    )
  );

test("an action item is a plain list item: no literal [ ] and no checkbox", () => {
  const html = render(
    "## Action items\n- [ ] Theo: signed-assertion fix by Thursday.\n- [ ] **Ruth**: review the fix.\n"
  );
  assert.equal(
    html,
    "<h2>Action items</h2>\n<ul>\n<li>Theo: signed-assertion fix by Thursday.</li>\n" +
      "<li><strong>Ruth</strong>: review the fix.</li>\n</ul>"
  );
  assert.doesNotMatch(html, /\[ \]|<input/);
});

test("a summary written before sentence case reads like a new one", () => {
  const html = render(
    [
      "The team kept the launch date.",
      "## Key Discussion Points\n- Pricing holds.",
      "## Decisions Made\n- Hold the 3rd.",
      "## Action Items\n- [ ] Theo: signed-assertion fix by Thursday.",
      "## Follow-Ups\n- Who covers the evening queue.",
    ].join("\n\n")
  );
  assert.deepEqual(
    [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((match) => match[1]),
    ["Key discussion points", "Decisions made", "Action items", "Follow-ups"]
  );
  assert.match(html, /<li>Theo: signed-assertion fix by Thursday\.<\/li>/);
  assert.match(html, /<p>The team kept the launch date\.<\/p>/);
});

test("a task marker is dropped only at the start of a list item", () => {
  assert.equal(render("- [x] Shipped the flag."), "<ul>\n<li>Shipped the flag.</li>\n</ul>");
  assert.equal(render("* [X] Shipped."), "<ul>\n<li>Shipped.</li>\n</ul>");
  assert.equal(render("1. [ ] Ines: run it."), "<ol>\n<li>Ines: run it.</li>\n</ol>");
  assert.equal(
    render("- [ ] Ines: run the migration\n  - [ ] on the three largest workspaces"),
    "<ul>\n<li>Ines: run the migration\n<ul>\n<li>on the three largest workspaces</li>\n</ul>\n</li>\n</ul>"
  );
  // Not markers: inside the words, without the space after it, or code.
  assert.equal(render("- Pick [ ] or [x]."), "<ul>\n<li>Pick [ ] or [x].</li>\n</ul>");
  assert.equal(render("- [ ]tight"), "<ul>\n<li>[ ]tight</li>\n</ul>");
  assert.equal(render("- `[ ] code`"), "<ul>\n<li><code>[ ] code</code></li>\n</ul>");
  assert.equal(
    render("```\n- [ ] in a code block\n```"),
    "<pre><code>- [ ] in a code block\n</code></pre>"
  );
  assert.equal(render("[ ] not in a list"), "<p>[ ] not in a list</p>");
});

test("only a whole heading the prompt asks for changes case", () => {
  assert.equal(render("### ACTION ITEMS"), "<h3>Action items</h3>");
  assert.equal(render("## Action Items for Q3"), "<h2>Action Items for Q3</h2>");
  assert.equal(render("## Getroffene Entscheidungen"), "<h2>Getroffene Entscheidungen</h2>");
  assert.equal(render("Action Items"), "<p>Action Items</p>");
});

test("the prompt asks for the headings in sentence case", () => {
  for (const heading of summary.SUMMARY_HEADINGS) {
    assert.equal(heading, heading[0].toUpperCase() + heading.slice(1).toLowerCase());
  }
  const store = read("src/stores/actionProcessingStore.ts");
  assert.ok(
    store.includes(
      `section headings, in sentence case: ${summary.SUMMARY_HEADINGS.map((h) => `## ${h}`).join(", ")}`
    )
  );
  assert.match(store, /Under ## Action items, use checkboxes/);
  assert.doesNotMatch(store, /Key Discussion Points|Decisions Made|Action Items/);
  // The heading Oats puts on the transcript it sends the model.
  assert.match(read("src/components/OatsWorkspace.tsx"), /`## Conversation transcript\\n/);
});

test("the shipped example and the demo fixtures use exactly the prompt's headings", () => {
  const files = [
    "src/helpers/sampleConversations/launch-readiness-review.json",
    ...fs
      .readdirSync(path.join(root, "demo/fixtures"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => `demo/fixtures/${name}`),
  ];
  for (const file of files) {
    const { note } = JSON.parse(read(file));
    const headings = [...note.enhanced_content.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1]);
    assert.ok(headings.length > 0, file);
    for (const heading of headings) {
      assert.ok(summary.SUMMARY_HEADINGS.includes(heading), `${file}: "${heading}"`);
    }
  }
});

test("the list preview drops headings whole, emphasis and task markers", () => {
  assert.equal(
    summary.plainPreview(
      "Intro.\n\n## Threads\n- **Pricing.** Holds.\n\n## Action items\n- [ ] Theo: fix.\n* [x] Ruth: review.\n1. [ ] Ines: run it."
    ),
    "Intro. Pricing. Holds. Theo: fix. Ruth: review. 1. Ines: run it."
  );
  assert.equal(summary.plainPreview(null), "");
  assert.equal(summary.plainPreview(""), "");
});

test("the reading view and the lists use these rules", () => {
  const renderer = read("src/components/ui/MarkdownRenderer.tsx");
  assert.match(renderer, /const REMARK_PLUGINS = \[remarkPlainTaskItems, remarkSummaryHeadings\];/);
  assert.match(renderer, /remarkPlugins=\{REMARK_PLUGINS\}/);
  const workspace = read("src/components/OatsWorkspace.tsx");
  assert.match(workspace, /import \{ plainPreview \} from "\.\.\/helpers\/summaryMarkdown\.mjs";/);
  assert.doesNotMatch(workspace, /function plainPreview/);
});
