const test = require("node:test");
const assert = require("node:assert/strict");

// The lanes (src/helpers/topicLanes.mjs): one row per topic and one line for
// the room, read from which topic each utterance was placed in.

const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

let topicLanes, runAt, lanePath, MIN_RUN_MS, LANE_ROW_PX, LANE_BEND_PX;

test.before(async () => {
  ({ topicLanes, runAt, lanePath, MIN_RUN_MS, LANE_ROW_PX, LANE_BEND_PX } =
    await import("../../src/helpers/topicLanes.mjs"));
});

const START = 1_800_000_000_000;
const S = 1000;

// A topic with its utterances, as the tracker stores it.
const node = (id, label, over = {}) => ({
  id,
  label,
  words: [],
  durationMs: 60_000,
  utteranceIds: [],
  firstAt: START,
  lastAt: START,
  returns: 0,
  state: "open",
  ...over,
});

// A conversation written as `[topic id, seconds]` turns, one turn per stop:
// the snapshot's nodes get the turns' ids, the segments their moments.
function conversation(turns, nodes, { spokenMs = 4000 } = {}) {
  const segments = turns.map(([, seconds], index) => ({
    id: `u${index}`,
    text: "words",
    timestamp: START + seconds * S,
    startMs: seconds * S,
    endMs: seconds * S + spokenMs,
  }));
  const byTopic = new Map();
  turns.forEach(([topic], index) => {
    if (topic == null) return;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(`u${index}`);
  });
  const placedNodes = nodes.map((item) => {
    const ids = byTopic.get(item.id) ?? [];
    const times = ids.map((id) => segments[Number(id.slice(1))].timestamp);
    return {
      ...item,
      utteranceIds: item.utteranceIds.length ? item.utteranceIds : ids,
      firstAt: times.length ? Math.min(...times) : item.firstAt,
      lastAt: times.length ? Math.max(...times) : item.lastAt,
    };
  });
  return { snapshot: { nodes: placedNodes, edges: [] }, segments };
}

const labelsOf = (lanes, ids) =>
  ids.map((id) => lanes.rows.find((row) => row.id === id)?.label ?? `#${id}`);

// ------------------------------------------------------------ the example

test("the example has 8 rows in the order raised and 11 runs", () => {
  const lanes = topicLanes({
    snapshot: example.note.conversation_topics,
    segments: example.note.transcript,
  });
  assert.deepEqual(
    lanes.rows.map((row) => row.label),
    [
      "launch date",
      "sso saml",
      "soc audit",
      "discount pricing",
      "data migration",
      "support queue",
      "import bug",
      "news embargo",
    ]
  );
  assert.equal(lanes.runs.length, 11);
  assert.deepEqual(
    labelsOf(
      lanes,
      lanes.runs.map((run) => run.topic)
    ),
    [
      "launch date",
      "sso saml",
      "soc audit",
      "launch date",
      "discount pricing",
      "sso saml",
      "data migration",
      "support queue",
      "import bug",
      "news embargo",
      "launch date",
    ]
  );
  assert.equal(lanes.now, null, "a finished conversation has no now");
  assert.equal(lanes.empty, false);
});

test("the example returns to the launch date twice and to SSO once", () => {
  const lanes = topicLanes({
    snapshot: example.note.conversation_topics,
    segments: example.note.transcript,
  });
  assert.deepEqual(
    labelsOf(
      lanes,
      lanes.returns.map((item) => item.topic)
    ),
    ["launch date", "sso saml", "launch date"]
  );
  assert.deepEqual(
    labelsOf(
      lanes,
      lanes.returns.map((item) => item.previous)
    ),
    ["soc audit", "discount pricing", "news embargo"]
  );
  const back = Object.fromEntries(lanes.rows.map((row) => [row.label, row.back]));
  assert.equal(back["launch date"], 2);
  assert.equal(back["sso saml"], 1);
  assert.equal(back["soc audit"], 0);
});

test("the example's runs are contiguous and fill the axis from the first words", () => {
  const lanes = topicLanes({
    snapshot: example.note.conversation_topics,
    segments: example.note.transcript,
  });
  assert.equal(lanes.runs[0].from, 0);
  assert.equal(lanes.runs.at(-1).to, 1);
  for (let i = 1; i < lanes.runs.length; i += 1) {
    assert.equal(lanes.runs[i].from, lanes.runs[i - 1].to, `run ${i} starts where ${i - 1} ends`);
    assert.ok(lanes.runs[i].to > lanes.runs[i].from);
  }
  // The axis is the conversation's first words to its last.
  const first = Math.min(...example.note.transcript.map((segment) => segment.timestamp));
  assert.equal(lanes.start, first);
});

// ------------------------------------------------------------ live

