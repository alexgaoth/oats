const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

// The context check's search over past conversations (contextService.js), run
// against the real schema: notes_fts, its triggers, and the columns the query
// filters on.

let userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-context-"));
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
const { ContextService } = require("../../src/helpers/contextService.js");

function isNativeBindingUnavailable(error) {
  const message = String(error?.message || error);
  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("Could not locate the bindings file") ||
    message.includes("ERR_DLOPEN_FAILED")
  );
}

function createDb(t) {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-context-"));
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

const transcript = (...lines) => JSON.stringify(lines.map((text, i) => ({ id: `s${i}`, text })));

test("past conversations are found by full-text search and ranked by passage", async (t) => {
  const db = createDb(t);
  if (!db) return;
  const review = db.saveNote("Launch review", "", "meeting").note;
  db.updateNote(review.id, {
    enhanced_content: "## Summary\n\nThe team agreed Pellwood goes live on October 30.",
    transcript: transcript("When does Pellwood go live?", "October 30, after the load test."),
  });
  // The conversation being recorded: its own reply must not confirm itself.
  const current = db.saveNote("Untitled conversation", "", "meeting").note;
  db.updateNote(current.id, { transcript: transcript("I think Pellwood goes live on the 23rd.") });
  // Not conversations, or not the person's own: never context.
  const personal = db.saveNote(
    "Pellwood notes",
    "Pellwood goes live on November 2.",
    "personal"
  ).note;
  const example = db.saveNote("Example", "", "meeting").note;
  db.updateNote(example.id, { transcript: transcript("Pellwood goes live on December 1.") });
  db.db.prepare("UPDATE notes SET sample_id = 'example' WHERE id = ?").run(example.id);
  const deleted = db.saveNote("Old review", "", "meeting").note;
  db.updateNote(deleted.id, { transcript: transcript("Pellwood goes live on September 9.") });
  db.updateNote(deleted.id, { deleted_at: new Date().toISOString() });

  const service = new ContextService({ databaseManager: db });
  const passages = await service.search({
    question: "When does Pellwood go live?",
    noteId: current.id,
  });
  assert.ok(passages.length > 0);
  assert.ok(passages.every((passage) => passage.source.kind === "conversation"));
  assert.deepEqual([...new Set(passages.map((passage) => passage.source.noteId))], [review.id]);
  assert.match(passages.map((passage) => passage.text).join(" "), /October 30/);
  assert.ok(personal.id && example.id);
});

test("a question that matches nothing in the database finds nothing", async (t) => {
  const db = createDb(t);
  if (!db) return;
  const review = db.saveNote("Launch review", "", "meeting").note;
  db.updateNote(review.id, { transcript: transcript("Pellwood goes live on October 30.") });
  const service = new ContextService({ databaseManager: db });
  assert.deepEqual(await service.search({ question: "How was everyone's weekend?" }), []);
});
