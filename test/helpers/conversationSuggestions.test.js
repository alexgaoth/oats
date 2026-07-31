const test = require("node:test");
const assert = require("node:assert/strict");

let buildSuggestions;
let buildLifetimeGraph;
let recurringTopics;

test.before(async () => {
  ({ buildSuggestions } = await import("../../src/helpers/conversationSuggestions.mjs"));
  ({ buildLifetimeGraph, recurringTopics } = await import("../../src/helpers/lifetimeGraph.mjs"));
});

const topic = (id, label, words, overrides = {}) => ({
  id,
  label,
  words,
  durationMs: 60000,
  lastAt: id * 1000,
  state: "open",
  utteranceIds: [],
  returns: 0,
  ...overrides,
});

test("a thread the room opened and walked away from is the strongest suggestion", () => {
  const snapshot = {
    nodes: [
      topic(1, "enterprise pricing", ["enterprise", "pricing", "segment"], { lastAt: 1000 }),
      topic(2, "investor update", ["investor", "update", "friday"], {
        state: "live",
        lastAt: 5000,
      }),
    ],
    edges: [],
  };
  const suggestions = buildSuggestions({ snapshot });
  assert.equal(suggestions[0].kind, "unfinished");
  assert.equal(suggestions[0].label, "enterprise pricing");
  // The live topic is never suggested — you are already in it.
  assert.ok(!suggestions.some((item) => item.label === "investor update"));
});

test("a topic that got a sentence and died is flagged as shallow", () => {
  const snapshot = {
    nodes: [
      topic(1, "enterprise pricing", ["enterprise", "pricing"], { durationMs: 120000 }),
      topic(2, "hiring band", ["hiring", "band"], { durationMs: 120000 }),
      topic(3, "security review", ["security", "review"], { durationMs: 2000 }),
      topic(4, "investor update", ["investor", "update"], { state: "live" }),
    ],
    edges: [],
  };
  const suggestions = buildSuggestions({ snapshot, limit: 10 });
  const security = suggestions.find((item) => item.label === "security review");
  assert.ok(security, "expected the brief topic to be suggested");
  assert.equal(security.kind, "shallow");
  // Being both unfinished and shallow outranks being merely unfinished.
  const pricing = suggestions.find((item) => item.label === "enterprise pricing");
  assert.ok(security.score > pricing.score);
});

test("resolved threads are never suggested", () => {
  const snapshot = {
    nodes: [
      topic(1, "hiring band", ["hiring", "band"], { state: "resolved", durationMs: 1000 }),
      topic(2, "investor update", ["investor", "update"], { state: "live" }),
    ],
    edges: [],
  };
  assert.deepEqual(buildSuggestions({ snapshot }), []);
});

test("history suggests what usually accompanies the live subject", () => {
  const snapshot = {
    nodes: [topic(1, "enterprise pricing", ["enterprise", "pricing"], { state: "live" })],
    edges: [],
  };
  const history = [
    {
      nodes: [
        topic(1, "enterprise pricing", ["enterprise", "pricing"]),
        topic(2, "churn cohort", ["churn", "cohort"]),
      ],
      edges: [],
    },
    {
      nodes: [
        topic(1, "pricing enterprise", ["pricing", "enterprise"]),
        topic(2, "churn retention", ["churn", "cohort"]),
      ],
      edges: [],
    },
  ];
  const suggestions = buildSuggestions({ snapshot, history });
  const adjacent = suggestions.filter((item) => item.kind === "adjacent");
  assert.equal(adjacent.length, 1);
  assert.match(adjacent[0].label, /churn/);
  assert.equal(adjacent[0].seenIn, 2);
});

test("history never suggests something this conversation already covered", () => {
  const snapshot = {
    nodes: [
      topic(1, "enterprise pricing", ["enterprise", "pricing"], { state: "live" }),
      topic(2, "churn cohort", ["churn", "cohort"], { state: "resolved" }),
    ],
    edges: [],
  };
  const history = [
    {
      nodes: [
        topic(1, "enterprise pricing", ["enterprise", "pricing"]),
        topic(2, "churn cohort", ["churn", "cohort"]),
      ],
      edges: [],
    },
  ];
  assert.deepEqual(
    buildSuggestions({ snapshot, history }).filter((item) => item.kind === "adjacent"),
    []
  );
});

