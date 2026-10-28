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

test("a check decides the links to the conversations it was asked about, and names them", () => {
  const list = [
    conversation(1, 100, [topic(1, "Enterprise pricing")]),
    conversation(2, 200, [topic(1, "SSO rollout")]),
    conversation(3, 300, [topic(1, "Discount for annual plans"), topic(2, "SAML clock skew")]),
  ];
  // By meaning alone, 3 joins 1 on pricing and 2 on SSO.
  assert.equal(links.linkThreads(list, { vectorOf }).subjects.length, 2);
  // Asked about both, the cloud model linked only 1, on pricing, and named it.
  const checks = new Map([
    [
      3,
      {
        candidates: [1, 2],
        links: [
          {
            id: 1,
            subject: "Annual plan pricing",
            topic: "discount for annual plans",
            earlierTopic: "Enterprise pricing",
          },
        ],
      },
    ],
  ]);
  const { subjects, edges } = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(subjects, [{ label: "Annual plan pricing", conversationIds: [1, 3] }]);
  assert.deepEqual(
    edges.map((edge) => edge.topics),
    [["Annual plan pricing"]]
  );
});

test("a conversation the check was not asked about keeps its links on this computer", () => {
  const list = [
    conversation(1, 100, [topic(1, "Enterprise pricing")]),
    // Summarized on this computer: the check was never asked about it.
    conversation(2, 200, [topic(1, "SSO rollout")]),
    conversation(3, 300, [topic(1, "Discount for annual plans"), topic(2, "SAML clock skew")]),
  ];
  const checks = new Map([[3, { candidates: [1], links: [] }]]);
  const { subjects } = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(
    subjects,
    [{ label: "SSO rollout", conversationIds: [2, 3] }],
    "linked to 2 by meaning; not to 1, which the check was asked about and did not link"
  );
});

test("a check draws its links without vectors too, and later conversations join by meaning", () => {
  const list = [
    conversation(1, 100, [topic(1, "SSO rollout", 120, ["sso", "okta"])]),
    conversation(2, 200, [topic(1, "Single sign-on setup", 120, ["login", "idp"])]),
    conversation(3, 300, [topic(1, "SAML clock skew", 120, ["saml", "skew"])]),
  ];
  const checks = new Map([
    [
      2,
      {
        links: [
          { id: 1, subject: "SSO", topic: "Single sign-on setup", earlierTopic: "SSO rollout" },
        ],
      },
    ],
  ]);
  const byWords = links.linkThreads(list, { checks });
  assert.deepEqual(
    byWords.subjects,
    [{ label: "SSO", conversationIds: [1, 2] }],
    "no shared word, linked by the check"
  );
  const byMeaning = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(byMeaning.subjects, [{ label: "SSO", conversationIds: [1, 2, 3] }]);
});

test("a link to a conversation that is not on the board, or to itself, is left out", () => {
  const list = [conversation(2, 200, [topic(1, "SSO rollout")])];
  const checks = new Map([
    [
      2,
      {
        links: [
          { id: 9, subject: "SSO", topic: "SSO rollout", earlierTopic: "x" },
          { id: 2, subject: "Self" },
        ],
      },
    ],
  ]);
  assert.deepEqual(links.linkThreads(list, { vectorOf, checks }), { subjects: [], edges: [] });
});
