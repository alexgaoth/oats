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

// --- Sorting with the writing model (stores/conversationGroupSortStore.ts).

const SORTER = read("src/stores/conversationGroupSortStore.ts");
const ACTIONS = read("src/stores/actionProcessingStore.ts");

test("the model's choice and the conversations left to sort reach the main process", () => {
  for (const [method, channel, args] of [
    ["setConversationGroupFromModel", "db-set-conversation-group-from-model", "noteId, groupId"],
    ["listUnsortedConversations", "db-list-unsorted-conversations", ""],
  ]) {
    const invoke = args
      ? `ipcRenderer.invoke("${channel}", ${args})`
      : `ipcRenderer.invoke("${channel}")`;
    assert.ok(
      PRELOAD.replace(/\s+/g, " ").includes(`${method}: (${args}) => ${invoke}`),
      `preload.js exposes ${method}`
    );
    assert.ok(
      HANDLERS.includes(`ipcMain.handle("${channel}"`),
      `ipcHandlers.js handles ${channel}`
    );
    assert.match(TYPES, new RegExp(`\\b${method}\\?: \\(`), `electron.ts types ${method}`);
  }
});

test("the summary sorts its conversation by the same model and route, after it is written", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("export function runBackgroundAction"));
  const claim = body.indexOf("await claimWritingModel()");
  const summary = body.indexOf("reasoningService.processText(noteContent, modelId");
  const written = body.indexOf("await window.electronAPI.updateNote(noteId, updates)");
  const sorted = body.indexOf("await sortConversationIntoGroup(noteId, {");
  assert.ok(
    claim > 0 && claim < summary,
    "the background sort steps aside before the summary asks"
  );
  assert.ok(
    written > summary && sorted > written,
    "the group is chosen after the summary is saved"
  );
  assert.match(
    body.slice(sorted, sorted + 260),
    /modelId,\s*mode: noteFormatting\.mode,\s*config: \{ \.\.\.providerOverrides, disableThinking: noteFormatting\.disableThinking \},\s*\}\)\.catch\(/
  );
  // Each try releases its claim on the model, whatever happens to it (a failed
  // summary is tried twice: helpers/summaryQueue.mjs), and the cancel flag goes
  // when the last try ends.
  assert.match(body, /finally \{\s*release\(\);\s*\}/);
  assert.match(body, /finally \{\s*cancelledFlags\.delete\(noteId\);\s*\}/);
});

test("sorting opens no connection of its own: its one request is the reasoning service's", () => {
  const code = SORTER.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const forbidden of [/\bfetch\(/, /XMLHttpRequest/, /WebSocket/, /openExternal/, /\bnet\./]) {
    assert.doesNotMatch(code, forbidden);
  }
  assert.equal((code.match(/reasoningService\.processText\(/g) ?? []).length, 1);
  assert.match(
    code,
    /reasoningService\.processText\(prompt\.text, route\.modelId, null, \{\s*\.\.\.route\.config,/
  );
  // The background route is the summary's, built the same way.
  assert.match(
    code,
    /buildNoteFormattingOverrides\(noteFormatting, isCloudMode, noteFormatting\.customApiKey\)/
  );
  assert.match(
    ACTIONS,
    /buildNoteFormattingOverrides\(\s*noteFormatting,\s*options\.isCloudMode,\s*noteFormatting\.customApiKey\s*\)/
  );
  // In the background, only on this computer or the person's own server.
  assert.match(code, /const BACKGROUND_MODES = new Set\(\["local", "self-hosted"\]\);/);
});

test("the harness writes the model's choice by the database's rules", async () => {
  const main = createFakeMain({ fixtures: [] });
  const { api, db } = main;
  const [work, personal] = await api.getConversationGroups();
  const make = async (title, summary) => {
    const { note } = await api.saveNote(title, "", "meeting");
    if (summary) db.updateNote(note.id, { enhanced_content: summary });
    return note;
  };
  const one = await make("Pricing call", "Thirty percent off.");
  const two = await make("Flat viewing", "Two rooms and a balcony.");
  const three = await make("Still recording", null);
  assert.deepEqual((await api.listUnsortedConversations()).sort(), [one.id, two.id].sort());

  await api.setConversationGroup(two.id, personal.id);
  assert.deepEqual(await api.setConversationGroupFromModel(two.id, work.id), {
    success: false,
    error: "chosen",
  });
  const sorted = await api.setConversationGroupFromModel(one.id, work.id);
  assert.deepEqual([sorted.note.group_id, sorted.note.group_source], [work.id, "model"]);
  assert.deepEqual(await api.listUnsortedConversations(), []);
  assert.equal(three.group_source, null);
});
