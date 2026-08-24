const test = require("node:test");
const assert = require("node:assert/strict");

let FAILING_GRACE_MS;
let STALLED_GRACE_MS;
let checkpointRisk;
let transcriptionStalled;

test.before(async () => {
  ({ FAILING_GRACE_MS, STALLED_GRACE_MS, checkpointRisk, transcriptionStalled } =
    await import("../../src/helpers/recordingHealth.mjs"));
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

// The failure the dead-microphone warning cannot see: level healthy, backend
// producing nothing.
function busy(overrides = {}) {
  return {
    lastSoundAt: NOW - 500,
    lastSegmentAt: NOW - 10_000,
    startedAt: NOW - 600_000,
    micSilent: false,
    now: NOW,
    ...overrides,
  };
}

test("a room that is talking and being transcribed is fine", () => {
  assert.equal(transcriptionStalled(busy()).stalled, false);
});

test("sustained sound with nothing transcribed is a fault", () => {
  const stalled = transcriptionStalled(busy({ lastSegmentAt: NOW - STALLED_GRACE_MS - 1 }));
  assert.equal(stalled.stalled, true);
  assert.ok(stalled.quietMs >= STALLED_GRACE_MS);
});

// The expensive false positive: a fan sits above the silence floor all meeting.
test("it waits far longer than a chunk interval before saying anything", () => {
  assert.ok(STALLED_GRACE_MS >= 60_000, "well beyond the ~5s local chunk interval");
  assert.equal(transcriptionStalled(busy({ lastSegmentAt: NOW - 30_000 })).stalled, false);
});

test("a room that simply went quiet is not a fault", () => {
  assert.equal(
    transcriptionStalled(busy({ lastSoundAt: NOW - 30_000, lastSegmentAt: NOW - 300_000 })).stalled,
    false
  );
});

// One problem, one warning.
test("a silent microphone explains it, and does not get a second warning", () => {
  assert.equal(
    transcriptionStalled(busy({ micSilent: true, lastSegmentAt: NOW - 300_000 })).stalled,
    false
  );
});

// Loud at the start, not quiet at the end.
test("a backend that never came up is caught against the recording's start", () => {
  const stalled = transcriptionStalled(
    busy({ lastSegmentAt: null, startedAt: NOW - STALLED_GRACE_MS - 1 })
  );
  assert.equal(stalled.stalled, true);
});

test("a recording that just began is not accused of anything", () => {
  assert.equal(
    transcriptionStalled(busy({ lastSegmentAt: null, startedAt: NOW - 5_000 })).stalled,
    false
  );
});

test("missing inputs report no fault rather than inventing one", () => {
  assert.equal(transcriptionStalled().stalled, false);
  assert.equal(transcriptionStalled(busy({ lastSoundAt: null })).stalled, false);
  assert.equal(transcriptionStalled(busy({ lastSegmentAt: null, startedAt: null })).stalled, false);
});
