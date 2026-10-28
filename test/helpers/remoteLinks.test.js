const test = require("node:test");
const assert = require("node:assert/strict");

let remote;

test.before(async () => {
  remote = await import("../../src/helpers/remoteLinks.mjs");
});

test("earlier conversations are called by letters, never by an id or a title", () => {
  const prompt = remote.buildLinkPrompt({
    current: { gist: "A pricing call with Corbel.", topics: ["SSO on day one", "Annual discount"] },
    earlier: [
      { id: 41, gist: "The launch review.", topics: ["Launch date", "SSO"] },
      { id: 7, gist: "", topics: [] },
    ],
  });
  assert.equal(prompt.system, remote.LINK_SYSTEM_PROMPT);
  assert.deepEqual(
    [...prompt.keys],
    [
      ["A", 41],
      ["B", 7],
    ]
  );
  assert.match(
    prompt.text,
    /^New conversation\nGist: A pricing call with Corbel\.\nTopics: SSO on day one; Annual discount/
  );
  assert.match(prompt.text, /\nA\nGist: The launch review\.\nTopics: Launch date; SSO\n/);
  assert.match(prompt.text, /\nB\nTopics: none named$/);
  assert.doesNotMatch(prompt.text, /41|\b7\b/);
});

test("at most MAX_CANDIDATES earlier conversations are asked about, and a gist is cut", () => {
  const earlier = Array.from({ length: remote.MAX_CANDIDATES + 3 }, (_, index) => ({
    id: index,
    gist: "x".repeat(remote.GIST_CHARS + 50),
    topics: ["Topic"],
  }));
  const prompt = remote.buildLinkPrompt({ current: { topics: ["Topic"] }, earlier });
  assert.equal(prompt.keys.size, remote.MAX_CANDIDATES);
  assert.ok(!prompt.text.includes("x".repeat(remote.GIST_CHARS + 1)));
  assert.equal(remote.candidateKey(0), "A");
  assert.equal(remote.candidateKey(25), "Z");
  assert.equal(remote.candidateKey(26), "AA");
});

test("an answer's links are read by letter, each with its subject's name", () => {
  const keys = new Map([
    ["A", 41],
    ["B", 7],
  ]);
  const links = remote.parseLinkAnswer(
    '```json\n{"links":[{"conversation":"a","subject":"sso on day one","topic":"SSO on day one","earlier_topic":"SSO"},' +
      '{"conversation":"C","subject":"Nothing","topic":"x","earlier_topic":"y"},' +
      '{"conversation":"A","subject":"Again","topic":"x","earlier_topic":"y"}]}\n```',
    keys
  );
  assert.deepEqual(links, [
    { id: 41, subject: "Sso on day one", topic: "SSO on day one", earlierTopic: "SSO" },
  ]);
});

test("a subject the name rules refuse is named by the earlier topic", () => {
  const keys = new Map([["A", 1]]);
  const [link] = remote.parseLinkAnswer(
    JSON.stringify({
      links: [
        { conversation: "A", subject: "Discussion", topic: "t", earlier_topic: "Launch date" },
      ],
    }),
    keys
  );
  assert.equal(link.subject, "Launch date");
});

test("no links is an answer, and an unreadable answer is not", () => {
  const keys = new Map([["A", 1]]);
  assert.deepEqual(remote.parseLinkAnswer('{"links": []}', keys), []);
  assert.equal(remote.parseLinkAnswer("I cannot tell.", keys), null);
  assert.equal(remote.parseLinkAnswer('{"answer": 1}', keys), null);
});

test("topic names describe a conversation longest-held first, without repeats", () => {
  const names = remote.linkTopicNames(
    {
      nodes: [
        { label: "SSO", durationMs: 60_000 },
        { label: "Launch date", durationMs: 300_000 },
        { label: "sso", durationMs: 30_000 },
        { label: "Hello", durationMs: 2_000 },
        { label: "", durationMs: 400_000 },
      ],
    },
    { minTopicMs: 10_000 }
  );
  assert.deepEqual(names, ["Launch date", "SSO"]);
});

test("only a cloud provider with a link model checks links", () => {
  assert.equal(
    remote.linkProviderFor({ mode: "providers", config: { provider: "openai" } }),
    "openai"
  );
  assert.equal(
    remote.linkProviderFor({ mode: "providers", config: { provider: "anthropic" } }),
    "anthropic"
  );
  assert.equal(remote.linkProviderFor({ mode: "providers", config: { provider: "groq" } }), null);
  assert.equal(remote.linkProviderFor({ mode: "local", config: { provider: "openai" } }), null);
  assert.equal(remote.linkProviderFor({ mode: "self-hosted", config: {} }), null);
  assert.equal(remote.linkProviderFor(null), null);
});

