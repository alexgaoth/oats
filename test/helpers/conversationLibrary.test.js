const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

let library;
test.before(async () => {
  library = await import("../../src/helpers/conversationLibrary.mjs");
});

const transcript = JSON.stringify([
  null,
  { text: "The café project needs another look.", timestamp: 1000 },
  { id: "s2", text: "We should test the counter-example." },
]);
const row = {
  id: 1,
  title: "Research",
  created_at: "2026-01-01 00:00:00",
  note_type: "meeting",
  transcript,
  conversation_topics: JSON.stringify({
    nodes: [
      { label: "Café project", words: ["research", "counter-example"], description: "Inferred" },
    ],
  }),
};

test("criteria are explicit, typed, versioned and reject unknown fields", () => {
  const criteria = { query: " café ", groupId: null, markedOnly: false, openQuestionsOnly: true };
  const clean = { ...criteria, query: "café" };
  assert.deepEqual(library.validateCriteria(criteria), clean);
  assert.deepEqual(library.decodeCriteria(JSON.stringify({ version: 1, criteria })), clean);
  for (const value of [
    null,
    [],
    { query: 1 },
    { markedOnly: 1 },
    { groupId: 0 },
    { subject: "café" },
    { query: "x".repeat(2001) },
  ]) {
    assert.throws(() => library.validateCriteria(value));
  }
  for (const value of [
    "",
    "{",
    "null",
    '{"version":2,"criteria":{}}',
    '{"version":1,"criteria":{},"extra":1}',
    '{"version":1,"criteria":{"bad":true}}',
  ]) {
    assert.equal(library.decodeCriteria(value), null);
  }
  assert.deepEqual(library.validateCriteria({}), {});
});

