const test = require("node:test");
const assert = require("node:assert/strict");

let loopModule;
let LiveTopicLoop;

test.before(async () => {
  loopModule = await import("../../src/helpers/topicLoop.mjs");
  LiveTopicLoop = loopModule.LiveTopicLoop;
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/**
 * The on-device proposer as the test wants it: the lines from now on go to
 * `moveTo`'s topic, and `from` re-cuts earlier lines too, as a tracker does
 * with hindsight.
 */
function fakeProposer() {
  const topicOf = new Map();
  const order = [];
  let current = 1;
  return {
    onUtterance({ id }) {
      order.push(String(id));
      topicOf.set(String(id), current);
    },
    moveTo(topic, from = null) {
      current = topic;
      if (from === null) return;
      let on = false;
      for (const id of order) {
        if (id === from) on = true;
        if (on) topicOf.set(id, topic);
      }
    },
    snapshot() {
      const nodes = new Map();
      for (const id of order) {
        const topic = topicOf.get(id);
        if (!nodes.has(topic))
          nodes.set(topic, { id: topic, label: `device ${topic}`, utteranceIds: [] });
        nodes.get(topic).utteranceIds.push(id);
      }
      return { nodes: [...nodes.values()], edges: [] };
    },
  };
}

const wordsOf = (count, stem) =>
  Array.from({ length: count }, (_, index) => `${stem}${index}`).join(" ");

/** A JSON answer of the check, "new" at A1 unless the test says otherwise. */
const check = (fields) =>
  JSON.stringify({
    decision: "new",
    at: 1,
    topic: null,
    name: null,
    gist: null,
    rename: null,
    ...fields,
  });

function setup(options = {}) {
  const clock = fakeClock();
  const proposer = fakeProposer();
  const asked = [];
  const replies = [];
  let changes = 0;
  const loop = new LiveTopicLoop({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    proposer,
    ask: (request) => {
      asked.push(request);
      const reply = replies.shift();
      // No reply queued: the request never answers.
      if (reply === undefined) return deferred().promise;
      return typeof reply === "function" ? reply(request) : Promise.resolve(reply);
    },
    onChange: () => {
      changes += 1;
    },
    ...options,
  });
  let count = 0;
  /** A line of `words` words, said now. */
  const say = (words = 6, text = null) => {
    const id = `u${count++}`;
    loop.onUtterance({ id, text: text ?? wordsOf(words, `${id}w`), at: clock.now() });
    return id;
  };
  return { clock, proposer, loop, asked, replies, say, changes: () => changes };
}

const idsOf = (loop) => loop.snapshot().nodes.map((node) => node.utteranceIds);

/** The conversation's text a request quotes: its numbered or bulleted lines. */
const quoted = (request) =>
  request.user
    .split("\n")
    .map((line) => /^(?:[AB]\d+\. |- )(.*)$/.exec(line)?.[1])
    .filter((line) => line !== undefined);

test("every line shows at once in the topic the room is on, under its on-device name", async () => {
  const { clock, loop, asked, say } = setup();
  say(5);
  say(5);
  say(5);
  const device = { nodes: [{ id: 7, label: "Launch plan", utteranceIds: ["u0", "u1", "u2"] }] };
  const [topic] = loop.snapshot(clock.now(), { device }).nodes;
  assert.equal(topic.id, 1);
  assert.deepEqual(topic.utteranceIds, ["u0", "u1", "u2"]);
  assert.equal(topic.label, "Launch plan");
  assert.equal(topic.deviceLabel, undefined);
  assert.equal(topic.state, "live");
  // With no snapshot of the tracker, the proposer's own name.
  assert.equal(loop.snapshot().nodes[0].label, "device 1");
  // 15 words and no change proposed: nothing to ask.
  await clock.tick(10_000);
  assert.equal(asked.length, 0);
});

test("a change the model confirms starts a named topic with the lines since it", async () => {
  const { clock, proposer, loop, asked, replies, say, changes } = setup();
  say();
  say();
  say();
  proposer.moveTo(2);
  say();
  say();
  replies.push(check({ name: "Budget for the remote", gist: "What the parts cost" }));
  await clock.tick(1_499);
  assert.equal(asked.length, 0, "the room settles first");
  await clock.tick(1);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].kind, "proposal");
  assert.equal(asked[0].system, loopModule.CHECK_SYSTEM);
  assert.deepEqual(asked[0].schema, loopModule.CHECK_SCHEMA);
  assert.match(asked[0].user, /^B3\. u2w0/m);
  assert.match(asked[0].user, /^A1\. u3w0/m);

  const [first, second] = loop.snapshot().nodes;
  assert.deepEqual(first.utteranceIds, ["u0", "u1", "u2"]);
  assert.equal(first.state, "open");
  assert.deepEqual(second.utteranceIds, ["u3", "u4"]);
  assert.equal(second.label, "Budget for the remote");
  assert.equal(second.deviceLabel, "device 2");
  assert.equal(second.state, "live");
  assert.deepEqual(loop.snapshot().edges, [{ from: 1, to: 2, weight: 1, kind: "new" }]);
  assert.equal(changes(), 1);
  // The next line goes to the new topic at once.
  say();
  assert.deepEqual(idsOf(loop), [
    ["u0", "u1", "u2"],
    ["u3", "u4", "u5"],
  ]);
});

