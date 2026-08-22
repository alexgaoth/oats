const test = require("node:test");
const assert = require("node:assert/strict");

let ConversationTopicTracker;
let contentWords;
let similarity;
let topicLabel;

test.before(async () => {
  ({ ConversationTopicTracker, contentWords, similarity, topicLabel } =
    await import("../../src/helpers/conversationTopics.mjs"));
});

// A label is two words, and which two is a frequency question — but the order
// they are said in is not. Ranking by frequency alone renders every multi-word
// subject backwards as soon as its second word is repeated more than its first.
test("a label keeps the order the words were first said in, not their ranking", () => {
  // "onboarding" first, "flow" more often: the subject is still onboarding flow.
  const counts = new Map([
    ["onboarding", 2],
    ["flow", 5],
  ]);
  assert.equal(topicLabel(counts, "fallback"), "onboarding flow");
});

test("a label still picks the two most repeated words", () => {
  const counts = new Map([
    ["think", 1],
    ["pricing", 6],
    ["seat", 2],
    ["enterprise", 5],
  ]);
  assert.equal(topicLabel(counts, "fallback"), "pricing enterprise");
});

test("a topic with nothing countable falls back rather than rendering empty", () => {
  assert.equal(topicLabel(new Map(), "the opening sentence"), "the opening sentence");
  assert.equal(topicLabel(new Map(), ""), "untitled");
});

// Feeds utterances a fixed interval apart so duration and drop-age assertions
// are deterministic.
function feed(tracker, lines, { start = 0, stepMs = 1000 } = {}) {
  lines.forEach((text, index) => {
    tracker.onUtterance({ id: `u${index}`, text, at: start + index * stepMs });
  });
}

test("content extraction keeps subject matter and drops conversational filler", () => {
  assert.deepEqual(contentWords("So yeah, I think the pricing model is broken"), [
    "pricing",
    "model",
    "broken",
  ]);
  assert.deepEqual(contentWords("Yeah. Okay, sure."), []);
  // Plurals fold together so "investors" and "investor" are one subject.
  assert.deepEqual(contentWords("investors"), ["investor"]);
});

test("similarity is symmetric, bounded, and zero against nothing", () => {
  const a = new Set(["pricing", "model"]);
  const b = new Set(["pricing", "model"]);
  assert.equal(similarity(a, b), 1);
  assert.equal(similarity(a, b), similarity(b, a));
  assert.equal(similarity(a, new Set()), 0);
  assert.ok(similarity(a, new Set(["pricing", "churn"])) < 1);
});

test("a conversation that stays on one subject stays on one topic", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is the thing I keep coming back to",
    "Our pricing is too low for the enterprise segment",
    "If we raise pricing the enterprise deals get easier",
  ]);
  const { nodes, edges } = tracker.snapshot(3000);
  assert.equal(nodes.length, 1);
  assert.deepEqual(edges, []);
  assert.equal(nodes[0].state, "live");
  assert.ok(nodes[0].durationMs > 0);
});

test("backchannel utterances are ignored rather than becoming topics", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, ["The pricing model is broken", "Yeah", "Mm-hm", "Right, okay"]);
  assert.equal(tracker.snapshot(3000).nodes.length, 1);
});

test("a genuine subject change starts a topic and records the transition", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing needs a rethink",
    "Separately, hiring the research engineer is urgent",
    "The research engineer role has been open for months",
  ]);
  const { nodes, edges } = tracker.snapshot(4000);
  assert.equal(nodes.length, 2);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].from, nodes[0].id);
  assert.equal(edges[0].to, nodes[1].id);
  assert.equal(edges[0].kind, "new");
});

test("returning to an earlier subject produces the back-edge the graph is for", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing needs a rethink",
    "Separately, hiring the research engineer is urgent",
    "The research engineer role has been open for months",
    "Coming back to enterprise pricing though, it is broken",
  ]);
  const { nodes, edges } = tracker.snapshot(5000);
  assert.equal(nodes.length, 2);
  const back = edges.find((edge) => edge.kind === "return");
  assert.ok(back, "expected a return edge");
  assert.equal(back.from, nodes[1].id);
  assert.equal(back.to, nodes[0].id);
  assert.equal(nodes[0].returns, 1);
  assert.equal(nodes[0].state, "live");
});

