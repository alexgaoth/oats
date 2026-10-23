const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  ContextService,
  transcriptPassages,
  dayOf,
} = require("../../src/helpers/contextService.js");

const waitFor = async (check, ms = 4000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

function makeFolder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oats-context-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

const PLAN =
  "# Pellwood launch\n\n## Dates\n\nPellwood goes live on October 30, after the second load test.\n";

test("the folder's Markdown and text files are indexed, nothing else", async (t) => {
  const root = makeFolder({
    "docs/launch-plan.md": PLAN,
    "notes.txt": "The billing cutover is the week after launch.",
    "image.png": "not text",
    ".git/HEAD": "ref: refs/heads/main",
    "node_modules/pkg/readme.md": "# vendored",
    "vault/2026-10-14 Standup.md": "---\noats_id: 12\n---\nPellwood goes live on October 23.",
  });
  const service = new ContextService();
  t.after(() => service.configure({ folder: null }));
  await service.configure({ folder: root });
  await waitFor(() => !service.status().indexing);
  assert.equal(service.status().files, 2);

  const [best] = await service.search({ question: "When does Pellwood go live?" });
  assert.equal(best.source.kind, "file");
  assert.equal(best.source.path, "docs/launch-plan.md");
  assert.equal(best.label, "launch-plan.md, Dates");
  assert.match(best.text, /October 30/);
});

test("a conversation Oats mirrored into the folder is not read twice", async (t) => {
  const root = makeFolder({
    "Standup.md": "---\noats_id: 12\n---\nPellwood goes live on October 23.",
  });
  const service = new ContextService();
  t.after(() => service.configure({ folder: null }));
  await service.configure({ folder: root });
  await waitFor(() => !service.status().indexing);
  assert.deepEqual(await service.search({ question: "When does Pellwood go live?" }), []);
});

test("a saved edit, a new file and a deleted file are followed", async (t) => {
  const root = makeFolder({ "plan.md": PLAN });
  const service = new ContextService();
  t.after(() => service.configure({ folder: null }));
  await service.configure({ folder: root });
  await waitFor(() => !service.status().indexing);

  fs.writeFileSync(path.join(root, "plan.md"), "# Pellwood\n\nPellwood goes live on November 6.");
  assert.ok(
    await waitFor(async () => {
      const [best] = await service.search({ question: "When does Pellwood go live?" });
      return best && /November 6/.test(best.text);
    })
  );

  fs.writeFileSync(
    path.join(root, "hiring.md"),
    "Two offers out for the platform team, both due Friday."
  );
  assert.ok(
    await waitFor(
      async () =>
        (await service.search({ question: "When are the platform offers due?" })).length > 0
    )
  );

  fs.rmSync(path.join(root, "plan.md"));
  assert.ok(
    await waitFor(
      async () => (await service.search({ question: "When does Pellwood go live?" })).length === 0
    )
  );
});

test("no folder, a missing folder, or an empty question finds nothing", async (t) => {
  const service = new ContextService();
  t.after(() => service.configure({ folder: null }));
  assert.deepEqual(await service.search({ question: "When does Pellwood go live?" }), []);
  await service.configure({ folder: path.join(os.tmpdir(), "oats-context-does-not-exist") });
  await waitFor(() => !service.status().indexing);
  assert.equal(service.status().error, "missing");
  assert.deepEqual(await service.search({ question: "" }), []);
});

test("a path outside the folder is refused", async (t) => {
  const root = makeFolder({ "plan.md": PLAN });
  const service = new ContextService();
  t.after(() => service.configure({ folder: null }));
  await service.configure({ folder: root });
  assert.equal(service.resolveInside("plan.md"), path.join(root, "plan.md"));
  assert.equal(service.resolveInside("../secrets.md"), null);
  assert.equal(service.resolveInside("/etc/passwd"), null);
  assert.equal(service.resolveInside(""), null);
});

test("past conversations are ranked by their summary and their turns", async (t) => {
  const rows = [
    {
      id: 7,
      title: "Launch review",
      created_at: "2026-10-14 17:30:00",
      enhanced_content: "## Summary\n\nThe team agreed Pellwood goes live on October 30.",
      transcript: JSON.stringify([
        { text: "So when does Pellwood go live?" },
        { text: "October 30, after the second load test." },
      ]),
    },
  ];
  const queries = [];
  const databaseManager = {
    db: {
      prepare: (sql) => ({
        all: (...args) => {
          queries.push({ sql, args });
          return rows;
        },
      }),
    },
  };
  const service = new ContextService({ databaseManager });
  t.after(() => service.configure({ folder: null }));
  const results = await service.search({ question: "When does Pellwood go live?", noteId: 9 });
  assert.ok(results.length > 0);
  assert.equal(results[0].source.kind, "conversation");
  assert.equal(results[0].source.noteId, 7);
  assert.equal(results[0].label, "Launch review (2026-10-14)");
  // Any of the question's words may match; the conversation being recorded
  // is left out.
  assert.equal(queries[0].args[0], '"pellwo"* OR "go"* OR "live"*');
  assert.equal(queries[0].args[1], 9);
});

test("a transcript becomes runs of turns, and a bad one becomes nothing", () => {
  const long = Array.from({ length: 12 }, (_, i) => ({
    text: `Turn ${i} says something about the launch plan.`,
  }));
  const passages = transcriptPassages({
    id: 3,
    title: "Standup",
    transcript: JSON.stringify(long),
  });
  assert.ok(passages.length > 1);
  assert.ok(passages.every((p) => p.docId === "conversation:3"));
  assert.deepEqual(transcriptPassages({ id: 3, title: "x", transcript: "not json" }), []);
  assert.deepEqual(transcriptPassages({ id: 3, title: "x", transcript: "{}" }), []);
});

test("a stored time reads as the day it was in UTC", () => {
  assert.equal(dayOf("2026-10-14 23:30:00"), "2026-10-14");
  assert.equal(dayOf("2026-10-14T23:30:00Z"), "2026-10-14");
  assert.equal(dayOf(""), "");
});
