const test = require("node:test");
const assert = require("node:assert/strict");

let highlight;
let arcs;
let lifetime;

test.before(async () => {
  highlight = await import("../../src/components/global/linkedHighlight.ts");
  arcs = await import("../../src/components/global/arcGeometry.ts");
  lifetime = await import("../../src/helpers/lifetimeGraph.mjs");
});

// Five conversations: 1-2-3 share SSO, 3-4 share pricing, 5 is a one-off.
const graph = {
  nodes: [1, 2, 3, 4, 5].map((id) => ({ id })),
  edges: [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 1, to: 3 },
    { from: 3, to: 4 },
  ],
};
const subjects = [
  { label: "sso saml", conversationIds: [1, 2, 3] },
  { label: "pricing", conversationIds: [3, 4] },
];
const nothing = { hoveredConversationId: null, hoveredSubject: null, selectedConversationId: null };
const keys = (set) => [...set].sort();

test("with nothing pointed at, nothing is lit and nothing recedes", () => {
  const { linkedHighlight, markTone, lineTone } = highlight;
  const result = linkedHighlight(graph, subjects, nothing);
  assert.equal(result.active, false);
  assert.equal(result.focus.size, 0);
  assert.equal(markTone(result, 5), "rest");
  assert.equal(lineTone(result, arcs.edgeKey(1, 2)), "rest");
});

test("pointing at a conversation lights it, its edges and the conversations they reach", () => {
  const { linkedHighlight, markTone, lineTone } = highlight;
  const { edgeKey } = arcs;
  const result = linkedHighlight(graph, subjects, { ...nothing, hoveredConversationId: 3 });
  assert.equal(result.active, true);
  assert.deepEqual([...result.focus], [3]);
  assert.deepEqual(keys(result.edges), keys([edgeKey(2, 3), edgeKey(1, 3), edgeKey(3, 4)]));
  assert.deepEqual([...result.related].sort(), [1, 2, 4]);
  assert.equal(markTone(result, 3), "focus");
  assert.equal(markTone(result, 4), "rest", "a conversation it reaches keeps its tone");
  assert.equal(markTone(result, 5), "recede", "everything else recedes");
  assert.equal(lineTone(result, edgeKey(4, 3)), "lit", "either way round");
  assert.equal(lineTone(result, edgeKey(1, 2)), "recede");
});

test("pointing at a subject lights the conversations that carry it and the arcs among them", () => {
  const { linkedHighlight, markTone, lineTone } = highlight;
  const { edgeKey } = arcs;
  const result = linkedHighlight(graph, subjects, { ...nothing, hoveredSubject: "pricing" });
  assert.equal(result.active, true);
  assert.deepEqual([...result.focus].sort(), [3, 4]);
  assert.deepEqual(keys(result.edges), [edgeKey(3, 4)]);
  assert.equal(
    lineTone(result, edgeKey(2, 3)),
    "recede",
    "an edge with one end outside the subject"
  );
  assert.equal(markTone(result, 2), "recede");
});

test("a subject lights only the edges that carry it, when edges name their subjects", () => {
  const { linkedHighlight, lineTone } = highlight;
  const { edgeKey } = arcs;
  // 1 and 3 are both on SSO, but the edge between them is the pricing thread's.
  const named = {
    nodes: graph.nodes,
    edges: [
      { from: 1, to: 2, topics: ["sso saml"] },
      { from: 2, to: 3, topics: ["sso saml"] },
      { from: 1, to: 3, topics: ["pricing"] },
    ],
  };
  const result = linkedHighlight(named, subjects, { ...nothing, hoveredSubject: "sso saml" });
  assert.deepEqual([...result.focus].sort(), [1, 2, 3]);
  assert.equal(lineTone(result, edgeKey(1, 2)), "lit");
  assert.equal(lineTone(result, edgeKey(2, 3)), "lit");
  assert.equal(lineTone(result, edgeKey(1, 3)), "recede", "both ends are on SSO, the edge is not");
});

test("two subjects with one name are one subject to the reader", () => {
  const { linkedHighlight } = highlight;
  const twice = [...subjects, { label: "pricing", conversationIds: [5] }];
  const result = linkedHighlight(graph, twice, { ...nothing, hoveredSubject: "pricing" });
  assert.deepEqual([...result.focus].sort(), [3, 4, 5]);
});

test("a selected conversation stays honey, and on its own makes nothing recede", () => {
  const { linkedHighlight, markTone, lineTone } = highlight;
  const { edgeKey } = arcs;
  const alone = linkedHighlight(graph, subjects, { ...nothing, selectedConversationId: 5 });
  assert.equal(alone.active, false);
  assert.equal(markTone(alone, 5), "focus");
  assert.equal(markTone(alone, 1), "rest");
  assert.equal(lineTone(alone, edgeKey(1, 2)), "rest");

  const both = linkedHighlight(graph, subjects, {
    ...nothing,
    selectedConversationId: 5,
    hoveredConversationId: 1,
  });
  assert.equal(markTone(both, 5), "focus", "pointing elsewhere does not take the selection away");
  assert.equal(markTone(both, 1), "focus");
});

test("a conversation from another tab lights nothing on this one", () => {
  const { linkedHighlight } = highlight;
  const result = linkedHighlight(graph, subjects, { ...nothing, hoveredConversationId: 42 });
  assert.equal(result.active, false);
  assert.equal(result.focus.size, 0);
  const subject = linkedHighlight(graph, subjects, { ...nothing, hoveredSubject: "office lease" });
  assert.equal(subject.active, false);
});

test("recurring subjects name the conversations that carry them", () => {
  const topic = (id, label, words) => ({ id, label, words, durationMs: 60000 });
  const conversations = [
    { id: 11, snapshot: { nodes: [topic(1, "enterprise pricing", ["enterprise", "pricing"])] } },
    { id: 12, snapshot: { nodes: [topic(1, "pricing enterprise", ["pricing", "enterprise"])] } },
    { id: 13, snapshot: { nodes: [topic(1, "office lease", ["office", "lease"])] } },
  ];
  const recurring = lifetime.recurringTopics(conversations);
  assert.equal(recurring.length, 1);
  assert.deepEqual(recurring[0].conversationIds.sort(), [11, 12]);
  assert.equal(recurring[0].conversations, 2);
});