test("a change the model does not confirm leaves the view as it was", async () => {
  const { clock, proposer, loop, replies, say, changes } = setup();
  say();
  say();
  proposer.moveTo(2);
  say();
  replies.push(check({ decision: "same" }));
  await clock.tick(1_500);
  assert.deepEqual(idsOf(loop), [["u0", "u1", "u2"]]);
  assert.equal(changes(), 0);
  assert.equal(loop.stats.answered, 1);
});

test("a confirmed change moves its lines in one step, however long ago they were shown", async () => {
  const { clock, proposer, loop, replies, say } = setup();
  for (let index = 0; index < 5; index += 1) say();
  await clock.tick(40_000);
  // With hindsight, the proposer now sees a change at u3, 40 s back.
  proposer.moveTo(2, "u3");
  say();
  replies.push(check({ name: "Budget for the remote" }));
  await clock.tick(1_500);
  assert.deepEqual(idsOf(loop), [
    ["u0", "u1", "u2"],
    ["u3", "u4", "u5"],
  ]);
  assert.equal(loop.snapshot().nodes[1].label, "Budget for the remote");
  assert.equal(loop.stats.cuts, 1);
});

test("a request carries at most 3,000 characters of the conversation, nearest the change first", async () => {
  const { clock, proposer, loop, asked, replies, say } = setup();
  const long = (id) => `${id} ${"remote control buttons and the battery cover ".repeat(6)}`;
  replies.push(JSON.stringify({ name: "Remote control buttons", gist: "Which buttons" }));
  replies.push(check({ decision: "same" }));
  for (let index = 0; index < 20; index += 1) say(0, long(`u${index}`));
  proposer.moveTo(2);
  for (let index = 20; index < 40; index += 1) say(0, long(`u${index}`));
  await clock.tick(3_000);
  assert.deepEqual(
    asked.map((request) => request.kind),
    ["name", "proposal"]
  );
  for (const request of asked) {
    const lines = quoted(request);
    const chars = lines.reduce((total, line) => total + line.length, 0);
    assert.ok(chars <= loopModule.MAX_EXCERPT_CHARS, `${request.kind}: ${chars} characters`);
    assert.ok(lines.length >= 10, `${request.kind}: ${lines.length} lines`);
    for (const line of lines) assert.ok(line.length <= loopModule.LINE_CHARS + 1);
  }
  // The check quotes the lines on both sides of the change, the nearest ones.
  const user = asked[1].user;
  assert.match(user, /^A1\. u20 /m);
  const before = user.split("\n").filter((line) => /^B\d+\. /.test(line));
  assert.match(before.at(-1), /\. u19 /);
  // The name quotes the topic's latest lines: all 40 were in it when it went out.
  assert.match(asked[0].user, /^- u39 /m);
  assert.doesNotMatch(asked[0].user, /^- u0 /m);
  assert.equal(loop.sentIds.has("u0"), false);
  assert.equal(loop.sentIds.has("u20"), true);
});

