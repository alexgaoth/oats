// Conversation groups against a real database (src/helpers/database.js): the
// migration on a fresh database and on one from before groups, run twice; the
// name rules; rename, delete and order; and moving a conversation by hand.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-conversation-groups-"));
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

function freshDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-conversation-groups-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A DatabaseManager on `dir`, or null (and the test skipped) outside Electron. */
function openAt(t, dir) {
  userDataDir = dir;
  try {
    const db = new DatabaseManager();
    t.after(() => db.db?.open && db.db.close());
    return db;
  } catch (error) {
    if (isNativeBindingUnavailable(error)) {
      t.skip("better-sqlite3 is built for Electron; test:oats:db runs this test there");
      return null;
    }
    throw error;
  }
}

const groupNames = (db) => db.getConversationGroups().map((group) => group.name);
const noteColumns = (db) => db.db.pragma("table_info(notes)").map((column) => column.name);

function conversation(db, title, fields = {}) {
  const { note } = db.saveNote(title, "", "meeting");
  if (Object.keys(fields).length) db.updateNote(note.id, fields);
  return db.getNote(note.id);
}

// What a database looked like before groups: notes without the two columns,
// and no groups table.
function writeDatabaseFromBeforeGroups(dir) {
  const Database = require("better-sqlite3");
  const sqlite = new Database(path.join(dir, "transcriptions.db"));
  sqlite.exec(`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'Untitled Note',
      content TEXT NOT NULL DEFAULT '',
      note_type TEXT NOT NULL DEFAULT 'personal',
      source_file TEXT,
      audio_duration_seconds REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      enhanced_content TEXT,
      transcript TEXT,
      deleted_at TEXT
    );
  `);
  const insert = sqlite.prepare(
    "INSERT INTO notes (title, note_type, enhanced_content, updated_at) VALUES (?, 'meeting', ?, ?)"
  );
  insert.run("Board prep", "The team agreed the demo would slip.", "2026-09-01 10:00:00");
  insert.run("Flat viewing", "The flat is two rooms and a balcony.", "2026-09-02 18:30:00");
  sqlite.close();
}

test("a fresh database starts with Work and Personal, and notes in no group", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const groups = db.getConversationGroups();
  assert.deepEqual(
    groups.map(({ name, seed_key, sort_order }) => ({ name, seed_key, sort_order })),
    [
      { name: "Work", seed_key: "work", sort_order: 0 },
      { name: "Personal", seed_key: "personal", sort_order: 1 },
    ]
  );
  assert.ok(groups.every((group) => Number.isInteger(group.id) && group.created_at));
  assert.ok(noteColumns(db).includes("group_id"));
  assert.ok(noteColumns(db).includes("group_source"));

  const note = conversation(db, "Standup");
  assert.equal(note.group_id, null);
  assert.equal(note.group_source, null);
  // The lists read whole rows, so every note carries its group.
  const listed = db.getNotes("meeting").find((row) => row.id === note.id);
  assert.ok("group_id" in listed && "group_source" in listed);
});

test("a database from before groups gains them, keeps its notes, and runs the migration once", (t) => {
  const dir = freshDir(t);
  writeDatabaseFromBeforeGroups(dir);

  const first = openAt(t, dir);
  if (!first) return;
  assert.deepEqual(groupNames(first), ["Work", "Personal"]);
  const notes = first.getNotes("meeting");
  assert.deepEqual(notes.map((note) => note.title).sort(), ["Board prep", "Flat viewing"]);
  for (const note of notes) {
    assert.equal(note.group_id, null);
    assert.equal(note.group_source, null);
  }
  // The person reorganizes before the next launch.
  const [work, personal] = first.getConversationGroups();
  const boardPrep = notes.find((note) => note.title === "Board prep");
  assert.equal(first.setConversationGroup(boardPrep.id, personal.id).success, true);
  assert.equal(first.deleteConversationGroup(work.id).success, true);
  first.db.close();

  // The second launch runs every migration again and changes nothing.
  const second = openAt(t, dir);
  assert.deepEqual(groupNames(second), ["Personal"], "a deleted seeded group stays deleted");
  const columns = noteColumns(second);
  assert.equal(columns.filter((name) => name === "group_id").length, 1);
  assert.equal(columns.filter((name) => name === "group_source").length, 1);
  const again = second.getNote(boardPrep.id);
  assert.equal(again.group_id, personal.id);
  assert.equal(again.group_source, "user");
  assert.equal(again.title, "Board prep");
  assert.equal(again.updated_at, "2026-09-01 10:00:00");
});

