const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-note-recall-"));
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

/** A DatabaseManager on `dir`, or null (and the test skipped) outside Electron. */
function openAt(t, dir) {
  userDataDir = dir;
  try {
    const db = new DatabaseManager();
    t.after(() => db.db?.close());
    return db;
  } catch (error) {
    if (isNativeBindingUnavailable(error)) {
      t.skip("better-sqlite3 is built for Electron; test:oats:db runs this test there");
      return null;
    }
    throw error;
  }
}

function freshDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-note-recall-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const transcript = (...texts) =>
  JSON.stringify(
    texts.map((text, index) => ({
      id: `seg-${index}`,
      text,
      source: "mic",
      timestamp: 1_700_000_000_000 + index * 6000,
      startMs: index * 6000,
      endMs: index * 6000 + 5000,
      speaker: `speaker_${index % 2}`,
      speakerIsPlaceholder: true,
      speakerStatus: "provisional",
    }))
  );

const titles = (rows) => rows.map((row) => row.title);

// rank 1 also compares an external-content index with its content table, which
// is where the old launch backfill shows; on a contentless table it is the
// same check as rank 0.
function integrity(db) {
  try {
    db.prepare("INSERT INTO notes_fts(notes_fts, rank) VALUES ('integrity-check', 1)").run();
    return "ok";
  } catch (error) {
    return error.message;
  }
}

// What a database looked like before this migration: the external-content index
// over title/content/summary, its three triggers, and the backfill the old code
// ran on every launch.
const OLD_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, content, enhanced_content, content='notes', content_rowid='id'
  );
  CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content, enhanced_content)
    VALUES (new.id, new.title, new.content, new.enhanced_content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, enhanced_content)
    VALUES ('delete', old.id, old.title, old.content, old.enhanced_content);
    INSERT INTO notes_fts(rowid, title, content, enhanced_content)
    VALUES (new.id, new.title, new.content, new.enhanced_content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, enhanced_content)
    VALUES ('delete', old.id, old.title, old.content, old.enhanced_content);
  END;
`;
const OLD_LAUNCH_BACKFILL = `
  INSERT OR IGNORE INTO notes_fts(rowid, title, content, enhanced_content)
  SELECT id, COALESCE(title, ''), COALESCE(content, ''), COALESCE(enhanced_content, '')
  FROM notes
