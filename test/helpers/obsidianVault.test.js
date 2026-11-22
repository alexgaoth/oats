const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The module is a singleton, which is what the main process wants and what a
// test has to work around: every case reconfigures it at its own folder.
const vault = require("../../src/helpers/obsidianVault");

const makeVault = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-vault-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  vault.configure({ vaultPath: dir, enabled: true });
  return dir;
};

const note = (id, body = "body") => `---\noats_id: ${id}\n---\n\n${body}\n`;

test("a write lands inside the configured folder", (t) => {
  const dir = makeVault(t);
  const result = vault.write(1, "2026-08-25 Pricing.md", note(1));
  assert.equal(result.success, true);
  assert.equal(result.filePath, path.join(dir, "2026-08-25 Pricing.md"));
  assert.match(fs.readFileSync(result.filePath, "utf8"), /oats_id: 1/);
});

test("a traversal or an absolute filename is refused", (t) => {
  const dir = makeVault(t);
  for (const bad of ["../escaped.md", "../../escaped.md", "/tmp/oats-escaped-abs.md", ".."]) {
    assert.equal(vault.write(1, bad, "x").success, false, `${bad} was not refused`);
  }
  assert.ok(!fs.existsSync(path.join(path.dirname(dir), "escaped.md")));
  assert.ok(!fs.existsSync("/tmp/oats-escaped-abs.md"));
});

test("renaming a conversation moves its note instead of leaving the old name", (t) => {
  // A conversation is titled after it is recorded, and resuming one titles it
  // again. Every name it has ever had used to stay in the vault as its own file.
  const dir = makeVault(t);
  vault.write(7, "2026-08-25 Untitled conversation.md", note(7, "first"));
  vault.write(7, "2026-08-25 Pricing and onboarding.md", note(7, "second"));
  assert.deepEqual(fs.readdirSync(dir), ["2026-08-25 Pricing and onboarding.md"]);
});

test("two conversations that share a title and a day do not overwrite each other", (t) => {
  const dir = makeVault(t);
  vault.write(1, "2026-08-25 Standup.md", note(1, "first standup"));
  const second = vault.write(2, "2026-08-25 Standup.md", note(2, "second standup"));
  assert.equal(second.success, true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["2026-08-25 Standup 2.md", "2026-08-25 Standup.md"]);
  assert.match(fs.readFileSync(path.join(dir, "2026-08-25 Standup.md"), "utf8"), /first standup/);
  // And the second conversation keeps its own file on every later update.
  vault.write(2, "2026-08-25 Standup.md", note(2, "second standup, revised"));
  assert.equal(fs.readdirSync(dir).length, 2);
  assert.match(
    fs.readFileSync(path.join(dir, "2026-08-25 Standup 2.md"), "utf8"),
    /second standup, revised/
  );
});

test("a note the reader wrote themselves is never overwritten", (t) => {
  const dir = makeVault(t);
  fs.writeFileSync(path.join(dir, "2026-08-25 Standup.md"), "my own notes\n", "utf8");
  vault.write(3, "2026-08-25 Standup.md", note(3, "from Oats"));
  assert.equal(fs.readFileSync(path.join(dir, "2026-08-25 Standup.md"), "utf8"), "my own notes\n");
  assert.match(fs.readFileSync(path.join(dir, "2026-08-25 Standup 2.md"), "utf8"), /from Oats/);
});

/**
 * Run the debounce out without waiting for it.
 *
 * The write is deliberately four seconds behind the update that triggers it, so
 * a hundred checkpoints collapse into one — and four real seconds per case
 * would be most of the fast suite's runtime. The timer is mocked and the
 * promise chain behind it flushed by hand.
 */
async function runDebounce(t) {
  t.mock.timers.tick(4000);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

const withTimers = (t) => t.mock.timers.enable({ apis: ["setTimeout"] });

test("a disabled vault schedules nothing", async (t) => {
  withTimers(t);
  const dir = makeVault(t);
  vault.configure({ vaultPath: dir, enabled: false });
  let builds = 0;
  vault.schedule(1, () => {
    builds++;
    return { filename: "n.md", markdown: "x" };
  });
  await runDebounce(t);
  assert.equal(builds, 0);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("a burst of checkpoint writes collapses into one", async (t) => {
  withTimers(t);
  const dir = makeVault(t);
  let builds = 0;
  for (let i = 0; i < 100; i++) {
    vault.schedule(7, () => {
      builds++;
      return { filename: "burst.md", markdown: note(7, `v${builds}`) };
    });
  }
  await runDebounce(t);
  assert.equal(builds, 1, "the debounce did not coalesce");
  assert.deepEqual(fs.readdirSync(dir), ["burst.md"]);
});

test("a build that declines to mirror writes nothing", async (t) => {
  withTimers(t);
  const dir = makeVault(t);
  vault.schedule(8, () => null);
  await runDebounce(t);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("turning the export off cancels the write still in its debounce", async (t) => {
  withTimers(t);
  const dir = makeVault(t);
  vault.schedule(9, () => ({ filename: "after-off.md", markdown: note(9) }));
  vault.configure({ vaultPath: dir, enabled: false });
  await runDebounce(t);
  assert.deepEqual(fs.readdirSync(dir), [], "a write landed after the export was turned off");
});

test("pointing at another folder does not drop the pending note into it", async (t) => {
  withTimers(t);
  const first = makeVault(t);
  vault.schedule(10, () => ({ filename: "moved.md", markdown: note(10) }));
  const second = makeVault(t);
  await runDebounce(t);
  assert.deepEqual(fs.readdirSync(first), []);
  assert.deepEqual(fs.readdirSync(second), []);
});
