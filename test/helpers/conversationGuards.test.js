const test = require("node:test");
const assert = require("node:assert/strict");
const { createQuitGuard, createSleepGuard } = require("../../src/helpers/conversationGuards");

test("quitting with nothing recorded does not wait", async () => {
  let asked = 0;
  const guard = createQuitGuard({
    isRecording: () => false,
    finish: async () => {
      asked += 1;
    },
  });
  assert.equal(await guard(), "idle");
  assert.equal(asked, 0, "no conversation, nothing to finish");
});

test("quitting during a conversation finishes it first", async () => {
  const order = [];
  const guard = createQuitGuard({
    isRecording: () => true,
    finish: async () => {
      order.push("finish");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("saved");
    },
  });
  assert.equal(await guard(), "finished");
  order.push("quit");
  assert.deepEqual(order, ["finish", "saved", "quit"]);
});

test("a finish that never reports back cannot hold the quit forever", async () => {
  const logged = [];
  const guard = createQuitGuard({
    isRecording: () => true,
    finish: () => new Promise(() => {}),
    timeoutMs: 20,
    log: (message) => logged.push(message),
  });
  const started = Date.now();
  assert.equal(await guard(), "timed-out");
  assert.ok(Date.now() - started < 1000);
  assert.equal(logged.length, 1, "the forced quit is logged, not silent");
});

test("a finish that throws lets the quit go ahead, and says so", async () => {
  const logged = [];
  const guard = createQuitGuard({
    isRecording: () => true,
    finish: () => {
      throw new Error("renderer gone");
    },
    log: (message) => logged.push(message),
  });
  assert.equal(await guard(), "failed");
  assert.equal(logged.length, 1);
});

function fakeBlocker() {
  const live = new Set();
  let next = 1;
  return {
    live,
    starts: [],
    start(type) {
      this.starts.push(type);
      const id = next++;
      live.add(id);
      return id;
    },
    stop(id) {
      live.delete(id);
    },
  };
}

test("the system stays awake exactly while a conversation is recorded", () => {
  const blocker = fakeBlocker();
  const guard = createSleepGuard(blocker);

  guard.update(false);
  assert.equal(blocker.live.size, 0, "idle: nothing held");

  guard.update(true);
  guard.update(true); // repeated state reports must not stack blockers
  assert.equal(blocker.live.size, 1);
  assert.deepEqual(blocker.starts, ["prevent-app-suspension"]);
  assert.ok(guard.isHeld());

  guard.update(false);
  assert.equal(blocker.live.size, 0, "released when the conversation ends");
  assert.ok(!guard.isHeld());

  guard.update(true);
  guard.release();
  assert.equal(blocker.live.size, 0, "released on quit");
});
