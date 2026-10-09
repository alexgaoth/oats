const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const MeetingDetectionEngine = require("../../src/helpers/meetingDetectionEngine");

// The meeting prompt and the meeting hotkey used to save an empty "New note" and
// queue a navigation nothing listened for: nothing recorded, an orphan note was
// left behind, and meeting mode stuck on until restart. These pin what they do
// instead — start the conversation through the one toggle.

function fakes({ recording = false } = {}) {
  const calls = { toggles: 0, notes: 0, prompts: 0 };
  const process = Object.assign(new EventEmitter(), { start() {}, stop() {} });
  const audio = Object.assign(new EventEmitter(), {
    started: 0,
    stopped: 0,
    start() {
      this.started += 1;
    },
    stop() {
      this.stopped += 1;
    },
    resetPrompt() {},
    dismiss() {},
    setUserRecording() {},
  });
  const windowManager = {
    notificationPrefs: { notificationsEnabled: true, notifyMeetingDetection: true },
    isConversationRecording: () => recording,
    async sendToggleConversation() {
      calls.toggles += 1;
    },
    showMeetingNotification() {
      calls.prompts += 1;
    },
    dismissMeetingNotification() {},
  };
  const database = {
    saveNote() {
      calls.notes += 1;
      return { note: { id: 1 } };
    },
    getMeetingsFolder: () => ({ id: 1 }),
  };
  const engine = new MeetingDetectionEngine(process, audio, windowManager, database);
  return { engine, calls, audio };
}

test("audio detection starts off until the user's preference turns it on", () => {
  const { engine, audio } = fakes();
  engine.start();
  assert.equal(engine.getPreferences().audioDetection, false);
  assert.equal(audio.started, 0, "the microphone listener is not started at launch");
  engine.setPreferences({ audioDetection: true });
  assert.equal(audio.started, 1);
});

test("Take notes starts a conversation and leaves no note behind", async () => {
  const { engine, calls } = fakes();
  engine.setPreferences({ audioDetection: true });
  engine._handleDetection("audio", "sustained-audio", {});
  assert.equal(calls.prompts, 1, "the prompt was shown");
  await engine.handleNotificationResponse("audio:sustained-audio", "start");
  assert.equal(calls.toggles, 1);
  assert.equal(calls.notes, 0, "no orphan note");
  // Meeting mode is not left stuck: the next call is still detected.
  engine._handleDetection("audio", "sustained-audio", {});
  assert.equal(calls.prompts, 2);
});

test("the meeting hotkey starts a conversation the same way", async () => {
  const { engine, calls } = fakes();
  await engine.startManualMeeting();
  assert.equal(calls.toggles, 1);
  assert.equal(calls.notes, 0);
});

test("nothing is toggled while a conversation is already recording — that would stop it", async () => {
  const { engine, calls } = fakes({ recording: true });
  await engine.startManualMeeting();
  engine.setPreferences({ audioDetection: true });
  engine._handleDetection("audio", "sustained-audio", {});
  await engine.handleNotificationResponse("audio:sustained-audio", "start");
  assert.equal(calls.toggles, 0);
});