`;

function writeOldSchemaDatabase(dir) {
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
  sqlite.exec(OLD_FTS);
  const insert = sqlite.prepare(
    "INSERT INTO notes (title, content, note_type, enhanced_content, transcript, deleted_at) VALUES (?, '', 'meeting', ?, ?, ?)"
  );
  insert.run(
    "Board prep",
    "The team agreed the demo would slip.",
    transcript("so what is the median seat price", "nobody in the room knew"),
    null
  );
  insert.run("Hiring sync", null, transcript("the candidate asked about the vesting cliff"), null);
  insert.run("Deleted one", null, transcript("the median seat price again"), "2026-01-01");
  insert.run("A plain-text transcript", null, "an early transcript saved as plain text", null);
  // Two more launches of the old code.
  sqlite.exec(OLD_LAUNCH_BACKFILL);
  sqlite.exec(OLD_LAUNCH_BACKFILL);
  const before = {
    integrity: integrity(sqlite),
    transcriptHits: sqlite
      .prepare("SELECT count(*) AS c FROM notes_fts WHERE notes_fts MATCH ?")
      .get('"seat"* "price"*').c,
  };
  sqlite.close();
  return before;
}

test("the migration rebuilds an old index so what was said is found, and runs once", (t) => {
  const dir = freshDir(t);
  let before;
  try {
    before = writeOldSchemaDatabase(dir);
  } catch (error) {
    if (isNativeBindingUnavailable(error)) {
      t.skip("better-sqlite3 is built for Electron; test:oats:db runs this test there");
      return;
    }
    throw error;
  }
  // The state this repairs: transcripts unindexed, and the index malformed by
  // the backfill every launch ran.
  assert.equal(before.transcriptHits, 0, "the old index never saw a transcript");
  assert.match(before.integrity, /malformed/, "the old launch backfill corrupted the index");

  const db = openAt(t, dir);
  if (!db) return;

  assert.equal(db._notesFtsIsCurrent(), true);
  assert.equal(integrity(db.db), "ok");
  assert.deepEqual(
    db.db
      .prepare("SELECT name FROM pragma_table_info('notes_fts')")
      .all()
      .map((row) => row.name),
    ["title", "content", "enhanced_content", "transcript_text", "marks_text"]
  );
  // Existing rows were backfilled: a phrase only ever said is found, the soft-
  // deleted conversation that said it too is not, and the summary still is.
  assert.deepEqual(titles(db.searchNotes("seat price")), ["Board prep"]);
  assert.deepEqual(titles(db.searchNotes("vesting cliff")), ["Hiring sync"]);
  assert.deepEqual(titles(db.searchNotes("demo would slip")), ["Board prep"]);
  assert.deepEqual(titles(db.searchNotes("plain text")), ["A plain-text transcript"]);
  // The words, not the JSON: key names and values of other fields are not text.
  for (const query of ["speaker", "speakerStatus", "provisional", "timestamp", "seg"]) {
    assert.deepEqual(db.searchNotes(query), [], query);
  }
  // The rows themselves are untouched.
  assert.equal(db.db.prepare("SELECT count(*) AS c FROM notes").get().c, 4);

  // Idempotent: a second launch finds the index current and leaves it alone.
  assert.equal(db._migrateNotesFts(), false);
  db.db.close();
  const again = openAt(t, dir);
  assert.equal(again._migrateNotesFts(), false);
  assert.deepEqual(titles(again.searchNotes("seat price")), ["Board prep"]);
  assert.equal(integrity(again.db), "ok");
});

test("the index follows every write to what was said", (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const note = db.saveNote("Standup", "", "meeting").note;
  // A conversation's content is "" — before this, nothing said was searchable.
  assert.deepEqual(db.searchNotes("migration"), []);

  db.updateNote(note.id, { transcript: transcript("the migration slipped a week") });
  assert.deepEqual(titles(db.searchNotes("migration slipped")), ["Standup"]);

  // A checkpoint rewrites the transcript; the old words go with it.
  db.updateNote(note.id, { transcript: transcript("the launch moved to friday") });
  assert.deepEqual(db.searchNotes("migration"), []);
  assert.deepEqual(titles(db.searchNotes("friday")), ["Standup"]);

  // The reader's notes on marks.
  db.updateNote(note.id, {
    conversation_marks: JSON.stringify([{ id: "m1", at: 1, note: "counterexample on churn" }]),
  });
  assert.deepEqual(titles(db.searchNotes("counterexample")), ["Standup"]);

  // A write the index does not read does not touch it.
  db.updateNote(note.id, { sync_status: "synced" });
  assert.deepEqual(titles(db.searchNotes("friday")), ["Standup"]);

  // A transcript that is not JSON never fails a write — this runs on every
  // recording checkpoint — and its words are still found.
  assert.equal(db.updateNote(note.id, { transcript: "{not json at all" }).success, true);
  assert.deepEqual(titles(db.searchNotes("json")), ["Standup"]);
  for (const odd of ['[1, null, "x", [2]]', '{"text":"an object"}', "", "[]"]) {
    assert.equal(db.updateNote(note.id, { transcript: odd }).success, true, odd);
  }

  // Soft-deleted rows are not results; a hard delete leaves the index.
  db.updateNote(note.id, { transcript: transcript("the launch moved to friday") });
  db.deleteNote(note.id);
  assert.deepEqual(db.searchNotes("friday"), []);
  db.db.prepare("DELETE FROM notes WHERE id = ?").run(note.id);
  assert.equal(
    db.db.prepare("SELECT count(*) AS c FROM notes_fts WHERE notes_fts MATCH ?").get('"friday"*').c,
    0
  );
  assert.equal(integrity(db.db), "ok");
});
