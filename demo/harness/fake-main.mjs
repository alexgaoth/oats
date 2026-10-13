// A stand-in for Oats' main process: `window.electronAPI`, backed by an
// in-memory copy of the database the sample fixtures describe.
//
// It answers the calls the workspace makes (notes, question events, the
// built-in summary action, the local model, recording) with the shapes
// `preload.js` and `ipcHandlers.js` give them, and pushes the same events back
// (`note-added`, `note-updated`, `meeting-transcription-segment`, ...). Any call
// it does not know resolves to nothing, as an IPC handler that is not there
// would; any `on*` subscription it does not drive is accepted and never fires.

import { placeSampleConversation } from "../../src/helpers/sampleConversations.mjs";

// The columns `DatabaseManager.updateNote` accepts.
const UPDATABLE = new Set([
  "title",
  "content",
  "enhanced_content",
  "enhancement_prompt",
  "enhanced_at_content_hash",
  "folder_id",
  "transcript",
  "calendar_event_id",
  "participants",
  "diarization_enabled",
  "expected_speaker_count",
  "open_questions",
  "conversation_topics",
  "conversation_marks",
  "conversation_loudness",
  "sync_status",
  "deleted_at",
  "client_note_id",
  "cloud_id",
]);

const MEETINGS_FOLDER_ID = 2;

const BUILTIN_ACTION = {
  id: 1,
  name: "Generate Notes",
  description: "Clean up, structure, and enhance your notes",
  prompt:
    "Transform the provided content into clean, well-structured notes in markdown. Preserve the user's intent and all substantive information. Remove filler, small talk, false starts, and redundant content. For personal notes, improve grammar and structure for readability. For meeting transcripts, extract key discussion points, decisions, action items, and follow-ups.",
  icon: "sparkles",
  is_builtin: 1,
  sort_order: 0,
  translation_key: "notes.actions.builtin.generateNotes",
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
};

/** SQLite's `CURRENT_TIMESTAMP`: UTC, to the second. */
export function sqlTime(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `demo-${Math.random().toString(36).slice(2)}`;
}

function noteRow(id, fields) {
  return {
    id,
    title: "Untitled Note",
    content: "",
    enhanced_content: null,
    enhancement_prompt: null,
    enhanced_at_content_hash: null,
    note_type: "meeting",
    source_file: null,
    audio_duration_seconds: null,
    folder_id: MEETINGS_FOLDER_ID,
    transcript: null,
    calendar_event_id: null,
    participants: null,
    diarization_enabled: null,
    expected_speaker_count: null,
    open_questions: null,
    conversation_topics: null,
    conversation_marks: null,
    conversation_loudness: null,
    sample_id: null,
    cloud_id: null,
    created_at: sqlTime(),
    updated_at: sqlTime(),
    client_note_id: uuid(),
    sync_status: "pending",
    deleted_at: null,
    ...fields,
  };
}

/**
 * @param {{ fixtures: object[], example?: object, now?: number }} options The
 *   sample fixtures to hold, placed relative to `now` exactly as
 *   `insertSampleConversations` places them, and the one the app ships as its
 *   in-app example (`insertExampleConversation`).
 */
