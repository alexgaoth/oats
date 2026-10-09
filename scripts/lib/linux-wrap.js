// The Linux launcher wrapper, applied after Electron's fuses are set.
//
// The wrapper replaces the executable with a bash script (scripts/lib/
// linux-launcher.js) and moves the real binary to `<name>-app`. electron-builder
// sets the fuses on `<appOutDir>/<name>` right after the afterPack hook, so
// wrapping in afterPack left it a script to patch and the build failed with
// "Could not find sentinel". afterPack now only records the unpacked app; the
// wrap happens when the first artifact of that architecture starts building,
// which is after the fuses and before the AppImage / deb / rpm / tar.gz read
// the unpacked app.
//
// Keyed by architecture: electron-builder can pack arm64 (fuses not yet set)
// while x64 artifacts are already building, and an x64 artifact must not wrap
// the arm64 binary early.

const fs = require("fs");
const path = require("path");
const { buildLinuxWrapperScript } = require("./linux-launcher");

const LINUX_ARTIFACT = /\.(AppImage|deb|rpm|tar\.gz|tar\.xz|tar\.bz2|snap|pacman|freebsd)$/i;

const pending = new Map();

/** afterPack: remember the unpacked Linux app of this architecture. */
function scheduleLinuxWrap(arch, appOutDir, binaryName) {
  pending.set(arch, { appOutDir, binaryName });
}

/** Wrap one unpacked app. Idempotent: an app already wrapped is left as it is. */
function wrapLinuxExecutable(appOutDir, binaryName) {
  const binaryPath = path.join(appOutDir, binaryName);
  const realBinaryPath = path.join(appOutDir, `${binaryName}-app`);
  if (fs.existsSync(realBinaryPath)) return false;
  fs.renameSync(binaryPath, realBinaryPath);
  fs.writeFileSync(binaryPath, buildLinuxWrapperScript(binaryName), { mode: 0o755 });
  return true;
}

/**
 * artifactBuildStarted: wrap the app this Linux artifact is built from, once.
 * Returns the wrapped app directory, or null when there was nothing to do.
 */
function wrapForArtifact({ file, arch } = {}) {
  if (typeof file !== "string" || !LINUX_ARTIFACT.test(file)) return null;
  const entry = pending.get(arch);
  if (!entry) return null;
  pending.delete(arch);
  wrapLinuxExecutable(entry.appOutDir, entry.binaryName);
  return entry.appOutDir;
}

module.exports = { scheduleLinuxWrap, wrapLinuxExecutable, wrapForArtifact, _pending: pending };