test("names use NFC, normalized whitespace and strict limits", () => {
  assert.equal(library.libraryName("  Cafe\u0301 \n ideas "), "Café ideas");
  assert.equal(library.libraryName("a".repeat(80)).length, 80);
  for (const value of [null, 1, "", " \n", "a".repeat(81)])
    assert.throws(() => library.libraryName(value));
  for (const id of [0, -1, 1.5, NaN, "1", Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => library.positiveId(id));
});

test("subjects match normalized topic phrases, not partial words or descriptions", () => {
  assert.equal(library.matchesSubject(row.conversation_topics, "cafe project"), true);
  assert.equal(library.matchesSubject(row.conversation_topics, "CAFÉ  project"), true);
  assert.equal(library.matchesSubject(row.conversation_topics, "counter example"), true);
  assert.equal(library.matchesSubject(row.conversation_topics, "search"), false);
  assert.equal(library.matchesSubject(row.conversation_topics, "Inferred"), false);
  for (const raw of [null, "{", "[]", '{"nodes":[null,1,{}]}'])
    assert.equal(library.matchesSubject(raw, "cafe"), false);
});

test("library rows return actual transcript evidence, separate topic descriptions and unknown counts", () => {
  const item = library.libraryConversation(row, "cafe");
  assert.deepEqual(item.excerpt, {
    text: "The café project needs another look.",
    segmentId: "legacy-1",
  });
  assert.equal(item.openQuestionCount, null);
  assert.equal(item.markedCount, 0);
  assert.equal(item.topics[0].description, "Inferred");
  assert.equal("transcript" in item, false);
  assert.equal(
    library.libraryConversation(
      { ...row, enhanced_content: "Inferred summary", transcript: null },
      "summary"
    ).excerpt,
    null
  );
  assert.equal(
    library.libraryConversation({
      ...row,
      transcript: "[]",
      conversation_topics: "{",
      conversation_marks: "{",
    }).excerpt,
    null
  );
  assert.equal(library.libraryConversation({ ...row, transcript: '[{"broken"' }).excerpt, null);
  assert.equal(
    library.libraryConversation({ ...row, transcript: "An early plain transcript" }).excerpt
      .segmentId,
    null
  );
  assert.equal(library.libraryConversation({ ...row, open_questions: 0 }).openQuestionCount, 0);
  assert.equal(
    library.libraryConversation({ ...row, open_questions: "2" }).openQuestionCount,
    null
  );
  assert.equal(
    library.libraryConversation({ ...row, conversation_marks: '[null,{},{"at":12}]' }).markedCount,
    1
  );
});

test("source ranges validate active meetings and preserve positional legacy ids", () => {
  assert.deepEqual(
    library.librarySegments(transcript).map((s) => s.id),
    ["legacy-1", "s2"]
  );
  const source = { noteId: 1, segmentId: "legacy-1", start: 4, end: 8 };
  assert.equal(library.passageSource(row, source).hash.length, 64);
  for (const update of [
    { segmentId: "missing" },
    { start: -1 },
    { end: 999 },
    { end: 4 },
    { start: 1.5 },
    { start: null },
    { extra: true },
    { noteId: "1" },
  ])
    assert.throws(() => library.passageSource(row, { ...source, ...update }));
  for (const badRow of [
    null,
    { ...row, deleted_at: "now" },
    { ...row, note_type: "personal" },
    { ...row, transcript: "{}" },
  ]) {
    assert.throws(() => library.passageSource(badRow, source));
  }
});

test("subject excerpts quote a matching later turn, never the unrelated first turn or inferred text", () => {
  const subjectRow = {
    ...row,
    transcript: JSON.stringify([
      { id: "intro", text: "The weather is pleasant." },
      { id: "evidence", text: "The café project needs another look." },
    ]),
  };
  assert.deepEqual(library.libraryConversation(subjectRow, "", "cafe project").excerpt, {
    text: "The café project needs another look.",
    segmentId: "evidence",
  });
  assert.equal(
    library.libraryConversation(subjectRow, "weather", "cafe project").excerpt.segmentId,
    "evidence"
  );
  const graphOnly = {
    ...subjectRow,
    title: "Café project",
    enhanced_content: "The café project was inferred here.",
    transcript: JSON.stringify([{ id: "intro", text: "The weather is pleasant." }]),
  };
  const withoutEvidence = library.libraryConversation(graphOnly, "", "cafe project");
  assert.equal(withoutEvidence.excerpt, null);
  assert.equal(withoutEvidence.topics[0].label, "Café project");
  assert.equal(withoutEvidence.topics[0].description, "Inferred");
  assert.equal(library.libraryConversation(graphOnly, "weather").excerpt.segmentId, "intro");
  assert.equal(library.libraryConversation(graphOnly).excerpt.segmentId, "intro");
});

test("source changes are honest, deletion retains coordinates but never deleted text or title", () => {
  const range = library.passageSource(row, { noteId: 1, segmentId: "legacy-1", start: 4, end: 8 });
  const link = {
    id: 9,
    note_id: 1,
    segment_id: "legacy-1",
    start_offset: 4,
    end_offset: 8,
    source_hash: range.hash,
    note: "My idea",
    created_at: "2026-01-01",
  };
  assert.equal(library.resolvePassage(link, row).quote, "café");
  const changed = library.resolvePassage(link, {
    ...row,
    transcript: transcript.replace("café", "cave"),
  });
  assert.equal(changed.sourceStatus, "changed");
  assert.equal(changed.quote, "");
  assert.equal(changed.currentQuote, "cave");
  const shortened = library.resolvePassage(link, { ...row, transcript: '[null,{"text":"Hi"}]' });
  assert.equal(shortened.sourceStatus, "changed");
  assert.equal(shortened.quote, "");
  assert.equal(shortened.currentQuote, "");
  for (const unavailable of [null, { ...row, deleted_at: "now" }]) {
    const result = library.resolvePassage(link, unavailable);
    assert.equal(result.sourceStatus, "missing");
    assert.equal(result.quote, "");
    assert.equal(result.currentQuote, null);
    assert.equal(result.title, "");
    assert.equal(result.note, "My idea");
    assert.equal(result.noteId, 1);
  }
});

test("preload exposes all library channels and change listener cleanup", async () => {
  const invocations = [];
  const listeners = new Map();
  let api;
  const preload = fs.readFileSync(path.join(__dirname, "../../preload.js"), "utf8");
  vm.runInNewContext(preload, {
    require: (name) => {
      assert.equal(name, "electron");
      return {
        contextBridge: {
          exposeInMainWorld: (_name, value) => {
            api = value;
          },
        },
        ipcRenderer: {
          invoke: (...args) => {
            invocations.push(args);
            return Promise.resolve();
          },
          on: (channel, listener) => listeners.set(channel, listener),
          removeListener: (channel, listener) => {
            if (listeners.get(channel) === listener) listeners.delete(channel);
          },
        },
      };
    },
  });
  const calls = [
    ["listLibraryConversations", "db-list-library-conversations", { limit: 1 }],
    ["getWorkingSets", "db-get-working-sets"],
    ["createWorkingSet", "db-create-working-set", "Ideas"],
    ["renameWorkingSet", "db-rename-working-set", 1, "Research"],
    ["deleteWorkingSet", "db-delete-working-set", 1],
    ["getWorkingSet", "db-get-working-set", 1],
    ["addWorkingSetPassage", "db-add-working-set-passage", 1, { noteId: 2, segmentId: "s" }],
    ["updateWorkingSetPassage", "db-update-working-set-passage", 1, 3, { note: "Idea" }],
    ["removeWorkingSetPassage", "db-remove-working-set-passage", 1, 3],
    ["listSavedViews", "db-list-saved-library-views"],
    [
      "saveLibraryView",
      "db-save-library-view",
      { name: "Open", criteria: { openQuestionsOnly: true } },
    ],
    ["deleteLibraryView", "db-delete-library-view", 4],
  ];
  for (const [method, channel, ...args] of calls) {
    await api[method](...args);
    assert.deepEqual(invocations.pop(), [channel, ...args]);
  }
  let count = 0;
  const cleanup = api.onConversationLibraryChanged(() => {
    count++;
  });
  listeners.get("conversation-library-changed")({}, "ignored");
  assert.equal(count, 1);
  cleanup();
  assert.equal(listeners.has("conversation-library-changed"), false);
});

test("IPC library writes broadcast only after successful completion; reads and rejected writes do not", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../../src/helpers/ipcHandlers.js"), "utf8");
  const start = source.indexOf("    const libraryMethods = [");
  const end = source.indexOf('    ipcMain.handle("db-update-note"', start);
  assert.ok(start > 0 && end > start);
  const handlers = new Map();
  const events = [];
  const controller = {
    databaseManager: {
      getWorkingSets: async () => [],
      createWorkingSet: async (name) => {
        if (name === "reject") throw new Error("Write failed");
        return { id: 1, name, count: 0 };
      },
    },
    broadcastToWindows: (channel) => events.push(channel),
  };
  const register = vm.runInNewContext(`(function(ipcMain) {${source.slice(start, end)}})`);
  register.call(controller, { handle: (channel, handler) => handlers.set(channel, handler) });
  assert.equal(handlers.size, 12);
  await handlers.get("db-get-working-sets")({});
  assert.deepEqual(events, []);
  await assert.rejects(handlers.get("db-create-working-set")({}, "reject"), /Write failed/);
  assert.deepEqual(events, []);
  const pending = handlers.get("db-create-working-set")({}, "Ideas");
  assert.deepEqual(events, []);
  assert.equal((await pending).name, "Ideas");
  assert.deepEqual(events, ["conversation-library-changed"]);

  const broadcastStart = source.indexOf("  broadcastToWindows(channel, payload) {");
  const broadcastEnd = source.indexOf("\n}\n\nmodule.exports", broadcastStart);
  const sent = [[], []];
  const windows = [
    { isDestroyed: () => false, webContents: { send: (...args) => sent[0].push(args) } },
    { isDestroyed: () => false, webContents: { send: (...args) => sent[1].push(args) } },
    { isDestroyed: () => true },
  ];
  const broadcaster = vm.runInNewContext(`({${source.slice(broadcastStart, broadcastEnd)}})`, {
    BrowserWindow: { getAllWindows: () => windows },
  });
  for (const channel of [
    "note-added",
    "note-updated",
    "note-deleted",
    "conversation-groups-changed",
  ]) {
    broadcaster.broadcastToWindows(channel, { id: 1 });
  }
  for (const calls of sent) {
    assert.equal(calls.length, 8);
    assert.equal(calls.filter(([channel]) => channel === "conversation-library-changed").length, 4);
  }
});
