const test = require("node:test");
const assert = require("node:assert/strict");

// The replay on the site (components/demo/DemoReplay.tsx): the example
// conversation played back, cut at any moment from its own record
// (src/helpers/conversationReplay.mjs). Pinned against the bundled example.

const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

let replay;
let tourConversation;
let buildContour;
let topicLanes;

test.before(async () => {
  replay = await import("../../src/helpers/conversationReplay.mjs");
  ({ tourConversation } = await import("../../src/helpers/oatsTour.mjs"));
  ({ buildContour } = await import("../../src/helpers/conversationContour.mjs"));
  ({ topicLanes } = await import("../../src/helpers/topicLanes.mjs"));
});

const NOW = Date.parse("2026-10-31T12:00:00Z");
const MINUTE = 60_000;

function setUp() {
  const conversation = tourConversation(example, { now: NOW });
  const timeline = replay.replayTimeline(conversation);
  return { conversation, timeline };
}

test("the timeline runs from the first words to the last, about 29 minutes", () => {
  const { conversation, timeline } = setUp();
  assert.equal(timeline.start, conversation.segments[0].timestamp);
  assert.ok(timeline.duration > 28 * MINUTE && timeline.duration < 30 * MINUTE);
  // The room came back to the launch date twice: the finished lanes' returns.
  const returns = [...timeline.returnsAt.values()].flat();
  assert.equal(returns.length, 2);
  assert.ok(returns.every((at) => at > timeline.start && at <= timeline.end));
});

test("the whole conversation plays in under a minute, and stops at its end", () => {
  const { timeline } = setUp();
  assert.ok(replay.REPLAY_MS < 60_000);
  assert.equal(replay.replayAdvance(timeline, 0, replay.REPLAY_MS), timeline.duration);
  assert.equal(replay.replayAdvance(timeline, timeline.duration, 5_000), timeline.duration);
  assert.equal(replay.replayAdvance(timeline, 10 * MINUTE, -500), 10 * MINUTE);
  const half = replay.replayAdvance(timeline, 0, replay.REPLAY_MS / 2);
  assert.ok(Math.abs(half - timeline.duration / 2) < 1);
});

test("a moment keeps the turns said by then, and the topics raised by then", () => {
  const { timeline } = setUp();
  const early = replay.replayFrame(timeline, 2 * MINUTE);
  assert.ok(early.segments.every((segment) => segment.timestamp <= early.now));
  assert.equal(
    early.segments.length,
    timeline.segments.filter((segment) => segment.timestamp <= early.now).length
  );
  assert.deepEqual(
    early.snapshot.nodes.map((node) => node.label),
    ["launch date"],
    "two minutes in, one topic"
  );
  const hero = replay.replayFrame(timeline, 669_000);
  assert.deepEqual(
    hero.snapshot.nodes.map((node) => node.label),
    ["launch date", "SSO", "SOC"],
    "at 11:09, the hero's moment, three topics"
  );
  // Each topic holds only the turns placed in it by then, and its returns so far.
  for (const node of hero.snapshot.nodes) {
    assert.ok(node.lastAt <= hero.now);
    assert.ok(node.utteranceIds.length > 0);
  }
  assert.equal(hero.snapshot.nodes.find((node) => node.label === "launch date").returns, 1);
  // The topic the room is on is live, the others open, as while recording.
  assert.deepEqual(
    hero.snapshot.nodes.map((node) => node.state),
    ["live", "open", "open"]
  );
});

test("nothing goes backwards as it plays: turns, topics and lanes only grow", () => {
  const { timeline } = setUp();
  let previous = null;
  let rows = 0;
  for (let at = 0; at <= timeline.duration; at += 30_000) {
    const frame = replay.replayFrame(timeline, at, previous ?? undefined);
    if (previous) {
      assert.ok(frame.segments.length >= previous.segments.length, `turns at ${at}`);
      assert.ok(frame.snapshot.nodes.length >= previous.snapshot.nodes.length, `topics at ${at}`);
      // A frame with no new turn keeps the same list.
      if (frame.segments.length === previous.segments.length) {
        assert.equal(frame.segments, previous.segments);
      }
    }
    const lanes = topicLanes({
      snapshot: frame.snapshot,
      segments: frame.segments,
      start: timeline.start,
      end: frame.now,
      live: true,
    });
    assert.ok(lanes.rows.length >= rows, `rows at ${at}`);
    rows = lanes.rows.length;
    previous = frame;
  }
  assert.equal(rows, 8, "every topic has its lane by the end");
});

