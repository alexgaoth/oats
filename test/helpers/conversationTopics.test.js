const test = require("node:test");
const assert = require("node:assert/strict");

let ConversationTopicTracker;
let contentWords;
let topicLabel;
let labelCandidates;

test.before(async () => {
  ({ ConversationTopicTracker, contentWords, topicLabel, labelCandidates } =
    await import("../../src/helpers/conversationTopics.mjs"));
});

// Three subjects, written as a room says them: fillers, backchannels and
// half-sentences included. The tracker reads windows of speech, so a subject
// needs a minute or so of talk before it is one.
const PRICING = [
  "So the enterprise pricing is the thing I keep coming back to.",
  "Yeah, our enterprise pricing is too low for the seat count we see.",
  "If we raise enterprise pricing, the renewal conversations get harder.",
  "Mm-hmm.",
  "The seat discount is what makes the enterprise pricing look cheap.",
  "Corbel asked for a seat discount of thirty percent on the renewal.",
  "I'd rather hold the list price and give the seat discount once.",
  "Okay.",
  "What does the enterprise pricing page say about the seat discount today?",
  "It says the list price, and the seat discount is only in the contract.",
  "Then the renewal for Corbel is where we test the enterprise pricing.",
  "Right, and the list price stays the same for everyone else.",
  "So enterprise pricing goes up, and the seat discount comes down at renewal.",
  "Fine by me, I think that's the plan for pricing.",
];
const HIRING = [
  "Separately, hiring the research engineer is urgent.",
  "The research engineer role has been open for three months now.",
  "We had two candidates in the interview loop last week.",
  "Yeah.",
  "The interview loop takes four hours and candidates drop out of it.",
  "Can we cut the interview loop to two hours for the research engineer?",
  "We could drop the take-home from the interview loop.",
  "The job post for the research engineer also needs a rewrite.",
  "Uh-huh.",
  "Who owns the job post? I can rewrite the job post this week.",
  "Good, then the research engineer candidates see the new job post.",
  "And the shorter interview loop starts with the next candidates.",
  "So the research engineer hiring plan is the job post and the loop.",
  "That works, hiring is sorted for now.",
];
const DEMO = [
  "Now the investor demo on Friday keeps crashing.",
  "The investor demo build crashes on the slides with the charts.",
  "It's the chart rendering in the demo build, it runs out of memory.",
  "Okay, so the investor demo needs a smaller dataset for the charts.",
  "Mm-hmm.",
  "We can cut the charts to the last quarter for the investor demo.",
  "The demo build should use the cached charts, not live queries.",
  "Who is presenting the investor demo on Friday?",
  "Maya is presenting the investor demo, with the new slides.",
  "Then the slides and the demo build have to be frozen by Thursday.",
  "Yeah.",
  "I'll freeze the demo build on Thursday morning.",
  "Good, the investor demo is fine if the charts load.",
  "Right, the charts are the only risk for the investor demo.",
];

// Utterances a fixed interval apart, ids u0, u1, ...
function utterancesOf(lines, { start = 0, stepMs = 6000 } = {}) {
  return lines.map((text, index) => ({ id: `u${index}`, text, at: start + index * stepMs }));
}

function feed(tracker, utterances) {
  for (const utterance of utterances) tracker.onUtterance(utterance);
  return utterances;
}

function record(lines, options) {
  const tracker = new ConversationTopicTracker(options);
  const utterances = feed(tracker, utterancesOf(lines));
  return { tracker, utterances, end: utterances.at(-1).at };
}

// ------------------------------------------------------------------ words

// What the first tracker put in labels: contractions, fillers, and the
// plural strip that cut "that's" to "that'".
test("content words leave out contractions, fillers and bare numbers", () => {
  assert.deepEqual(contentWords("So yeah, I think the pricing model is broken"), [
    "pricing",
    "model",
    "broken",
  ]);
  assert.deepEqual(contentWords("Yeah. Okay, sure. Mm-hmm, uh-huh."), []);
  assert.deepEqual(contentWords("Wait, it's, I'm, you're, couldn't, I'll, can't, that's"), []);
  assert.deepEqual(contentWords("It’s fine, we’re not, that’s it"), []);
  assert.deepEqual(contentWords("restart the router at 40 past, for 2.5 seconds"), [
    "restart",
    "router",
    "past",
    "second",
  ]);
});

