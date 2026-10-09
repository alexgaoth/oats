const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Regression tests for a bug that made the product's primary action fail on a
// fresh install.
//
// Recording a conversation resolves its transcription through
// `selectResolvedMeetingTranscription`, which reads `meetingUseLocalWhisper`.
// That defaulted to `false` while `meetingTranscriptionMode` defaulted to
// "local" — the two meeting settings contradicted each other out of the box, so
// pressing record reached for OpenAI Realtime and failed with "requires a
// bring-your-own-key API key" on a machine with no key. Settings meanwhile
// showed "On this computer" selected and lit gold, because the visible page
// wrote the *dictation* scope and never touched the meeting one.
//
// These are source-level assertions rather than store tests because the store
// pulls in browser globals; the point is to pin the two facts that broke, in the
// two files that broke them.

const STORE = fs.readFileSync(path.join(__dirname, "../../src/stores/settingsStore.ts"), "utf8");
// The Processing switch moved out of OatsWorkspace when Settings was rebuilt.
const PROCESSING = fs.readFileSync(
  path.join(__dirname, "../../src/components/settings/processing.ts"),
  "utf8"
);

test("transcription defaults to local, because Oats ships a model and promises offline", () => {
  for (const key of ["useLocalWhisper", "meetingUseLocalWhisper", "uploadUseLocalWhisper"]) {
    const match = STORE.match(new RegExp(`${key}: readBoolean\\("${key}", (true|false)\\)`));
    assert.ok(match, `could not find the default for ${key}`);
    assert.equal(
      match[1],
      "true",
      `${key} must default to local — a cloud default fails on a fresh install with no API key`
    );
  }
});

test("the meeting scope is what the primary action actually reads", () => {
  // If this moves, the test below is checking the wrong field.
  assert.match(
    STORE,
    /selectResolvedMeetingTranscription[\s\S]{0,600}useLocalWhisper: state\.meetingUseLocalWhisper/,
    "meeting transcription should resolve from meetingUseLocalWhisper"
  );
});

test("the one visible processing choice configures the meeting scope too", () => {
  const start = PROCESSING.indexOf("export function setProcessing(");
  assert.ok(start > -1, "setProcessing not found");
  const body = PROCESSING.slice(start, start + 2000);

  assert.match(
    body,
    /setMeetingUseLocalWhisper\(mode === "local"\)/,
    "choosing on-device processing must set meetingUseLocalWhisper, or recording still goes to the cloud"
  );
  assert.match(
    body,
    /setMeetingTranscriptionMode\(mode\)/,
    "the meeting transcription mode must follow the visible choice"
  );
});

test("the Settings toggle reflects the meeting scope, not just dictation", () => {
  // Otherwise the button can read "On this computer" while recording is cloud —
  // which is exactly how the bug stayed invisible.
  const start = PROCESSING.indexOf("function processingMode(");
  assert.ok(start > -1, "processingMode not found");
  const body = PROCESSING.slice(start, start + 600);
  for (const scope of [
    "transcriptionMode",
    "cleanupMode",
    "noteFormattingMode",
    "meetingTranscriptionMode",
  ]) {
    assert.ok(body.includes(`state.${scope}`), `the selected state must include ${scope}`);
  }
});

test("switching processing does not leave the other mode's model behind", () => {
  // A cloud model id used to survive the switch to local, so summaries kept
  // going to the provider while the switch read "On this Mac".
  const start = PROCESSING.indexOf("export function setProcessing(");
  const body = PROCESSING.slice(start, start + 2000);
  assert.match(body, /setNoteFormattingModel\(remembered\?\.noteFormattingModel \|\| DEFAULT_LOCAL_MODEL\)/);
  assert.match(body, /setNoteFormattingModel\(remembered\?\.noteFormattingModel \|\| DEFAULT_CLOUD_MODEL\)/);
  assert.match(body, /setCleanupModel\(remembered\?\.cleanupModel \|\| DEFAULT_LOCAL_MODEL\)/);
});
