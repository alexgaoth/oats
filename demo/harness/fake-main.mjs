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
import { demoAgentAnswer, folderStatus, searchDemoContext } from "./context.mjs";

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

// The conversation groups a new database starts with
// (`CONVERSATION_GROUP_SEEDS` in database.js), and the longest name.
const SEEDED_GROUPS = [
  { name: "Work", seed_key: "work" },
  { name: "Personal", seed_key: "personal" },
];
const GROUP_NAME_MAX = 40;

// Where the writing model would file a fixture whose script names no group.
// The launch review is left unfiled in the app's own samples, to be sorted
// like any conversation, but the harness has no model to sort it: unfiled, it
// was missing from the Work tab on Global conversations, which reads as a bug.
export const DEMO_FILING = { "launch-readiness-review": "work" };

/** A group name as database.js stores it, and the key two names compare by. */
const cleanGroupName = (name) =>
  typeof name === "string" ? name.replace(/\s+/gu, " ").trim() : "";
const groupNameKey = (name) => cleanGroupName(name).normalize("NFC").toLowerCase();

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
    group_id: null,
    group_source: null,
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
 * @param {{ fixtures: object[], example?: object, now?: number, badges?: boolean, agent?: boolean, openai?: boolean }} options The
 *   sample fixtures to hold, placed relative to `now` exactly as
 *   `insertSampleConversations` places them, and the one the app ships as its
 *   in-app example (`insertExampleConversation`).
 */
