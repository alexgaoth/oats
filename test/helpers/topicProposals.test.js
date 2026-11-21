const test = require("node:test");
const assert = require("node:assert/strict");

let TopicProposals, TopicChangeDetector;
test.before(async () => {
  ({ TopicProposals } = await import("../../src/helpers/topicProposals.mjs"));
  ({ TopicChangeDetector } = await import("../../src/helpers/topicChange.mjs"));
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

function bands(pauses, score, options = {}) {
  const detector = new TopicChangeDetector({
    model: { base: 1, features: [], trees: [] },
    threshold: 0.5,
  });
  for (const start of [0, ...pauses]) {
    detector.addTurn({
      id: String(start),
      text: "some words",
      keys: ["words"],
      words: 2,
      start,
      end: start + 1,
    });
    detector.addVector(String(start), [1]);
  }
  const proposals = new TopicProposals(detector, {
    greyFloor: 0.4,
    score: (g, lag) => score(detector.turns[g].start, lag),
    ...options,
  });
  return { detector, proposals };
}

test("commits at the first complete 15 s read and preserves spacing and the slow fallback", () => {
  const { detector, proposals } = bands([5, 21, 110, 111, 205, 222], (start) =>
    [21, 110, 111].includes(start) ? 0.45 : 0
  );
  // The slow detector holds an older candidate. It must not escape after the early cut.
  detector.advance(50);
  assert.equal(detector.proposedId(), "5");
  detector.turns[2].vector = null;
  proposals.advance(50, 50);
  assert.deepEqual(detector.cuts, []);
  detector.addVector("21", [1]);
  proposals.advance(50.2, 50);
  assert.deepEqual(detector.cuts, [2]);
  assert.equal(detector.proposedId(), null);
  assert.equal(detector.commitEarlyCut(1), false);
  proposals.advance(126, 126);
  assert.deepEqual(detector.cuts, [2, 4]);
  detector.advance(250);
  assert.equal(detector.proposedId(), "205");
  detector.advance(267);
  assert.deepEqual(detector.cuts, [2, 4, 5]);
});

test("opens the strongest eligible grey at a tick, then commits on the 30 s reread", () => {
  const { detector, proposals } = bands([9, 10, 20], (start, lag) =>
    start === 10 ? (lag === 30 ? 0.45 : 0.42) : start === 9 ? 0.4 : 0.39
  );
  proposals.advance(15);
  proposals.advance(29);
  assert.deepEqual(proposals.snapshot(), []);
  proposals.advance(30);
  assert.equal(proposals.snapshot().at(-1).at, 10);
  assert.equal(proposals.deadline(), 75);
  proposals.advance(39.9);
  assert.deepEqual(detector.cuts, []);
  proposals.advance(40);
  assert.deepEqual(detector.cuts, [2]);
  assert.equal(proposals.snapshot().at(-1).state, "solid");
});

test("settles a grey within 20 s of a cut but never at or past its deadline", () => {
  for (const [at, now, state] of [
    [30, 74.9, "solid"],
    [31, 74.9, "grey"],
    [30, 75, "faded"],
  ]) {
    const { detector, proposals } = bands([10, at], (start) => (start === 10 ? 0.4 : 0));
    proposals.advance(30);
    assert.equal(detector.commitEarlyCut(2), true);
    proposals.advance(now, 30);
    assert.equal(proposals.snapshot().at(-1).state, state);
  }
});

test("the band caps fades in any rolling hour without limiting early cuts", () => {
  const { detector, proposals } = bands([10, 91, 172, 260, 350, 3660], (start) =>
    start === 350 ? 0.45 : 0.4
  );
  for (const [open, fade] of [
    [30, 75],
    [120, 156],
    [195, 237],
  ]) {
    proposals.advance(open);
    assert.equal(proposals.snapshot().at(-1).state, "grey");
    assert.equal(proposals.deadline(), fade);
    proposals.advance(fade);
    assert.equal(proposals.snapshot().at(-1).state, "faded");
  }
  proposals.advance(285);
  proposals.advance(365);
  assert.deepEqual(proposals.snapshot(), []);
  assert.deepEqual(detector.cuts, [5]);
  proposals.advance(3675);
  assert.equal(proposals.snapshot().at(-1).at, 3660);
});

test("asks once for the 90 s before and 15 s after, and accepts confidence 0.8", async () => {
  let now = 120;
  let asked = 0;
  let window;
  const { detector, proposals } = bands(
    [9, 10, 99, 100, 114, 115],
    (start) => (start === 100 ? 0.4 : 0),
    {
      judge: {
        active: () => true,
        now: () => now,
        text: (id) => `turn ${id}`,
        ask: async (input) => {
          asked++;
          window = input;
          return { newSubject: true, confidence: 0.8 };
        },
      },
    }
  );
  proposals.advance(now);
  assert.deepEqual(detector.cuts, []);
  now = 121;
  proposals.advance(now);
  await Promise.resolve();
  assert.equal(asked, 1);
  assert.deepEqual(window, { before: ["turn 10", "turn 99"], after: ["turn 100", "turn 114"] });
  assert.deepEqual(detector.cuts, [4]);
  assert.equal(proposals.snapshot().at(-1).state, "solid");
});

test("an ineligible, failed, or stale judge cannot draw a cut", async () => {
  for (const scenario of [
    "off",
    "rejected",
    "negative",
    "weak",
    "invalid",
    "stopped",
    "expired",
    "settled",
  ]) {
    let now = 30;
    let active = scenario !== "off";
    let resolve, reject, isOpen;
    const result = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const { detector, proposals } = bands([10, 30], (start) => (start === 10 ? 0.42 : 0), {
      judge: {
        now: () => now,
        active: () => active,
        text: (id) => id,
        ask: (_input, current) => {
          assert.equal(isOpen, undefined);
          isOpen = current;
          return result;
        },
      },
    });
    proposals.advance(now);
    assert.equal(isOpen?.(), scenario === "off" ? undefined : true, scenario);
    if (scenario === "stopped") active = false;
    if (scenario === "expired") now = 75;
    if (scenario === "settled") {
      detector.commitEarlyCut(2);
      proposals.advance(now);
    }
    if (["stopped", "expired", "settled"].includes(scenario)) assert.equal(isOpen(), false);
    if (scenario === "rejected") reject(new Error("offline"));
    else
      resolve({
        newSubject: scenario !== "negative",
        confidence: scenario === "weak" ? 0.799 : scenario === "invalid" ? 1.5 : 0.99,
      });
    await Promise.resolve();
    assert.deepEqual(detector.cuts, scenario === "settled" ? [2] : [], scenario);
  }
});
