const test = require("node:test");
const assert = require("node:assert/strict");

let naming;

test.before(async () => {
  naming = await import("../../src/helpers/topicNaming.mjs");
});

const words = (count, stem = "word") =>
  Array.from({ length: count }, (_, index) => `${stem}${index}`).join(" ");

test("an excerpt leaves out one- and two-word turns and keeps the order said", () => {
  const lines = naming.topicExcerpt([
    "Yeah.",
    "So the remote should have a scroll wheel.",
    "Okay, sure.",
    "A scroll wheel is a special chip, so it costs more.",
  ]);
  assert.deepEqual(lines, [
    "So the remote should have a scroll wheel.",
    "A scroll wheel is a special chip, so it costs more.",
  ]);
});

test("a long topic is read from its beginning to its end, within the budget", () => {
  const turns = Array.from({ length: 200 }, (_, index) =>
    index % 7 === 0 ? `turn ${index} ${words(30, `t${index}x`)}` : `turn ${index} is short`
  );
  const lines = naming.topicExcerpt(turns, { budget: 1500 });
  const size = lines.reduce((total, line) => total + line.length + 3, 0);
  assert.ok(size <= 1500, `the excerpt is ${size} characters`);
  const said = lines.map((line) => Number(/^turn (\d+)/.exec(line)[1]));
  assert.deepEqual(
    said,
    [...said].sort((a, b) => a - b),
    "in the order said"
  );
  // One turn from each equal stretch: the first from the first, the last from the last.
  const stretch = 200 / lines.length;
  assert.ok(said[0] < stretch, "it starts in the first stretch");
  assert.ok(said.at(-1) >= 200 - stretch, "and ends in the last");
  // The longest turn of each stretch: the long ones, not "turn 3 is short".
  assert.ok(said.every((index) => index % 7 === 0));
});

test("one turn cannot fill the excerpt", () => {
  const [line] = naming.topicExcerpt([words(400)]);
  assert.ok(line.length <= naming.TURN_CHARS + 1);
  assert.ok(line.endsWith("…"));
});

test("the prompt carries the other topics' names, the current name and what was said", () => {
  const first = naming.buildTopicNamePrompt({ turns: ["We need to pick the launch date."] });
  assert.equal(first.system, naming.TOPIC_NAME_SYSTEM_PROMPT);
  assert.match(first.text, /^Other topics: none yet$/m);
  assert.doesNotMatch(first.text, /Current name/);
  assert.match(first.text, /^- We need to pick the launch date\.$/m);

  const again = naming.buildTopicNamePrompt({
    turns: ["We need to pick the launch date.", "The third works for everyone."],
    others: ["SSO login", "SSO login", "Discount pricing"],
    current: "Launch date",
  });
  assert.match(again.text, /^Other topics: SSO login; Discount pricing$/m);
  assert.match(
    again.text,
    /^Current name: Launch date\. Reply with it unchanged if it still fits most of what was said\./m
  );
  assert.deepEqual(again.excerpt, [
    "We need to pick the launch date.",
    "The third works for everyone.",
  ]);
});

test("a name is read out of quotes, bullets, bold, prefixes and a full stop", () => {
  for (const answer of [
    "Scroll wheel cost",
    '"Scroll wheel cost"',
    "“Scroll wheel cost.”",
    "- Scroll wheel cost",
    "1. Scroll wheel cost",
    "**Scroll wheel cost**",
    "Topic: Scroll wheel cost",
    "Name: 'Scroll wheel cost'",
    "Scroll wheel cost.\nThe group compared the wheel's cost with buttons.",
    "<think>They talk about the wheel.</think>\nScroll wheel cost",
    "scroll wheel cost",
  ]) {
    assert.equal(naming.parseTopicName(answer), "Scroll wheel cost", answer);
  }
});