export function createFakeMain({
  fixtures,
  example = null,
  now = Date.now(),
  badges = false,
  agent = false,
  openai = false,
}) {
  const notes = [];
  const events = [];
  const groups = SEEDED_GROUPS.map((group, index) => ({
    id: index + 1,
    name: group.name,
    seed_key: group.seed_key,
    sort_order: index,
    created_at: sqlTime(now),
  }));
  // Searches the app asked to open, in order (see openConversationSearch).
  const searches = [];
  const listeners = new Map();
  const hooks = {};
  let nextNoteId = 1;
  let nextEventId = 1;
  let nextGroupId = groups.length + 1;

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

  // A fixture, placed and stored the way `insertSampleConversations` does,
  // filed in its seeded group as `markSampleNote` files it.
  //
  // The demo's own conversations stand for somebody's real ones, so they carry
  // no `sample_id` and no "Example" badge (`badges` brings it back). The
  // harness still finds them by `demo_sample`. The example a person opens from
  // an empty Home is the app's real in-app example, badge and all.
  const storeFixture = (fixture, at, { example: inApp = false } = {}) => {
    const placed = placeSampleConversation(fixture, { now: at });
    const id = nextNoteId++;
    const groupKey = placed.group ?? DEMO_FILING[placed.sampleId] ?? null;
    const filed = groupKey ? groups.find((group) => group.seed_key === groupKey) : null;
    const note = noteRow(id, {
      ...placed.note,
      sample_id: inApp || badges ? placed.sampleId : null,
      demo_sample: placed.sampleId,
      ...(filed ? { group_id: filed.id, group_source: "model" } : {}),
    });
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
      notes.find((note) => note.demo_sample === sampleId && !note.deleted_at) ?? null,
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
    groups,
    /** The groups in their order, as `getConversationGroups` answers. */
    orderedGroups: () =>
      [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((g) => ({ ...g })),
    /** Put a note in a group as database.js does: no `updated_at`, who chose recorded. */
    placeNote(noteId, groupId, source) {
      const note = notes.find((item) => item.id === Number(noteId));
      if (!note) return null;
      note.group_id = groupId;
      note.group_source = source;
      return { ...note };
    },
  };

  // Conversation groups, by database.js's rules: names trimmed, not empty, at
  // most 40 characters and unique whatever their case. The harness is in
  // English, so a seeded group's shown name is its stored one.
  const checkGroupName = (name, exceptId = null) => {
    const clean = cleanGroupName(name);
    if (!clean) return { error: "name-required" };
    if (Array.from(clean).length > GROUP_NAME_MAX) return { error: "name-too-long" };
    const key = groupNameKey(clean);
    const taken = groups.some((group) => group.id !== exceptId && groupNameKey(group.name) === key);
    return taken ? { error: "name-taken" } : { name: clean };
  };
  const findGroup = (id) => groups.find((group) => group.id === id) ?? null;
  const announceGroups = (changedNotes = []) =>
    broadcast("onConversationGroupsChanged", { groups: db.orderedGroups(), notes: changedNotes });
  const groupApi = {
    getConversationGroups: async () => db.orderedGroups(),
    createConversationGroup: async (name) => {
      const checked = checkGroupName(name);
      if (checked.error) return { success: false, error: checked.error };
      const group = {
        id: nextGroupId++,
        name: checked.name,
        seed_key: null,
        sort_order: groups.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1,
        created_at: sqlTime(),
      };
      groups.push(group);
      announceGroups();
      return { success: true, group: { ...group } };
    },
    renameConversationGroup: async (id, name) => {
      const group = findGroup(id);
      if (!group) return { success: false, error: "not-found" };
      if (cleanGroupName(name) === group.name) {
        return { success: true, group: { ...group }, changed: false };
      }
      const checked = checkGroupName(name, id);
      if (checked.error) return { success: false, error: checked.error };
      group.name = checked.name;
      group.seed_key = null;
      announceGroups();
      return { success: true, group: { ...group }, changed: true };
    },
    deleteConversationGroup: async (id) => {
      const group = findGroup(id);
      if (!group) return { success: false, error: "not-found" };
      const changed = notes
        .filter((note) => note.group_id === id)
        .map((note) => {
          note.group_id = null;
          return { id: note.id, group_id: null, group_source: note.group_source };
        });
      groups.splice(groups.indexOf(group), 1);
      announceGroups(changed);
      return { success: true, id, notes: changed };
    },
    reorderConversationGroups: async (ids) => {
      if (!Array.isArray(ids) || !ids.every(Number.isInteger) || new Set(ids).size !== ids.length) {
        return { success: false, error: "invalid" };
      }
      const current = db.orderedGroups().map((group) => group.id);
      if (!ids.every((id) => current.includes(id))) return { success: false, error: "not-found" };
      [...ids, ...current.filter((id) => !ids.includes(id))].forEach((id, index) => {
        findGroup(id).sort_order = index;
      });
      announceGroups();
      return { success: true, groups: db.orderedGroups() };
    },
    setConversationGroup: async (noteId, groupId) => {
      const note = findNote(noteId);
      if (!note) return { success: false, error: "not-found" };
      if (groupId !== null && !findGroup(groupId)) return { success: false, error: "not-found" };
      const placed = db.placeNote(note.id, groupId, "user");
      broadcast("onNoteUpdated", placed);
      return { success: true, note: placed };
    },
    // The writing model's choice: never over a person's.
    setConversationGroupFromModel: async (noteId, groupId) => {
      if (!Number.isInteger(noteId) || (groupId !== null && !Number.isInteger(groupId))) {
        return { success: false, error: "invalid" };
      }
      const note = findNote(noteId);
      if (!note) return { success: false, error: "not-found" };
      if (note.group_source === "user") return { success: false, error: "chosen" };
      if (groupId !== null && !findGroup(groupId)) return { success: false, error: "not-found" };
      const placed = db.placeNote(note.id, groupId, "model");
      broadcast("onNoteUpdated", placed);
      return { success: true, note: placed };
    },
    listUnsortedConversations: async () =>
      notes
        .filter(
          (note) =>
            !note.deleted_at &&
            note.note_type === "meeting" &&
            note.group_source == null &&
            String(note.enhanced_content ?? "").trim()
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .map((note) => note.id),
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
      const note = storeFixture(example, Date.now(), { example: true });
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
    // The one way out to the network: in the demo it goes nowhere, but it is
    // written down, so a film can show the browser opening at that moment.
    openConversationSearch: async (request = {}) => {
      searches.push({
        query: String(request.query ?? ""),
        searchBaseUrl: String(request.searchBaseUrl ?? ""),
        at: Date.now(),
      });
      return { success: true };
    },
    dismissConversationCard: async () => ({ success: true }),

    // --- The context check (`check=1`): the demo's team folder (context.mjs).
    configureContext: async () => folderStatus({ agent }),
    getContextStatus: async () => folderStatus({ agent }),
    chooseContextFolder: async () => ({ success: false }),
    searchContext: async (query = {}) => ({
      success: true,
      passages: searchDemoContext(query.question, { agent }),
    }),
    openContextFile: async () => ({ success: true }),

    // --- Its agent (`agent=1`): a stand-in for the user's Claude Code that
    // names the service it reads, then answers, at a run's pace.
    contextAgentStatus: async () => ({
      available: agent,
      path: agent ? "/Users/demo/.local/bin/claude" : null,
      version: agent ? "2.1.302" : null,
    }),
    contextAgentCheck: async (request = {}) => {
      const run = agent ? demoAgentAnswer(request.question) : null;
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (!run) return { ok: false, reason: "unclear" };
      emit("onContextAgentProgress", { checkId: request.checkId, sources: run.sources });
      await new Promise((resolve) => setTimeout(resolve, 2600));
      const verdict =
        request.outcome === "denied" ? { ...run.verdict, verdict: "answer" } : run.verdict;
      return { ok: true, verdict, sources: run.sources };
    },
    contextAgentCancel: async () => ({ success: true }),

    // --- Conversation groups.
    ...groupApi,

    // --- OpenAI as the writing model (`loop=1`): a placeholder key, for the
    // stand-in that answers api.openai.com in the page (fastModel.mjs).
    getOpenAIKey: async () => (openai ? "demo-key-answered-in-page" : ""),

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

  return { api, db, emit, listen, listenerCount, hooks, insertEvent, searches };
}
