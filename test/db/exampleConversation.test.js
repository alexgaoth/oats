// The in-app example conversation against a real database: what the
// `db-insert-example-conversation` handler runs (src/helpers/exampleConversation.mjs).
// It goes in once, and asking again returns the copy that is there; only a new
// copy is announced to the windows, the vector index and the note files; and a
// failed insert adds nothing, which is what the failure toast says.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-example-conversation-"));
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
const fixture = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

let insertExampleConversation;

test.before(async () => {
  ({ insertExampleConversation } = await import("../../src/helpers/exampleConversation.mjs"));
});

function isNativeBindingUnavailable(error) {
  const message = String(error?.message || error);
  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("Could not locate the bindings file") ||
    message.includes("ERR_DLOPEN_FAILED")
  );
}

function createDb(t) {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-example-conversation-"));
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

const NOW = Date.UTC(2027, 2, 15, 18, 0, 0);

function insert(db, announced, options = {}) {
  return insertExampleConversation(db, options.fixture ?? fixture, {
    now: NOW,
    announce: (note) => announced.push(note),
  });
}

test("the example goes in once, and asking again returns the copy that is there", (t) => {
  const db = createDb(t);
  if (!db) return;
  const announced = [];

  const first = insert(db, announced);
  assert.equal(first.inserted, true);
  assert.equal(first.note.id, first.noteId);
  assert.equal(first.note.sample_id, "launch-readiness-review");
  assert.equal(first.note.title, fixture.note.title);
  // Announced once, with the stored row, as db-save-note announces a note.
  assert.deepEqual(
    announced.map((note) => note.id),
    [first.noteId]
  );
  assert.equal(announced[0].sample_id, "launch-readiness-review");

  const again = insert(db, announced);
  assert.equal(again.inserted, false);
  assert.equal(again.noteId, first.noteId);
  assert.equal(again.note.id, first.noteId);
  assert.equal(announced.length, 1, "a copy that is there is not announced again");
  assert.equal(db.listSampleNotes().length, 1);
  assert.deepEqual(
    db.getNotes("meeting").map((note) => note.id),
    [first.noteId]
  );
  assert.equal(db.listConversationEvents(first.noteId).length, fixture.events.length);
});

test("after Delete hides it, asking again brings a fresh copy and announces it", (t) => {
  const db = createDb(t);
  if (!db) return;
  const announced = [];
  const first = insert(db, announced);
  assert.equal(db.deleteNote(first.noteId).success, true);
  assert.equal(db.getNotes("meeting").length, 0);

  const second = insert(db, announced);
  assert.equal(second.inserted, true);
  assert.notEqual(second.noteId, first.noteId);
  assert.deepEqual(
    announced.map((note) => note.id),
    [first.noteId, second.noteId]
  );
  assert.deepEqual(
    db.getNotes("meeting").map((note) => note.id),
    [second.noteId]
  );
});

test("a failed insert adds nothing and announces nothing", (t) => {
  const db = createDb(t);
  if (!db) return;
  const announced = [];
  // The last question event is one the database refuses, so the transaction
  // fails after the note and most events were written.
  const broken = structuredClone(fixture);
  broken.events[broken.events.length - 1].kind = "not-an-event-kind";
  assert.throws(() => insert(db, announced, { fixture: broken }), /Invalid conversation event/);
  assert.equal(announced.length, 0);
  assert.equal(db.getNotes(null).length, 0);
  assert.equal(db.listSampleNotes({ includeDeleted: true }).length, 0);

  // And the real example still goes in afterwards.
  const after = insert(db, announced);
  assert.equal(after.inserted, true);
  assert.equal(announced.length, 1);
});