test("excerptAround alternates after and before the change until the budget", () => {
  const line = (id) => ({ id, text: `${id} ${"x".repeat(96)}` });
  const before = ["b1", "b2", "b3"].map(line);
  const after = ["a1", "a2", "a3"].map(line);
  const {
    before: keptBefore,
    after: keptAfter,
    chars,
  } = loopModule.excerptAround(before, after, {
    budget: 450,
  });
  assert.deepEqual(
    keptBefore.map((item) => item.id),
    ["b2", "b3"]
  );
  assert.deepEqual(
    keptAfter.map((item) => item.id),
    ["a1", "a2"]
  );
  assert.equal(chars, 4 * 99);
  // One side empty: the other fills the budget, nearest the change first.
  const onlyBefore = loopModule.excerptAround(before, [], { budget: 250 });
  assert.deepEqual(
    onlyBefore.before.map((item) => item.id),
    ["b2", "b3"]
  );
});

test("a failure, a timeout or an answer that is not JSON changes nothing; three in a row end the loop", async () => {
  const { clock, loop, asked, replies, say, changes } = setup();
  replies.push(() => Promise.reject(new Error("offline")));
  replies.push("Sorry, I can't help with that.");
  // The third request is never answered.
  for (let index = 0; index < 4; index += 1) say(10); // 40 words: the first name is due
  await clock.tick(1_500);
  assert.equal(asked.length, 1);
  assert.equal(loop.stats.failed, 1);
  const unnamed = () => {
    const [topic] = loop.snapshot().nodes;
    return topic.label === "device 1" && topic.deviceLabel === undefined;
  };
  assert.ok(unnamed());
  // Within the back-off (10 s) nothing is asked, whatever is said.
  await clock.tick(5_000);
  say(10);
  await clock.tick(5_000);
  assert.equal(asked.length, 1);
  say(10);
  await clock.tick(1_500);
  assert.equal(asked.length, 2);
  assert.equal(loop.stats.malformed, 1);
  assert.ok(unnamed());
  // Then 20 s; the third request times out after 15 s.
  await clock.tick(20_000);
  say(10);
  await clock.tick(1_500);
  assert.equal(asked.length, 3);
  assert.equal(loop.disabled, false);
  await clock.tick(loopModule.REQUEST_TIMEOUT_MS);
  assert.equal(loop.stats.failed, 2);
  assert.equal(loop.disabled, true);
  assert.equal(changes(), 1, "the view is published once, to go back to the tracker's");
  assert.ok(unnamed());
  say(10);
  await clock.tick(60_000);
  assert.equal(asked.length, 3);
});

test("a request that timed out still holds the line until it settles", async () => {
  const { clock, loop, asked, replies, say } = setup();
  const late = deferred();
  replies.push(() => late.promise);
  replies.push(JSON.stringify({ name: "Launch date plan", gist: "" }));
  for (let index = 0; index < 4; index += 1) say(10);
  await clock.tick(1_500 + loopModule.REQUEST_TIMEOUT_MS);
  assert.equal(loop.stats.failed, 1);
  // Past the back-off, and still nothing beside the request that is out.
  await clock.tick(30_000);
  say(10);
  await clock.tick(5_000);
  assert.equal(asked.length, 1);
  // Its answer comes too late to count, and frees the line.
  late.resolve(JSON.stringify({ name: "Too late to count", gist: "" }));
  await flush();
  await clock.tick(1_500);
  assert.equal(asked.length, 2);
  assert.equal(loop.snapshot().nodes[0].label, "Launch date plan");
});

test("an answer after a failure resets the count", async () => {
  const { clock, loop, replies, say } = setup();
  replies.push(() => Promise.reject(new Error("offline")));
  replies.push(JSON.stringify({ name: "Launch date plan", gist: "" }));
  for (let index = 0; index < 4; index += 1) say(10);
  await clock.tick(1_500);
  assert.equal(loop.failures, 1);
  await clock.tick(10_000);
  say(10);
  await clock.tick(1_500);
  assert.equal(loop.failures, 0);
  assert.equal(loop.snapshot().nodes[0].label, "Launch date plan");
});