test("while recording, the line runs to now and ends on the topic now", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 5],
      [1, 30],
      [1, 70],
      [2, 100],
      [2, 130],
      [1, 160],
      [1, 175],
    ],
    [node(1, "pricing", { state: "live" }), node(2, "hiring")]
  );
  const now = START + 190 * S;
  const lanes = topicLanes({ snapshot, segments, start: START, end: now, live: true });
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1, 2, 1]
  );
  assert.equal(lanes.runs[0].from, 5 / 190, "the line starts at the first words, not the press");
  assert.equal(lanes.runs.at(-1).to, 1, "the line runs on to now");
  assert.equal(lanes.now, 1);
  assert.deepEqual(lanes.returns, [{ topic: 1, previous: 2, at: 160 / 190 }]);
});

test("the topic the room has only just come back to is not a blip while recording", () => {
  const { snapshot, segments } = conversation(
    [
      [2, 0],
      [2, 40],
      [1, 60],
      [1, 100],
      [2, 120], // back on hiring ten seconds ago
      [2, 126],
    ],
    [node(1, "pricing"), node(2, "hiring", { state: "live" })]
  );
  const window = { snapshot, segments, start: START, end: START + 130 * S };
  const live = topicLanes({ ...window, live: true });
  assert.deepEqual(
    live.runs.map((run) => run.topic),
    [2, 1, 2]
  );
  assert.equal(live.now, 2);
  assert.equal(live.returns.length, 1);
  // The same ten seconds at the end of a finished conversation are a blip.
  const finished = topicLanes(window);
  assert.deepEqual(
    finished.runs.map((run) => run.topic),
    [2, 1]
  );
});

// ------------------------------------------------------------ empty, single

test("no snapshot, no topics or no speech draws nothing", () => {
  for (const snapshot of [null, undefined, {}, { nodes: [] }, { nodes: "nope" }]) {
    const lanes = topicLanes({ snapshot, segments: [] });
    assert.deepEqual(lanes.rows, []);
    assert.deepEqual(lanes.runs, []);
    assert.deepEqual(lanes.returns, []);
    assert.equal(lanes.now, null);
    assert.equal(lanes.empty, true);
    assert.equal(runAt(lanes, START), null);
  }
  const silent = topicLanes({ snapshot: { nodes: [node(1, "pricing")] }, segments: null });
  assert.equal(silent.empty, false, "a topic is a row even with no speech to place it");
  assert.deepEqual(silent.runs, []);
  assert.equal(lanePath({ runs: silent.runs, rows: new Map([[1, 0]]), width: 400 }), null);
});

test("one topic is one row and one run, with no returns", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 0],
      [1, 30],
      [1, 61],
    ],
    [node(1, "pricing")]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.equal(lanes.rows.length, 1);
  assert.deepEqual(lanes.runs, [{ topic: 1, from: 0, to: 1 }]);
  assert.deepEqual(lanes.returns, []);
  assert.equal(lanes.span, 65 * S, "first words to the end of the last");
});

// ------------------------------------------------------------ what is a row

test("a topic whose utterances are not in the transcript keeps its row and gets no run", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 0],
      [1, 40],
      [2, 80],
      [2, 120],
    ],
    [
      node(1, "pricing"),
      node(2, "hiring"),
      // Stored before transcripts kept their ids: its ids match nothing.
      node(3, "budget", { utteranceIds: ["legacy-1", "legacy-2"], firstAt: START + 50 * S }),
    ]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.deepEqual(
    lanes.rows.map((row) => row.label),
    ["pricing", "budget", "hiring"],
    "still in the order raised"
  );
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1, 2],
    "the line passes it by"
  );
  assert.ok(!lanes.runs.some((run) => run.topic === 3));
});

test("a conversation whose transcript matches no topic has rows and no line", () => {
  const snapshot = {
    nodes: [
      node(1, "pricing", { utteranceIds: ["a"] }),
      node(2, "hiring", { utteranceIds: ["b"], firstAt: START + 1 }),
    ],
  };
  const segments = [
    { id: "legacy-0", text: "x", timestamp: START },
    { id: "legacy-1", text: "y", timestamp: START + 60 * S },
  ];
  const lanes = topicLanes({ snapshot, segments });
  assert.equal(lanes.rows.length, 2);
  assert.deepEqual(lanes.runs, []);
  assert.deepEqual(lanes.returns, []);
});

test("a topic too short to show has no row, and its turns do not break the line", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 0],
      [1, 30],
      [9, 60],
      [1, 70],
      [1, 100],
    ],
    [node(1, "pricing"), node(9, "aside", { durationMs: 1500 })]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.deepEqual(
    lanes.rows.map((row) => row.id),
    [1]
  );
  assert.deepEqual(lanes.runs, [{ topic: 1, from: 0, to: 1 }]);
});

// ------------------------------------------------------------ blips

