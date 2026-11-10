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
  assert.match(first.text, /^Length of the description: about 15 words, in 1 sentence\.$/m);
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

  // Between the steps where a name may change, the name is kept and the
  // request is for the description; its length follows the topic's words.
  const describe = naming.buildTopicNamePrompt({
    turns: ["We need to pick the launch date."],
    current: "Launch date",
    keepName: true,
    words: 600,
  });
  assert.match(describe.text, /^Current name: Launch date\. Reply with it unchanged\.$/m);
  assert.match(describe.text, /^Length of the description: about 42 words, in 2 sentences\.$/m);
});

test("a description grows with the topic, to a cap", () => {
  const length = naming.descriptionLength;
  assert.equal(length(0), naming.MIN_DESCRIPTION_WORDS);
  assert.equal(length(40), 15);
  assert.equal(length(100), 17);
  assert.equal(length(250), 25);
  assert.equal(length(625), 43);
  assert.equal(length(1000), 62);
  assert.equal(length(5000), naming.MAX_DESCRIPTION_WORDS);
  assert.equal(length(Number.NaN), 15);
});

test("a longer description is asked for in more sentences", () => {
  const sentences = naming.descriptionSentences;
  assert.equal(sentences(naming.MIN_DESCRIPTION_WORDS), 1);
  assert.equal(sentences(26), 1);
  assert.equal(sentences(27), 2);
  assert.equal(sentences(42), 2);
  assert.equal(sentences(62), 3);
  assert.equal(sentences(naming.MAX_DESCRIPTION_WORDS), 4);
});

test("an answer gives a name and a description, labelled or in order", () => {
  const description =
    "The scroll wheel costs more than buttons because it needs a special chip. Buttons were chosen.";
  for (const answer of [
    `Name: Scroll wheel cost\nAbout: ${description}`,
    `**Name:** Scroll wheel cost\n**About:** ${description}`,
    `Name: "Scroll wheel cost"\n\nDescription: ${description}`,
    `About: ${description}\nName: Scroll wheel cost`,
    `Scroll wheel cost.\n${description}`,
    `<think>The wheel.</think>\nName: Scroll wheel cost\nAbout: ${description.split(". ")[0]}.\n${description.split(". ")[1]}`,
  ]) {
    assert.deepEqual(
      naming.parseTopicLabel(answer),
      { name: "Scroll wheel cost", description },
      answer
    );
  }
  // A name only, as the earlier prompt asked: no description.
  assert.deepEqual(naming.parseTopicLabel("Scroll wheel cost"), {
    name: "Scroll wheel cost",
    description: null,
  });
  // A description with an unusable name keeps the description.
  assert.deepEqual(naming.parseTopicLabel(`Name: General discussion\nAbout: ${description}`), {
    name: null,
    description,
  });
});

test("an answer that splits the topic in several pairs gives the first pair only", () => {
  const first = "The kinetic battery was discussed. The chip type was left for later.";
  for (const answer of [
    `Energy source ideas\n${first}\n\nChip selection options\nThe options were simple or advanced.`,
    `Energy source ideas\n${first}\nChip selection options\nThe options were simple or advanced.`,
    `Name: Energy source ideas\nAbout: ${first}\nName: Chip selection options\nAbout: The options were simple or advanced.`,
  ]) {
    assert.deepEqual(
      naming.parseTopicLabel(answer),
      { name: "Energy source ideas", description: first },
      answer
    );
  }
});

test("a description that is no description is left out", () => {
  const read = (about) =>
    naming.parseTopicLabel(`Name: Scroll wheel cost\nAbout: ${about}`).description;
  assert.equal(read(""), null);
  assert.equal(read("Wheel cost."), null, "under three words");
  assert.equal(read("Sorry, I cannot tell what was said"), null);
  assert.equal(read("Not enough information to describe this topic"), null);
  assert.equal(read("What was said on this topic: the wheel"), null);
  assert.equal(read("Length of the description: about 15 words, in 1 sentence."), null);
  assert.equal(read("scroll wheel cost"), null, "the name again");
  assert.equal(read("“The wheel costs more than buttons.”"), "The wheel costs more than buttons.");
});

