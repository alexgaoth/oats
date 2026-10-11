const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The microphone level is read ten times a second for a whole recording. It
// used to run on a requestAnimationFrame loop that skipped frames, which still
// woke the page on every vsync: 120 times a second on a ProMotion display, and,
// with the window's backgroundThrottling off, minimized or closed to the tray
// too. Source-level: the component needs a browser and an audio graph.

const SOURCE = fs.readFileSync(
  path.join(__dirname, "../../src/components/MeetingRecordingMount.tsx"),
  "utf8"
);

test("the microphone level is sampled on a 100 ms timer, not on every frame", () => {
  assert.match(SOURCE, /const MIC_SAMPLE_INTERVAL_MS = 100;/);
  assert.match(SOURCE, /window\.setInterval\(sample, MIC_SAMPLE_INTERVAL_MS\)/);
  assert.match(SOURCE, /window\.clearInterval\(timer\)/);
  assert.doesNotMatch(SOURCE, /requestAnimationFrame\(/);
});