test("a blip gives its time to the run before it, so no false return is drawn", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 0],
      [1, 60],
      [2, 120],
      [2, 180],
      [1, 240], // ten seconds back on pricing, then hiring again
      [2, 250],
      [2, 300],
    ],
    [node(1, "pricing"), node(2, "hiring")]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.ok(10 * S < MIN_RUN_MS);
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1, 2]
  );
  assert.deepEqual(lanes.returns, []);
  assert.equal(lanes.runs[1].to, 1);
});

test("a short run that is all its topic has is kept, so its row has a line", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 0],
      [1, 60],
      [2, 120], // fifteen seconds on hiring, and never again
      [2, 128],
      [1, 135],
      [1, 200],
    ],
    [node(1, "pricing"), node(2, "hiring", { durationMs: 8000 })]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1, 2, 1]
  );
  assert.equal(lanes.returns.length, 1);
});

test("a blip at the start gives its time to the run after it", () => {
  const { snapshot, segments } = conversation(
    [
      [2, 0], // hiring for five seconds, then pricing at length
      [1, 5],
      [1, 60],
      [1, 120],
      [2, 180],
      [2, 240],
    ],
    [node(1, "pricing"), node(2, "hiring")]
  );
  const lanes = topicLanes({ snapshot, segments });
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1, 2]
  );
  assert.equal(lanes.runs[0].from, 0);
  assert.deepEqual(lanes.returns, []);
});

test("speech outside the window is dropped, not clamped onto its edge", () => {
  const { snapshot, segments } = conversation(
    [
      [2, -600], // an earlier sitting, seeded into a resumed recording
      [1, 10],
      [1, 50],
    ],
    [node(1, "pricing"), node(2, "hiring")]
  );
  const lanes = topicLanes({ snapshot, segments, start: START, end: START + 60 * S, live: true });
  assert.deepEqual(
    lanes.runs.map((run) => run.topic),
    [1]
  );
  assert.equal(lanes.runs[0].from, 10 / 60);
});

// ------------------------------------------------------------ runAt

test("a moment belongs to the run that holds it, or to the nearest one", () => {
  const { snapshot, segments } = conversation(
    [
      [1, 10],
      [1, 50],
      [2, 100],
      [2, 150],
    ],
    [node(1, "pricing"), node(2, "hiring")]
  );
  const lanes = topicLanes({ snapshot, segments, start: START, end: START + 200 * S });
  assert.equal(runAt(lanes, START + 60 * S).topic, 1);
  assert.equal(runAt(lanes, START + 120 * S).topic, 2);
  assert.equal(runAt(lanes, START + 1 * S).topic, 1, "before the line starts");
  assert.equal(runAt(lanes, START + 900 * S).topic, 2, "after it ends");
  assert.equal(runAt(lanes, Number.NaN), null);
  assert.equal(runAt(null, START), null);
});

// ------------------------------------------------------------ lanePath

const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("the line runs along a row and bends to the next at the switch", () => {
  const runs = [
    { topic: 1, from: 0, to: 0.5 },
    { topic: 2, from: 0.5, to: 1 },
  ];
  const rows = new Map([
    [1, 0],
    [2, 2],
  ]);
  const d = lanePath({ runs, rows, width: 400 });
  const row = (index) => index * LANE_ROW_PX + LANE_ROW_PX / 2;
  assert.equal(
    d,
    `M 0 ${row(0)} L ${200 - LANE_BEND_PX} ${row(0)} C 200 ${row(0)} 200 ${row(2)} ${200 + LANE_BEND_PX} ${row(2)} L 400 ${row(2)}`
  );
});

test("a bend narrows for a short run, so the line never doubles back", () => {
  const runs = [
    { topic: 1, from: 0, to: 0.3 },
    { topic: 2, from: 0.3, to: 0.31 }, // 4px wide at 400px
    { topic: 3, from: 0.31, to: 0.32 },
    { topic: 1, from: 0.32, to: 1 },
  ];
  const rows = new Map([
    [1, 0],
    [2, 1],
    [3, 2],
  ]);
  const d = lanePath({ runs, rows, width: 400 });
  // Every x in the path, in drawing order, including control points.
  const values = numbers(d);
  const xs = values.filter((_, index) => index % 2 === 0);
  for (let i = 1; i < xs.length; i += 1) {
    assert.ok(xs[i] >= xs[i - 1], `x goes back at ${i}: ${xs[i - 1]} -> ${xs[i]}`);
  }
  assert.equal(xs[0], 0);
  assert.equal(xs.at(-1), 400);
});

test("a run on a topic with no row is skipped, and nothing is drawn unmeasured", () => {
  const runs = [
    { topic: 1, from: 0, to: 0.5 },
    { topic: 7, from: 0.5, to: 1 },
  ];
  const rows = new Map([[1, 0]]);
  assert.equal(lanePath({ runs, rows, width: 400 }), `M 0 15 L 200 15`);
  assert.equal(lanePath({ runs, rows, width: 0 }), null);
  assert.equal(lanePath({ runs: [], rows, width: 400 }), null);
});
