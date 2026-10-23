// Putting the bundled example into a real database and taking it back out
// (src/helpers/sampleConversations.mjs, DatabaseManager's sample methods).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-sample-conversations-"));
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
const example = require("../../src/helpers/sampleConversations/launch-readiness-review.json");

let samples;

test.before(async () => {
  samples = await import("../../src/helpers/sampleConversations.mjs");
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
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-sample-conversations-"));
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
const eventCount = (db, noteId) => db.listConversationEvents(noteId).length;

test("the example goes in as a recorded conversation does, marked as a sample", (t) => {
  const db = createDb(t);
  if (!db) return;
  const [result] = samples.insertSampleConversations(db, [example], { now: NOW });
  assert.equal(result.inserted, true);
  assert.equal(result.sampleId, "launch-readiness-review");

  const [note] = db.getNotes("meeting");
  assert.equal(note.id, result.noteId);
  assert.equal(note.sample_id, "launch-readiness-review");
  assert.equal(note.title, example.note.title);
  assert.equal(note.open_questions, example.note.open_questions);
  assert.equal(note.deleted_at, null);
  const placed = samples.placeSampleConversation(example, { now: NOW });
  assert.equal(note.created_at, placed.note.created_at);
  assert.equal(note.updated_at, placed.note.updated_at);
  assert.equal(note.transcript, placed.note.transcript);

  const events = db.listConversationEvents(note.id);
  assert.equal(events.length, example.events.length);
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const event of events) {
    if (event.kind === "question") continue;
    assert.equal(byId.get(event.parentEventId)?.kind, "question");
  }
  // Its words are searchable like any conversation's.
  assert.ok(db.searchNotes("Kestrel").some((found) => found.id === note.id));
});

test("inserting again keeps the one copy, unless asked to replace it", (t) => {
  const db = createDb(t);
  if (!db) return;
  const [first] = samples.insertSampleConversations(db, [example], { now: NOW });
  const [again] = samples.insertSampleConversations(db, [example], { now: NOW });
  assert.equal(again.inserted, false);
  assert.equal(again.noteId, first.noteId);
  assert.equal(db.listSampleNotes().length, 1);

  const [replaced] = samples.insertSampleConversations(db, [example], { now: NOW, replace: true });
  assert.equal(replaced.inserted, true);
  assert.notEqual(replaced.noteId, first.noteId);
  assert.equal(db.getNote(first.noteId), null);
  assert.equal(eventCount(db, first.noteId), 0);
  assert.equal(eventCount(db, replaced.noteId), example.events.length);
});

test("the normal Delete hides it, a later insert brings it back, and removal takes every copy", (t) => {
  const db = createDb(t);
  if (!db) return;
  const [first] = samples.insertSampleConversations(db, [example], { now: NOW });
  assert.equal(db.deleteNote(first.noteId).success, true);
  assert.equal(db.getNotes("meeting").length, 0);
  assert.equal(db.listSampleNotes().length, 0);

  const [second] = samples.insertSampleConversations(db, [example], { now: NOW });
  assert.equal(second.inserted, true);
  assert.equal(db.getNotes("meeting").length, 1);
  assert.equal(db.listSampleNotes({ includeDeleted: true }).length, 2);

  const recorded = db.saveNote("A conversation somebody recorded", "", "meeting").note;
  const { removed } = samples.removeSampleConversations(db);
  assert.equal(removed, 2);
  assert.equal(db.listSampleNotes({ includeDeleted: true }).length, 0);
  assert.equal(eventCount(db, first.noteId) + eventCount(db, second.noteId), 0);
  assert.deepEqual(
    db.getNotes("meeting").map((note) => note.id),
    [recorded.id]
  );
});

test("the sample marker cannot be written through updateNote", (t) => {
  const db = createDb(t);
  if (!db) return;
  const note = db.saveNote("Recorded", "", "meeting").note;
  db.updateNote(note.id, { sample_id: "launch-readiness-review", title: "Still recorded" });
  const stored = db.getNote(note.id);
  assert.equal(stored.sample_id, null);
  assert.equal(stored.title, "Still recorded");
  assert.throws(() =>
    db.markSampleNote(note.id, { sampleId: "x", createdAt: "yesterday", updatedAt: "today" })
  );
});

test("a sample is filed in the group its fixture names, as the model's choice", (t) => {
  const db = createDb(t);
  if (!db) return;
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "demo", "fixtures", name), "utf8"));
  const work = read("backend-hiring-sync.json");
  const personal = read("flat-viewing-call.json");
  const results = samples.insertSampleConversations(db, [example, work, personal], { now: NOW });
  const [workGroup, personalGroup] = db.getConversationGroups();
  const byId = (sampleId) => db.getNote(results.find((r) => r.sampleId === sampleId).noteId);

  assert.deepEqual(
    [byId("backend-hiring-sync").group_id, byId("backend-hiring-sync").group_source],
    [workGroup.id, "model"]
  );
  assert.deepEqual(
    [byId("flat-viewing-call").group_id, byId("flat-viewing-call").group_source],
    [personalGroup.id, "model"]
  );
  // The example names no group: it is left for the writing model to sort.
  assert.deepEqual(
    [byId("launch-readiness-review").group_id, byId("launch-readiness-review").group_source],
    [null, null]
  );
});

test("a sample whose seeded group was renamed or deleted stays unsorted", (t) => {
  const db = createDb(t);
  if (!db) return;
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "demo", "fixtures", name), "utf8"));
  const [workGroup, personalGroup] = db.getConversationGroups();
  db.renameConversationGroup(workGroup.id, "Pellwood");
  db.deleteConversationGroup(personalGroup.id);
  const results = samples.insertSampleConversations(
    db,
    [read("sso-fix-checkin.json"), read("family-weekend-trip.json")],
    { now: NOW }
  );
  for (const { noteId } of results) {
    const note = db.getNote(noteId);
    assert.deepEqual([note.group_id, note.group_source], [null, null], note.title);
  }
});
