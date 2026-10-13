const test = require("node:test");
const assert = require("node:assert/strict");

let data;

test.before(async () => {
  data = await import("../../src/components/global/boardData.ts");
});

const group = (id, name, sortOrder, seedKey = null) => ({
  id,
  name,
  seed_key: seedKey,
  sort_order: sortOrder,
  created_at: "2026-10-01 00:00:00",
});
const conversation = (id, groupId) => ({
  id,
  title: `c${id}`,
  createdAt: id,
  snapshot: null,
  groupId,
  openQuestions: null,
});

test("All comes first, then one tab per group in the groups' order", () => {
  const { boardTabs } = data;
  const tabs = boardTabs([
    group(1, "Work", 0, "work"),
    group(5, "Research", 1),
    group(2, "Personal", 2),
  ]);
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ["all", "group:1", "group:5", "group:2"]
  );
  assert.equal(tabs[0].group, null);
  assert.equal(tabs[2].group.name, "Research");
  assert.deepEqual(
    boardTabs([]).map((tab) => tab.id),
    ["all"],
    "with no groups, the board has All"
  );
});

test("a group's tab holds only that group's conversations, and All holds every one", () => {
  const { boardTabs, conversationsInTab } = data;
  const [all, work, personal] = boardTabs([group(1, "Work", 0), group(2, "Personal", 1)]);
  const list = [
    conversation(10, 1),
    conversation(11, 2),
    conversation(12, null),
    conversation(13, 1),
  ];
  assert.deepEqual(
    conversationsInTab(list, all).map((item) => item.id),
    [10, 11, 12, 13]
  );
  assert.deepEqual(
    conversationsInTab(list, work).map((item) => item.id),
    [10, 13]
  );
  assert.deepEqual(
    conversationsInTab(list, personal).map((item) => item.id),
    [11]
  );
});

test("a topic snapshot is read from the note, and nothing else is taken for one", () => {
  const { readSnapshot } = data;
  const nodes = [{ label: "pricing", words: ["pricing"], durationMs: 1000 }];
  assert.deepEqual(readSnapshot(JSON.stringify({ nodes, edges: [] })).nodes, nodes);
  assert.deepEqual(readSnapshot({ nodes }).nodes, nodes);
  for (const junk of [null, "", "  ", "{not json", "[]", JSON.stringify({ nodes: "x" }), 4]) {
    assert.equal(readSnapshot(junk), null, String(junk));
  }
});

test("a title is said as short as it can be: the part before its colon", () => {
  const { shortTitle } = data;
  assert.equal(shortTitle("Design crit: import errors and SSO setup"), "Design crit");
  assert.equal(shortTitle("Weekly sync"), "Weekly sync");
  assert.equal(shortTitle(": only after"), ": only after");
});