test("plurals fold together without cutting words that only end in s", () => {
  assert.deepEqual(contentWords("investors"), ["investor"]);
  assert.deepEqual(contentWords("companies company"), ["company", "company"]);
  assert.deepEqual(contentWords("the process analysis status"), ["process", "analysis", "status"]);
  assert.deepEqual(contentWords("the company's roadmap"), ["company", "roadmap"]);
});

test("two-letter names survive and two-letter function words do not", () => {
  assert.deepEqual(contentWords("We use AI for the UX of it"), ["ai", "ux"]);
});

// ------------------------------------------------------------------ labels

// The first tracker joined the two most frequent words, in the order first
// said, whatever they were. A label is now a phrase the room said.
test("a label is a phrase somebody said, not two frequent words joined", () => {
  const label = topicLabel(PRICING);
  assert.equal(label, "enterprise pricing");
  const said = PRICING.join(" ").toLowerCase();
  assert.ok(said.includes(label.toLowerCase()));
});

test("a phrase people repeat beats each of its words", () => {
  assert.equal(
    topicLabel([
      "The speech recognition is slow on the old phones.",
      "Speech recognition needs a better microphone.",
      "We could license speech recognition from a vendor.",
      "And the speech recognition errors annoy people.",
    ]),
    "speech recognition"
  );
});

test("a label is never a filler, a contraction or a number", () => {
  const lines = [
    "Wait, it's, I mean, I'm not sure, wait.",
    "Wait, wait, it's 900, it's 900 for the hosting bill.",
    "I'm saying the hosting bill is 900, you know.",
    "Couldn't we, I don't know, wait, cut the hosting bill?",
    "Yeah, it's the hosting bill again, I'm sorry.",
  ];
  const label = topicLabel(lines);
  assert.equal(label, "hosting bill");
  for (const candidate of labelCandidates(lines, { limit: 10 })) {
    assert.doesNotMatch(candidate.text, /'|^\d+$|\bwait\b|\bit's\b|\bi'm\b/i);
  }
});

test("a name keeps its own case and a sentence's capital does not stick", () => {
  assert.equal(
    topicLabel(["SAML breaks for SSO.", "The SAML config is wrong.", "Fix SAML first."]),
    "SAML"
  );
  assert.equal(
    topicLabel([
      "Budget is tight this quarter.",
      "Budget again: the budget for travel.",
      "The budget for hiring too.",
    ]),
    "budget"
  );
});

test("a word the whole conversation uses does not name one part of it", () => {
  const conversation = [...PRICING, ...HIRING];
  assert.equal(topicLabel(HIRING, { conversation }), "research engineer");
  assert.equal(topicLabel(PRICING, { conversation }), "enterprise pricing");
});

test("nothing nameable names nothing", () => {
  assert.equal(topicLabel([]), "");
  assert.equal(topicLabel(["Yeah.", "Okay, sure.", "Mm-hmm."]), "");
});

// ------------------------------------------------------------------ topics

test("a conversation that stays on one subject stays on one topic", () => {
  const { tracker, end } = record(PRICING);
  const { nodes, edges } = tracker.snapshot(end, { final: true });
  assert.equal(nodes.length, 1);
  assert.deepEqual(edges, []);
  assert.equal(nodes[0].label, "enterprise pricing");
  assert.ok(nodes[0].durationMs > 0);
});

test("each change of subject starts a topic named after it, in order", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...DEMO]);
  const { nodes, edges } = tracker.snapshot(end, { final: true });
  assert.deepEqual(
    nodes.map((node) => node.label),
    ["enterprise pricing", "research engineer", "investor demo"]
  );
  assert.deepEqual(
    edges.map((edge) => [edge.from, edge.to, edge.kind]),
    [
      [nodes[0].id, nodes[1].id, "new"],
      [nodes[1].id, nodes[2].id, "new"],
    ]
  );
  // Every utterance is in a topic, backchannels included.
  const placed = nodes.flatMap((node) => node.utteranceIds);
  assert.equal(placed.length, PRICING.length + HIRING.length + DEMO.length);
  assert.ok(nodes[0].utteranceIds.includes("u3"), "the first Mm-hmm sits with pricing");
});

