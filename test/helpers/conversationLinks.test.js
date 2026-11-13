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

test("topics alike in meaning are one subject, and each edge is a pair that links", () => {
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
    { vectorOf, threshold: 0.7 }
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
      [1, 3],
      [2, 3],
    ],
    "all three SSO topics link, and two subjects share the edge from 1 to 2"
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

test("one topic linked on two subjects leaves them two, and neither takes the other's name", () => {
  const list = [
    conversation(1, 100, [topic(1, "SSO rollout")]),
    conversation(2, 200, [topic(1, "Enterprise pricing")]),
    conversation(3, 300, [topic(1, "Discount for annual plans")]),
    conversation(4, 400, [topic(1, "Weekend at the lake")]),
  ];
  const checks = new Map([
    [
      3,
      {
        candidates: [1, 2],
        links: [
          {
            id: 1,
            subject: "Rollout",
            topic: "Discount for annual plans",
            earlierTopic: "SSO rollout",
          },
          {
            id: 2,
            subject: "Pricing",
            topic: "Discount for annual plans",
            earlierTopic: "Enterprise pricing",
          },
        ],
      },
    ],
  ]);
  const { subjects } = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(subjects, [
    { label: "Pricing", conversationIds: [2, 3] },
    { label: "Rollout", conversationIds: [1, 3] },
  ]);
});

test("subjects a check named are one when their names are alike, and a thread keeps its order", () => {
  const list = [
    conversation(1, 100, [topic(1, "SSO rollout")]),
    conversation(2, 200, [topic(1, "Single sign-on setup")]),
    conversation(3, 300, [topic(1, "SAML clock skew")]),
  ];
  const same = (id, subject, own, earlierTopic) => ({ id, subject, topic: own, earlierTopic });
  const checks = new Map([
    [2, { links: [same(1, "SSO rollout", "Single sign-on setup", "SSO rollout")] }],
    [3, { links: [same(1, "Single sign-on setup", "SAML clock skew", "SSO rollout")] }],
  ]);
  const { subjects, edges } = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(subjects[0].conversationIds, [1, 2, 3]);
  assert.equal(subjects.length, 1);
  assert.deepEqual(
    edges.map((edge) => [edge.from, edge.to]),
    [
      [1, 2],
      [2, 3],
    ]
  );
});

test("what the provider has read and did not link stays apart, unasked or not", () => {
  const route = "providers:anthropic";
  const on = (item, summaryRoute) => ({ ...item, summaryRoute });
  const list = [
    on(conversation(1, 100, [topic(1, "SSO rollout")]), route),
    on(conversation(2, 200, [topic(1, "Single sign-on setup")]), "local:"),
    on(conversation(3, 300, [topic(1, "SAML clock skew")]), route),
  ];
  // Asked about nothing: 1 was read by this provider and 2 was not.
  const checks = new Map([[3, { candidates: [], links: [] }]]);
  const { subjects } = links.linkThreads(list, { vectorOf, checks });
  assert.deepEqual(
    subjects.map((subject) => subject.conversationIds),
    [[1, 2]],
    "2 meets 1 by meaning; 3 meets neither, for 1 is closed and it is on 1's subject"
  );
  const apart = links.linkThreads([list[1], list[2]], { vectorOf, checks });
  assert.deepEqual(
    apart.subjects.map((subject) => subject.conversationIds),
    [[2, 3]],
    "the provider never read 2, so 3 still meets it on this computer"
  );
});

test("the board asks for a vector of every subject a check named", () => {
  const item = {
    ...conversation(1, 100, [topic(1, "SSO rollout")]),
    linkCheck: { links: [{ subject: " Annual plan pricing " }, { subject: "" }] },
  };
  assert.deepEqual(links.linkTexts([item]), ["SSO rollout", "Annual plan pricing"]);
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

// What was said on a topic, as a direction in degrees. Every angle under 38
// clears the bar of 0.78, so these read like a history about one thing.
const saidAt = (id, degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return conversation(id, id * 100, [
    {
      ...topic(1, `Topic ${id}`),
      vector: links.encodeTopicVector(unit(Math.cos(radians), Math.sin(radians))),
    },
  ]);
};
const said = (...degrees) => degrees.map((value, index) => saidAt(index + 1, value));
const pairsOf = ({ edges }) => edges.map((edge) => [edge.from, edge.to]).sort();
const heldBy = ({ subjects }) => subjects.map((subject) => subject.conversationIds).sort();

test("two topics link only when each is among the other's three nearest", () => {
  assert.equal(links.LINK_NEIGHBOURS, 3);
  // All five clear the bar together. 1 has 4 among its three nearest, and 4 has
  // not 1; 1 and 5 have not each other.
  const board = links.meaningThreads(said(0, 4, 10, 18, 28), { vectorOf });
  assert.deepEqual(pairsOf(board), [
    [1, 2],
    [1, 3],
    [2, 3],
    [2, 4],
    [3, 4],
    [4, 5],
  ]);
  const nearestOne = links.meaningThreads(said(0, 4, 10, 18, 28), { vectorOf, neighbours: 1 });
  assert.deepEqual(pairsOf(nearestOne), [[1, 2]], "3's nearest is 2, and 2's is 1");
});

test("the nearest still have to reach the bar", () => {
  assert.deepEqual(links.meaningThreads(said(0, 60), { vectorOf }).subjects, []);
  assert.equal(
    links.meaningThreads(said(0, 60), { vectorOf, contentThreshold: 0.4 }).subjects.length,
    1
  );
});

test("links do not chain: a subject holds a topic and those that link to it", () => {
  const board = links.meaningThreads(said(0, 30, 60), { vectorOf });
  assert.deepEqual(heldBy(board), [
    [1, 2],
    [2, 3],
  ]);
  assert.deepEqual(pairsOf(board), [
    [1, 2],
    [2, 3],
  ]);
});

test("a subject's edges start at its first topic, and those it drew do not link each other", () => {
  const board = links.meaningThreads(said(0, 30, -30), { vectorOf });
  assert.deepEqual(heldBy(board), [[1, 2, 3]]);
  assert.deepEqual(pairsOf(board), [
    [1, 2],
    [1, 3],
  ]);
});

test("topics all alike are one subject, and each of their edges carries it", () => {
  const board = links.meaningThreads(said(0, 5, 10), { vectorOf });
  assert.deepEqual(heldBy(board), [[1, 2, 3]]);
  assert.equal(board.edges.length, 3);
  const [{ label }] = board.subjects;
  assert.ok(board.edges.every((edge) => edge.topics.length === 1 && edge.topics[0] === label));
});

test("on a history about one thing, a board grows with the history and not with its square", () => {
  const history = said(...Array.from({ length: 12 }, (_, index) => index * 3));
  const board = links.meaningThreads(history, { vectorOf });
  assert.ok(board.edges.length <= (12 * links.LINK_NEIGHBOURS) / 2);
  assert.ok(board.subjects.every((subject) => subject.conversationIds.length <= 4));
});

test("a name said many times is one subject, threaded to its newest conversation", () => {
  const history = Array.from({ length: 8 }, (_, index) =>
    conversation(index + 1, (index + 1) * 100, [topic(1, "SSO rollout")])
  );
  const board = links.meaningThreads(history, { vectorOf });
  assert.deepEqual(board.subjects, [
    { label: "SSO rollout", conversationIds: [1, 2, 3, 4, 5, 6, 7, 8] },
  ]);
  assert.ok(
    pairsOf(board).every(([from, to]) => to - from <= 2),
    "the same name ties, and the nearest in time win"
  );
  assert.ok(pairsOf(board).some(([from, to]) => from === 7 && to === 8));
});

test("a subject on this computer does not join what the provider read and did not link", () => {
  const route = "providers:anthropic";
  const on = (item, summaryRoute) => ({ ...item, summaryRoute });
  const list = [
    on(conversation(1, 100, [topic(1, "SSO rollout")]), "local:"),
    on(conversation(2, 200, [topic(1, "Single sign-on setup")]), route),
    on(conversation(3, 300, [topic(1, "SAML clock skew")]), route),
  ];
  const checks = new Map([[3, { candidates: [], links: [] }]]);
  assert.deepEqual(
    heldBy(links.linkThreads(list, { vectorOf, checks })),
    [[1, 2]],
    "3 would meet 1 on this computer, but 1's subject holds 2, which the provider kept apart"
  );
});

test("a check's subject takes what came after it, and leaves an earlier link alone", () => {
  const list = [
    conversation(1, 100, [topic(1, "SSO rollout")]),
    conversation(2, 200, [topic(1, "Single sign-on setup")]),
    conversation(3, 300, [topic(1, "SAML clock skew")]),
  ];
  // The check linked 1 and left 2 out. That says nothing of 1 and 2.
  const checks = new Map([
    [
      3,
      {
        candidates: [1, 2],
        links: [{ id: 1, subject: "SSO", topic: "SAML clock skew", earlierTopic: "SSO rollout" }],
      },
    ],
  ]);
  assert.deepEqual(heldBy(links.linkThreads(list, { vectorOf, checks })), [
    [1, 2],
    [1, 3],
  ]);
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

test("with stored vectors too, a check decides only the conversations it was asked about", () => {
  const stored = (id, label, ...values) => ({
    ...topic(id, label),
    vector: links.encodeTopicVector(unit(...values)),
  });
  const list = [
    conversation(1, 100, [stored(1, "Enterprise pricing", 1, 0, 0)]),
    conversation(2, 200, [stored(1, "SSO rollout", 0, 1, 0)]),
    conversation(3, 300, [
      stored(1, "Discount for annual plans", 1, 0.02, 0),
      stored(2, "SAML clock skew", 0, 1, 0.03),
    ]),
  ];
  // By what was said alone, 3 joins 1 on pricing and 2 on sign-in.
  assert.equal(links.linkThreads(list, { vectorOf }).subjects.length, 2);
  // Asked about 1 only, the check did not link it: 3 stays apart from 1, and
  // still meets 2, which the check was not asked about, by what was said.
  const checks = new Map([[3, { candidates: [1], links: [] }]]);
  const { subjects } = links.linkThreads(list, { vectorOf, checks });
  assert.equal(subjects.length, 1);
  assert.deepEqual(subjects[0].conversationIds, [2, 3]);
});
