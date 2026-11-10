const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

let userDataDir;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") {
    return {
      app: { getPath: () => userDataDir, getAppPath: () => process.cwd(), isReady: () => false },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
process.env.NODE_ENV = "test";
const DatabaseManager = require("../../src/helpers/database.js");

function open(t, dir) {
  const directory = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "oats-library-"));
  userDataDir = directory;
  if (!dir) t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  try {
    const db = new DatabaseManager();
    t.after(() => {
      if (db.db?.open) db.db.close();
    });
    return db;
  } catch (error) {
    if (
      /NODE_MODULE_VERSION|Could not locate the bindings file|ERR_DLOPEN_FAILED/.test(error.message)
    ) {
      t.skip("Run with Electron-as-Node: native database binding is unavailable in this runtime");
      return null;
    }
    throw error;
  }
}

function conversation(db, title = "Research", fields = {}) {
  const { note } = db.saveNote(title, "", "meeting");
  db.updateNote(note.id, {
    transcript: JSON.stringify([
      { id: "a", text: "first quoted passage" },
      { text: "second quote" },
      { id: "c", text: "third quote" },
    ]),
    ...fields,
  });
  return note.id;
}

const positions = (db, id) =>
  db.db
    .prepare("SELECT position FROM working_set_passages WHERE set_id = ? ORDER BY position")
    .all(id)
    .map((r) => r.position);

test("migration, reopen and FTS triggers preserve existing notes and durable links/views", async (t) => {
  const db = open(t);
  if (!db) return;
  const dir = userDataDir;
  // Recreate the exact pre-library state without changing the notes schema.
  db.db.exec(
    "DROP TABLE working_set_passages; DROP TABLE working_sets; DROP TABLE saved_library_views;"
  );
  const noteId = conversation(db);
  const ftsBefore = db.db
    .prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE 'notes_fts%' ORDER BY name")
    .all();
  db.db.close();
  const migrated = open(t, dir);
  const set = await migrated.createWorkingSet("Research");
  await migrated.addWorkingSetPassage(set.id, { noteId, segmentId: "legacy-1" });
  await migrated.saveLibraryView({
    name: "Open",
    criteria: { groupId: null, openQuestionsOnly: true },
  });
  assert.deepEqual(
    migrated.db
      .prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE 'notes_fts%' ORDER BY name")
      .all(),
    ftsBefore
  );
  migrated.db.close();
  const reopened = open(t, dir);
  assert.equal((await reopened.getWorkingSet(set.id)).passages[0].quote, "second quote");
  assert.deepEqual((await reopened.listSavedViews())[0].criteria, {
    groupId: null,
    openQuestionsOnly: true,
  });
  assert.equal(reopened.searchNotes("quoted").length, 1);
  reopened.db.prepare("INSERT INTO notes_fts(notes_fts, rank) VALUES ('integrity-check', 1)").run();
});

test("working sets have independent membership/notes, strict names, atomic contiguous moves and repeatable removal", async (t) => {
  const db = open(t);
  if (!db) return;
  assert.deepEqual(await db.getWorkingSets(), []);
  assert.equal(await db.getWorkingSet(99), null);
  const one = await db.createWorkingSet("  Cafe\u0301 \n work ");
  const two = await db.createWorkingSet("Other");
  assert.equal(one.name, "Café work");
  await assert.rejects(db.createWorkingSet("CAFÉ WORK"));
  await assert.rejects(db.renameWorkingSet(two.id, "cafe\u0301 work"));
  assert.equal((await db.getWorkingSet(two.id)).name, "Other");
  const noteId = conversation(db);
  const source = { noteId, segmentId: "a" };
  await db.addWorkingSetPassage(one.id, source);
  await db.addWorkingSetPassage(one.id, source);
  await db.addWorkingSetPassage(two.id, source);
  await db.addWorkingSetPassage(one.id, { noteId, segmentId: "legacy-1" });
  await db.addWorkingSetPassage(one.id, { noteId, segmentId: "c" });
  let passages = (await db.getWorkingSet(one.id)).passages;
  assert.equal(passages.length, 3);
  const first = passages[0].id;
  await db.updateWorkingSetPassage(one.id, first, { note: "my idea", position: 2 });
  assert.deepEqual(
    (await db.getWorkingSet(one.id)).passages.map((p) => p.id),
    [passages[1].id, passages[2].id, first]
  );
  assert.deepEqual(positions(db, one.id), [0, 1, 2]);
  assert.equal((await db.getWorkingSet(two.id)).passages[0].note, "");
  await assert.rejects(
    db.updateWorkingSetPassage(one.id, first, { note: "not committed", position: 3 })
  );
  await assert.rejects(db.updateWorkingSetPassage(two.id, first, { note: "wrong set" }));
  await assert.rejects(db.updateWorkingSetPassage(one.id, first, { note: "x".repeat(501) }));
  assert.equal((await db.getWorkingSet(one.id)).passages[2].note, "my idea");
  // A mid-move SQL failure must roll back every already-written position.
  db.db.exec(`CREATE TRIGGER fail_library_move BEFORE UPDATE OF position ON working_set_passages
    WHEN new.position = 1 BEGIN SELECT RAISE(ABORT, 'test move failure'); END`);
  await assert.rejects(
    db.updateWorkingSetPassage(one.id, first, { note: "no", position: 0 }),
    /test move failure/
  );
  assert.deepEqual(
    (await db.getWorkingSet(one.id)).passages.map((p) => p.id),
    [passages[1].id, passages[2].id, first]
  );
  assert.deepEqual(positions(db, one.id), [0, 1, 2]);
  db.db.exec("DROP TRIGGER fail_library_move");
  await db.removeWorkingSetPassage(one.id, passages[1].id);
  await db.removeWorkingSetPassage(one.id, passages[1].id);
  assert.deepEqual(positions(db, one.id), [0, 1]);
  await db.deleteWorkingSet(one.id);
  await db.deleteWorkingSet(one.id);
  assert.equal(await db.getWorkingSet(one.id), null);
  assert.equal((await db.getWorkingSet(two.id)).count, 1);
  assert.equal(
    db.db.prepare("SELECT count(*) AS c FROM working_set_passages WHERE set_id = ?").get(one.id).c,
    0
  );
});

