const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const {
  verifySha256,
  verifyExistingOrRemove,
  installVerifiedFile,
} = require("../../scripts/lib/download-utils");

const GOOD = Buffer.from("known good helper binary");
const GOOD_SHA256 = crypto.createHash("sha256").update(GOOD).digest("hex");
const BAD = Buffer.from("tampered helper binary");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oats-dl-integrity-"));
}

test("hash mismatch on first install fails and leaves no output behind", async () => {
  const dir = tmpdir();
  const src = path.join(dir, "extracted.exe");
  const out = path.join(dir, "helper.exe");
  fs.writeFileSync(src, BAD);
  await assert.rejects(installVerifiedFile(src, out, GOOD_SHA256, "t"), /SHA256 mismatch/);
  assert.equal(fs.existsSync(out), false, "a mismatched binary must never be installed");
});

test("the source is verified before copying and a good install succeeds", async () => {
  const dir = tmpdir();
  const src = path.join(dir, "extracted.exe");
  const out = path.join(dir, "helper.exe");
  fs.writeFileSync(src, GOOD);
  await installVerifiedFile(src, out, GOOD_SHA256, "t");
  assert.deepEqual(fs.readFileSync(out), GOOD);
});

test("a pre-existing bad output is removed instead of skipped", () => {
  const dir = tmpdir();
  const out = path.join(dir, "helper.exe");
  fs.writeFileSync(out, BAD);
  assert.equal(verifyExistingOrRemove(out, GOOD_SHA256, "t"), false);
  assert.equal(fs.existsSync(out), false, "bad residue must be deleted so the run re-downloads");
});

test("a pre-existing good output passes the skip gate", () => {
  const dir = tmpdir();
  const out = path.join(dir, "helper.exe");
  fs.writeFileSync(out, GOOD);
  assert.equal(verifyExistingOrRemove(out, GOOD_SHA256, "t"), true);
  assert.equal(fs.existsSync(out), true);
});

test("missing output does not pass the skip gate", () => {
  const dir = tmpdir();
  assert.equal(verifyExistingOrRemove(path.join(dir, "nope.exe"), GOOD_SHA256, "t"), false);
});

test("an unpinned existing file is trusted (no hash configured for it)", () => {
  const dir = tmpdir();
  const out = path.join(dir, "helper.exe");
  fs.writeFileSync(out, BAD);
  assert.equal(verifyExistingOrRemove(out, null, "t"), true);
});

test("verifySha256 rejects wrong content and accepts the pinned bytes", async () => {
  const dir = tmpdir();
  const f = path.join(dir, "x.exe");
  fs.writeFileSync(f, GOOD);
  await verifySha256(f, GOOD_SHA256, "t");
  fs.writeFileSync(f, BAD);
  await assert.rejects(verifySha256(f, GOOD_SHA256, "t"), /SHA256 mismatch/);
});

test("zip-slip guard rejects traversal and absolute archive paths", () => {
  const { assertSafeArchivePaths } = require("../../scripts/lib/download-utils");
  assert.throws(() => assertSafeArchivePaths(["../evil.txt"], "a.zip"), /Unsafe path/);
  assert.throws(() => assertSafeArchivePaths(["sub/../../evil.txt"], "a.zip"), /Unsafe path/);
  assert.throws(() => assertSafeArchivePaths(["/abs/evil.txt"], "a.zip"), /Unsafe path/);
  assert.throws(() => assertSafeArchivePaths(["C:\\evil.txt"], "a.zip"), /Unsafe path/);
  assertSafeArchivePaths(["ok.txt", "sub/also-ok.txt", ".cache/oats/x"], "a.zip");
});
