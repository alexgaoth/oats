const test = require("node:test");
const assert = require("node:assert/strict");

let links;

test.before(async () => {
  links = await import("../../src/helpers/conversationLinks.mjs");
});

// Unit vectors in three dimensions, one direction per subject, so the tests
// read like the words they stand for.
const unit = (...values) => {
  const norm = Math.hypot(...values);
  return Float32Array.from(values, (value) => value / norm);
};
const VECTORS = new Map([
  ["SSO rollout", unit(1, 0, 0)],
  ["Single sign-on setup", unit(0.95, 0.31, 0)],
  ["SAML clock skew", unit(0.8, 0.6, 0)],
  ["Enterprise pricing", unit(0, 1, 0)],
  ["Discount for annual plans", unit(0.1, 0.99, 0)],
  ["Weekend at the lake", unit(0, 0, 1)],
  ["Hello and introductions", unit(0.5, 0.5, 0.7)],
]);
const vectorOf = (text) => VECTORS.get(text) ?? null;

const topic = (id, label, seconds = 120, words = []) => ({
  id,
  label,
  words,
  durationMs: seconds * 1000,
});
const conversation = (id, createdAt, nodes) => ({
  id,
  title: `c${id}`,
  createdAt,
  snapshot: { nodes },
});

test("the text a topic is read by is its name, or its name and the telling words it lacks", () => {
  const node = topic(1, "Remote control design", 60, ["remote", "button", "battery", "control"]);
  assert.equal(links.topicLinkText(node), "Remote control design");
  assert.equal(links.topicLinkText(node, { words: 2 }), "Remote control design button battery");
  assert.equal(links.topicLinkText(node, { label: "remote control" }), "remote control");
  assert.equal(links.topicLinkText(null), "");
});

test("topics alike in meaning are one subject, threaded through time", () => {
  const { subjects, edges } = links.meaningThreads(
    [
      conversation(3, 300, [topic(1, "SAML clock skew")]),
      conversation(1, 100, [topic(1, "SSO rollout"), topic(2, "Enterprise pricing")]),
      conversation(2, 200, [
        topic(1, "Single sign-on setup"),
        topic(2, "Discount for annual plans"),
      ]),
      conversation(4, 400, [topic(1, "Weekend at the lake")]),
    ],
    { vectorOf }
  );
  const byLabel = Object.fromEntries(
    subjects.map((subject) => [subject.label, subject.conversationIds])
  );
  assert.deepEqual(
    Object.values(byLabel).sort(),
    [
      [1, 2],
      [1, 2, 3],
    ].sort()
  );
  assert.ok(
    subjects.every((subject) => !subject.conversationIds.includes(4)),
    "a weekend at the lake shares nothing with SSO"
  );
  assert.deepEqual(
    edges.map((edge) => [edge.from, edge.to]).sort(),
    [
      [1, 2],
      [2, 3],
    ],
    "each conversation on a subject joins the one on it before, and two subjects share an edge"
  );
  const first = edges.find((edge) => edge.from === 1 && edge.to === 2);
  assert.equal(first.weight, 2, "the edge between 1 and 2 carries both subjects");
});

test("a subject is named by the member most alike the others", () => {
  const { subjects } = links.meaningThreads(
    [
      conversation(1, 100, [topic(1, "SSO rollout")]),
      conversation(2, 200, [topic(1, "Single sign-on setup")]),
      conversation(3, 300, [topic(1, "SAML clock skew")]),
    ],
    { vectorOf }
  );
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].label, "Single sign-on setup", "the middle one, not the first");
});

test("a short topic, one without a vector, and a topic in one conversation link nothing", () => {
  const { subjects, edges } = links.meaningThreads(
    [
      conversation(1, 100, [
        topic(1, "Hello and introductions", 10),
        topic(2, "Enterprise pricing"),
      ]),
      conversation(2, 200, [topic(1, "Hello and introductions", 10), topic(2, "Unknown thing")]),
    ],
    { vectorOf }
  );
  assert.deepEqual(subjects, [], "ten seconds of hellos is not a subject");
  assert.deepEqual(edges, []);
  assert.deepEqual(links.meaningThreads(null, { vectorOf }), { subjects: [], edges: [] });
});