test("passages validate sources, do not duplicate source data and never expose deleted source text", async (t) => {
  const db = open(t);
  if (!db) return;
  const set = await db.createWorkingSet("Ideas");
  const noteId = conversation(db);
  const personalId = db.saveNote("Personal", "", "personal").note.id;
  for (const source of [
    { noteId: personalId, segmentId: "a" },
    { noteId: 999, segmentId: "a" },
    { noteId, segmentId: "missing" },
    { noteId, segmentId: "a", start: 0, end: 999 },
  ])
    await assert.rejects(db.addWorkingSetPassage(set.id, source));
  assert.equal((await db.getWorkingSet(set.id)).count, 0);
  await db.addWorkingSetPassage(set.id, { noteId, segmentId: "a", start: 6, end: 12 });
  const fields = db.db.pragma("table_info(working_set_passages)").map((r) => r.name);
  assert.equal(
    fields.some((field) => /quote|transcript|title/.test(field)),
    false
  );
  const passage = (await db.getWorkingSet(set.id)).passages[0];
  assert.equal(passage.quote, "quoted");
  db.updateNote(noteId, {
    transcript: JSON.stringify([{ id: "a", text: "first edited passage" }]),
  });
  let current = (await db.getWorkingSet(set.id)).passages[0];
  assert.equal(current.sourceStatus, "changed");
  assert.equal(current.quote, "");
  assert.equal(current.currentQuote, "edited");
  db.deleteNote(noteId);
  assert.ok(db.getNote(noteId).transcript, "legacy getNote includes deleted rows");
  current = (await db.getWorkingSet(set.id)).passages[0];
  assert.equal(current.sourceStatus, "missing");
  assert.equal(current.currentQuote, null);
  assert.equal(current.quote, "");
  assert.equal(current.title, "");
  assert.deepEqual((await db.listLibraryConversations()).items, []);
  await assert.rejects(db.addWorkingSetPassage(set.id, { noteId, segmentId: "a" }));
  db.db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
  assert.equal((await db.getWorkingSet(set.id)).count, 1);
  assert.equal((await db.getWorkingSet(set.id)).passages[0].sourceStatus, "missing");
});

