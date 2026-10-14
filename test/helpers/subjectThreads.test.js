const test = require("node:test");
const assert = require("node:assert/strict");

let lifetime;

test.before(async () => {
  lifetime = await import("../../src/helpers/lifetimeGraph.mjs");
});

const topic = (id, label, words) => ({ id, label, words, durationMs: 60000 });
const sso = (id) => topic(id, "sso saml", ["sso", "saml", "okta", "login"]);
const pricing = (id) => topic(id, "pricing", ["pricing", "enterprise", "discount", "annual"]);
const lease = (id) => topic(id, "office lease", ["office", "lease", "landlord", "rent"]);
const conversation = (id, createdAt, nodes) => ({
  id,
  title: `c${id}`,
  createdAt,
  snapshot: { nodes },
});

test("a subject that came back is a thread through time, not every pair", () => {
  const { subjectThreads } = lifetime;
  // Given out of order: the thread follows the dates.
  const { subjects, edges } = subjectThreads([
    conversation(4, 400, [sso(1)]),
    conversation(1, 100, [sso(1), lease(2)]),
    conversation(3, 300, [sso(1)]),
    conversation(2, 200, [sso(1)]),
  ]);
  assert.equal(
    subjects.length,
    1,
    "a topic in one conversation only is not a subject that came back"
  );
  assert.deepEqual(subjects[0].conversationIds, [1, 2, 3, 4]);
  assert.deepEqual(
    edges.map((edge) => [edge.from, edge.to]),
    [
      [1, 2],
      [2, 3],
      [3, 4],
    ],
    "four conversations on one subject make three links, not six"
  );
  for (const edge of edges) assert.deepEqual(edge.topics, ["sso saml"]);
});

test("two conversations next to each other on two subjects share one edge carrying both", () => {
  const { subjectThreads } = lifetime;
  const { subjects, edges } = subjectThreads([
    conversation(1, 100, [sso(1), pricing(2)]),
    conversation(2, 200, [sso(1), pricing(2)]),
    conversation(3, 300, [pricing(1)]),
  ]);
  assert.deepEqual(
    subjects.map((subject) => subject.label),
    ["pricing", "sso saml"],
    "the subject that came back most often first"
  );
  const first = edges.find((edge) => edge.from === 1 && edge.to === 2);
  assert.deepEqual([...first.topics].sort(), ["pricing", "sso saml"]);
  assert.equal(first.weight, 2);
  assert.ok(edges.some((edge) => edge.from === 2 && edge.to === 3));
  assert.equal(edges.length, 2);
});

test("conversations with no topics, and no conversations, make no threads", () => {
  const { subjectThreads } = lifetime;
  assert.deepEqual(subjectThreads(null), { subjects: [], edges: [] });
  assert.deepEqual(
    subjectThreads([
      conversation(1, 100, []),
      { id: 2, createdAt: 200 },
      conversation(3, 300, [sso(1)]),
    ]),
    { subjects: [], edges: [] }
  );
});

test("two hundred conversations make a few hundred links, where every pair made over a thousand", async () => {
  const { subjectThreads, buildLifetimeGraph } = lifetime;
  const vocabulary = [sso, pricing, lease];
  const many = Array.from({ length: 200 }, (_, index) =>
    conversation(index + 1, index * 1000, [vocabulary[index % 3](1)])
  );
  const pairs = buildLifetimeGraph(many).edges.length;
  const { edges } = subjectThreads(many);
  assert.equal(edges.length, 197, "one link fewer than conversations, per subject");
  assert.ok(pairs > 6000, `every pair made ${pairs}`);
});
