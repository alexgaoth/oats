const test = require("node:test");
const assert = require("node:assert/strict");

let truth;
let score;
let links;

test.before(async () => {
  truth = await import("../../scripts/lib/return-truth.mjs");
  score = await import("../../scripts/lib/return-score.mjs");
  links = await import("../../scripts/lib/link-score.mjs");
});

// A meeting of stretches: each `[label, words]` is one turn of that many words,
// a second apart, on a top-level topic with that label.
function meeting(stretches) {
  const topics = new Map();
  const utterances = stretches.map(([label, words], index) => {
    const id = `t${index}`;
    topics.set(id, { id, type: label, description: "", parent: null });
    return {
      id: `u${index}`,
      text: new Array(words).fill("word").join(" "),
      start: index,
      end: index + 0.5,
      at: index * 1000,
      refTop: [id],
      refFine: [id],
    };
  });
  return { utterances, topics };
}

const level = { level: "top" };

test("a subject returns at each held stretch after its first", () => {
  const conversation = meeting([
    ["costing", 150],
    ["look and usability", 150],
    ["costing", 150],
  ]);
  const { returns, held } = truth.meetingReturns(conversation, level);
  assert.equal(held.length, 3);
  assert.deepEqual(
    returns.map((item) => [item.subject, item.start]),
    [["costing", 2]]
  );
});

test("a passing remark is not leaving, and a short stretch does not count", () => {
  const passing = meeting([
    ["costing", 150],
    ["look and usability", 40],
    ["costing", 150],
  ]);
  assert.deepEqual(truth.meetingReturns(passing, level).returns, []);
  const short = meeting([
    ["costing", 150],
    ["look and usability", 150],
    ["costing", 40],
  ]);
  assert.deepEqual(truth.meetingReturns(short, level).returns, []);
});

test("a generic label makes no subject, so it cannot return", () => {
  const conversation = meeting([
    ["chitchat", 150],
    ["costing", 150],
    ["chitchat", 150],
  ]);
  assert.deepEqual(truth.meetingReturns(conversation, level).returns, []);
});

function scored(stretches) {
  const conversation = meeting(stretches);
  return { conversation, gold: truth.meetingReturns(conversation, level) };
}

test("a drawn return is right when the room left the subject and came back", () => {
  const item = scored([
    ["costing", 150],
    ["look and usability", 150],
    ["costing", 150],
  ]);
  const drawn = { at: 2000, end: 3000, earlier: [[0, 1000]] };
  const verdict = score.verdictOf(item, drawn);
  assert.equal(verdict.verdict, "right");
  assert.equal(verdict.subject, "costing");
  const found = score.scoreMeeting(item, [drawn]).found;
  assert.equal(found.length, 1);
  assert.equal(found[0].match, drawn);
});

test("a drawn return is wrong on another subject, and when the room never left", () => {
  const other = scored([
    ["costing", 150],
    ["look and usability", 150],
    ["project budget", 150],
  ]);
  assert.equal(
    score.verdictOf(other, { at: 2000, end: 3000, earlier: [[0, 1000]] }).verdict,
    "wrong"
  );
  const stayed = scored([
    ["costing", 150],
    ["costing", 150],
    ["costing", 150],
  ]);
  assert.equal(
    score.verdictOf(stayed, { at: 2000, end: 3000, earlier: [[0, 1000]] }).verdict,
    "wrong"
  );
});

test("a side with no subject leaves a drawn return unverifiable", () => {
  const item = scored([
    ["chitchat", 150],
    ["look and usability", 150],
    ["costing", 150],
  ]);
  assert.equal(
    score.verdictOf(item, { at: 2000, end: 3000, earlier: [[0, 1000]] }).verdict,
    "unverifiable"
  );
});

test("chance reads every pair of runs that are not neighbours", () => {
  const runs = [
    [1, 0, 10],
    [2, 10, 20],
    [3, 20, 30],
    [4, 30, 40],
  ];
  assert.equal(score.chancePairs(runs).length, 3);
});

test("a prediction can be a share of the orders of the history", () => {
  const pairs = [
    { key: "a", linked: true },
    { key: "b", linked: false },
  ];
  const counts = links.confusion(pairs, (pair) => (pair.key === "a" ? 0.75 : 0.5));
  assert.deepEqual(counts, { tp: 0.75, fn: 0.25, fp: 0.5, tn: 0.5 });
  const booleans = links.confusion(pairs, (pair) => pair.key === "a");
  assert.deepEqual(booleans, { tp: 1, fn: 0, fp: 0, tn: 1 });
});

test("a paired interval leaves out a replicate that holds no pair of a kind", () => {
  const groupOf = () => "scenario";
  const seriesOf = (id) => id;
  const pairs = [
    { a: "s1", b: "s2", linked: true },
    { a: "s1", b: "s3", linked: false },
  ];
  for (const id of ["s4", "s5", "s6"]) pairs.push({ a: id, b: id, linked: true, skip: true });
  const paired = links.pairedRates(
    pairs.filter((pair) => !pair.skip),
    () => 1,
    () => 0,
    { seriesOf, groupOf, samples: 200 }
  );
  assert.equal(paired.balance.delta, 0);
  assert.ok(paired.recall.delta === 1);
});