test("the stack lists what was left open and never the topic being spoken", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing needs a rethink",
    "Separately, hiring the research engineer is urgent",
    "The research engineer role has been open for months",
  ]);
  const open = tracker.openThreads(4000);
  assert.equal(open.length, 1);
  assert.match(open[0].label, /pricing|enterprise/);
  assert.equal(open[0].state, "open");
});

test("a thread nobody returns to goes cold, and a resolved one leaves the stack", () => {
  const tracker = new ConversationTopicTracker({ dropAfterMs: 5000 });
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing needs a rethink",
  ]);
  // Resolving is keyed by the utterance the question was asked in, not by
  // whatever happens to be live when the verdict lands.
  assert.ok(tracker.resolveTopicForUtterance("u0"));
  feed(
    tracker,
    ["Separately, hiring the research engineer is urgent", "The research engineer search drags on"],
    {
      start: 2000,
    }
  );

  // Resolved threads are not reminders — they are gone from the stack.
  assert.deepEqual(tracker.openThreads(4000), []);

  feed(
    tracker,
    [
      "Marketing spend on the conference booth was wasted",
      "That conference booth spend was pure marketing waste",
    ],
    {
      start: 20000,
    }
  );
  const cold = tracker.openThreads(22000).find((thread) => /research|engineer/.test(thread.label));
  assert.ok(cold, "expected the hiring thread to still be listed");
  assert.equal(cold.state, "dropped");
});

test("resolving closes the thread the question was asked in, not the live one", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Separately, hiring the research engineer is urgent",
  ]);
  // The room has moved to hiring; the answered question was about pricing.
  const resolved = tracker.resolveTopicForUtterance("u0");
  assert.match(resolved.label, /pricing|enterprise/);
  assert.deepEqual(tracker.openThreads(2000), []);

  // An utterance nobody has heard of resolves nothing rather than guessing.
  assert.equal(tracker.resolveTopicForUtterance("nope"), null);
  assert.equal(tracker.resolveTopicForUtterance(null), null);
});

test("the stack is ordered by what was dropped most recently", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing has to change",
    "Separately, hiring the research engineer is urgent",
    "The research engineer search drags on",
    "Marketing spend on the conference booth was wasted",
    "That conference booth spend was pure marketing waste",
  ]);
  const open = tracker.openThreads(6000);
  assert.equal(open.length, 2);
  assert.ok(open[0].lastAt > open[1].lastAt);
});

test("a one-sentence tangent is folded in rather than becoming its own node", () => {
  const tracker = new ConversationTopicTracker();
  feed(tracker, [
    "The pricing model is broken for enterprise",
    "Enterprise pricing has to change",
    "Anyway the coffee machine broke again this morning",
    "Back to enterprise pricing, it has to change",
  ]);
  const { nodes } = tracker.snapshot(4000);
  // The coffee remark never earned a node — but it is not lost either.
  assert.equal(nodes.length, 1);
  assert.ok(nodes[0].utteranceIds.includes("u2"));
});

test("snapshot weights topics by time spent, not by utterance count", () => {
  const tracker = new ConversationTopicTracker();
  tracker.onUtterance({ id: "a", text: "The pricing model is broken", at: 0 });
  tracker.onUtterance({ id: "b", text: "Pricing for enterprise is broken", at: 60000 });
  tracker.onUtterance({ id: "c", text: "Hiring a research engineer is urgent", at: 61000 });
  tracker.onUtterance({ id: "d", text: "The research engineer search is slow", at: 62000 });
  const { nodes } = tracker.snapshot(62000);
  const pricing = nodes.find((node) => /pricing/.test(node.label));
  const hiring = nodes.find((node) => /research|engineer|hiring/.test(node.label));
  assert.ok(pricing.durationMs > hiring.durationMs);
});