test("library pages cover more than 1000 date-ordered notes, ties, literal recall, subjects and graph membership", async (t) => {
  const db = open(t);
  if (!db) return;
  const expected = [];
  const stamp = db.db.prepare("UPDATE notes SET created_at = ? WHERE id = ?");
  db.db.transaction(() => {
    for (let i = 0; i < 1031; i++) {
      const id = conversation(db, `Row ${i}`, {
        transcript: JSON.stringify([{ text: `The café project ${i} is real.` }]),
        conversation_topics: JSON.stringify({
          nodes: [{ label: "Café project", description: "Not a quote" }],
        }),
      });
      // Deliberately scramble dates, with many ties spanning page boundaries.
      const date = new Date(Date.UTC(2026, 0, 1 + ((i * 17) % 53)))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      stamp.run(date, id);
      expected.push({ id, date });
    }
  })();
  expected.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const expectedIds = expected.map((item) => item.id);
  const first = await db.listLibraryConversations({ limit: 200, query: "cafe project" });
  assert.equal(first.items.length, 200);
  assert.deepEqual(
    first.items.map((item) => item.id),
    expectedIds.slice(0, 200)
  );
  assert.equal(first.items[0].excerpt.segmentId, "legacy-0");
  assert.equal("transcript" in first.items[0], false);
  db.updateNote(1, { title: "Edited oldest" });
  const newId = conversation(db, "New during paging");
  stamp.run("2026-12-01 00:00:00", newId);
  const seen = first.items.map((r) => r.id);
  let cursor = first.cursor;
  while (cursor !== null) {
    const page = await db.listLibraryConversations({ limit: 200, query: "cafe project", cursor });
    seen.push(...page.items.map((r) => r.id));
    cursor = page.cursor;
  }
  assert.equal(seen.length, 1031);
  assert.equal(new Set(seen).size, 1031);
  assert.deepEqual(
    seen,
    expectedIds,
    "edits and a newer insert do not move the existing date order"
  );
  const subjectIds = [];
  cursor = null;
  do {
    const page = await db.listLibraryConversations({
      subject: "CAFÉ  project",
      conversationIds: [newId],
      limit: 200,
      cursor,
    });
    subjectIds.push(...page.items.map((r) => r.id));
    cursor = page.cursor;
  } while (cursor !== null);
  assert.equal(subjectIds.length, 1032);
  assert.deepEqual(subjectIds, [newId, ...expectedIds]);
  assert.equal((await db.listLibraryConversations({ subject: "projectile" })).items.length, 0);
  assert.equal((await db.listLibraryConversations({ conversationIds: [1] })).items[0].id, 1);
  assert.equal((await db.listLibraryConversations({ conversationIds: [] })).items.length, 0);
  for (const options of [
    { limit: 201 },
    { cursor: -1 },
    { groupId: "1" },
    { surprise: true },
    { conversationIds: [null] },
  ]) {
    await assert.rejects(db.listLibraryConversations(options));
  }
});

test("numeric cursors seek by source date and id across deleted rows, ties and exact page boundaries", async (t) => {
  const db = open(t);
  if (!db) return;
  const group = db.getConversationGroups()[0];
  const stamp = db.db.prepare("UPDATE notes SET created_at = ? WHERE id = ?");
  const insert = (title, date) => {
    const id = conversation(db, title);
    stamp.run(date, id);
    db.setConversationGroup(id, group.id);
    return id;
  };
  const today = insert("Main review", "2026-11-09 12:00:00");
  const wednesday = insert("Wednesday", "2026-11-04 12:00:00");
  const friday = insert("Friday", "2026-11-06 12:00:00");
  const fridayTie = insert("Friday tie", "2026-11-06 12:00:00");
  const monday = insert("Monday", "2026-11-02 12:00:00");
  const legacy = insert("Legacy timestamp", null);
  const legacyTie = insert("Legacy timestamp tie", null);
  // Apply a SQL filter too, so its bindings must remain before seek parameters.
  const options = { groupId: group.id, limit: 2 };
  const first = await db.listLibraryConversations(options);
  assert.deepEqual(
    first.items.map((item) => item.id),
    [today, fridayTie]
  );
  assert.equal(first.cursor, fridayTie);
  db.deleteNote(fridayTie);
  db.updateNote(wednesday, { title: "Edited Wednesday", transcript: '[{"text":"Edited"}]' });
  db.db
    .prepare("UPDATE notes SET updated_at = ? WHERE id = ?")
    .run("2099-01-01 00:00:00", wednesday);
  const second = await db.listLibraryConversations({ ...options, cursor: first.cursor });
  assert.deepEqual(
    second.items.map((item) => item.id),
    [friday, wednesday]
  );
  const third = await db.listLibraryConversations({ ...options, cursor: second.cursor });
  assert.deepEqual(
    third.items.map((item) => item.id),
    [monday, legacyTie]
  );
  const fourth = await db.listLibraryConversations({ ...options, cursor: third.cursor });
  assert.deepEqual(
    fourth.items.map((item) => item.id),
    [legacy]
  );
  assert.equal(fourth.cursor, null);
  assert.deepEqual(await db.listLibraryConversations({ ...options, cursor: legacy }), {
    items: [],
    cursor: null,
  });
  // Exactly a page of results must not return a spurious next-page cursor.
  const exact = await db.listLibraryConversations({
    conversationIds: [friday, wednesday],
    limit: 2,
  });
  assert.deepEqual(
    exact.items.map((item) => item.id),
    [friday, wednesday]
  );
  assert.equal(exact.cursor, null);
  db.db.prepare("DELETE FROM notes WHERE id = ?").run(fridayTie);
  await assert.rejects(
    db.listLibraryConversations({ ...options, cursor: fridayTie }),
    /Library cursor no longer exists.*Restart/
  );
  assert.ok(
    db.db.pragma("index_list(notes)").some((index) => index.name === "idx_notes_library_created")
  );
});