test("the conversations asked about are the most alike, never one that shares nothing", () => {
  const unit = (...values) => {
    const norm = Math.hypot(...values);
    return Float32Array.from(values, (value) => value / norm);
  };
  const vectors = new Map([
    ["SSO rollout", unit(1, 0, 0)],
    ["Single sign-on setup", unit(0.95, 0.31, 0)],
    ["Enterprise pricing", unit(0.3, 0.95, 0)],
    ["Weekend at the lake", unit(0, 0, 1)],
  ]);
  const vectorOf = (text) => vectors.get(text) ?? null;
  const node = (label, words = []) => ({ label, words, durationMs: 60_000 });
  const current = { id: 9, snapshot: { nodes: [node("SSO rollout", ["sso"])] } };
  const earlier = [
    { id: 1, snapshot: { nodes: [node("Weekend at the lake", ["lake"])] } },
    { id: 2, snapshot: { nodes: [node("Enterprise pricing", ["pricing", "sso"])] } },
    { id: 3, snapshot: { nodes: [node("Single sign-on setup", ["login"])] } },
  ];
  assert.deepEqual(remote.chooseCandidates(current, earlier, { vectorOf }), [3]);
  assert.deepEqual(remote.chooseCandidates(current, earlier, { vectorOf, floor: 0.1 }), [3, 2]);
  assert.deepEqual(
    remote.chooseCandidates(current, earlier, { vectorOf, floor: 0, limit: 1 }),
    [3]
  );
  // No vectors: by the words they share.
  assert.deepEqual(remote.chooseCandidates(current, earlier), [2]);
  assert.deepEqual(remote.chooseCandidates({ id: 9, snapshot: { nodes: [] } }, earlier), []);
});

test("a stored check is read back, and anything else is no check", () => {
  const check = remote.readLinkCheck(
    JSON.stringify({
      checkedAt: "2026-10-28T19:00:00.000Z",
      model: "claude-opus-5-5",
      candidates: [1, 2],
      links: [
        { id: 1, subject: " SSO setup ", topic: "a", earlierTopic: "b" },
        { id: 2, subject: "" },
      ],
    })
  );
  assert.deepEqual(check, {
    checkedAt: "2026-10-28T19:00:00.000Z",
    model: "claude-opus-5-5",
    candidates: [1, 2],
    links: [{ id: 1, subject: "SSO setup", topic: "a", earlierTopic: "b" }],
  });
  assert.equal(remote.readLinkCheck(null), null);
  assert.equal(remote.readLinkCheck("not json"), null);
  assert.equal(remote.readLinkCheck({ links: "x" }), null);
});

test("a summary's route is kept as mode and provider", () => {
  assert.equal(
    remote.summaryRouteKey({ mode: "providers", provider: "openai" }),
    "providers:openai"
  );
  assert.equal(
    remote.summaryRouteKey({ mode: "providers", provider: "anthropic" }),
    "providers:anthropic"
  );
  assert.equal(remote.summaryRouteKey({ mode: "local", provider: "openai" }), "local:");
  assert.equal(remote.summaryRouteKey({ mode: "self-hosted" }), "self-hosted:");
  assert.equal(remote.summaryRouteKey({}), "unknown:");
});

test("a check sends an earlier conversation only to the provider that wrote its summary", () => {
  const note = (summary_route) => ({ summary_route });
  assert.equal(remote.sendableTo("openai", note("providers:openai")), true);
  assert.equal(remote.sendableTo("anthropic", note("providers:anthropic")), true);
  assert.equal(remote.sendableTo("openai", note("providers:anthropic")), false, "another provider");
  assert.equal(remote.sendableTo("openai", note("local:")), false, "summarized on this computer");
  assert.equal(
    remote.sendableTo("openai", note("self-hosted:")),
    false,
    "on the person's own server"
  );
  assert.equal(remote.sendableTo("openai", note(null)), false, "summarized before it was recorded");
  assert.equal(remote.sendableTo("openai", {}), false);
  assert.equal(remote.sendableTo("openai", null), false);
  assert.equal(remote.sendableTo("", note("providers:")), false);
});
