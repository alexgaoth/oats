const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The example conversation (approved by the product owner, 2026-10-12): with
// nothing recorded, Home and the empty Conversations page offer the bundled
// sample. The press inserts it in the main process and opens it the way a
// Recent row does, and an "Example" badge marks it wherever its title is.
//
// The rules are pure helpers (src/helpers/exampleConversation.mjs), tested
// here; the wiring is pinned at source level, because the components need a
// DOM. The database half is test/db/exampleConversation.test.js.

const root = path.join(__dirname, "../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from > -1 && to > -1, `could not find ${start} … ${end}`);
  return source.slice(from, to);
};

const COMPONENT = read("src/components/conversation/ExampleConversation.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");
const HANDLERS = read("src/helpers/ipcHandlers.js");
const fixture = require("../../src/helpers/sampleConversations/launch-readiness-review.json");
const en = require("../../src/locales/en/translation.json");

let offersExample;
let isExampleNote;

test.before(async () => {
  ({ offersExample, isExampleNote } = await import("../../src/helpers/exampleConversation.mjs"));
});

const meeting = (id) => ({ id, note_type: "meeting" });

test("the example is offered only when there are no conversations at all", () => {
  assert.equal(offersExample({ loaded: true, notes: [] }), true);
  assert.equal(offersExample({ loaded: true, notes: null }), true);
  assert.equal(offersExample({ loaded: true, notes: [meeting(1)] }), false);
  assert.equal(offersExample({ loaded: true, notes: [meeting(1), meeting(2)] }), false);
  // A conversation is a meeting note, as Home's recent list counts them.
  assert.equal(offersExample({ loaded: true, notes: [{ id: 3, note_type: "personal" }] }), true);
});

test("nothing is offered before the list has been read", () => {
  // An empty list before the read means "not known yet": offering then would
  // flash the offer on every launch for everybody with conversations.
  assert.equal(offersExample({ loaded: false, notes: [] }), false);
  assert.equal(offersExample({ loaded: undefined, notes: [] }), false);
});

test("only a note with a sample id is an example", () => {
  assert.equal(isExampleNote({ sample_id: "launch-readiness-review" }), true);
  for (const note of [
    { sample_id: null },
    { sample_id: undefined },
    { sample_id: "" },
    { sample_id: "  " },
    {},
    null,
    undefined,
  ]) {
    assert.equal(isExampleNote(note), false, JSON.stringify(note));
  }
});

test("the offer and the badge are gated by those rules", () => {
  const offer = between(COMPONENT, "export function ExampleOffer(", "\n}\n");
  assert.match(offer, /if \(!offersExample\(\{ loaded, notes \}\)\) return null;/);
  assert.match(offer, /const notes = useNotes\(\);/);
  assert.match(offer, /const loaded = useNotesLoaded\(\);/);
  const badge = between(COMPONENT, "export function ExampleBadge(", "\n}\n");
  assert.match(badge, /if \(!isExampleNote\(note\)\) return null;/);
  // The store says when the list has been read.
  const store = read("src/stores/noteStore.ts");
  assert.match(store, /loaded: false,/);
  assert.match(store, /useNoteStore\.setState\(\{ notes: items, loaded: true \}\);/);
});

test("the offer is plain, never honey: a ghost button and a muted line", () => {
  const offer = between(COMPONENT, "export function ExampleOffer(", "\n}\n");
  assert.match(offer, /<Button\s+variant="ghost"/);
  assert.match(offer, /text-muted-foreground/);
  // Honey is New recording, Start recording and the view switches (DESIGN.md §2).
  assert.doesNotMatch(COMPONENT, /oats-cta|bg-primary|text-brand-ink|variant="(default|brand)"/);
  const badge = between(COMPONENT, "export function ExampleBadge(", "\n}\n");
  assert.match(badge, /<Badge variant="outline"/);
});

