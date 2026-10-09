const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The Linux launcher wrap moved from afterPack to artifactBuildStarted, so that
// electron-builder sets the Electron fuses on the real binary first. These pin
// when it wraps, and what it must never touch.

const {
  scheduleLinuxWrap,
  wrapLinuxExecutable,
  wrapForArtifact,
  _pending,
} = require("../../scripts/lib/linux-wrap");

const X64 = 1; // builder-util Arch.x64
const ARM64 = 3; // builder-util Arch.arm64

function unpackedApp(name = "oats") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oats-linux-wrap-"));
  fs.writeFileSync(path.join(dir, name), "\x7fELF fake binary");
  return dir;
}

test.beforeEach(() => _pending.clear());

test("afterPack leaves the binary alone; the first Linux artifact wraps it", () => {
  const dir = unpackedApp();
  scheduleLinuxWrap(X64, dir, "oats");
  // Still the real binary after afterPack: this is what the fuse step patches.
  assert.equal(fs.readFileSync(path.join(dir, "oats"), "utf8"), "\x7fELF fake binary");

  const wrapped = wrapForArtifact({ file: "/dist/Oats-1.0.0-linux-x64.deb", arch: X64 });
  assert.equal(wrapped, dir);
  assert.equal(fs.readFileSync(path.join(dir, "oats-app"), "utf8"), "\x7fELF fake binary");
  const script = fs.readFileSync(path.join(dir, "oats"), "utf8");
  assert.match(script, /^#!\/bin\/bash/);
  assert.match(script, /exec -a "\$0" "\$HERE\/oats-app"/);
  assert.equal(fs.statSync(path.join(dir, "oats")).mode & 0o777, 0o755);
});

test("later artifacts of the same arch do not wrap twice", () => {
  const dir = unpackedApp();
  scheduleLinuxWrap(X64, dir, "oats");
  wrapForArtifact({ file: "/dist/Oats-1.0.0-linux-x64.AppImage", arch: X64 });
  const script = fs.readFileSync(path.join(dir, "oats"), "utf8");
  assert.equal(wrapForArtifact({ file: "/dist/Oats-1.0.0-linux-x64.rpm", arch: X64 }), null);
  assert.equal(wrapLinuxExecutable(dir, "oats"), false, "an app already wrapped is left as it is");
  assert.equal(fs.readFileSync(path.join(dir, "oats"), "utf8"), script);
  assert.equal(fs.readFileSync(path.join(dir, "oats-app"), "utf8"), "\x7fELF fake binary");
});

test("an artifact never wraps another architecture's app", () => {
  const arm = unpackedApp();
  scheduleLinuxWrap(ARM64, arm, "oats");
  // x64 artifacts can start while arm64 is still being packed (fuses not set).
  assert.equal(wrapForArtifact({ file: "/dist/Oats-1.0.0-linux-x64.tar.gz", arch: X64 }), null);
  assert.equal(fs.existsSync(path.join(arm, "oats-app")), false);
  assert.equal(wrapForArtifact({ file: "/dist/Oats-1.0.0-linux-arm64.tar.gz", arch: ARM64 }), arm);
});

test("macOS and Windows artifacts never trigger the Linux wrap", () => {
  const dir = unpackedApp();
  scheduleLinuxWrap(X64, dir, "oats");
  for (const file of [
    "/dist/Oats-1.0.0-mac-x64.dmg",
    "/dist/Oats-1.0.0-mac-x64.zip",
    "/dist/Oats Setup 1.0.0.exe",
  ]) {
    assert.equal(wrapForArtifact({ file, arch: X64 }), null, file);
  }
  assert.equal(fs.existsSync(path.join(dir, "oats-app")), false);
});
