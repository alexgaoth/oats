const test = require("node:test");
const assert = require("node:assert/strict");

let RoomAudioWindow;
test.before(async () => {
  ({ RoomAudioWindow } = await import("../../src/helpers/roomAudioWindow.mjs"));
});

const run = (from, to) => Int16Array.from({ length: to - from }, (_, i) => from + i);

test("the samples before a segment come back in order", () => {
  const window = new RoomAudioWindow(10);
  window.push(run(0, 4));
  window.push(run(4, 8));
  assert.deepEqual([...window.before(6, 3)], [3, 4, 5]);
});

test("a stream's start gives what there is", () => {
  const window = new RoomAudioWindow(10);
  window.push(run(0, 8));
  assert.deepEqual([...window.before(2, 5)], [0, 1]);
  assert.deepEqual([...window.before(0, 5)], []);
});

test("across the ring's seam, and past what it still holds", () => {
  const window = new RoomAudioWindow(10);
  for (let at = 0; at < 37; at += 3) window.push(run(at, at + 3));
  assert.equal(window.total, 39);
  assert.deepEqual([...window.before(36, 4)], [32, 33, 34, 35]);
  assert.deepEqual([...window.before(31, 4)], [29, 30]);
  assert.deepEqual([...window.before(20, 4)], []);
});

test("a push longer than the ring keeps its end", () => {
  const window = new RoomAudioWindow(4);
  window.push(run(0, 9));
  assert.deepEqual([...window.before(9, 4)], [5, 6, 7, 8]);
});

test("a start past the stream's end stops at the end", () => {
  const window = new RoomAudioWindow(10);
  window.push(run(0, 5));
  assert.deepEqual([...window.before(7, 3)], [2, 3, 4]);
});
