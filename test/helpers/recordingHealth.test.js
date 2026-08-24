const test = require("node:test");
const assert = require("node:assert/strict");

let FAILING_GRACE_MS;
let checkpointRisk;

test.before(async () => {
  ({ FAILING_GRACE_MS, checkpointRisk } = await import("../../src/helpers/recordingHealth.mjs"));
});

const NOW = 1_700_000_000_000;

test("a healthy recording says nothing at all", () => {
  const risk = checkpointRisk({
    failingSince: null,
    unsavedTurns: 3,
    lastSavedAt: NOW - 2000,
    now: NOW,
  });
  assert.equal(risk.atRisk, false);
});

// A warning that cries wolf is one people learn to ignore before the real one.
test("one refused write is not news; a persistent one is", () => {
  const justFailed = checkpointRisk({
    failingSince: NOW - 1000,
    unsavedTurns: 2,
    lastSavedAt: NOW - 5000,
    now: NOW,
  });
  assert.equal(justFailed.atRisk, false);

  const stillFailing = checkpointRisk({
    failingSince: NOW - FAILING_GRACE_MS - 1,
    unsavedTurns: 2,
    lastSavedAt: NOW - 60_000,
    now: NOW,
  });
  assert.equal(stillFailing.atRisk, true);
});

test("nothing said means nothing at risk, however the write went", () => {
  const risk = checkpointRisk({
    failingSince: NOW - 60_000,
    unsavedTurns: 0,
    lastSavedAt: null,
    now: NOW,
  });
  assert.equal(risk.atRisk, false);
  assert.equal(risk.unsavedTurns, 0);
});

test("it reports how much is at risk, which is the actionable part", () => {
  const risk = checkpointRisk({
    failingSince: NOW - 60_000,
    unsavedTurns: 7,
    lastSavedAt: NOW - 240_000,
    now: NOW,
  });
  assert.equal(risk.atRisk, true);
  assert.equal(risk.unsavedTurns, 7);
  assert.equal(risk.unsavedMs, 240_000);
});

test("a recording that never saved once still reports its turns", () => {
  const risk = checkpointRisk({
    failingSince: NOW - 60_000,
    unsavedTurns: 4,
    lastSavedAt: null,
    now: NOW,
  });
  assert.equal(risk.atRisk, true);
  assert.equal(risk.unsavedMs, 0, "no successful write means no elapsed-since to report");
});

test("malformed input does not throw or invent a problem", () => {
  assert.equal(checkpointRisk().atRisk, false);
  assert.equal(checkpointRisk({ failingSince: "soon", unsavedTurns: 5, now: NOW }).atRisk, false);
  assert.equal(checkpointRisk({ failingSince: NaN, unsavedTurns: 5, now: NOW }).atRisk, false);
});