test("a description longer than the cap is cut at a sentence, else at a word", () => {
  const sentence = (index) => `Sentence ${index} has exactly eight words in it.`;
  const long = Array.from({ length: 12 }, (_, index) => sentence(index)).join(" ");
  const cut = naming.parseTopicDescription(long);
  const count = cut.split(" ").length;
  assert.ok(count <= naming.MAX_DESCRIPTION_WORDS, `${count} words`);
  assert.ok(count > naming.MAX_DESCRIPTION_WORDS - 8, "as many whole sentences as fit");
  assert.ok(cut.endsWith("in it."));
  const run = Array.from({ length: 120 }, (_, index) => `w${index}`).join(" ");
  const clipped = naming.parseTopicDescription(run);
  assert.equal(clipped.split(" ").length, naming.MAX_DESCRIPTION_WORDS);
  assert.ok(clipped.endsWith("…"));
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

test("a name one word over the prompt's five is kept, two words over is not", () => {
  // gpt-6-luna answers six words to about one request in eight; those names
  // were judged as good as shorter ones (docs/fast-models.md).
  assert.equal(naming.MAX_NAME_WORDS, 6);
  assert.equal(
    naming.parseTopicName("How remote controls transmit button signals"),
    "How remote controls transmit button signals"
  );
  assert.equal(naming.parseTopicName("How the remote controls transmit button signals"), null);
  assert.equal(
    naming.parseTopicName("How remote controls transmit button signals", { maxWords: 5 }),
    null
  );
  // The lanes' bound holds whatever the count: six long words are still too long.
  assert.equal(
    naming.parseTopicName(
      "Interdepartmental telecommunications infrastructure standardisation documentation requirements"
    ),
    null
  );
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

test("a topic is named at forty words, asked again as it grows, and once more at the end", () => {
  const need = naming.topicNeedsName;
  assert.equal(need({ words: 39 }), null);
  assert.equal(need({ words: 40 }), "first");
  assert.equal(need({ words: 29, final: true }), null);
  assert.equal(need({ words: 30, final: true }), "first");

  // Asked again at 1.6 times its words, so its description keeps up.
  assert.equal(naming.DESCRIBE_GROWTH, 1.6);
  const record = { name: "Launch date", words: 40 };
  assert.equal(need({ words: 63, record }), null);
  assert.equal(need({ words: 64, record }), "rename");
  // At the end, less growth is enough, but not a few words.
  assert.equal(need({ words: 69, record, final: true }), null);
  assert.equal(need({ words: 70, record, final: true }), "rename");
  assert.equal(need({ words: 300, record: { name: "x", words: 290 }, final: true }), null);
  // A topic the tracker cut smaller is asked again once it lost as much.
  const big = { name: "Launch date", words: 250 };
  assert.equal(need({ words: 157, record: big }), null);
  assert.equal(need({ words: 156, record: big }), "rename");
  assert.equal(need({ words: 200, record: big, final: true }), null);
  assert.equal(need({ words: 190, record: big, final: true }), "rename");
  // Cut below what can be named from: the name stays, and nothing is asked.
  assert.equal(need({ words: 39, record: big }), null);
  assert.equal(need({ words: 29, record: big, final: true }), null);
});

test("a name may change only at the steps of 2.5, a name the check gave never", () => {
  const may = naming.nameMayChange;
  assert.equal(may({ words: 40 }), true, "no name yet");
  const record = { name: "Launch date", words: 64, nameWords: 40 };
  assert.equal(may({ words: 99, record }), false);
  assert.equal(may({ words: 100, record }), true);
  assert.equal(may({ words: 16, record }), true, "cut to as much fewer");
  // A record from before descriptions has no `nameWords`: its `words` count.
  assert.equal(may({ words: 99, record: { name: "x", words: 40 } }), false);
  assert.equal(may({ words: 100, record: { name: "x", words: 40 } }), true);
  // At the end, the end's step.
  assert.equal(may({ words: 52, record, final: true }), true);
  assert.equal(may({ words: 51, record, final: true }), false);
  assert.equal(may({ words: 900, record: { ...record, held: true } }), false);
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

test("a description goes on the topic with its name, and to the record", () => {
  const snapshot = { nodes: [node()], edges: [] };
  const ids = ["a", "b", "c", "d"];
  const described = naming.applyTopicNames(
    snapshot,
    new Map([
      [
        1,
        {
          name: "Launch date move",
          description: "The launch moves to the 10th.",
          utteranceIds: ids,
        },
      ],
    ])
  );
  assert.equal(described.nodes[0].description, "The launch moves to the 10th.");
  // A newer description changes the topic; the same one does not.
  const again = new Map([
    [
      1,
      { name: "Launch date move", description: "The launch moves to the 10th.", utteranceIds: ids },
    ],
  ]);
  assert.equal(naming.applyTopicNames(described, again), described);
  const newer = naming.applyTopicNames(
    described,
    new Map([
      [
        1,
        {
          name: "Launch date move",
          description: "The launch moves to the 10th, after the audit.",
          utteranceIds: ids,
        },
      ],
    ])
  );
  assert.equal(newer.nodes[0].description, "The launch moves to the 10th, after the audit.");
  // A record with no description keeps the one the topic has.
  const nameOnly = new Map([[1, { name: "Launch date move", utteranceIds: ids }]]);
  assert.equal(naming.applyTopicNames(described, nameOnly), described);
  assert.equal(naming.applyTopicNames(snapshot, nameOnly).nodes[0].description, undefined);
  // The record as stored takes it by topic id.
  const stored = naming.applyTopicNames(
    JSON.parse(JSON.stringify(snapshot)),
    naming.namesOf(newer)
  );
  assert.equal(stored.nodes[0].description, "The launch moves to the 10th, after the audit.");
  assert.equal(
    naming.namesOf(newer).get(1).description,
    "The launch moves to the 10th, after the audit."
  );
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
