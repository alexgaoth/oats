const test = require("node:test");
const assert = require("node:assert/strict");

const { createOneAtATime, BUSY } = require("../../src/helpers/oneAtATime.js");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("a second task waits for the first instead of being refused", async () => {
  const queue = createOneAtATime();
  const first = deferred();
  const order = [];
  const a = queue.run(async () => {
    order.push("a start");
    await first.promise;
    order.push("a end");
    return "a";
  });
  const b = queue.run(async () => {
    order.push("b start");
    return "b";
  });
  await tick();
  assert.deepEqual(order, ["a start"]);
  assert.equal(queue.waiting, 1);
  first.resolve();
  assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);
  assert.deepEqual(order, ["a start", "a end", "b start"]);
});

test("a failed task still lets the next one run", async () => {
  const queue = createOneAtATime();
  const a = queue.run(async () => {
    throw new Error("model crashed");
  });
  const b = queue.run(async () => "b");
  await assert.rejects(a, /model crashed/);
  assert.equal(await b, "b");
});

test("a task that waits too long gives up with the old error, and never overtakes", async () => {
  const queue = createOneAtATime({ maxWaitMs: 30 });
  const first = deferred();
  const order = [];
  const a = queue.run(async () => {
    await first.promise;
    order.push("a");
  });
  const b = queue.run(async () => order.push("b"));
  await assert.rejects(b, new RegExp(BUSY));
  // A third task arrives after b gave up: it still waits for a.
  const c = queue.run(async () => order.push("c"));
  await tick();
  assert.deepEqual(order, []);
  first.resolve();
  await Promise.all([a, c]);
  assert.deepEqual(order, ["a", "c"]);
});

test("past the waiting limit, a new task is refused at once", async () => {
  const queue = createOneAtATime({ maxWaiting: 1 });
  const first = deferred();
  const a = queue.run(() => first.promise);
  const b = queue.run(async () => "b");
  await tick();
  await assert.rejects(
    queue.run(async () => "c"),
    new RegExp(BUSY)
  );
  first.resolve("a");
  assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);
  // Once the queue drains, tasks run again.
  assert.equal(await queue.run(async () => "d"), "d");
});
