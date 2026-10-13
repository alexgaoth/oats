const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Conversation groups: Work, Personal and the person's own, one per
// conversation. The database half is test/db/conversationGroups.test.js; this
// pins the wiring at source level (the components need a DOM) and holds the
// demo harness's fake main process to the database's rules, since the board
// and the screenshots are built against it.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const PRELOAD = read("preload.js");
const HANDLERS = read("src/helpers/ipcHandlers.js");
const TYPES = read("src/types/electron.ts");
const DATABASE = read("src/helpers/database.js");
const LOCALES = ["en", "es", "fr", "de", "pt", "it", "ru", "ja", "zh-CN", "zh-TW"];

let createFakeMain;

test.before(async () => {
  ({ createFakeMain } = await import("../../demo/harness/fake-main.mjs"));
});

// Each renderer call, the channel it invokes, and the arguments it passes on.
const CALLS = [
  ["getConversationGroups", "db-get-conversation-groups", ""],
  ["createConversationGroup", "db-create-conversation-group", "name"],
  ["renameConversationGroup", "db-rename-conversation-group", "id, name"],
  ["deleteConversationGroup", "db-delete-conversation-group", "id"],
  ["reorderConversationGroups", "db-reorder-conversation-groups", "ids"],
  ["setConversationGroup", "db-set-conversation-group", "noteId, groupId"],
];

test("every group call reaches a handler in the main process, and is typed", () => {
  for (const [method, channel, args] of CALLS) {
    const invoke = args
      ? `ipcRenderer.invoke("${channel}", ${args})`
      : `ipcRenderer.invoke("${channel}")`;
    assert.ok(
      PRELOAD.replace(/\s+/g, " ").includes(`${method}: (${args}) => ${invoke}`),
      `preload.js exposes ${method} on ${channel}`
    );
    assert.ok(
      HANDLERS.includes(`ipcMain.handle("${channel}"`),
      `ipcHandlers.js handles ${channel}`
    );
    // Optional, so the board can ask for it by feature detection.
    assert.match(TYPES, new RegExp(`\\b${method}\\?: \\(`), `electron.ts types ${method}`);
  }
  assert.match(
    PRELOAD,
    /onConversationGroupsChanged: registerListener\(\s*"conversation-groups-changed"/
  );
  assert.match(HANDLERS, /broadcastToWindows\("conversation-groups-changed", change\)/);
  assert.match(TYPES, /\bonConversationGroupsChanged\?: \(/);
});

test("a person's move is announced like any change to a note, and changes no timestamp", () => {
  const handler = HANDLERS.slice(HANDLERS.indexOf('ipcMain.handle("db-set-conversation-group"'));
  assert.match(
    handler.slice(0, handler.indexOf("});")),
    /broadcastToWindows\("note-updated", result\.note\)/
  );
  const method = DATABASE.slice(DATABASE.indexOf("  setConversationGroup(noteId, groupId) {"));
  const body = method.slice(0, method.indexOf("\n  }\n"));
  assert.match(body, /UPDATE notes SET group_id = \?, group_source = 'user' WHERE id = \?/);
  assert.doesNotMatch(body, /updated_at|sync_status/);
});

test("the seeded groups are named in every locale, and so is everything the menu says", () => {
  const seeds = [...DATABASE.matchAll(/\{ seedKey: "(\w+)", name: "[^"]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(seeds, ["work", "personal"]);
  for (const locale of LOCALES) {
    const groups = require(`../../src/locales/${locale}/translation.json`).oats.groups;
    for (const seed of seeds) assert.ok(groups.seed[seed], `${locale}: oats.groups.seed.${seed}`);
    for (const key of ["moveTo", "none", "new", "newTitle", "nameLabel", "create", "moveFailed"]) {
      assert.ok(groups[key], `${locale}: oats.groups.${key}`);
    }
    assert.match(groups.movedTo, /\{\{group\}\}/, `${locale}: movedTo names the group`);
    assert.match(groups.errors.nameTooLong, /\{\{max\}\}/, `${locale}: the limit is a number`);
  }
});

test("the harness keeps groups by the database's rules", async () => {
  const main = createFakeMain({ fixtures: [] });
  const { api } = main;
  const changes = [];
  api.onConversationGroupsChanged((change) => changes.push(change));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

  const seeded = await api.getConversationGroups();
  assert.deepEqual(
    seeded.map(({ name, seed_key, sort_order }) => ({ name, seed_key, sort_order })),
    [
      { name: "Work", seed_key: "work", sort_order: 0 },
      { name: "Personal", seed_key: "personal", sort_order: 1 },
    ]
  );
  assert.deepEqual(await api.createConversationGroup(" "), {
    success: false,
    error: "name-required",
  });
  assert.deepEqual(await api.createConversationGroup("x".repeat(41)), {
    success: false,
    error: "name-too-long",
  });
  assert.deepEqual(await api.createConversationGroup("WORK"), {
    success: false,
    error: "name-taken",
  });
  const family = await api.createConversationGroup("  Family  trips ");
  assert.equal(family.success, true);
  assert.equal(family.group.name, "Family trips");
  assert.equal(family.group.sort_order, 2);

  const [work, personal] = seeded;
  const renamed = await api.renameConversationGroup(work.id, "Pellwood");
  assert.equal(renamed.group.seed_key, null);
  assert.equal((await api.renameConversationGroup(work.id, "Pellwood")).changed, false);

  const { note } = await api.saveNote("Weekend trip", "", "meeting");
  assert.equal(note.group_id, null);
  assert.equal(note.group_source, null);
  const moved = await api.setConversationGroup(note.id, personal.id);
  assert.deepEqual([moved.note.group_id, moved.note.group_source], [personal.id, "user"]);
  assert.equal(moved.note.updated_at, note.updated_at, "filing is not a change to it");

  const deleted = await api.deleteConversationGroup(personal.id);
  assert.deepEqual(deleted.notes, [{ id: note.id, group_id: null, group_source: "user" }]);
  const order = await api.reorderConversationGroups([family.group.id]);
  assert.deepEqual(
    order.groups.map((group) => group.name),
    ["Family trips", "Pellwood"]
  );

  await settle();
  assert.equal(changes.length, 4, "create, rename, delete and order are each announced");
  assert.deepEqual(changes[2].notes, deleted.notes);
});
