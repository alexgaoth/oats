const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A call recording holds each mic chunk for MEETING_MIC_REFERENCE_ALIGNMENT_MS
// (320 ms), so the echo check can compare it with the system audio that plays
// at the same moment. The hold was keyed to whether this Mac can capture system
// audio, not to whether this recording does. A room recording captures none,
// so it waited 320 ms and up to one more chunk for audio that never came,
// before every word reached the transcriber.
//
// Source-level, like meetingTranscriptionDefaults.test.js: the logic lives in
// the meeting handler's closure in ipcHandlers.js, which needs Electron.

const SOURCE = fs.readFileSync(path.join(__dirname, "../../src/helpers/ipcHandlers.js"), "utf8");

test("the mic path asks whether this recording waits, not what the Mac can do", () => {
  assert.match(
    SOURCE,
    /if \(!meetingMicWaitsForSystem\) \{\s*const analysis = meetingEchoLeakDetector\.analyzeMicChunk/
  );
  assert.doesNotMatch(SOURCE, /hasNativeMeetingSystemAudio/);
});

test("a room recording plans no system audio, and the wait follows the plan", () => {
  assert.match(
    SOURCE,
    /const systemAudioPlan = isInRoom\s*\? \{ mode: "unsupported", strategy: "unsupported" \}/
  );
  assert.match(SOURCE, /= systemAudioPlan;\s*setMeetingMicWaitsForSystem\(systemAudioMode\);/);
});

test("only native system audio makes the mic wait, and ending a wait releases held audio", () => {
  const setter = SOURCE.match(
    /const setMeetingMicWaitsForSystem = \(systemAudioMode\) => \{([\s\S]*?)\n {4}\};/
  );
  assert.ok(setter, "setMeetingMicWaitsForSystem not found");
  assert.match(setter[1], /meetingMicWaitsForSystem = systemAudioMode === "native";/);
  // Held chunks go out before newer ones, which no longer wait.
  assert.match(setter[1], /flushPendingMeetingMicChunks\(true\)/);
});

test("a failed native tap and the end of a recording stop the wait", () => {
  assert.match(
    SOURCE,
    /await fallBackToMicOnly\("native"\);\s*setMeetingMicWaitsForSystem\("unsupported"\);/
  );
  assert.match(SOURCE, /setMeetingMicWaitsForSystem\("unsupported"\);\s*await stopMeetingAec\(\);/);
  const resets = SOURCE.match(
    /meetingPendingMicChunks = \[\];\s*meetingMicWaitsForSystem = false;/g
  );
  assert.equal(resets?.length, 2, "both state resets clear the wait with the queue");
});
