const test = require("node:test");
const assert = require("node:assert/strict");

const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

let ConversationTopicTracker;
let contentWords;
let topicLabel;
let labelCandidates;
let sittingTopics;

test.before(async () => {
  ({ ConversationTopicTracker, contentWords, topicLabel, labelCandidates, sittingTopics } =
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

// ------------------------------------------------------------------ resume

// Stopping and starting again within half an hour continues the conversation
// (conversationResume.mjs): the same note, its turns seeded into the
// recording store. The store gave the new sitting a new tracker that heard
// only the new turns, so the topics saved at Finish were the last sitting's,
// numbered from 1 again, and a return to an earlier subject was a new topic.
// The new tracker now reads the earlier turns first (`seed`), with the record
// they were saved with.
function resumed(lines, stop) {
  const turns = utterancesOf(lines);
  const before = new ConversationTopicTracker();
  feed(before, turns.slice(0, stop));
  const saved = before.snapshot(turns[stop - 1].at, { final: true });
  const tracker = new ConversationTopicTracker();
  tracker.seed(turns.slice(0, stop), { record: saved });
  return { tracker, saved, turns, rest: turns.slice(stop), end: turns.at(-1).at };
}

test("a conversation recorded again keeps every sitting's topics in its record", () => {
  const lines = [...PRICING, ...HIRING, ...DEMO, ...PRICING.slice(0, 9)];
  const unbroken = record(lines).tracker.snapshot(lines.length * 6000, { final: true });
  assert.deepEqual(
    unbroken.nodes.map((node) => node.label),
    ["enterprise pricing", "research engineer", "investor demo"]
  );
  assert.equal(unbroken.nodes[0].returns, 1, "the room came back to pricing");
  for (const stop of [PRICING.length + 5, PRICING.length + HIRING.length, lines.length - 9]) {
    const { tracker, rest, end } = resumed(lines, stop);
    feed(tracker, rest);
    // Every turn, the same topics with the same ids, and the return: the
    // record of the conversation recorded without a stop.
    assert.deepEqual(
      tracker.snapshot(end, { final: true }),
      unbroken,
      `stopped after turn ${stop}`
    );
  }
});

// A topic's name from the writing model is kept by topic id (topicNaming.mjs).
test("a continued conversation's topics keep the ids its saved record gave them", () => {
  const lines = [...PRICING, ...HIRING, ...DEMO];
  const stop = PRICING.length + HIRING.length;
  const { saved, turns } = resumed(lines, stop);
  // Ids are the tracker's own and a record can hold any: a topic split off
  // with hindsight at Finish takes a new one.
  const ids = new Map([
    [saved.nodes[0].id, 7],
    [saved.nodes[1].id, 3],
  ]);
  const record = {
    ...saved,
    nodes: saved.nodes.map((node) => ({ ...node, id: ids.get(node.id) })),
  };
  const tracker = new ConversationTopicTracker();
  tracker.seed(turns.slice(0, stop), { record });
  assert.deepEqual(
    tracker.snapshot(turns[stop - 1].at).nodes.map((node) => node.id),
    [7, 3]
  );
  feed(tracker, turns.slice(stop));
  assert.deepEqual(
    tracker.snapshot(turns.at(-1).at, { final: true }).nodes.map((node) => [node.id, node.label]),
    [
      [7, "enterprise pricing"],
      [3, "research engineer"],
      [8, "investor demo"],
    ],
    "a new topic takes an id no saved topic had"
  );
});

// Fed again turn by turn, the earlier sittings would earn their cuts again
// (a cut is drawn live only once speech has followed it). They are finished
// speech: cut once with hindsight, as the record was, and drawn at once.
test("the earlier sittings' topics are there the moment the recording continues", () => {
  const { tracker, saved, end } = resumed([...PRICING, ...HIRING], PRICING.length + HIRING.length);
  const live = tracker.snapshot(end);
  assert.deepEqual(
    live.nodes.map((node) => [node.id, node.label, node.utteranceIds]),
    saved.nodes.map((node) => [node.id, node.label, node.utteranceIds])
  );
  assert.equal(live.nodes.at(-1).state, "live", "the room is still on the last topic");
});

test("the live view takes no topic back across the stop", () => {
  const lines = [...PRICING, ...HIRING, ...DEMO, ...PRICING.slice(0, 6)];
  const stop = PRICING.length + HIRING.length;
  const { tracker, rest, turns } = resumed(lines, stop);
  let previous = tracker.snapshot(turns[stop - 1].at).nodes.map((node) => node.utteranceIds[0]);
  for (const utterance of rest) {
    tracker.onUtterance(utterance);
    const starts = tracker.snapshot(utterance.at).nodes.map((node) => node.utteranceIds[0]);
    for (const start of previous) assert.ok(starts.includes(start), `${start} stays a topic start`);
    previous = starts;
  }
  assert.ok(previous.length >= 3, "the new sitting's subject became a topic");
});

test("a long conversation is read back in one pass", () => {
  // The review four times over: 896 turns, two hours. Fed turn by turn, as
  // the live tracker hears them, they took 8.8 s; read back in one pass, 21 ms.
  const turns = [];
  for (let lap = 0; lap < 4; lap += 1) {
    for (const segment of example.note.transcript) {
      turns.push({
        id: `${segment.id}-${lap}`,
        text: segment.text,
        at: segment.timestamp + lap * 30 * 60_000,
      });
    }
  }
  const tracker = new ConversationTopicTracker();
  const started = Date.now();
  tracker.seed(turns);
  assert.ok(Date.now() - started < 1000);
  assert.equal(tracker.snapshot(turns.at(-1).at).nodes.length, 8);
});

test("a turn read back with no time takes the time of the turn before it", () => {
  const turns = utterancesOf(PRICING);
  delete turns[0].at;
  delete turns[5].at;
  // A clock far from the conversation, so a turn placed at "now" shows.
  const tracker = new ConversationTopicTracker({ now: () => 1e12 });
  tracker.seed(turns);
  const [topic] = tracker.snapshot(turns.at(-1).at, { final: true }).nodes;
  assert.equal(topic.firstAt, turns[1].at, "the first turn takes the first time known");
  assert.equal(topic.lastAt, turns.at(-1).at);
  assert.equal(topic.durationMs, turns.at(-1).at - turns[1].at);
});

test("reading back nothing leaves the tracker as new", () => {
  const tracker = new ConversationTopicTracker();
  tracker.seed([]);
  tracker.seed([{ id: "x", text: "  " }]);
  assert.deepEqual(tracker.snapshot(0), { nodes: [], edges: [] });
  feed(tracker, utterancesOf(PRICING));
  assert.equal(tracker.snapshot(PRICING.length * 6000).nodes.length, 1);
});

// The recording screen counts this sitting, as its clock and contour do. A
// topic of an earlier sitting is drawn once the room comes back to it.
test("the recording screen draws this sitting's topics, and the record keeps them all", () => {
  const lines = [...PRICING, ...HIRING, ...DEMO, ...PRICING];
  const { tracker, rest, end } = resumed(lines, PRICING.length + HIRING.length);
  feed(tracker, rest);
  const all = tracker.snapshot(end);
  assert.equal(all.nodes.length, 3);
  const sitting = sittingTopics(all, rest[0].at);
  assert.deepEqual(
    sitting.nodes.map((node) => node.label),
    ["enterprise pricing", "investor demo"],
    "hiring was the first sitting's alone; pricing came back"
  );
  assert.deepEqual(
    sitting.edges.map((edge) => edge.kind),
    ["return"],
    "only moves between topics it draws"
  );
  assert.equal(sittingTopics(all, 0), all, "the same snapshot when nothing is left out");
  assert.equal(sittingTopics(all, Number.NaN), all);
  assert.equal(sittingTopics(null, rest[0].at), null);
});
