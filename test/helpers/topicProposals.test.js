const test = require("node:test");
const assert = require("node:assert/strict");

let TopicProposals;
test.before(async () => {
  ({ TopicProposals } = await import("../../src/helpers/topicProposals.mjs"));
});

function replay(pauses, scores = {}) {
  const detector = {
    turns: [0, ...pauses].map((start) => ({ id: String(start), start, end: start + 1 })),
    cuts: [],
  };
  const proposals = new TopicProposals(detector, {
    score: (g) => scores[detector.turns[g].start] ?? 0.45,
  });
  return { detector, proposals };
}

test("opens the strongest ready pause and holds at most one mark", () => {
  const { proposals } = replay([10, 15, 20], { 10: 0.44, 20: 0.9 });
  proposals.advance(44);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(45);
  assert.deepEqual(proposals.snapshot(), [
    { id: "proposal-15", startId: "15", at: 15, state: "grey", since: 45 },
  ]);
  proposals.advance(60);
  assert.deepEqual(
    proposals.snapshot().map((mark) => mark.at),
    [15]
  );
});

test("uses the arrival watermark and settles between ticks at the same position", () => {
  const { detector, proposals } = replay([15, 35]);
  proposals.advance(45, 44);
  proposals.advance(59, 59);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(60);
  const [grey] = proposals.snapshot();
  assert.equal(grey.at, 15);
  detector.cuts.push(2);
  proposals.observeCuts(62);
  assert.deepEqual(proposals.snapshot(), [{ ...grey, state: "solid", since: 62 }]);
  assert.equal(grey.state, "grey");
});

test("fades on the first tick at expiration and a late cut cannot revive it", () => {
  const { detector, proposals } = replay([10]);
  proposals.advance(45);
  proposals.advance(60);
  assert.equal(proposals.snapshot()[0].state, "grey");
  proposals.advance(75);
  assert.equal(proposals.snapshot()[0].state, "faded");
  detector.cuts.push(1);
  proposals.observeCuts(79);
  assert.equal(proposals.snapshot()[0].state, "faded");
  proposals.advance(90);
  assert.deepEqual(proposals.snapshot(), []);
});

test("allows spacing at 90 seconds but not one second earlier", () => {
  const { detector, proposals } = replay([10, 25, 99, 100], { 99: 1 });
  detector.cuts.push(1);
  proposals.advance(60);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(135);
  assert.equal(proposals.snapshot()[0].at, 100);
});

test("blocks openings after three fades until the oldest leaves the rolling hour", () => {
  const { proposals } = replay([10, 100, 190, 280, 3630]);
  for (const [open, fade] of [
    [45, 75],
    [135, 165],
    [225, 255],
  ]) {
    proposals.advance(open);
    assert.equal(proposals.snapshot().at(-1).state, "grey");
    proposals.advance(fade);
    assert.equal(proposals.snapshot().at(-1).state, "faded");
  }
  proposals.advance(315);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(3660);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(3675);
  assert.equal(proposals.snapshot()[0].at, 3630);
});
