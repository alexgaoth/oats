const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-conversation-events-"));
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") {
    return {
      app: {
        getPath: () => userDataDir,
        getAppPath: () => process.cwd(),
        isReady: () => false,
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

process.env.NODE_ENV = "test";
const DatabaseManager = require("../../src/helpers/database.js");

function isNativeBindingUnavailable(error) {
  const message = String(error?.message || error);
  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("Could not locate the bindings file") ||
    message.includes("ERR_DLOPEN_FAILED")
  );
}

function createDb(t) {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-conversation-events-"));
  try {
    const db = new DatabaseManager();
    t.after(() => {
      db.db?.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    });
    return db;
  } catch (error) {
    if (isNativeBindingUnavailable(error)) {
      t.skip("better-sqlite3 is built for Electron; test:oats:db runs this test there");
      return null;
    }
    throw error;
  }
}

test("conversation events preserve parent links, order, JSON fields, and suggestion state", (t) => {
  const db = createDb(t);
  if (!db) return;
  const note = db.saveNote("Conversation", "", "meeting").note;

  const question = db.insertConversationEvent({
    noteId: note.id,
    kind: "question",
    segmentIds: ["seg-1"],
    text: "What is Kubernetes?",
    metadata: { confidence: 0.9 },
    createdAt: 100,
  });
  const response = db.insertConversationEvent({
    noteId: note.id,
    kind: "response",
    parentEventId: question.id,
    segmentIds: ["seg-2"],
    text: "I don't know.",
    metadata: { reason: "denied_knowledge" },
    createdAt: 101,
  });
  const suggestion = db.insertConversationEvent({
    noteId: note.id,
    kind: "search_suggestion",
    parentEventId: question.id,
    segmentIds: ["seg-1", "seg-2"],
    text: "what is Kubernetes",
    metadata: { query: "what is Kubernetes", state: "shown" },
    createdAt: 102,
  });

  assert.equal(response.parentEventId, question.id);
  assert.equal(suggestion.parentEventId, question.id);
  assert.deepEqual(suggestion.segmentIds, ["seg-1", "seg-2"]);

  const opened = db.updateConversationSuggestionState(suggestion.id, "opened");
  assert.equal(opened.metadata.state, "opened");
  assert.deepEqual(
    db.listConversationEvents(note.id).map((event) => event.kind),
    ["question", "response", "search_suggestion"]
  );
  assert.throws(() => db.updateConversationSuggestionState(suggestion.id, "clicked"));
});
