const test = require("node:test");
const assert = require("node:assert/strict");

let questionAge;
let NOW_SECONDS;

test.before(async () => {
  ({ questionAge, NOW_SECONDS } = await import("../../src/helpers/questionAge.mjs"));
});

const at = 1_000_000;
const age = (seconds) => questionAge(at, at + seconds * 1000);

// The bug this exists for: a card asked and settled before the rail's first
// 15-second tick read "Answered · 0s".
test("a question under 15 seconds old is 'now', never 0s", () => {
  assert.equal(NOW_SECONDS, 15);
  assert.deepEqual(age(0), { kind: "now" });
  assert.deepEqual(age(9), { kind: "now" });
  assert.deepEqual(age(14.4), { kind: "now" });
});

test("then seconds, then minutes, as before", () => {
  assert.deepEqual(age(15), { kind: "ago", label: "15s" });
  assert.deepEqual(age(59), { kind: "ago", label: "59s" });
  assert.deepEqual(age(60), { kind: "ago", label: "1m" });
  assert.deepEqual(age(150), { kind: "ago", label: "3m" });
});

test("a clock a little behind the card is 'now', not a negative age", () => {
  assert.deepEqual(questionAge(at, at - 2000), { kind: "now" });
});