test("English Title Case becomes sentence case, keeping acronyms and names", () => {
  const excerpt = [
    "So the question is whether we move the SSO work before the launch, and Kestrel is waiting on it.",
    "I think we can do it if the iPhone build is done by then, so that is the plan for this week.",
  ];
  assert.equal(
    naming.parseTopicName("Remote Control Hardware Design", { excerpt }),
    "Remote control hardware design"
  );
  assert.equal(
    naming.parseTopicName("SSO Work Before Launch", { excerpt }),
    "SSO work before launch"
  );
  assert.equal(naming.parseTopicName("Kestrel SSO Deadline", { excerpt }), "Kestrel SSO deadline");
  assert.equal(naming.parseTopicName("Waiting For Kestrel", { excerpt }), "Waiting for Kestrel");
  assert.equal(naming.parseTopicName("iPhone Build Timing", { excerpt }), "iPhone build timing");
  // A name in sentence case already is left as it is.
  assert.equal(naming.parseTopicName("Budget for Q3 hiring", { excerpt }), "Budget for Q3 hiring");
});

test("German keeps its capitals: every noun has one", () => {
  const excerpt = [
    "Wir müssen über das Budget für die Fernbedienung sprechen, das ist zu hoch.",
    "Ja, und die Tasten kosten mehr, als wir gedacht haben, das ist das Problem.",
  ];
  assert.equal(
    naming.parseTopicName("Budget Fernbedienung Tasten", { excerpt }),
    "Budget Fernbedienung Tasten"
  );
});

test("a generic name, a refusal or a name of the wrong size is no name", () => {
  for (const answer of [
    "",
    "Discussion",
    "General discussion",
    "Team meeting update",
    "Project discussion",
    "Meeting",
    "Unclear topic",
    "Diskussion",
    "Reunión general",
    "Обсуждение темы",
    "会議",
    "讨论",
    "Sorry, I cannot tell what this topic is about",
    "Not enough information",
    "N/A",
    "Budget",
    "The cost of the scroll wheel versus buttons",
    "A very long name that goes on well past what fits in the lanes",
  ]) {
    assert.equal(naming.parseTopicName(answer), null, answer);
  }
  assert.equal(naming.parseTopicName("Project budget"), "Project budget");
  assert.equal(
    naming.parseTopicName("Unclear ownership of billing"),
    "Unclear ownership of billing"
  );
  assert.equal(naming.parseTopicName("Team offsite planning"), "Team offsite planning");
});

test("the prompt handed back as the answer is no name", () => {
  const prompt = naming.buildTopicNamePrompt({
    turns: ["We need to pick the launch date before the kickoff."],
    current: "Launch date",
  });
  assert.equal(naming.parseTopicName(prompt.text), null);
  assert.equal(naming.parseTopicName("Other topics: none yet"), null);
  assert.equal(naming.parseTopicName("Current name: Launch date."), null);
});

test("Japanese and Chinese names are counted by their words", () => {
  assert.equal(naming.parseTopicName("予算の見直し"), "予算の見直し");
  assert.equal(naming.parseTopicName("「発売日の変更」"), "発売日の変更");
  assert.equal(naming.parseTopicName("预算讨论"), "预算讨论");
  assert.equal(naming.parseTopicName("会议讨论"), null);
});

test("a name another topic already has is no name", () => {
  const others = ["Launch date", "SSO login"];
  assert.equal(naming.parseTopicName("launch date.", { others }), null);
  assert.equal(naming.parseTopicName("Launch date move", { others }), "Launch date move");
  assert.equal(naming.sameName("SSO login", "sso Login."), true);
  assert.equal(naming.sameName("", ""), false);
});

test("a topic is named at forty words, renamed as it grows, and once more at the end", () => {
  const need = naming.topicNeedsName;
  assert.equal(need({ words: 39 }), null);
  assert.equal(need({ words: 40 }), "first");
  assert.equal(need({ words: 29, final: true }), null);
  assert.equal(need({ words: 30, final: true }), "first");

  const record = { name: "Launch date", words: 40 };
  assert.equal(need({ words: 99, record }), null);
  assert.equal(need({ words: 100, record }), "rename");
  // At the end, less growth is enough, but not a few words.
  assert.equal(need({ words: 69, record, final: true }), null);
  assert.equal(need({ words: 70, record, final: true }), "rename");
  assert.equal(need({ words: 300, record: { name: "x", words: 290 }, final: true }), null);
  // A topic the tracker cut smaller is asked again once it lost as much.
  const big = { name: "Launch date", words: 250 };
  assert.equal(need({ words: 101, record: big }), null);
  assert.equal(need({ words: 100, record: big }), "rename");
  assert.equal(need({ words: 200, record: big, final: true }), null);
  assert.equal(need({ words: 190, record: big, final: true }), "rename");
  // Cut below what can be named from: the name stays, and nothing is asked.
  assert.equal(need({ words: 39, record: big }), null);
  assert.equal(need({ words: 29, record: big, final: true }), null);
});