test("one request at a time: a change proposed while one is out waits for its answer", async () => {
  const { clock, proposer, loop, asked, replies, say } = setup();
  const first = deferred();
  replies.push(() => first.promise);
  say();
  say();
  say();
  proposer.moveTo(2);
  say();
  say();
  await clock.tick(1_500);
  assert.equal(asked.length, 1);
  // Another change, at u5, while the first request is out.
  proposer.moveTo(3);
  say();
  say();
  await clock.tick(5_000);
  assert.equal(asked.length, 1);
  replies.push(check({ name: "Battery life worries" }));
  first.resolve(check({ name: "Budget for the remote" }));
  await flush();
  // Lines said while it was out moved with the change.
  assert.deepEqual(idsOf(loop), [
    ["u0", "u1", "u2"],
    ["u3", "u4", "u5", "u6"],
  ]);
  await clock.tick(1_500);
  assert.equal(asked.length, 2);
  assert.match(asked[1].user, /^A1\. u5w0/m);
  assert.deepEqual(idsOf(loop), [
    ["u0", "u1", "u2"],
    ["u3", "u4"],
    ["u5", "u6"],
  ]);
  assert.deepEqual(
    loop.snapshot().nodes.map((node) => node.label),
    ["device 1", "Budget for the remote", "Battery life worries"]
  );
});

test("a return goes back to the earlier topic, and so does a new topic named like one", async () => {
  const { clock, proposer, loop, replies, say } = setup();
  say();
  say();
  proposer.moveTo(2);
  say();
  say();
  replies.push(check({ name: "Budget for the remote" }));
  await clock.tick(1_500);
  proposer.moveTo(3);
  say();
  say();
  replies.push(check({ name: "Battery life worries" }));
  await clock.tick(1_500);
  proposer.moveTo(4);
  say();
  // Named like topic 2: a return to it, not a fourth topic.
  replies.push(check({ name: "budget for the remote." }));
  await clock.tick(1_500);
  proposer.moveTo(5);
  say();
  replies.push(check({ decision: "return", topic: "1" }));
  await clock.tick(1_500);
  const nodes = loop.snapshot().nodes;
  assert.deepEqual(
    nodes.map((node) => [node.id, node.utteranceIds]),
    [
      [1, ["u0", "u1", "u7"]],
      [2, ["u2", "u3", "u6"]],
      [3, ["u4", "u5"]],
    ]
  );
  assert.deepEqual(
    nodes.map((node) => node.returns),
    [1, 1, 0]
  );
  assert.equal(nodes[0].state, "live");
  assert.deepEqual(
    loop.snapshot().edges.map((edge) => `${edge.from}>${edge.to} ${edge.kind}`),
    ["1>2 new", "2>3 new", "3>2 return", "2>1 return"]
  );
  assert.equal(loop.stats.returns, 2);
  assert.equal(loop.stats.cuts, 2);
});

test("a topic is renamed only once it grew two and a half times since its name", async () => {
  const { clock, loop, asked, replies, say } = setup({ checkAfterWords: 30 });
  replies.push(JSON.stringify({ name: "Launch date plan", gist: "" }));
  replies.push(check({ decision: "same", rename: "Launch date and pricing" }));
  replies.push(check({ decision: "same", rename: "Launch date and pricing" }));
  for (let index = 0; index < 4; index += 1) say(10);
  await clock.tick(3_000);
  assert.deepEqual(
    asked.map((request) => request.kind),
    ["name", "periodic"]
  );
  // 40 words, named at 40: too soon to rename.
  assert.equal(loop.snapshot().nodes[0].label, "Launch date plan");
  for (let index = 0; index < 6; index += 1) say(10);
  await clock.tick(1_500);
  assert.equal(asked.length, 3);
  assert.equal(loop.snapshot().nodes[0].label, "Launch date and pricing");
  assert.equal(loop.stats.renames, 1);
});

