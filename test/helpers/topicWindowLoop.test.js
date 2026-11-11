const test = require("node:test");
const assert = require("node:assert/strict");

let WindowTopicLoop;
let WINDOW_STRIDE_MS;
let WINDOW_MS;

test.before(async () => {
  ({ WindowTopicLoop, WINDOW_STRIDE_MS, WINDOW_MS } =
    await import("../../src/helpers/topicWindowLoop.mjs"));
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A clock the test moves: timers run when it passes them, in order. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        let due = null;
        for (const [id, timer] of timers) {
          if (timer.at <= until && (!due || timer.at < due[1].at)) due = [id, timer];
        }
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}

const wordsOf = (count, stem) =>
  Array.from({ length: count }, (_, index) => `${stem}${index}`).join(" ");

const answer = (segments, fresh = [], rename = []) =>
  JSON.stringify({ segments, new: fresh, rename });

function setup(options = {}) {
  const clock = fakeClock();
  const asked = [];
  const answers = [];
  let changes = 0;
  const loop = new WindowTopicLoop({
    ask: async (request) => {
      asked.push(request);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next ?? "";
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: () => {
      changes += 1;
    },
    ...options,
  });
  let count = 0;
  /** One line of `words` words, said now. */
  const say = (words = 10, stem = "w") => {
    count += 1;
    loop.onUtterance({ id: `u${count}`, text: wordsOf(words, stem), at: clock.now() });
    return `u${count}`;
  };
  const topicOf = (id) => loop.topicOf.get(id);
  return { clock, loop, asked, answers, say, topicOf, changes: () => changes };
}

test("a line shows at once; the first request waits for 25 words", async () => {
  const { clock, loop, asked, say } = setup();
  say(10);
  say(10);
  await clock.tick(5_000);
  assert.equal(asked.length, 0);
  assert.equal(loop.snapshot().nodes.length, 1);
  say(10);
  await clock.tick(2_000);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].kind, "window");
  assert.match(asked[0].user, /^TOPICS: none yet/);
  // A topic with no name is shown as no topic.
  assert.match(asked[0].user, /\n1\. \[-\] w0 /);
});

test("the first answer names the topic the lines are in, and a new key starts a topic", async () => {
  const { clock, loop, answers, say, topicOf, changes } = setup();
  for (let index = 0; index < 6; index += 1) say(20);
  answers.push(
    answer(
      [
        { from: 1, topic: "new1" },
        { from: 4, topic: "new2" },
      ],
      [
        { key: "new1", name: "Budget for the remote", gist: "What the parts cost" },
        { key: "new2", name: "Battery life worries", gist: "How long it lasts" },
      ]
    )
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u1"), "1");
  assert.equal(topicOf("u4"), "2");
  assert.equal(loop.currentId, "2");
  const labels = loop.snapshot().nodes.map((node) => node.label);
  assert.deepEqual(labels, ["Budget for the remote", "Battery life worries"]);
  assert.ok(changes() >= 1);
  // A new line goes to the topic the room is on.
  say(10);
  assert.equal(topicOf("u7"), "2");
});

test("one request a stride, and the next prompt shows the topics by id", async () => {
  const { clock, asked, answers, say } = setup();
  for (let index = 0; index < 3; index += 1) say(10);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Launch date plan", gist: "" }])
  );
  await clock.tick(2_000);
  assert.equal(asked.length, 1);
  for (let index = 0; index < 10; index += 1) {
    await clock.tick(10_000);
    say(10);
  }
  assert.equal(asked.length, 1, "no second request inside the stride");
  await clock.tick(WINDOW_STRIDE_MS);
  say(10);
  await clock.tick(2_000);
  assert.equal(asked.length, 2);
  assert.match(asked[1].user, /^TOPICS:\n1 \| Launch date plan \| \d+ min \| CURRENT/);
  assert.match(asked[1].user, /\[1\] w0/);
});

test("the window holds the last few minutes, and lines before it stay where they are", async () => {
  const { clock, asked, answers, say, topicOf } = setup();
  const early = say(30);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Launch date plan", gist: "" }])
  );
  await clock.tick(2_000);
  await clock.tick(WINDOW_MS + 60_000);
  say(10);
  say(10);
  say(10);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Battery life worries", gist: "" }])
  );
  await clock.tick(2_000);
  assert.equal(asked.length, 2);
  assert.doesNotMatch(asked[1].user, /\. \[\d\] w29/, "the early line is not sent again");
  assert.equal(topicOf(early), "1");
  assert.equal(topicOf("u2"), "2");
});