test("the threshold decides how alike is alike enough", () => {
  const list = [
    conversation(1, 100, [topic(1, "SSO rollout")]),
    conversation(2, 200, [topic(1, "SAML clock skew")]),
  ];
  // Their cosine is 0.8.
  assert.equal(links.meaningThreads(list, { vectorOf, threshold: 0.75 }).subjects.length, 1);
  assert.equal(links.meaningThreads(list, { vectorOf, threshold: 0.85 }).subjects.length, 0);
});

test("pairs are scored by their two most alike topics, named by the earlier one's", () => {
  const pairs = links.meaningPairs(
    [
      conversation(1, 100, [topic(1, "SSO rollout"), topic(2, "Enterprise pricing")]),
      conversation(2, 200, [topic(1, "Discount for annual plans")]),
    ],
    { vectorOf }
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].label, "Enterprise pricing");
  assert.ok(pairs[0].score > 0.98 && pairs[0].linked);
});

test("the texts to embed are each linkable topic's, once", () => {
  assert.deepEqual(
    links.linkTexts([
      conversation(1, 100, [topic(1, "SSO rollout"), topic(2, "Hello", 5)]),
      conversation(2, 200, [topic(1, "SSO rollout")]),
      { id: 3, snapshot: null },
    ]),
    ["SSO rollout"]
  );
});

test("a stored topic vector is one byte a dimension, and reads back the same way", () => {
  const values = unit(0.3, -0.2, 0.9, 0.1);
  const text = links.encodeTopicVector(values);
  assert.equal(typeof text, "string");
  assert.equal(Buffer.from(text, "base64").length, 4, "one byte a dimension");
  const back = links.decodeTopicVector(text);
  assert.ok(links.cosine(values, back) > 0.999);
  assert.equal(links.encodeTopicVector(null), null);
  assert.equal(links.decodeTopicVector(""), null);
  assert.equal(links.decodeTopicVector("not base64!"), null);
  assert.equal(links.decodeTopicVector(links.encodeTopicVector([0, 0, 0])), null, "no direction");
});

test("what was said on a topic is the mean of its turns, weighted by their words", () => {
  const vector = links.topicContentVector([
    { vector: unit(1, 0, 0), weight: 3 },
    { vector: unit(0, 1, 0), weight: 1 },
    { vector: unit(0, 0, 1), weight: 0 },
    { vector: null, weight: 5 },
  ]);
  assert.ok(Math.abs(vector[0] - 3 / Math.hypot(3, 1)) < 1e-6);
  assert.ok(Math.abs(vector[1] - 1 / Math.hypot(3, 1)) < 1e-6);
  assert.equal(vector[2], 0);
  assert.equal(links.topicContentVector([]), null);
});

test("two topics with stored vectors link by what was said, not by their names", () => {
  const stored = (label, ...values) => ({
    ...topic(1, label),
    vector: links.encodeTopicVector(unit(...values)),
  });
  // Alike names ("SSO rollout", "Single sign-on setup"), unlike content: not linked.
  const unlike = links.meaningThreads(
    [
      conversation(1, 100, [stored("SSO rollout", 1, 0, 0)]),
      conversation(2, 200, [stored("Single sign-on setup", 0, 1, 0)]),
    ],
    { vectorOf }
  );
  assert.deepEqual(unlike.subjects, []);
  // Unlike names, alike content: linked, and named by name as ever.
  const alike = links.meaningThreads(
    [
      conversation(1, 100, [stored("SSO rollout", 1, 0, 0)]),
      conversation(2, 200, [stored("Weekend at the lake", 1, 0.05, 0)]),
    ],
    { vectorOf }
  );
  assert.equal(alike.subjects.length, 1);
  assert.deepEqual(alike.subjects[0].conversationIds, [1, 2]);
});

test("a topic with no stored vector (an older conversation) links by name", () => {
  const stored = (label, ...values) => ({
    ...topic(1, label),
    vector: links.encodeTopicVector(unit(...values)),
  });
  const { subjects } = links.meaningThreads(
    [
      conversation(1, 100, [topic(1, "SSO rollout")]),
      conversation(2, 200, [stored("Single sign-on setup", 0, 1, 0)]),
      conversation(3, 300, [stored("SAML clock skew", 0, 0.99, 0.14)]),
    ],
    { vectorOf }
  );
  assert.equal(subjects.length, 1);
  assert.deepEqual(
    subjects[0].conversationIds,
    [1, 2, 3],
    "2 meets 1 by name; 3 meets 2 by what was said"
  );
});
