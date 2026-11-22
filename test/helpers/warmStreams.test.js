const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// I: a warm stream holds the key it was opened with; when its feature's key
// changes, a warm stream nothing uses yet is closed (warmStreams.js).

const { staleWarmStreams } = require("../../src/helpers/warmStreams");

const OLD = "sk-proj-fakeWarmKeyOld0000AAAA";
const NEW = "sk-proj-fakeWarmKeyNew0000BBBB";

test("a warm stream whose feature's key changed is closed; others are left", () => {
  const keys = { dictation: NEW, conversations: OLD };
  const keyNow = (feature) => keys[feature] ?? "";
  const streams = [
    { name: "dictation", warm: true, feature: "dictation", key: OLD },
    { name: "meeting", warm: true, feature: "conversations", key: OLD },
  ];
  assert.deepEqual(staleWarmStreams(streams, keyNow), ["dictation"]);
  // A stream in use is not warm: it keeps going.
  assert.deepEqual(staleWarmStreams([{ ...streams[0], warm: false }], keyNow), []);
  // A stream opened without a named key (another provider, the hosted path).
  assert.deepEqual(staleWarmStreams([{ ...streams[0], key: undefined }], keyNow), []);
  // The key was removed: the feature has none now.
  assert.deepEqual(staleWarmStreams([streams[1]], () => ""), ["meeting"]);
});

test("main closes the stale warm streams on every change of the keys", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "helpers", "ipcHandlers.js"),
    "utf8"
  );
  assert.match(
    source,
    /keys\.onApiKeysChanged = \(list\) => \{\s*this\.broadcastToWindows\("api-keys-changed", list\);[\s\S]{0,120}this\._dropStaleWarmStreams\?\.\(\);/
  );
  // The keys the warm streams were opened with are kept for the comparison.
  assert.match(source, /this\._meetingStreamsKey =/);
  assert.match(source, /this\._dictationStreamingKey =/);
  // A prepare marks the meeting streams warm, and a start claims them.
  assert.match(source, /meetingStreamsWarm = true;\s*return \{ success: true \};/);
  assert.match(
    source,
    /ipcMain\.handle\("meeting-transcription-start", async \(event, options = \{\}\) => \{\s*\/\/[^\n]*\n\s*meetingStreamsWarm = false;/
  );
});