test("pressing it asks main once at a time, opens what main returns, and says when it fails", () => {
  const offer = between(COMPONENT, "export function ExampleOffer(", "\n}\n");
  assert.match(offer, /disabled=\{opening\}/);
  assert.match(offer, /window\.electronAPI\?\.insertExampleConversation\?\.\(\)/);
  // Opened the way a Recent row opens a conversation.
  assert.match(
    offer,
    /window\.dispatchEvent\(new CustomEvent\("oats-open-note", \{ detail: result\.noteId \}\)\)/
  );
  assert.match(
    WORKSPACE,
    /onOpenNote=\{\(noteId\) =>\s+window\.dispatchEvent\(new CustomEvent\("oats-open-note", \{ detail: noteId \}\)\)/
  );
  // Held before the event, so the reading view finds it before note-added.
  assert.ok(offer.indexOf("addNote(result.note)") < offer.indexOf('"oats-open-note"'));
  assert.match(offer, /title: t\("oats\.example\.failed"\)/);
  assert.match(offer, /variant: "destructive"/);
  assert.match(offer, /finally \{\s+setOpening\(false\);/);
});

test("Home offers it under the record card, where the recent list goes", () => {
  const home = between(
    WORKSPACE,
    "function ConversationSurface()",
    "\nfunction ConversationStateBridge"
  );
  const idle = home.slice(home.indexOf('{t("oats.conversation.recordTitle")}'));
  const card = idle.indexOf("</Card>");
  const offer = idle.indexOf("<ExampleOffer />");
  const recent = idle.indexOf("<RecentConversations />");
  assert.ok(card > -1 && offer > card && recent > offer, "card, then the offer, then the list");
});

test("the empty Conversations page offers it under Start recording", () => {
  const empty = between(WORKSPACE, 'title={t("oats.intelligence.empty")}', "/>\n            )");
  const start = empty.indexOf("<StartRecordingButton />");
  const offer = empty.indexOf('<ExampleOffer layout="stacked" />');
  assert.ok(start > -1 && offer > start, "Start recording first, then the example");
});

test("the badge sits beside the title on Home, in the list and in the reading view", () => {
  const recentRow = between(WORKSPACE, "function RecentRow(", "\n}\n");
  assert.match(
    recentRow,
    /\{note\.title \|\| t\("oats\.untitled"\)\}<\/span>\s+<ExampleBadge note=\{note\} \/>/
  );
  const listRow = between(WORKSPACE, "function ConversationRow(", "\n}\n");
  assert.match(
    listRow,
    /\{note\.title \|\| t\("oats\.untitled"\)\}\s+<\/span>\s+<ExampleBadge note=\{note\} \/>/
  );
  const header = between(
    WORKSPACE,
    'title={t("oats.intelligence.renameHint")}',
    "<MetaItem icon={CalendarDays}>"
  );
  assert.match(header, /<\/h1>\s+<ExampleBadge note=\{selected\}/);
});

test("main inserts it behind its own channel and announces it as a saved note", () => {
  const handler = between(
    HANDLERS,
    'ipcMain.handle("db-insert-example-conversation"',
    'ipcMain.handle("db-get-note"'
  );
  assert.match(handler, /await import\("\.\/exampleConversation\.mjs"\)/);
  assert.match(handler, /require\("\.\/sampleConversations\/launch-readiness-review\.json"\)/);
  assert.match(handler, /announce: \(note\) => this\._announceNoteAdded\(note\)/);
  assert.match(handler, /return \{ success: false, error: error\.message \}/);
  // The same follow-up as db-save-note, by construction: one method for both.
  const save = between(
    HANDLERS,
    '"db-save-note"',
    'ipcMain.handle("db-insert-example-conversation"'
  );
  assert.match(save, /this\._announceNoteAdded\(result\.note\)/);
  const announce = between(HANDLERS, "_announceNoteAdded(note) {", "\n  }\n");
  assert.match(announce, /this\.broadcastToWindows\("note-added", note\)/);
  assert.match(announce, /this\._asyncVectorUpsert\(note\)/);
  assert.match(announce, /this\._asyncMirrorWrite\(note\)/);

  assert.match(
    read("preload.js"),
    /insertExampleConversation: \(\) => ipcRenderer\.invoke\("db-insert-example-conversation"\)/
  );
  assert.match(read("src/types/electron.ts"), /insertExampleConversation\?: \(\) => Promise</);
});

test("the note under the offer describes the example that ships", () => {
  // "A nine-person launch review": a claim about the fixture, so a new
  // fixture has to change the copy too.
  const voices = new Set(fixture.note.transcript.map((segment) => segment.speaker));
  assert.equal(voices.size, 9);
  assert.match(en.oats.example.note, /\bnine-person\b/);
  assert.match(fixture.note.title, /launch review/i);
});