test("subject history returns matching transcript evidence or no quote for nonliteral membership", async (t) => {
  const db = open(t);
  if (!db) return;
  const topic = {
    conversation_topics: '{"nodes":[{"label":"Café project","description":"Inferred"}]}',
  };
  const literal = conversation(db, "Literal", {
    ...topic,
    transcript:
      '[{"id":"intro","text":"Unrelated introduction."},{"id":"subject","text":"The café project needs a review."}]',
  });
  const inferred = conversation(db, "Café project", {
    ...topic,
    enhanced_content: "Café project",
    transcript: '[{"id":"intro","text":"A different conversation."}]',
  });
  const graphOnly = conversation(db, "Graph membership", {
    transcript: '[{"text":"Another nonliteral connection."}]',
  });
  const history = await db.listLibraryConversations({
    subject: "CAFÉ  project",
    conversationIds: [graphOnly],
  });
  const byId = new Map(history.items.map((item) => [item.id, item]));
  assert.equal(byId.get(literal).excerpt.segmentId, "subject");
  assert.equal(byId.get(literal).excerpt.text, "The café project needs a review.");
  assert.equal(byId.get(inferred).excerpt, null);
  assert.equal(byId.get(inferred).topics[0].description, "Inferred");
  assert.equal(byId.get(graphOnly).excerpt, null);
  const normal = await db.listLibraryConversations({ query: "different" });
  assert.equal(normal.items[0].excerpt.text, "A different conversation.");
});

test("saved filters are strict/versioned and missing question counts never count as open", async (t) => {
  const db = open(t);
  if (!db) return;
  assert.deepEqual(await db.listSavedViews(), []);
  assert.deepEqual(await db.listLibraryConversations(), { items: [], cursor: null });
  const unknown = conversation(db, "Unknown", { transcript: "[]", conversation_marks: "{" });
  const closed = conversation(db, "Closed", { open_questions: 0 });
  const opened = conversation(db, "Open", {
    open_questions: 2,
    conversation_marks: '[{"id":"m","at":1,"note":"check"}]',
  });
  const group = db.getConversationGroups()[0];
  db.setConversationGroup(opened, group.id);
  assert.deepEqual(
    (await db.listLibraryConversations({ openQuestionsOnly: true })).items.map((r) => r.id),
    [opened]
  );
  assert.equal(
    (await db.listLibraryConversations({ conversationIds: [unknown] })).items[0].openQuestionCount,
    null
  );
  assert.deepEqual(
    (await db.listLibraryConversations({ markedOnly: true, groupId: group.id })).items.map(
      (r) => r.id
    ),
    [opened]
  );
  assert.deepEqual(
    (await db.listLibraryConversations({ groupId: null })).items.map((r) => r.id),
    [closed, unknown]
  );
  const criteria = { query: " quote ", groupId: null, markedOnly: false, openQuestionsOnly: true };
  await db.saveLibraryView({ name: "  Research ", criteria });
  const view = (await db.listSavedViews())[0];
  assert.deepEqual(view.criteria, { ...criteria, query: "quote" });
  await assert.rejects(db.saveLibraryView({ name: "RESEARCH", criteria: {} }));
  await assert.rejects(db.saveLibraryView({ name: "Bad", criteria: { unknown: true } }));
  await assert.rejects(
    db.saveLibraryView({ id: view.id, name: "Changed", criteria: { markedOnly: "yes" } })
  );
  assert.equal((await db.listSavedViews())[0].name, "Research");
  await db.saveLibraryView({ id: view.id, name: "Marked", criteria: { markedOnly: true } });
  assert.deepEqual((await db.listSavedViews())[0].criteria, { markedOnly: true });
  db.db
    .prepare("UPDATE saved_library_views SET criteria_json = ? WHERE id = ?")
    .run('{"version":2,"criteria":{}}', view.id);
  assert.deepEqual(await db.listSavedViews(), []);
  await db.deleteLibraryView(view.id);
  await db.deleteLibraryView(view.id);
  assert.deepEqual(await db.listSavedViews(), []);
});