test("a fresh database opened twice keeps exactly its two seeded groups", (t) => {
  const dir = freshDir(t);
  const first = openAt(t, dir);
  if (!first) return;
  first.db.close();
  const second = openAt(t, dir);
  assert.deepEqual(groupNames(second), ["Work", "Personal"]);
  assert.equal(
    second.db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'idx_notes_group_id'")
      .get().n,
    1
  );
});

test("a name is trimmed, not empty, at most 40 characters, and unique whatever its case", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  assert.deepEqual(db.createConversationGroup("   "), { success: false, error: "name-required" });
  assert.deepEqual(db.createConversationGroup(null), { success: false, error: "name-required" });
  assert.deepEqual(db.createConversationGroup("x".repeat(41)), {
    success: false,
    error: "name-too-long",
  });
  // Characters, not UTF-16 units: forty emoji are forty characters.
  assert.equal(db.createConversationGroup("🌾".repeat(40)).success, true);
  assert.equal(db.createConversationGroup("y".repeat(40)).success, true);

  const research = db.createConversationGroup("  Side   research \n");
  assert.equal(research.success, true);
  assert.equal(research.group.name, "Side research", "trimmed, and inner runs made one space");
  assert.equal(research.group.seed_key, null);
  assert.equal(research.group.sort_order, 4, "after the others");

  for (const taken of ["work", "PERSONAL", "side RESEARCH"]) {
    assert.deepEqual(db.createConversationGroup(taken), { success: false, error: "name-taken" });
  }
  // A seeded group also answers to the name it shows in the current language.
  assert.deepEqual(db.createConversationGroup("arbeit", { seedNames: { work: "Arbeit" } }), {
    success: false,
    error: "name-taken",
  });
  assert.equal(db.createConversationGroup("Arbeit").success, true, "in English it is free");
  assert.equal(groupNames(db).length, 6);
});

test("renaming a seeded group makes its name the person's", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work, personal] = db.getConversationGroups();
  const seedNames = { work: "Arbeit", personal: "Privat" };

  // The name it already shows changes nothing, and it keeps following the language.
  const same = db.renameConversationGroup(work.id, " Arbeit ", { seedNames });
  assert.equal(same.success, true);
  assert.equal(same.changed, false);
  assert.equal(db.getConversationGroup(work.id).seed_key, "work");

  assert.deepEqual(db.renameConversationGroup(work.id, "privat", { seedNames }), {
    success: false,
    error: "name-taken",
  });
  assert.deepEqual(db.renameConversationGroup(work.id, ""), {
    success: false,
    error: "name-required",
  });
  assert.deepEqual(db.renameConversationGroup(999, "Elsewhere"), {
    success: false,
    error: "not-found",
  });

  const renamed = db.renameConversationGroup(work.id, "Pellwood", { seedNames });
  assert.equal(renamed.success, true);
  assert.equal(renamed.changed, true);
  assert.deepEqual(
    { name: renamed.group.name, seed_key: renamed.group.seed_key },
    { name: "Pellwood", seed_key: null }
  );
  // Its own name in another case is not taken by itself.
  assert.equal(db.renameConversationGroup(work.id, "PELLWOOD").group.name, "PELLWOOD");
  assert.equal(db.getConversationGroup(personal.id).seed_key, "personal");
});

