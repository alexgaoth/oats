const { BrowserWindow } = require("electron");
const debugLogger = require("./debugLogger");

const PLACEHOLDER_PREFIX = { __detected__: "detected", __manual__: "manual" };

function placeholderEvent(calendarId) {
  const now = Date.now();
  return {
    id: `${PLACEHOLDER_PREFIX[calendarId]}-${now}`,
    calendar_id: calendarId,
    summary: "New note",
    start_time: new Date(now).toISOString(),
    end_time: new Date(now + 3600000).toISOString(),
    is_all_day: 0,
    status: "confirmed",
    hangout_link: null,
    conference_data: null,
    organizer_email: null,
    attendees_count: 0,
  };
}

class MeetingDetectionEngine {
  constructor(meetingProcessDetector, audioActivityDetector, windowManager, databaseManager) {
    this.meetingProcessDetector = meetingProcessDetector;
    this.audioActivityDetector = audioActivityDetector;
    this.windowManager = windowManager;
    this.databaseManager = databaseManager;
    this.activeDetections = new Map();
    // Audio detection starts off and is switched on only by the user's own
    // preference, synced from the renderer at startup
    // (`sync-notification-preferences`). Starting it on meant a call in the
    // first seconds after launch could prompt somebody who had turned it off.
    this.preferences = { processDetection: true, audioDetection: false };
    this._userRecording = false;
    this._meetingModeActive = false;
    this._notificationQueue = [];
    this._postRecordingCooldown = null;
    this._bindListeners();
  }

  _bindListeners() {
    // Process detection is context-only — track running apps but don't trigger notifications.
    // This avoids false positives from apps like FaceTime running in the background.
    this.meetingProcessDetector.on("meeting-process-detected", (data) => {
      debugLogger.info(
        "Meeting app running (context only)",
        { processKey: data.processKey, appName: data.appName },
        "meeting"
      );
    });

    this.meetingProcessDetector.on("meeting-process-ended", (data) => {
      this.activeDetections.delete(`process:${data.processKey}`);
    });

    this.audioActivityDetector.on("sustained-audio-detected", (data) => {
      this._handleDetection("audio", "sustained-audio", data);
    });
  }

  _handleDetection(source, key, data) {
    const detectionId = `${source}:${key}`;

    if (source === "audio" && !this.preferences.audioDetection) {
      debugLogger.debug("Audio detection disabled, ignoring", { detectionId }, "meeting");
      return;
    }

    if (!this._notificationsEnabledFor(source)) {
      debugLogger.info(
        "Notification disabled by preference, ignoring",
        { detectionId, source },
        "meeting"
      );
      return;
    }

    if (this.activeDetections.has(detectionId)) {
      debugLogger.debug("Detection already active, skipping", { detectionId }, "meeting");
      return;
    }

    if (this._meetingModeActive) {
      debugLogger.info(
        "Suppressing detection — meeting mode already active",
        { detectionId },
        "meeting"
      );
      return;
    }

    if (this._userRecording || this._postRecordingCooldown) {
      debugLogger.info("Detection queued — user is recording", { detectionId, source }, "meeting");
      this._notificationQueue.push({ source, key, data });
      this.activeDetections.set(detectionId, { source, key, data, dismissed: false });
      return;
    }

    debugLogger.info("Meeting detection triggered", { detectionId, source }, "meeting");
    this.activeDetections.set(detectionId, { source, key, data, dismissed: false });
    this._showPrompt(detectionId, source, key, data);
  }

  _notificationsEnabledFor() {
    const nPrefs = this.windowManager.notificationPrefs || {};
    if (nPrefs.notificationsEnabled === false) return false;
    return nPrefs.notifyMeetingDetection !== false;
  }

  _showPrompt(detectionId, source, key, data) {
    const event = data?.event ?? placeholderEvent("__detected__");

    debugLogger.info(
      "Showing notification",
      { detectionId, source, variant: "detected" },
      "meeting"
    );

    const detection = this.activeDetections.get(detectionId);
    if (detection) {
      detection.event = event;
    }

    this.windowManager.showMeetingNotification({
      detectionId,
      source,
      key,
      event,
      variant: "detected",
      joinUrl: null,
    });
  }

  async handleNotificationResponse(detectionId, action) {
    debugLogger.info("Notification response", { detectionId, action }, "meeting");
    try {
      const detection = this.activeDetections.get(detectionId);

      if (action === "start" && detection) {
        await this._startConversation("detected");
        this.audioActivityDetector.resetPrompt();
      } else if (action === "dismiss") {
        if (detection) {
          this._dismiss();
        }
      }
    } catch (error) {
      this._meetingModeActive = false;
      debugLogger.error(
        "Error handling notification response",
        { error: error?.message, detectionId, action },
        "meeting"
      );
    } finally {
      // One overlay at a time — a response settles every pending detection,
      // including any the responded prompt replaced.
      this.activeDetections.clear();
      this.windowManager.dismissMeetingNotification();
    }
  }

