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

/**
 * `count` meeting notes, newest first by updated_at: index 0 is the newest.
 * Returns their ids in that order.
 */
function seedConversations(db, count, transcriptFor) {
  const ids = [];
  const insert = db.db.prepare(
    "INSERT INTO notes (title, content, note_type, transcript, updated_at, client_note_id) VALUES (?, '', 'meeting', ?, datetime('now', ?), ?)"
  );
  db.db.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      const result = insert.run(
        `Conversation ${index}`,
        transcriptFor(index),
        `-${index} minutes`,
        `client-${index}`
      );
      ids.push(Number(result.lastInsertRowid));
    }
  })();
  return ids;
}

test("a search finds a conversation older than the newest hundred", async (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const ids = seedConversations(db, 105, (index) =>
    index === 103
      ? transcript("small talk", "and then the dolphin protocol came up", "我们讨论了价格问题")
      : transcript(`ordinary conversation number ${index}`)
  );
  const oldest = ids[103];

  // The renderer's window: the hundred newest. The conversation is not in it,
  // which is how it became unfindable.
  const held = db.getNotes("meeting", 100).map((note) => note.id);
  assert.equal(held.length, 100);
  assert.equal(held.includes(oldest), false);

  const found = await db.recallNotes("dolphin protocol", { excludeIds: held });
  assert.deepEqual(
    found.map((note) => note.id),
    [oldest]
  );
  // A whole row, so the result can show its passage and be opened.
  assert.equal(typeof found[0].transcript, "string");

  // The same fold as the renderer's filter: case and accents.
  assert.deepEqual(
    (await db.recallNotes("DOLPHÍN", { excludeIds: held })).map((note) => note.id),
    [oldest]
  );
  // A match inside a word, and a Chinese word inside a sentence: a scan finds
  // both, where the word-prefix index finds neither.
  for (const query of ["olphin protoc", "价格"]) {
    assert.deepEqual(
      (await db.recallNotes(query, { excludeIds: held })).map((note) => note.id),
      [oldest],
      query
    );
    assert.deepEqual(db.searchNotes(query), [], `FTS cannot: ${query}`);
  }
  // Key names in the stored JSON are not words anybody said.
  assert.deepEqual(await db.recallNotes("speakerStatus", { excludeIds: held }), []);
  assert.deepEqual(await db.recallNotes("   ", { excludeIds: held }), []);

  // Soft-deleted conversations and other kinds of note are not conversations.
  db.deleteNote(oldest);
  assert.deepEqual(await db.recallNotes("dolphin", { excludeIds: held }), []);
  const personal = db.saveNote("A personal note", "", "personal").note;
  db.updateNote(personal.id, { transcript: transcript("dolphin") });
  assert.deepEqual(await db.recallNotes("dolphin", { excludeIds: held }), []);
});

test("recall returns the newest matches first, up to its limit, skipping held ones", async (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  const ids = seedConversations(db, 30, (index) =>
    transcript(index % 2 ? "the pricing question" : "nothing relevant")
  );
  const pricing = ids.filter((_, index) => index % 2);

  assert.deepEqual(
    (await db.recallNotes("pricing")).map((note) => note.id),
    pricing,
    "most recently updated first"
  );
  assert.deepEqual(
    (await db.recallNotes("pricing", { limit: 3 })).map((note) => note.id),
    pricing.slice(0, 3)
  );
  assert.deepEqual(
    (await db.recallNotes("pricing", { excludeIds: pricing.slice(0, 5) })).map((note) => note.id),
    pricing.slice(5)
  );
  // Junk options fall back rather than throw.
  assert.equal((await db.recallNotes("pricing", { limit: "9", excludeIds: "x" })).length, 15);
});

test("a newer query ends an older scan at its next pause", async (t) => {
  const db = openAt(t, freshDir(t));
  if (!db) return;
  // Enough transcript that one scan has to pause for the main process.
  const turns = Array.from({ length: 400 }, (_, index) => `turn ${index} about the roadmap`);
  seedConversations(db, 120, () => transcript(...turns));
  let asked = 0;
  const result = await db.recallNotes("a phrase nobody said", {
    shouldStop: () => {
      asked += 1;
      return true;
    },
  });
  assert.ok(asked > 0, "the scan paused at least once");
  assert.deepEqual(result, []);
});