test("deleting a group leaves its conversations in no group, and nobody re-sorts them", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work, personal] = db.getConversationGroups();
  const byHand = conversation(db, "Hiring sync");
  const byModel = conversation(db, "Pricing call");
  const elsewhere = conversation(db, "Flat viewing");
  db.setConversationGroup(byHand.id, work.id);
  db.setConversationGroup(elsewhere.id, personal.id);
  // As the writing model leaves a conversation it sorted.
  db.db
    .prepare("UPDATE notes SET group_id = ?, group_source = 'model' WHERE id = ?")
    .run(work.id, byModel.id);

  const result = db.deleteConversationGroup(work.id);
  assert.equal(result.success, true);
  assert.equal(result.id, work.id);
  assert.deepEqual(
    result.notes.sort((a, b) => a.id - b.id),
    [
      { id: byHand.id, group_id: null, group_source: "user" },
      { id: byModel.id, group_id: null, group_source: "model" },
    ]
  );
  assert.deepEqual(groupNames(db), ["Personal"]);
  assert.equal(db.getNote(byHand.id).group_id, null);
  // Who chose stays recorded: neither is waiting to be sorted again.
  assert.equal(db.getNote(byHand.id).group_source, "user");
  assert.equal(db.getNote(byModel.id).group_source, "model");
  assert.equal(db.getNote(elsewhere.id).group_id, personal.id, "other groups are untouched");
  assert.deepEqual(db.deleteConversationGroup(work.id), { success: false, error: "not-found" });
});

test("groups take the order they are given, and the ones not named follow", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work, personal] = db.getConversationGroups();
  const family = db.createConversationGroup("Family").group;
  const reading = db.createConversationGroup("Reading").group;

  const result = db.reorderConversationGroups([reading.id, work.id]);
  assert.equal(result.success, true);
  assert.deepEqual(
    result.groups.map((group) => group.name),
    ["Reading", "Work", "Personal", "Family"]
  );
  assert.deepEqual(
    db.getConversationGroups().map((group) => group.sort_order),
    [0, 1, 2, 3]
  );
  assert.deepEqual(db.reorderConversationGroups([work.id, work.id]), {
    success: false,
    error: "invalid",
  });
  assert.deepEqual(db.reorderConversationGroups([personal.id, 999]), {
    success: false,
    error: "not-found",
  });
  assert.deepEqual(db.reorderConversationGroups("1,2"), { success: false, error: "invalid" });
  assert.deepEqual(
    groupNames(db),
    ["Reading", "Work", "Personal", "Family"],
    "a refusal moves nothing"
  );
  assert.equal(db.getConversationGroup(family.id).sort_order, 3);
});

test("a person's move is recorded as theirs and does not reorder the lists", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work, personal] = db.getConversationGroups();
  const note = conversation(db, "Weekend trip");
  db.db.prepare("UPDATE notes SET updated_at = '2026-09-03 08:00:00' WHERE id = ?").run(note.id);

  const moved = db.setConversationGroup(note.id, personal.id);
  assert.equal(moved.success, true);
  assert.equal(moved.note.group_id, personal.id);
  assert.equal(moved.note.group_source, "user");
  assert.equal(moved.note.updated_at, "2026-09-03 08:00:00", "filing is not a change to it");

  const out = db.setConversationGroup(note.id, null);
  assert.equal(out.success, true);
  assert.equal(out.note.group_id, null);
  assert.equal(out.note.group_source, "user", "No group is a choice too");

  assert.deepEqual(db.setConversationGroup(note.id, 999), { success: false, error: "not-found" });
  assert.deepEqual(db.setConversationGroup(999, work.id), { success: false, error: "not-found" });
  assert.deepEqual(db.setConversationGroup(String(note.id), work.id), {
    success: false,
    error: "not-found",
  });
  db.deleteNote(note.id);
  assert.deepEqual(db.setConversationGroup(note.id, work.id), {
    success: false,
    error: "not-found",
  });
});