const node = (overrides = {}) => ({
  id: 1,
  label: "launch date",
  words: ["launch", "date"],
  durationMs: 60_000,
  utteranceIds: ["a", "b", "c", "d"],
  firstAt: 0,
  lastAt: 60_000,
  returns: 0,
  state: "open",
  ...overrides,
});

test("only a topic the lanes show is named", () => {
  assert.equal(naming.isNameableTopic(node()), true);
  assert.equal(naming.isNameableTopic(node({ durationMs: 1000 })), false);
  assert.equal(naming.isNameableTopic(node({ label: "" })), false);
  assert.equal(naming.isNameableTopic(node({ utteranceIds: [] })), false);
});

test("a name fits its topic while the topic keeps half the turns it was named from", () => {
  const record = { name: "Launch date", utteranceIds: ["a", "b", "c", "d"] };
  assert.equal(naming.nameStillFits(node(), record), true);
  assert.equal(
    naming.nameStillFits(node({ utteranceIds: ["x", "a", "b", "c", "d", "e"] }), record),
    true
  );
  assert.equal(naming.nameStillFits(node({ utteranceIds: ["a", "b", "y", "z"] }), record), true);
  assert.equal(naming.nameStillFits(node({ utteranceIds: ["a", "x", "y", "z"] }), record), false);
  assert.equal(naming.nameStillFits(node(), { name: "Launch date", utteranceIds: [] }), false);
});

test("names go on a snapshot as its labels, with the on-device name kept beside", () => {
  const snapshot = {
    nodes: [node(), node({ id: 2, label: "sso saml", utteranceIds: ["e", "f"] })],
    edges: [],
  };
  const names = new Map([[1, { name: "Launch date move", utteranceIds: ["a", "b", "c", "d"] }]]);
  const named = naming.applyTopicNames(snapshot, names);
  assert.notEqual(named, snapshot);
  assert.equal(named.nodes[0].label, "Launch date move");
  assert.equal(named.nodes[0].deviceLabel, "launch date");
  assert.equal(named.nodes[1], snapshot.nodes[1], "an unnamed topic is untouched");
  assert.equal(snapshot.nodes[0].label, "launch date", "the tracker's snapshot is not changed");
  assert.equal(named.edges, snapshot.edges);

  // Applying again changes nothing, and returns the same snapshot.
  assert.equal(naming.applyTopicNames(named, names), named);
  assert.equal(naming.applyTopicNames(snapshot, new Map()), snapshot);
  assert.equal(naming.applyTopicNames(null, names), null);

  // A name read from turns the topic no longer holds is not shown.
  const regrouped = { nodes: [node({ utteranceIds: ["q", "r", "s", "d"] })], edges: [] };
  assert.equal(naming.applyTopicNames(regrouped, names), regrouped);

  // The record as stored takes the names by topic id.
  const stored = JSON.parse(JSON.stringify(snapshot));
  const merged = naming.applyTopicNames(stored, naming.namesOf(named));
  assert.equal(merged.nodes[0].label, "Launch date move");
  assert.equal(merged.nodes[0].deviceLabel, "launch date");
  assert.equal(merged.nodes[1].label, "sso saml");
  assert.equal(naming.namesOf(snapshot).size, 0);
});