test("an answer can move a cut the view showed", async () => {
  const { clock, answers, say, topicOf } = setup({ minRunWords: 0 });
  for (let index = 0; index < 6; index += 1) say(10);
  answers.push(
    answer(
      [
        { from: 1, topic: "new1" },
        { from: 3, topic: "new2" },
      ],
      [
        { key: "new1", name: "Budget for the remote", gist: "" },
        { key: "new2", name: "Battery life worries", gist: "" },
      ]
    )
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u3"), "2");
  await clock.tick(WINDOW_STRIDE_MS);
  say(10);
  say(10);
  say(10);
  answers.push(
    answer([
      { from: 1, topic: "1" },
      { from: 5, topic: "2" },
    ])
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u3"), "1");
  assert.equal(topicOf("u4"), "1");
  assert.equal(topicOf("u5"), "2");
});

test("a new key named like an earlier topic is a return to it", async () => {
  const { clock, loop, answers, say, topicOf } = setup({ minRunWords: 0 });
  for (let index = 0; index < 3; index += 1) say(10);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Budget for the remote", gist: "" }])
  );
  await clock.tick(2_000);
  await clock.tick(WINDOW_STRIDE_MS);
  say(10);
  say(10);
  say(10);
  answers.push(
    answer(
      [
        { from: 1, topic: "1" },
        { from: 4, topic: "new1" },
        { from: 5, topic: "new2" },
      ],
      [
        { key: "new1", name: "Battery life worries", gist: "" },
        { key: "new2", name: "budget for the remote", gist: "" },
      ]
    )
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u4"), "2");
  assert.equal(topicOf("u5"), "1");
  assert.equal(loop.currentId, "1");
  const back = loop.snapshot().nodes.find((node) => node.id === 1);
  assert.equal(back.returns, 1);
});

test("a short run folds into the topic around it, but the last run is kept", async () => {
  const { clock, answers, say, topicOf } = setup();
  for (let index = 0; index < 8; index += 1) say(10);
  answers.push(
    answer(
      [
        { from: 1, topic: "new1" },
        { from: 4, topic: "new2" },
        { from: 5, topic: "new1" },
        { from: 8, topic: "new3" },
      ],
      [
        { key: "new1", name: "Budget for the remote", gist: "" },
        { key: "new2", name: "Battery life worries", gist: "" },
        { key: "new3", name: "Launch date plan", gist: "" },
      ]
    )
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u4"), "1", "a 10-word run joins the topic around it");
  assert.equal(topicOf("u8"), "2", "the last run may be a topic just begun");
});

test("an answer with no usable segment changes nothing", async () => {
  const { clock, loop, answers, say, topicOf } = setup();
  for (let index = 0; index < 3; index += 1) say(10);
  answers.push(JSON.stringify({ segments: [], new: [], rename: [] }));
  await clock.tick(2_000);
  assert.equal(loop.stats.malformed, 1);
  assert.equal(topicOf("u1"), "1");
  assert.equal(loop.disabled, false);
});

test("three failures in a row end the loop", async () => {
  const { clock, loop, answers, say, changes } = setup();
  for (let round = 0; round < 3; round += 1) {
    for (let index = 0; index < 3; index += 1) say(10);
    answers.push(new Error("server down"));
    await clock.tick(2_000);
    await clock.tick(WINDOW_STRIDE_MS);
  }
  assert.equal(loop.stats.failed, 3);
  assert.equal(loop.disabled, true);
  assert.ok(changes() >= 1, "the view goes back to the tracker's");
});

test("nothing is sent when the writing model is not ready", async () => {
  const { clock, loop, asked, say } = setup({ ready: async () => false });
  for (let index = 0; index < 3; index += 1) say(10);
  await clock.tick(2_000);
  assert.equal(asked.length, 0);
  assert.equal(loop.disabled, true);
});

test("an answer after the timeout counts as a failure", async () => {
  const { clock, loop, say } = setup({
    ask: () => new Promise(() => {}),
    timeoutMs: 1_000,
  });
  for (let index = 0; index < 3; index += 1) say(10);
  await clock.tick(2_000);
  await clock.tick(2_000);
  assert.equal(loop.stats.failed, 1);
});

test("a topic without a usable name takes the name of the next answer", async () => {
  const { clock, loop, answers, say, topicOf } = setup();
  for (let index = 0; index < 3; index += 1) say(10);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Discussion", gist: "" }])
  );
  await clock.tick(2_000);
  assert.equal(loop.topics.get("1").name, null);
  await clock.tick(WINDOW_STRIDE_MS);
  say(10);
  say(10);
  say(10);
  answers.push(
    answer([{ from: 1, topic: "new1" }], [{ key: "new1", name: "Launch date plan", gist: "" }])
  );
  await clock.tick(2_000);
  assert.equal(topicOf("u1"), "1");
  assert.equal(loop.topics.get("1").name, "Launch date plan");
  assert.equal(loop.topics.size, 1);
});

test("the names carry over to another cut of the conversation", async () => {
  const { clock, loop, answers, say } = setup();
  for (let index = 0; index < 6; index += 1) say(20);
  answers.push(
    answer(
      [
        { from: 1, topic: "new1" },
        { from: 4, topic: "new2" },
      ],
      [
        { key: "new1", name: "Budget for the remote", gist: "What the parts cost" },
        { key: "new2", name: "Battery life worries", gist: "" },
      ]
    )
  );
  await clock.tick(2_000);
  const record = {
    nodes: [
      { id: 10, utteranceIds: ["u1", "u2", "u3"] },
      { id: 11, utteranceIds: ["u4", "u5", "u6"] },
    ],
  };
  const names = loop.namesFor(record);
  assert.equal(names.get(10).name, "Budget for the remote");
  assert.equal(names.get(10).description, "What the parts cost");
  assert.equal(names.get(11).name, "Battery life worries");
});