test("the graph's links grow with the replay, returns when the room came back", () => {
  const { conversation, timeline } = setUp();
  const returns = (frame) => frame.snapshot.edges.filter((edge) => edge.kind === "return");
  const firstReturn = Math.min(...[...timeline.returnsAt.values()].flat()) - timeline.start;

  assert.equal(returns(replay.replayFrame(timeline, firstReturn - 1)).length, 0);
  assert.equal(returns(replay.replayFrame(timeline, firstReturn)).length, 1);

  let links = 0;
  for (let at = 0; at <= timeline.duration; at += MINUTE) {
    const { snapshot } = replay.replayFrame(timeline, at);
    assert.ok(snapshot.edges.length >= links, `the links went backwards at ${at}`);
    links = snapshot.edges.length;
    const raised = new Set(snapshot.nodes.map((node) => node.id));
    for (const edge of snapshot.edges) {
      assert.ok(raised.has(edge.from) && raised.has(edge.to), "a link to a topic not raised yet");
    }
  }
  const moved = replay.replayFrame(timeline, 24 * MINUTE).snapshot;
  assert.ok(moved.edges.length >= moved.nodes.length - 1, "a moment with topics and no links");

  // The last frame is the record's own map.
  const end = replay.replayFrame(timeline, timeline.duration);
  assert.deepEqual(end.snapshot.edges, conversation.snapshot.edges);
});

test("the end is the record itself, finished", () => {
  const { conversation, timeline } = setUp();
  const end = replay.replayFrame(timeline, timeline.duration);
  assert.equal(end.finished, true);
  assert.equal(end.segments.length, conversation.segments.length);
  assert.equal(end.snapshot.nodes, timeline.nodes);
  assert.equal(replay.replayFrame(timeline, timeline.duration + MINUTE).at, timeline.duration);
  assert.equal(replay.replayFrame(timeline, -5).at, 0);
});

test("the contour grows left to right on the whole conversation's axis", () => {
  const { conversation, timeline } = setUp();
  const finished = buildContour({
    utterances: conversation.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      timestamp: segment.timestamp,
    })),
    questions: [],
  });
  const middle = replay.replayContour(finished, timeline, timeline.duration / 2);
  assert.equal(middle.span, finished.span, "the axis does not rescale");
  const cut = middle.points[middle.points.length - 1].x;
  assert.ok(cut > 0.45 && cut < 0.55, `the line ends at the middle (${cut})`);
  assert.ok(middle.points.every((point) => point.x <= cut));
  assert.equal(replay.replayContour(finished, timeline, timeline.duration), finished);
});

test("a question's mark appears when asked, and settles when the room answers", async () => {
  const { conversation, timeline } = setUp();
  const { buildConversationGraph } = await import("../../src/helpers/conversationGraph.mjs");
  const graph = buildConversationGraph(conversation.events).filter((node) => node.question);
  const finished = buildContour({
    utterances: conversation.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      timestamp: segment.timestamp,
    })),
    questions: graph.map((node) => ({
      id: node.key,
      state: node.response ? "answered" : "asked",
      createdAt: node.question.createdAt,
      groupKey: node.key,
    })),
  });
  const first = graph[0];
  const asked = first.question.createdAt - timeline.start;
  const answered = first.response.createdAt - timeline.start;
  assert.ok(answered > asked);
  const before = replay.replayContour(finished, timeline, asked - 1_000);
  assert.ok(!before.marks.some((mark) => mark.id === first.key), "not asked yet");
  const waiting = replay.replayContour(finished, timeline, (asked + answered) / 2);
  assert.equal(waiting.marks.find((mark) => mark.id === first.key).state, "asked");
  const settled = replay.replayContour(finished, timeline, answered + 1_000);
  assert.equal(settled.marks.find((mark) => mark.id === first.key).state, "answered");
  // By the end every mark the finished contour draws is on the line, as it ended.
  const end = replay.replayContour(finished, timeline, timeline.duration);
  assert.deepEqual(
    end.marks.map((mark) => mark.state),
    finished.marks.map((mark) => mark.state)
  );
});