test("a thread the room opened outranks anything history can offer", () => {
  const snapshot = {
    nodes: [
      topic(1, "enterprise pricing", ["enterprise", "pricing"], { state: "live" }),
      topic(2, "demo slipping", ["demo", "slipping"], { lastAt: 4000 }),
    ],
    edges: [],
  };
  const history = Array.from({ length: 8 }, () => ({
    nodes: [
      topic(1, "enterprise pricing", ["enterprise", "pricing"]),
      topic(2, "churn cohort", ["churn", "cohort"]),
    ],
    edges: [],
  }));
  const suggestions = buildSuggestions({ snapshot, history });
  assert.equal(suggestions[0].label, "demo slipping");
});

test("suggestions are capped and an empty conversation suggests nothing", () => {
  const nodes = Array.from({ length: 12 }, (_, index) =>
    topic(index + 1, `topic ${index}`, [`word${index}`, "shared"], { lastAt: index * 100 })
  );
  assert.equal(buildSuggestions({ snapshot: { nodes, edges: [] } }).length, 4);
  assert.equal(buildSuggestions({ snapshot: { nodes, edges: [] }, limit: 2 }).length, 2);
  assert.deepEqual(buildSuggestions({ snapshot: { nodes: [], edges: [] } }), []);
  assert.deepEqual(buildSuggestions({}), []);
});

test("lifetime graph links conversations that shared a subject", () => {
  const conversations = [
    {
      id: 1,
      title: "Pricing and hiring",
      createdAt: 100,
      snapshot: {
        nodes: [
          topic(1, "enterprise pricing", ["enterprise", "pricing"]),
          topic(2, "hiring band", ["hiring", "band"]),
        ],
      },
    },
    {
      id: 2,
      title: "Pricing again",
      createdAt: 200,
      snapshot: { nodes: [topic(1, "pricing enterprise", ["pricing", "enterprise"])] },
    },
    {
      id: 3,
      title: "Unrelated",
      createdAt: 300,
      snapshot: { nodes: [topic(1, "office lease", ["office", "lease"])] },
    },
  ];
  const { nodes, edges } = buildLifetimeGraph(conversations);
  assert.equal(nodes.length, 3);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].from, 1);
  assert.equal(edges[0].to, 2);
  assert.deepEqual(edges[0].topics, ["enterprise pricing"]);
  // A conversation connected to nothing reads as a one-off.
  assert.equal(nodes.find((node) => node.id === 3).state, "dropped");
  assert.equal(nodes.find((node) => node.id === 1).state, "open");
});

test("lifetime graph ignores conversations with no topics and orders by time", () => {
  const { nodes, edges } = buildLifetimeGraph([
    { id: 1, title: "Empty", createdAt: 100, snapshot: { nodes: [] } },
    { id: 2, title: "No snapshot", createdAt: 200 },
    {
      id: 3,
      title: "Real",
      createdAt: 300,
      snapshot: { nodes: [topic(1, "pricing", ["pricing", "enterprise"])] },
    },
  ]);
  assert.deepEqual(
    nodes.map((node) => node.id),
    [3]
  );
  assert.deepEqual(edges, []);
  assert.deepEqual(buildLifetimeGraph(null), { nodes: [], edges: [] });
});

test("recurring topics name only what came back across conversations", () => {
  const conversations = [
    {
      id: 1,
      snapshot: {
        nodes: [
          topic(1, "enterprise pricing", ["enterprise", "pricing"]),
          topic(2, "office lease", ["office", "lease"]),
        ],
      },
    },
    { id: 2, snapshot: { nodes: [topic(1, "pricing enterprise", ["pricing", "enterprise"])] } },
    { id: 3, snapshot: { nodes: [topic(1, "pricing model", ["pricing", "enterprise"])] } },
  ];
  const recurring = recurringTopics(conversations);
  assert.equal(recurring.length, 1);
  assert.match(recurring[0].label, /pricing/);
  assert.equal(recurring[0].conversations, 3);
});