export function createFakeMain({ fixtures, example = null, now = Date.now() }) {
  const notes = [];
  const events = [];
  const listeners = new Map();
  const hooks = {};
  let nextNoteId = 1;
  let nextEventId = 1;

  const listen = (name, callback) => {
    if (typeof callback !== "function") return () => {};
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    hooks.listening?.(name);
    return () => listeners.get(name)?.delete(callback);
  };
  const emit = (name, ...args) => {
    for (const callback of [...(listeners.get(name) ?? [])]) callback(...args);
  };
  const listenerCount = (name) => listeners.get(name)?.size ?? 0;
  // Main broadcasts after the handler returns (`setImmediate`).
  const broadcast = (name, payload) => setTimeout(() => emit(name, payload), 0);

  const insertEvent = ({
    noteId,
    kind,
    parentEventId = null,
    segmentIds = [],
    text = "",
    metadata = {},
    createdAt = Date.now(),
  }) => {
    const event = {
      id: nextEventId++,
      noteId: Number(noteId),
      kind,
      parentEventId: parentEventId ?? null,
      segmentIds: (Array.isArray(segmentIds) ? segmentIds : []).map(String),
      text: String(text ?? ""),
      metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
      createdAt: Number(createdAt),
    };
    events.push(event);
    return { ...event, metadata: { ...event.metadata } };
  };

  // A fixture, placed and stored the way `insertSampleConversations` does.
  const storeFixture = (fixture, at) => {
    const placed = placeSampleConversation(fixture, { now: at });
    const id = nextNoteId++;
    const note = noteRow(id, { ...placed.note, sample_id: placed.sampleId });
    notes.push(note);
    const ids = new Map();
    for (const event of placed.events) {
      const stored = insertEvent({
        ...event,
        noteId: id,
        parentEventId: event.parentEventId == null ? null : (ids.get(event.parentEventId) ?? null),
      });
      ids.set(event.id, stored.id);
    }
    return note;
  };
  for (const fixture of fixtures) storeFixture(fixture, now);

  const findNote = (id) => notes.find((note) => note.id === Number(id) && !note.deleted_at) ?? null;

  const db = {
    notes,
    events,
    findNote,
    noteBySample: (sampleId) =>
      notes.find((note) => note.sample_id === sampleId && !note.deleted_at) ?? null,
    updateNote(id, updates) {
      const note = notes.find((item) => item.id === Number(id));
      if (!note) return { success: false };
      let changed = false;
      for (const [key, value] of Object.entries(updates ?? {})) {
        if (UPDATABLE.has(key) && value !== undefined) {
          note[key] = value;
          changed = true;
        }
      }
      if (!changed) return { success: false };
      if (!("sync_status" in (updates ?? {}))) note.sync_status = "pending";
      note.updated_at = sqlTime();
      const copy = { ...note };
      broadcast("onNoteUpdated", copy);
      return { success: true, note: copy };
    },
  };

  const explicit = {
    // --- The platform, and the boot-time questions.
    getPlatform: () => "darwin",
    getUiLanguage: async () => "en",
    getConversationKey: async () => "CommandOrControl+Shift+O",
    getUpdateStatus: async () => ({
      updateAvailable: false,
      updateDownloaded: false,
      isDevelopment: false,
    }),
    getUpdateInfo: async () => null,
    getPostMigrationState: async () => ({ justMigrated: false }),
    consumePendingFocusSearch: async () => false,
    checkWhisperInstallation: async () => ({ installed: true, working: true }),
    listWhisperModels: async () => ({
      success: true,
      models: [{ model: "base.en", downloaded: true }],
    }),
    modelCheck: async () => true,
    checkLocalReasoningAvailable: async () => true,

    // --- Notes.
    getNotes: async (noteType = null, limit = 100) =>
      notes
        .filter((note) => !note.deleted_at && (!noteType || note.note_type === noteType))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .slice(0, limit)
        .map((note) => ({ ...note })),
    getNote: async (id) => {
      const note = findNote(id);
      return note ? { ...note } : null;
    },
    saveNote: async (title, content = "", noteType = "personal") => {
      const note = noteRow(nextNoteId++, {
        title: String(title ?? "Untitled Note"),
        content: String(content ?? ""),
        note_type: noteType,
        folder_id: noteType === "meeting" ? MEETINGS_FOLDER_ID : 1,
      });
      notes.push(note);
      broadcast("onNoteAdded", { ...note });
      return { success: true, note: { ...note } };
    },
    updateNote: async (id, updates) => db.updateNote(id, updates),
    deleteNote: async (id) => {
      const note = findNote(id);
      if (!note) return { success: false, id };
      note.deleted_at = sqlTime();
      note.updated_at = sqlTime();
      broadcast("onNoteDeleted", { id: note.id });
      return { success: true, id: note.id };
    },
    // The in-app example (`db-insert-example-conversation`): the copy that is
    // there, or a new one, announced as main announces a saved note.
    insertExampleConversation: async () => {
      if (!example) return { success: false, error: "The demo has no example conversation." };
      const present = db.noteBySample(example.meta.id);
      if (present) {
        return { success: true, noteId: present.id, inserted: false, note: { ...present } };
      }
      const note = storeFixture(example, Date.now());
      broadcast("onNoteAdded", { ...note });
      return { success: true, noteId: note.id, inserted: true, note: { ...note } };
    },
    // Everything is held, so nothing older is left to recall, and there is
    // no vector index in a browser.
    recallNotes: async () => [],
    semanticSearchNotes: async () => [],
    searchNotes: async () => [],

    // --- Question events.
    listConversationEvents: async (noteId) =>
      events
        .filter((event) => event.noteId === Number(noteId))
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
        .map((event) => ({ ...event, metadata: { ...event.metadata } })),
    insertConversationEvent: async (input) => insertEvent(input ?? {}),
    updateConversationEventMetadata: async (id, patch) => {
      const event = events.find((item) => item.id === Number(id));
      if (!event) return null;
      event.metadata = { ...event.metadata, ...(patch ?? {}) };
      return { ...event, metadata: { ...event.metadata } };
    },
    updateConversationSuggestionState: async (id, state) => {
      const event = events.find(
        (item) => item.id === Number(id) && item.kind === "search_suggestion"
      );
      if (!event) return null;
      event.metadata = { ...event.metadata, state };
      return { ...event, metadata: { ...event.metadata } };
    },
    // The one way out to the network: in the demo it goes nowhere.
    openConversationSearch: async () => ({ success: true }),
    dismissConversationCard: async () => ({ success: true }),

    // --- The summary: the built-in action, and the local model behind it.
    getActions: async () => [{ ...BUILTIN_ACTION }],
    getAction: async (id) => (Number(id) === BUILTIN_ACTION.id ? { ...BUILTIN_ACTION } : null),
    processLocalReasoning: async (text, model, agentName, config = {}) => {
      const answer = hooks.reason?.({
        text: String(text ?? ""),
        prompt: String(config?.systemPrompt ?? ""),
      });
      if (!answer) return { success: false, error: "The demo has no model for this request." };
      if (answer.delayMs) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
      return { success: true, text: answer.text };
    },

    // --- Recording, which the replay drives.
    requestToggleConversation: async () => emit("onToggleConversation"),
    reportConversationState: () => {},
    meetingTranscriptionPrepare: async () => ({ success: true, alreadyPrepared: true }),
    meetingTranscriptionStart: async (options) =>
      (await hooks.start?.(options)) ?? {
        success: true,
        systemAudioMode: "unsupported",
        systemAudioStrategy: "unsupported",
        oneOnOneAttendee: null,
      },
    meetingTranscriptionSend: () => {},
    meetingTranscriptionStop: async () =>
      (await hooks.stop?.()) ?? {
        success: true,
        transcript: "",
        diarizationSessionId: `diar-${Date.now()}`,
      },
    meetingTranscriptionCancel: async () => ({ success: true }),
  };

  const api = new Proxy(explicit, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== "string" || prop === "then" || prop === "toJSON") return undefined;
      if (/^on[A-Z]/.test(prop)) return (callback) => listen(prop, callback);
      return async () => undefined;
    },
  });

  return { api, db, emit, listen, listenerCount, hooks, insertEvent };
}