test("a request goes by the writing model's own route, capped only where that is safe", () => {
  const local = { mode: "local", config: { disableThinking: true, provider: "local" } };
  assert.deepEqual(naming.topicNameConfig(local, "SYSTEM"), {
    disableThinking: true,
    provider: "local",
    systemPrompt: "SYSTEM",
    temperature: 0,
    maxTokens: naming.NAME_MAX_TOKENS,
  });
  // A model allowed to think spends its tokens thinking first.
  const thinking = naming.topicNameConfig(
    { mode: "local", config: { disableThinking: false } },
    "S"
  );
  assert.equal("maxTokens" in thinking, false);
  // A provider's reasoning counts against the cap, as for the title and the group.
  const provider = naming.topicNameConfig(
    { mode: "providers", config: { provider: "openai", disableThinking: true } },
    "S"
  );
  assert.equal("maxTokens" in provider, false);
  assert.equal(provider.provider, "openai");
  assert.equal(provider.temperature, 0);
  const server = naming.topicNameConfig(
    { mode: "self-hosted", config: { lanUrl: "http://10.0.0.2" } },
    "S"
  );
  assert.equal(server.maxTokens, naming.NAME_MAX_TOKENS);
  assert.equal(server.lanUrl, "http://10.0.0.2");
});

test("a model on this computer names while recording unless a classifier would take turns with it", () => {
  const live = naming.namesWhileRecording;
  assert.equal(
    live({ mode: "providers", model: "gpt-5.6-luna", classifier: "qwen", classifierOnDisk: true }),
    true
  );
  assert.equal(
    live({ mode: "self-hosted", model: "", classifier: "qwen", classifierOnDisk: true }),
    true
  );
  assert.equal(live({ mode: "local", model: "qwen3.5-4b", classifier: "" }), true);
  assert.equal(live({ mode: "local", model: "qwen3.5-4b", classifier: "qwen3.5-4b" }), true);
  assert.equal(
    live({
      mode: "local",
      model: "qwen3.5-4b",
      classifier: "qwen2.5-1.5b",
      classifierOnDisk: false,
    }),
    true
  );
  assert.equal(
    live({
      mode: "local",
      model: "qwen3.5-4b",
      classifier: "qwen2.5-1.5b",
      classifierOnDisk: true,
    }),
    false
  );
  // Not known: the loads it would cost are worth more than names a few minutes early.
  assert.equal(
    live({
      mode: "local",
      model: "qwen3.5-4b",
      classifier: "qwen2.5-1.5b",
      classifierOnDisk: null,
    }),
    false
  );
});

// docs/network-allowlist.md promises that topic names add no destination and
// no path the sidebar's count could miss: a request goes only by the writing
// model's own route (the reasoning service, whose provider calls are renderer
// requests the count sees), and only when that model is chosen and ready.
test("topic names reach a model only by the writing model's route, and only when it is ready", () => {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..", "..", "src");
  const runner = fs.readFileSync(path.join(root, "stores", "topicNamingRunner.ts"), "utf8");
  const helpers = ["topicNaming.mjs", "topicNamer.mjs"].map((file) =>
    fs.readFileSync(path.join(root, "helpers", file), "utf8")
  );
  for (const source of [runner, ...helpers]) {
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|electronAPI\?*\.?process/);
  }
  assert.match(runner, /reasoningService\.processText\(/);
  assert.match(runner, /ready: writingModelReady/);
  assert.match(runner, /currentWritingRoute\(\)/);
  // No writing model, no namer: nothing is asked at all.
  assert.match(runner, /if \(!route\) return;/);
});

test("a conversation's names go to Obsidian as its topic links", async () => {
  const { buildVaultNote } = await import("../../src/helpers/obsidianNote.mjs");
  const snapshot = {
    nodes: [
      node({ id: 1, label: "launch date", durationMs: 120_000 }),
      node({ id: 2, label: "sso saml", durationMs: 90_000, utteranceIds: ["e", "f"] }),
    ],
    edges: [],
  };
  const named = naming.applyTopicNames(
    snapshot,
    new Map([[1, { name: "Launch date move", utteranceIds: ["a", "b", "c", "d"] }]])
  );
  const { markdown } = buildVaultNote({
    note: { id: 7, title: "Launch review", createdAtMs: Date.UTC(2026, 9, 26) },
    snapshot: named,
    strings: {
      untitled: "Untitled",
      summary: "Summary",
      marked: "Marked",
      openQuestions: "Open questions",
      topics: "Topics",
      transcript: "Transcript",
      speaker: (n) => `Speaker ${n}`,
      you: "You",
      room: "Room",
    },
  });
  assert.match(markdown, /^topics: \["Launch date move", "sso saml"\]$/m);
  assert.match(markdown, /\[\[Launch date move\]\] · \[\[sso saml\]\]/);
});