test("returning to an earlier subject produces the back-edge the graph is for", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...PRICING.slice(0, 9)]);
  const { nodes, edges } = tracker.snapshot(end, { final: true });
  assert.equal(nodes.length, 2);
  const back = edges.find((edge) => edge.kind === "return");
  assert.ok(back, "expected a return edge");
  assert.equal(back.from, nodes[1].id);
  assert.equal(back.to, nodes[0].id);
  assert.equal(nodes[0].returns, 1);
});

test("backchannels and a passing remark do not become topics", () => {
  const lines = [
    ...PRICING.slice(0, 7),
    "Yeah.",
    "Mm-hmm.",
    "Anyway, the coffee machine broke again this morning.",
    "Okay.",
    ...PRICING.slice(7),
  ];
  const { tracker, end } = record(lines);
  const { nodes } = tracker.snapshot(end, { final: true });
  assert.equal(nodes.length, 1);
  assert.ok(nodes[0].utteranceIds.includes("u9"), "the remark stays in the topic it interrupted");
});

test("no two topics of a conversation share a label", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...DEMO, ...HIRING.slice(0, 4)]);
  const labels = tracker.snapshot(end, { final: true }).nodes.map((node) => node.label);
  assert.equal(new Set(labels).size, labels.length);
});

// ------------------------------------------------------------------ live

// The flow card redraws from every snapshot. A topic it has drawn is never
// taken back while the room talks.
test("the live view never takes a topic back", () => {
  const tracker = new ConversationTopicTracker();
  let previous = [];
  const lines = [...PRICING, ...HIRING, ...DEMO, ...PRICING.slice(0, 6)];
  for (const utterance of utterancesOf(lines)) {
    tracker.onUtterance(utterance);
    const { nodes } = tracker.snapshot(utterance.at);
    const starts = nodes.map((node) => node.utteranceIds[0]);
    for (const start of previous) assert.ok(starts.includes(start), `${start} stays a topic start`);
    previous = starts;
  }
  assert.ok(previous.length >= 3, "the live view did move on to new topics");
});

test("a live topic appears once enough of it has been said", () => {
  const tracker = new ConversationTopicTracker();
  const utterances = utterancesOf([...PRICING, ...HIRING]);
  utterances.forEach((utterance, index) => {
    tracker.onUtterance(utterance);
    if (index === PRICING.length) {
      assert.equal(tracker.snapshot(utterance.at).nodes.length, 1, "one sentence is no new topic");
    }
  });
  const { nodes } = tracker.snapshot(utterances.at(-1).at);
  assert.equal(nodes.length, 2);
  assert.match(
    nodes.find((node) => node.state === "live").label,
    /^(research engineer|interview loop)$/
  );
});

// The store reads the graph and the stack after every finalized utterance.
// Reading must not decide anything.
test("reading after every utterance decides nothing the tracker would not", () => {
  const lines = [...PRICING, ...HIRING, ...DEMO];
  const quiet = new ConversationTopicTracker();
  feed(quiet, utterancesOf(lines));
  const read = new ConversationTopicTracker();
  for (const utterance of utterancesOf(lines)) {
    read.onUtterance(utterance);
    read.snapshot(utterance.at);
    read.openThreads(utterance.at);
  }
  const end = lines.length * 6000;
  assert.deepEqual(read.snapshot(end), quiet.snapshot(end));
  assert.deepEqual(read.snapshot(end, { final: true }), quiet.snapshot(end, { final: true }));
});