  async startManualMeeting() {
    debugLogger.info("Starting a conversation from the meeting hotkey", {}, "meeting");
    await this._startConversation("hotkey");
  }

  /**
   * Start a conversation the way every other entry point does.
   *
   * Both the "Take notes" prompt and the meeting hotkey used to save an empty
   * "New note" and queue a navigation that no surface listened for, so nothing
   * recorded, an orphan note was left behind each time, and meeting mode stayed
   * on until restart — silencing every later detection. They now go through the
   * same toggle as the conversation hotkey, the tray and the oat, and do
   * nothing when a conversation is already running (a toggle would stop it).
   * The recording itself suppresses further prompts (`setUserRecording`).
   */
  async _startConversation(trigger) {
    if (this.windowManager.isConversationRecording?.()) {
      debugLogger.info("Conversation already recording; nothing to start", { trigger }, "meeting");
      return;
    }
    await this.windowManager.sendToggleConversation();
  }

  handleNotificationTimeout() {
    // Expiring unanswered is not a decline: only an audio prompt's timeout cools
    // down the mic detector, so an ignored calendar reminder leaves mic detection
    // armed and joining the call late still prompts.
    const audioTimedOut = [...this.activeDetections.values()].some(
      (d) => !d.dismissed && d.source === "audio"
    );
    if (audioTimedOut) {
      this._dismiss();
    }
    this.activeDetections.clear();
    debugLogger.info(
      "Notification auto-dismissed, detections cleared",
      { audioTimedOut },
      "meeting"
    );
  }

  _flushNotificationQueue() {
    if (this._notificationQueue.length === 0) return;

    if (this._meetingModeActive) {
      debugLogger.info("Dropping queued notifications — meeting mode active", {}, "meeting");
      for (const { source, key } of this._notificationQueue) {
        this.activeDetections.delete(`${source}:${key}`);
      }
      this._notificationQueue = [];
      return;
    }

    debugLogger.info(
      "Flushing notification queue",
      { count: this._notificationQueue.length },
      "meeting"
    );

    const best = this._notificationQueue[0];
    const detectionId = `${best.source}:${best.key}`;

    const detection = this.activeDetections.get(detectionId);
    if (detection && !detection.dismissed) {
      this._showPrompt(detectionId, best.source, best.key, best.data);
    }

    this._notificationQueue = [];
  }

  _dismiss() {
    this.audioActivityDetector.dismiss();
  }

  setMeetingModeActive(active) {
    this._meetingModeActive = active;
    debugLogger.info("Meeting mode active state changed", { active }, "meeting");
    if (!active) {
      // Own mic usage during meeting mode sets hasPrompted=true; reset so future detections work
      this.audioActivityDetector.resetPrompt();
    }
  }

  setUserRecording(active) {
    this._userRecording = active;
    this.audioActivityDetector.setUserRecording(active);

    if (active) {
      if (this._postRecordingCooldown) {
        clearTimeout(this._postRecordingCooldown);
        this._postRecordingCooldown = null;
      }
    } else {
      this._postRecordingCooldown = setTimeout(() => {
        this._postRecordingCooldown = null;
        this._flushNotificationQueue();
      }, 2500);
    }
  }

  setPreferences(prefs) {
    debugLogger.info("Updating detection preferences", prefs, "meeting");
    Object.assign(this.preferences, prefs);

    if (this.preferences.processDetection) {
      this.meetingProcessDetector.start();
    } else {
      this.meetingProcessDetector.stop();
    }

    if (this.preferences.audioDetection) {
      this.audioActivityDetector.start();
    } else {
      this.audioActivityDetector.stop();
    }
  }

  getPreferences() {
    return { ...this.preferences };
  }

  start() {
    debugLogger.info("Meeting detection engine started", this.preferences, "meeting");
    if (this.preferences.processDetection) this.meetingProcessDetector.start();
    if (this.preferences.audioDetection) this.audioActivityDetector.start();
  }

  stop() {
    debugLogger.info("Meeting detection engine stopped", {}, "meeting");
    this.meetingProcessDetector.stop();
    this.audioActivityDetector.stop();
    this.activeDetections.clear();
    this._meetingModeActive = false;
    if (this._postRecordingCooldown) {
      clearTimeout(this._postRecordingCooldown);
      this._postRecordingCooldown = null;
    }
    this._notificationQueue = [];
  }

  broadcastToWindows(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }
}

module.exports = MeetingDetectionEngine;