test("updateNote cannot write a note's group", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work] = db.getConversationGroups();
  const note = conversation(db, "Checkpoint");
  db.updateNote(note.id, { title: "Checkpoint", group_id: work.id, group_source: "user" });
  const after = db.getNote(note.id);
  assert.equal(after.group_id, null);
  assert.equal(after.group_source, null);
});

test("the model's choice is written only where no person has chosen", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work, personal] = db.getConversationGroups();
  const fresh = conversation(db, "Pricing call");
  const chosen = conversation(db, "Weekend trip");
  db.db.prepare("UPDATE notes SET updated_at = '2026-09-04 09:00:00' WHERE id = ?").run(fresh.id);
  db.setConversationGroup(chosen.id, personal.id);

  const sorted = db.setConversationGroupFromModel(fresh.id, work.id);
  assert.equal(sorted.success, true);
  assert.deepEqual([sorted.note.group_id, sorted.note.group_source], [work.id, "model"]);
  assert.equal(sorted.note.updated_at, "2026-09-04 09:00:00", "sorting is not a change to it");

  // The model may change its own mind (a resumed conversation, summarized again)...
  const again = db.setConversationGroupFromModel(fresh.id, null);
  assert.deepEqual([again.note.group_id, again.note.group_source], [null, "model"]);

  // ...but never a person's.
  assert.deepEqual(db.setConversationGroupFromModel(chosen.id, work.id), {
    success: false,
    error: "chosen",
  });
  assert.deepEqual(db.setConversationGroupFromModel(chosen.id, null), {
    success: false,
    error: "chosen",
  });
  assert.deepEqual(
    [db.getNote(chosen.id).group_id, db.getNote(chosen.id).group_source],
    [personal.id, "user"]
  );

  // A group deleted while the model was answering, a deleted conversation, nonsense.
  assert.deepEqual(db.setConversationGroupFromModel(fresh.id, 999), {
    success: false,
    error: "not-found",
  });
  assert.equal(db.getNote(fresh.id).group_source, "model");
  db.deleteNote(fresh.id);
  assert.deepEqual(db.setConversationGroupFromModel(fresh.id, work.id), {
    success: false,
    error: "not-found",
  });
  assert.deepEqual(db.setConversationGroupFromModel("1", work.id), {
    success: false,
    error: "invalid",
  });
  assert.deepEqual(db.setConversationGroupFromModel(chosen.id, "2"), {
    success: false,
    error: "invalid",
  });
});

test("the conversations left to sort: finished, summarized, and chosen by nobody", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const [work] = db.getConversationGroups();
  const at = (note, stamp) =>
    db.db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run(stamp, note.id);
  const older = conversation(db, "Hiring sync", { enhanced_content: "Two finalists remain." });
  const newer = conversation(db, "Design crit", { enhanced_content: "The import screen." });
  const noSummary = conversation(db, "Still recording");
  const blank = conversation(db, "Blank", { enhanced_content: "   " });
  const byModel = conversation(db, "Pricing", { enhanced_content: "Thirty percent." });
  const byHand = conversation(db, "Flat viewing", { enhanced_content: "Two rooms." });
  const leftOut = conversation(db, "Standup", { enhanced_content: "Nothing new." });
  const deleted = conversation(db, "Old", { enhanced_content: "Gone." });
  const dictation = db.saveNote("A dictation", "", "personal").note;
  db.updateNote(dictation.id, { enhanced_content: "Words." });
  at(older, "2026-09-01 10:00:00");
  at(newer, "2026-09-02 10:00:00");
  db.setConversationGroupFromModel(byModel.id, work.id);
  db.setConversationGroup(byHand.id, work.id);
  db.setConversationGroupFromModel(leftOut.id, null);
  db.deleteNote(deleted.id);

  assert.deepEqual(db.listUnsortedConversations(), [newer.id, older.id]);
  assert.deepEqual(db.listUnsortedConversations({ limit: 1 }), [newer.id]);
  for (const note of [noSummary, blank, byModel, byHand, leftOut, deleted, dictation]) {
    assert.ok(!db.listUnsortedConversations().includes(note.id), note.title);
  }
});
