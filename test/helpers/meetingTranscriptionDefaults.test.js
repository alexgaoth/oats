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
    /selectResolvedMeetingTranscription[\s\S]{0,2000}useLocalWhisper: state\.meetingUseLocalWhisper/,
    "meeting transcription should resolve from meetingUseLocalWhisper"
  );
});

test("the one visible processing choice configures the meeting scope too", () => {
  const start = PROCESSING.indexOf("export function setProcessing(");
  assert.ok(start > -1, "setProcessing not found");
  const body = PROCESSING.slice(start, start + 2000);

  // On this Mac: every scope's switch together, the meeting scope included.
  assert.match(
    body,
    /setCloudTranscriptionForAllScopes\(\{\s*useLocalWhisper: true,/,
    "choosing on-device processing must set meetingUseLocalWhisper, or recording still goes to the cloud"
  );
  assert.match(
    body,
    /setMeetingTranscriptionMode\(mode\)/,
    "the meeting transcription mode must follow the visible choice"
  );
  // With API keys: the store's rule, which follows the OpenAI key.
  assert.match(body, /applyProvidersSpeech\(\);/);
  const rule = STORE.slice(STORE.indexOf("export function applyProvidersSpeech("));
  assert.match(
    rule.slice(0, 800),
    /setCloudTranscriptionForAllScopes\(\{\s*useLocalWhisper: !cloud,/,
    "every scope moves together, the meeting scope included"
  );
  assert.match(rule.slice(0, 800), /setMeetingTranscriptionMode\("providers"\)/);
});

test("the Settings toggle reflects the meeting scope, not just dictation", () => {
  // Otherwise the button can read "On this computer" while recording is cloud —
  // which is exactly how the bug stayed invisible.
  assert.match(PROCESSING, /return selectProcessingMode\(state\);/);
  const start = STORE.indexOf("export function selectProcessingMode(");
  assert.ok(start > -1, "selectProcessingMode not found");
  const body = STORE.slice(start, start + 600);
  for (const scope of ["transcriptionMode", "cleanupMode", "meetingTranscriptionMode"]) {
    assert.ok(body.includes(`state.${scope}`), `the selected state must include ${scope}`);
  }
});

// One speech model and one writing model. Two models on one local server meant
// a reload on every alternation, and a request in flight on the killed server
// failed: a lost dictation or a lost conversation segment.
test("conversations use the dictation speech model", () => {
  const start = STORE.indexOf("export const selectResolvedMeetingTranscription");
  const body = STORE.slice(start, start + 2000);
  assert.match(body, /whisperModel: state\.whisperModel,/);
  assert.match(body, /parakeetModel: state\.parakeetModel,/);
  assert.match(body, /localTranscriptionProvider: state\.localTranscriptionProvider,/);
  assert.match(body, /cloudTranscriptionModel: state\.cloudTranscriptionModel,/);
  assert.doesNotMatch(body, /state\.meeting(Whisper|Parakeet)Model/);
});

test("summaries use the cleanup scope's whole configuration", () => {
  const start = STORE.indexOf("export const selectResolvedLLMConfig");
  const body = STORE.slice(start, start + 1200);
  assert.match(
    body,
    /if \(scope === "noteFormatting"\) \{\s*return \{ \.\.\.selectResolvedLLMConfig\(state, "dictationCleanup"\), scope \};/
  );
});

test("switching processing does not leave the other mode's model behind", () => {
  // A cloud model id used to survive the switch to local, so summaries kept
  // going to the provider while the switch read "On this Mac". Now the switch
  // sets the writing scope's mode and either restores that side's own choice
  // or forgets the stored model, so the default for the new side applies.
  const start = PROCESSING.indexOf("export function setProcessing(");
  const body = PROCESSING.slice(start, start + 2000);
  assert.match(body, /store\.setCleanupMode\(mode\);/);
  assert.match(body, /store\.setNoteFormattingMode\(mode\);/);
  // The choice in use is kept under the side the writing is on, also from
  // "mixed" (writingTier.mjs `switchWritingSide`, tested in writingTier.test.js).
  assert.match(
    body,
    /switchWritingSide\(\{\s*memory: readMemory\(\),\s*writingMode: store\.cleanupMode,\s*stored: storedWritingChoice\(\),\s*target: mode,\s*\}\);/
  );
  assert.match(body, /writeMemory\(memory\);/);
  // Moving to the providers stops a local writing download nothing would use.
  assert.match(body, /applyProvidersSpeech\(\);[^}]*leaveWritingDownload\(\);/);
  assert.match(
    body,
    /if \(remembered\) chooseWritingModel\(remembered\.cleanupProvider, remembered\.cleanupModel\);/
  );
  assert.match(body, /else forgetWritingChoice\(\);/);
  const forget = STORE.slice(STORE.indexOf("export function forgetWritingChoice("));
  assert.match(forget.slice(0, 400), /localStorage\.removeItem\(WRITING_MODEL_KEY\);/);
  assert.match(forget.slice(0, 400), /localStorage\.removeItem\(WRITING_PROVIDER_KEY\);/);
  // The default the forgotten side then follows is that side's own.
  assert.match(STORE, /mode: state\.cleanupMode,/);
});
