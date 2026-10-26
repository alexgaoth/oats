const test = require("node:test");
const assert = require("node:assert/strict");

// Feeding the topic tracker sentence vectors (src/helpers/topicVectors.mjs).

let TopicVectorFeeder;

test.before(async () => {
  ({ TopicVectorFeeder } = await import("../../src/helpers/topicVectors.mjs"));
});

// A tracker that records what it was given and offers `phrases` to embed.
function fakeTracker(phrases = []) {
  const queue = phrases.map((key) => ({ key, text: key }));
  return {
    added: [],
    phrasesToEmbed(limit) {
      return queue.splice(0, limit);
    },
    addVectors(vectors) {
      this.added.push(vectors);
    },
  };
}

const vectorsFor = (texts) => ({ success: true, vectors: texts.map((_, index) => [index, 1]) });

test("turns and phrases go out together and come back to the tracker by id and key", async () => {
  const tracker = fakeTracker(["launch date"]);
  const asked = [];
  let changes = 0;
  const feeder = new TopicVectorFeeder({
    tracker,
    embed: async (texts) => {
      asked.push(texts);
      return vectorsFor(texts);
    },
    onChange: () => (changes += 1),
  });
  feeder.observe({ id: "u1", text: "The launch date is Tuesday." });
  await feeder.pump();
  assert.deepEqual(asked, [["The launch date is Tuesday.", "launch date"]]);
  assert.deepEqual(tracker.added, [
    { utterances: [["u1", [0, 1]]], phrases: [["launch date", [1, 1]]] },
  ]);
  assert.equal(changes, 1);
});

test("one request at a time: turns that land meanwhile go in the next one", async () => {
  const tracker = fakeTracker();
  const asked = [];
  let release;
  const feeder = new TopicVectorFeeder({
    tracker,
    embed: async (texts) => {
      asked.push(texts);
      if (asked.length === 1) await new Promise((resolve) => (release = resolve));
      return vectorsFor(texts);
    },
  });
  feeder.observe({ id: "u1", text: "first" });
  feeder.observe({ id: "u2", text: "second" });
  feeder.observe({ id: "u3", text: "third" });
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await feeder.pump();
  assert.deepEqual(asked, [["first"], ["second", "third"]]);
});

test("a failed or malformed answer turns the feeder off, and the names stay lexical", async () => {
  for (const answer of [
    { success: false, error: "Embedding model not available" },
    { success: true, vectors: [] },
    null,
  ]) {
    const tracker = fakeTracker();
    let calls = 0;
    const feeder = new TopicVectorFeeder({
      tracker,
      embed: async () => {
        calls += 1;
        return answer;
      },
    });
    feeder.observe({ id: "u1", text: "one" });
    await feeder.pump();
    feeder.observe({ id: "u2", text: "two" });
    await feeder.pump();
    assert.equal(calls, 1);
    assert.deepEqual(tracker.added, []);
  }
});

test("a thrown request turns it off too, and no embedding function means no requests", async () => {
  const tracker = fakeTracker();
  const feeder = new TopicVectorFeeder({
    tracker,
    embed: async () => {
      throw new Error("worker crashed");
    },
  });
  feeder.observe({ id: "u1", text: "one" });
  await feeder.pump();
  assert.equal(feeder.off, true);
  const none = new TopicVectorFeeder({ tracker, embed: undefined });
  none.observe({ id: "u1", text: "one" });
  await none.pump();
  assert.deepEqual(tracker.added, []);
});

test("after stop, an answer in flight changes nothing", async () => {
  const tracker = fakeTracker();
  let release;
  const feeder = new TopicVectorFeeder({
    tracker,
    embed: async (texts) => {
      await new Promise((resolve) => (release = resolve));
      return vectorsFor(texts);
    },
  });
  feeder.observe({ id: "u1", text: "one" });
  feeder.stop();
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(tracker.added, []);
});

test("a turn with no words or no id is not sent", async () => {
  const tracker = fakeTracker();
  const asked = [];
  const feeder = new TopicVectorFeeder({
    tracker,
    embed: async (texts) => {
      asked.push(texts);
      return vectorsFor(texts);
    },
  });
  feeder.observe({ id: "u1", text: "   " });
  feeder.observe({ text: "no id" });
  await feeder.pump();
  assert.deepEqual(asked, []);
});
