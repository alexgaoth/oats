const test = require("node:test");
const assert = require("node:assert/strict");

let CHANGE_RULE;
let SCALES;
let TopicChangeDetector;
let changeScore;
let gapFeatures;
let makeTurn;
let openingCues;
let ConversationTopicTracker;

test.before(async () => {
  ({ CHANGE_RULE, SCALES, TopicChangeDetector, changeScore, gapFeatures, makeTurn, openingCues } =
    await import("../../src/helpers/topicChange.mjs"));
  ({ ConversationTopicTracker } = await import("../../src/helpers/conversationTopics.mjs"));
});

// One tree on one feature: a turn that opens with "okay" scores 0.98, any other 0.02.
const OKAY_MODEL = {
  features: ["okay"],
  threshold: 0.5,
  base: 0,
  trees: [{ f: [0], t: [0.5], l: [-1], r: [-2], v: [-4, 4] }],
};

const vector = (...values) => Float32Array.from(values);

function turn(index, text, start, { keys = text.split(" "), vec = vector(1, 0) } = {}) {
  const made = makeTurn({
    id: `t${index}`,
    text,
    start,
    end: start + 5,
    words: text.split(" ").length,
    keys,
  });
  made.vector = vec;
  return made;
}

function feed(detector, turns) {
  turns.forEach((item, index) => {
    detector.addTurn({
      id: `t${index}`,
      text: item.text,
      keys: item.text.split(" "),
      words: item.text.split(" ").length,
      start: item.start,
      end: item.start + 5,
    });
    detector.addVector(`t${index}`, vector(1, 0));
    detector.advance(item.start + 5);
  });
}

test("a turn's opening reads through filler and punctuation", () => {
  assert.deepEqual(openingCues("Um, okay. So what's next on the agenda?"), {
    cue: 1,
    okay: 1,
    phnext: 1,
    phlets: 0,
    phfirst: 0,
    phpresent: 0,
  });
  const quiet = openingCues("The blue one was cheaper than the red one.");
  assert.equal(quiet.cue, 0);
  assert.equal(quiet.okay, 0);
  assert.equal(openingCues("All right, let's look at the budget").okay, 1);
  assert.equal(openingCues("All right, let's look at the budget").phlets, 1);
});

test("the features compare the two sides of a pause", () => {
  const turns = [
    turn(0, "budget price budget", 0, { vec: vector(1, 0) }),
    turn(1, "budget price", 10, { vec: vector(1, 0) }),
    turn(2, "battery screen", 20, { vec: vector(0, 1) }),
    turn(3, "battery", 30, { vec: vector(0, 1) }),
  ];
  const firstSeen = new Map();
  turns.forEach((item, index) => {
    for (const key of item.keys) if (!firstSeen.has(key)) firstSeen.set(key, index);
  });
  const change = gapFeatures(turns, 2, { lag: 45, firstSeen });
  assert.ok(Math.abs(change.E30) < 1e-6, "other meaning");
  assert.equal(change.L30, 0, "no word shared");
  assert.equal(change.N30, 1, "every word after the pause is new");
  const same = gapFeatures(turns, 1, { lag: 45, firstSeen });
  assert.ok(same.E30 > 0.4);
  assert.ok(same.L30 > 0.4);
  assert.equal(same.gap, Math.log1p(5));
  // Nothing past `lag` is read: the right window stops at the lag.
  const far = gapFeatures(turns, 1, { lag: 10, firstSeen });
  assert.equal(far.WR30, 2 / 10);
  assert.ok(Object.keys(change).includes(`E${SCALES.at(-1)}`));
});

test("the score is the trees' sum through the logistic", () => {
  assert.ok(changeScore({ okay: 1 }, OKAY_MODEL) > 0.97);
  assert.ok(changeScore({ okay: 0 }, OKAY_MODEL) < 0.03);
});

test("a pause becomes a cut only after the lag and the hold", () => {
  const detector = new TopicChangeDetector({ model: OKAY_MODEL, lag: 40, hold: 20, spacing: 60 });
  feed(detector, [
    { text: "one thing", start: 0 },
    { text: "another thing", start: 10 },
    { text: "okay something else", start: 100 },
  ]);
  assert.deepEqual(detector.cuts, []);
  assert.equal(detector.proposedId(), null, "not read yet");
  feed2(detector, 3, [{ text: "more of it", start: 135 }]);
  detector.advance(145);
  assert.equal(detector.proposedId(), "t2", "read, and still weighed");
  assert.deepEqual(detector.cuts, []);
  feed2(detector, 4, [
    { text: "and more", start: 150 },
    { text: "and still more", start: 185 },
  ]);
  detector.advance(190);
  assert.deepEqual(detector.cuts, [2]);
  assert.equal(detector.proposedId(), null);
});