// A stored record is not being spoken. The topic current at stop takes the
// state it would have had the moment the room left it, including `resolved`.
test("a final snapshot has nothing live, and keeps a resolved current topic resolved", () => {
  const { tracker, end } = record([...PRICING, ...HIRING]);
  const open = tracker.snapshot(end, { final: true });
  assert.deepEqual(
    open.nodes.map((node) => node.state),
    ["open", "open"]
  );
  tracker.resolveTopicForUtterance(`u${PRICING.length + 9}`);
  const settled = tracker.snapshot(end, { final: true });
  assert.equal(settled.nodes[1].state, "resolved");
  assert.equal(tracker.snapshot(end).nodes.at(-1).state, "live", "the live view is unchanged");
});

test("resolving closes the topic the question was asked in, not the live one", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...DEMO]);
  // The room is on the demo; the answered question was about pricing.
  const resolved = tracker.resolveTopicForUtterance("u8");
  assert.ok(resolved);
  assert.ok(resolved.utteranceIds.includes("u8"));
  const pricing = tracker.snapshot(end).nodes.find((node) => node.utteranceIds.includes("u8"));
  assert.equal(pricing.state, "resolved");
  assert.ok(tracker.openThreads(end).every((thread) => thread.id !== pricing.id));
  // An utterance nobody has heard of resolves nothing rather than guessing.
  assert.equal(tracker.resolveTopicForUtterance("nope"), null);
  assert.equal(tracker.resolveTopicForUtterance(null), null);
});

test("the stack lists what was left open, most recent first, never the live topic", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...DEMO]);
  const live = tracker.snapshot(end).nodes.find((node) => node.state === "live");
  const open = tracker.openThreads(end);
  assert.ok(open.length >= 1);
  assert.ok(open.every((thread) => thread.id !== live.id));
  for (let index = 1; index < open.length; index += 1) {
    assert.ok(open[index - 1].lastAt >= open[index].lastAt);
  }
});

test("a thread nobody returns to goes cold", () => {
  const tracker = new ConversationTopicTracker({ dropAfterMs: 60_000 });
  const utterances = feed(tracker, utterancesOf([...PRICING, ...HIRING, ...DEMO]));
  const states = tracker.openThreads(utterances.at(-1).at).map((thread) => thread.state);
  assert.ok(states.includes("dropped"), "the oldest thread has gone cold");
});

// ------------------------------------------------------------------ time

// A topic's time is the time the room spent on it. A return used to add the
// whole gap since the topic was last discussed.
test("time spent on other topics is not counted when the room returns", () => {
  const { tracker, end } = record([...PRICING, ...HIRING, ...PRICING.slice(0, 9)]);
  const [pricing, hiring] = tracker.snapshot(end, { final: true }).nodes;
  assert.equal(pricing.returns, 1);
  // 6 s between turns within each of its two stretches, nothing between them.
  assert.equal(pricing.durationMs, (pricing.utteranceIds.length - 2) * 6000);
  assert.equal(hiring.durationMs, (hiring.utteranceIds.length - 1) * 6000);
});

test("a long silence inside a topic is not time spent on it", () => {
  const tracker = new ConversationTopicTracker({ maxGapMs: 60_000 });
  const utterances = utterancesOf(PRICING);
  for (const utterance of utterances.slice(7)) utterance.at += 30 * 60_000;
  feed(tracker, utterances);
  const [pricing] = tracker.snapshot(utterances.at(-1).at, { final: true }).nodes;
  assert.equal(pricing.durationMs, 12 * 6000 + 60_000);
});

// Agent-independent readers (the lanes, the graph, the vault note, the
// cross-conversation board) read these fields from the stored record.
test("a node keeps the shape every reader of the record expects", () => {
  const { tracker, end } = record([...PRICING, ...HIRING]);
  const { nodes, edges } = tracker.snapshot(end, { final: true });
  for (const node of nodes) {
    assert.deepEqual(Object.keys(node).sort(), [
      "durationMs",
      "firstAt",
      "id",
      "label",
      "lastAt",
      "returns",
      "state",
      "utteranceIds",
      "words",
    ]);
    assert.ok(node.words.length > 0 && node.words.length <= 8);
    assert.ok(node.words.every((word) => word === word.toLowerCase()));
  }
  for (const edge of edges) {
    assert.deepEqual(Object.keys(edge).sort(), ["from", "kind", "to", "weight"]);
  }
  assert.ok(nodes[0].words.includes("pricing"));
});

