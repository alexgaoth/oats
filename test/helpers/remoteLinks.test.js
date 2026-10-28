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