function feed2(detector, from, turns) {
  turns.forEach((item, index) => {
    detector.addTurn({
      id: `t${from + index}`,
      text: item.text,
      keys: item.text.split(" "),
      words: item.text.split(" ").length,
      start: item.start,
      end: item.start + 5,
    });
    detector.addVector(`t${from + index}`, vector(1, 0));
  });
}

test("two cuts keep their distance, and the stronger pause in the hold wins", () => {
  const detector = new TopicChangeDetector({ model: OKAY_MODEL, lag: 10, hold: 10, spacing: 100 });
  feed(detector, [
    { text: "start here", start: 0 },
    { text: "okay first change", start: 30 },
    { text: "plain turn", start: 60 },
    { text: "okay too soon", start: 90 },
    { text: "plain turn", start: 120 },
    { text: "okay far enough", start: 150 },
    { text: "plain turn", start: 180 },
    { text: "plain turn", start: 210 },
  ]);
  assert.deepEqual(detector.cuts, [1, 5]);
});

test("the far side's vectors are waited for, for a while", () => {
  const detector = new TopicChangeDetector({ model: OKAY_MODEL, lag: 10, hold: 5, spacing: 10 });
  const add = (index, text, start) =>
    detector.addTurn({ id: `t${index}`, text, keys: [], words: 3, start, end: start + 2 });
  add(0, "one thing here", 0);
  add(1, "okay new thing", 20);
  add(2, "plain turn again", 40);
  detector.advance(35);
  assert.equal(detector.next, 1, "no vector yet");
  detector.addVector("t1", vector(1, 0));
  detector.addVector("t2", vector(1, 0));
  detector.advance(35);
  assert.equal(detector.next, 2, "read once its vectors came");
  const late = new TopicChangeDetector({ model: OKAY_MODEL, lag: 10, hold: 5, spacing: 10 });
  late.addTurn({ id: "a", text: "x", keys: [], words: 1, start: 0, end: 1 });
  late.addTurn({ id: "b", text: "okay y", keys: [], words: 2, start: 20, end: 21 });
  late.advance(55);
  assert.equal(late.next, 2, "read without them once the wait is over");
});

test("the final cuts read the last pauses and change nothing", () => {
  const detector = new TopicChangeDetector({ model: OKAY_MODEL, lag: 40, hold: 20, spacing: 60 });
  feed(detector, [
    { text: "one thing", start: 0 },
    { text: "okay last subject", start: 100 },
  ]);
  assert.deepEqual(detector.finalCuts(), [1]);
  assert.deepEqual(detector.finalCuts(), [1]);
  assert.deepEqual(detector.cuts, []);
  assert.equal(detector.next, 1);
});

test("the tracker cuts by the detector once vectors come, and by words until then", () => {
  const tracker = new ConversationTopicTracker({
    now: () => 0,
    detector: { model: OKAY_MODEL, lag: 10, hold: 5, spacing: 30 },
  });
  const say = (index, text, start) => {
    tracker.onUtterance({ id: `u${index}`, text, at: start * 1000, start, end: start + 3 });
    tracker.addVectors({ utterances: [[`u${index}`, [1, 0]]] });
  };
  say(1, "We should settle the price of the launch", 0);
  say(2, "The launch price has to be lower", 20);
  say(3, "Okay the battery lasts two days", 40);
  say(4, "Two days of battery is plenty", 60);
  say(5, "A battery that size is heavy", 80);
  say(6, "Heavy batteries cost more to ship", 100);
  const live = tracker.snapshot(120);
  assert.equal(live.nodes.length, 2);
  assert.deepEqual(live.nodes[0].utteranceIds, ["u1", "u2"]);
  const record = tracker.snapshot(120, { final: true });
  assert.equal(record.nodes.length, 2);

  const lexical = new ConversationTopicTracker({ now: () => 0, detector: { model: OKAY_MODEL } });
  lexical.onUtterance({ id: "a", text: "Okay the budget for launch", at: 0 });
  assert.equal(lexical.detector.cuts.length, 0);
  assert.equal(lexical.snapshot(1).nodes.length, 1);
});

test("the rule's settings are the measured ones", () => {
  assert.deepEqual({ ...CHANGE_RULE }, { lag: 45, hold: 15, spacing: 90 });
});

test("when the vectors stop, the tracker goes back to its own cuts", () => {
  const tracker = new ConversationTopicTracker({
    now: () => 0,
    detector: { model: OKAY_MODEL, lag: 10, hold: 5, spacing: 30 },
  });
  tracker.onUtterance({ id: "a", text: "The launch price", at: 0, start: 0, end: 3 });
  tracker.addVectors({ utterances: [["a", [1, 0]]] });
  assert.equal(tracker._detectorOn, true);
  tracker.onUtterance({ id: "b", text: "The launch date", at: 200_000, start: 200, end: 203 });
  assert.equal(tracker._detectorOn, false);
  assert.equal(tracker.snapshot(200_000).nodes.length, 1);
});