// ------------------------------------------------------------------ meaning

// With sentence vectors (topicVectors.mjs feeds them from the local model),
// a topic is named with the candidate closest in meaning to what it says.
test("with vectors, a topic is named by the candidate closest to what it says", () => {
  const { tracker, utterances } = record(PRICING);
  assert.equal(tracker.snapshot(0).nodes[0].label, "enterprise pricing");
  const toward = [0, 1, 0];
  const away = [1, 0, 0];
  const phrases = tracker.phrasesToEmbed(500);
  assert.ok(phrases.some((phrase) => phrase.key === "seat discount"));
  tracker.addVectors({
    utterances: utterances.map((utterance) => [utterance.id, toward]),
    phrases: phrases.map((phrase) => [phrase.key, phrase.key === "seat discount" ? toward : away]),
  });
  assert.equal(tracker.snapshot(0, { final: true }).nodes[0].label, "seat discount");
});

test("without vectors for most of a topic, its name stays the room's most used phrase", () => {
  const { tracker, utterances } = record(PRICING);
  const phrases = tracker.phrasesToEmbed(500);
  tracker.addVectors({
    // Only two turns have vectors: too few to say what the topic means.
    utterances: utterances.slice(0, 2).map((utterance) => [utterance.id, [0, 1, 0]]),
    phrases: phrases.map((phrase) => [
      phrase.key,
      phrase.key === "seat discount" ? [0, 1, 0] : [1, 0, 0],
    ]),
  });
  assert.equal(tracker.snapshot(0, { final: true }).nodes[0].label, "enterprise pricing");
});

test("each phrase is asked for once, the topics' candidates first", () => {
  const { tracker } = record(PRICING);
  const first = tracker.phrasesToEmbed(3);
  assert.equal(first.length, 3);
  assert.equal(first[0].key, "enterprise pricing");
  const rest = tracker.phrasesToEmbed(500);
  assert.ok(rest.every((phrase) => !first.some((asked) => asked.key === phrase.key)));
  assert.deepEqual(tracker.phrasesToEmbed(500), []);
});

test("the record keeps a vector of what was said on each topic, when the turns had vectors", async () => {
  const { ConversationTopicTracker } = await import("../../src/helpers/conversationTopics.mjs");
  const { decodeTopicVector, cosine } = await import("../../src/helpers/conversationLinks.mjs");
  const turns = [
    "The pricing for enterprise customers needs a discount for annual plans",
    "Annual plans with a discount make enterprise pricing simpler for customers",
    "Enterprise customers ask about pricing and the annual discount every week",
  ];
  const fed = new ConversationTopicTracker({ now: () => 0 });
  const plain = new ConversationTopicTracker({ now: () => 0 });
  turns.forEach((text, index) => {
    const utterance = { id: `u${index}`, text, at: index * 20_000 };
    fed.onUtterance(utterance);
    plain.onUtterance(utterance);
    fed.addVectors({ utterances: [[utterance.id, [1, 0.1 * index, 0]]] });
  });
  const stored = fed.snapshot(60_000, { final: true }).nodes;
  assert.ok(stored.length >= 1);
  for (const node of stored) {
    const vector = decodeTopicVector(node.vector);
    assert.ok(vector, "every topic of the record has one");
    assert.ok(cosine(vector, [1, 0, 0]) > 0.97);
  }
  assert.ok(
    fed.snapshot(60_000).nodes.every((node) => node.vector === undefined),
    "the live view carries none"
  );
  assert.ok(
    plain.snapshot(60_000, { final: true }).nodes.every((node) => node.vector === undefined),
    "and a record made without vectors has none"
  );
});