test("when the writing model is no longer OpenAI's, nothing is sent and the loop ends", async () => {
  let ready = true;
  const { clock, loop, asked, say, changes } = setup({ ready: () => ready });
  ready = false;
  for (let index = 0; index < 4; index += 1) say(10);
  await clock.tick(1_500);
  assert.equal(asked.length, 0);
  assert.equal(loop.disabled, true);
  assert.equal(changes(), 1);
  say(10);
  await clock.tick(60_000);
  assert.equal(asked.length, 0);
});

test("after stop, nothing more is asked", async () => {
  const { clock, loop, asked, say } = setup();
  for (let index = 0; index < 4; index += 1) say(10);
  loop.stop();
  say(10);
  await clock.tick(60_000);
  assert.equal(asked.length, 0);
});

test("the names go to another cut of the conversation by the lines they were given from", async () => {
  const { clock, proposer, loop, replies, say } = setup();
  say();
  say();
  say();
  proposer.moveTo(2);
  say();
  say();
  say();
  replies.push(check({ name: "Budget for the remote" }));
  await clock.tick(1_500);
  // The record's cut: node 11 holds two of the three lines the name was given from.
  const record = {
    nodes: [
      { id: 10, utteranceIds: ["u0", "u1", "u2", "u3"] },
      { id: 11, utteranceIds: ["u4", "u5"] },
    ],
  };
  const names = loop.namesFor(record);
  assert.deepEqual([...names.keys()], [11]);
  assert.deepEqual(names.get(11), {
    name: "Budget for the remote",
    words: 18,
    namings: 1,
    utteranceIds: ["u3", "u4", "u5"],
    held: true,
  });
  // A cut that keeps under half of them gets no name.
  const split = {
    nodes: ["u3", "u4", "u5"].map((id, index) => ({ id: 20 + index, utteranceIds: [id] })),
  };
  assert.equal(loop.namesFor(split).size, 0);
});

test("the fast model is the first this key can use, and an unknown answer is asked again", async () => {
  const answers = (map) => async (model) => {
    const answer = map[model];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const choose = loopModule.chooseFastModel;
  assert.deepEqual(loopModule.FAST_MODELS, ["gpt-6-luna", "gpt-5.6-luna"]);
  assert.deepEqual(await choose(answers({ "gpt-6-luna": true })), {
    model: "gpt-6-luna",
    settled: true,
  });
  assert.deepEqual(await choose(answers({ "gpt-6-luna": false, "gpt-5.6-luna": true })), {
    model: "gpt-5.6-luna",
    settled: true,
  });
  assert.deepEqual(await choose(answers({ "gpt-6-luna": false, "gpt-5.6-luna": false })), {
    model: null,
    settled: true,
  });
  assert.deepEqual(await choose(answers({ "gpt-6-luna": null })), { model: null, settled: false });
  assert.deepEqual(await choose(answers({ "gpt-6-luna": new Error("offline") })), {
    model: null,
    settled: false,
  });
});

test("the check runs only when the writing model is OpenAI's own", () => {
  const route = loopModule.loopRouteFor;
  assert.equal(route({ mode: "providers", config: { provider: "openai" } }), true);
  for (const other of [
    { mode: "providers", config: { provider: "anthropic" } },
    { mode: "providers", config: { provider: "gemini" } },
    { mode: "providers", config: { provider: "custom" } },
    { mode: "local", config: { provider: "local" } },
    { mode: "lan", config: { provider: "openai" } },
    null,
    undefined,
  ]) {
    assert.equal(route(other), false, JSON.stringify(other));
  }
});

test("readJson takes the object in an answer, fenced or in prose, and nothing else", () => {
  const read = loopModule.readJson;
  assert.deepEqual(read('{"decision":"same"}'), { decision: "same" });
  assert.deepEqual(read('```json\n{"decision":"new"}\n```'), { decision: "new" });
  assert.deepEqual(read('Here: {"decision":"return"} done'), { decision: "return" });
  assert.equal(read("same"), null);
  assert.equal(read("[1, 2]"), null);
  assert.equal(read(""), null);
});
