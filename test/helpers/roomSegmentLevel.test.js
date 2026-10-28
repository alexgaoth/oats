const test = require("node:test");
const assert = require("node:assert/strict");

let raiseQuietSegment, segmentGain, ROOM_SEGMENT_LEVEL;

test.before(async () => {
  ({ raiseQuietSegment, segmentGain, ROOM_SEGMENT_LEVEL } =
    await import("../../src/helpers/roomSegmentLevel.mjs"));
});

const RATE = 16000;
/** A voiced tone at this RMS (0..1 of full scale), a second long. */
function tone(rms, seconds = 1) {
  const amplitude = rms * Math.SQRT2 * 32767;
  return Int16Array.from({ length: seconds * RATE }, (_, i) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE))
  );
}
const rmsOf = (samples) =>
  Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length) / 32768;
const peakOf = (samples) => samples.reduce((n, v) => Math.max(n, Math.abs(v)), 0) / 32768;

test("a quiet microphone's segment is raised to the target level", () => {
  // Speech as AMI's table microphone recorded it: about -50 dBFS.
  const raised = raiseQuietSegment(tone(0.003));
  assert.ok(Math.abs(rmsOf(raised) - ROOM_SEGMENT_LEVEL.targetRms) < 0.001, rmsOf(raised));
});

test("never past the peak, never quieter, and a loud segment is left as it is", () => {
  // One sharp click in a quiet segment: the click sets how far it can go.
  const clicked = tone(0.003);
  clicked[100] = 16000;
  assert.ok(peakOf(raiseQuietSegment(clicked)) <= ROOM_SEGMENT_LEVEL.maxPeak + 1e-4);
  const loud = tone(0.2);
  assert.equal(raiseQuietSegment(loud), loud);
  assert.equal(segmentGain(loud), 1);
});

test("silence stays silence", () => {
  const silent = new Int16Array(RATE);
  assert.equal(raiseQuietSegment(silent), silent);
});
