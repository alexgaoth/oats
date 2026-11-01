#!/usr/bin/env node
/**
 * Downloads prebuilt text monitor binary from GitHub releases.
 * Selects the correct binary for the current platform (Linux or Windows).
 *
 * Usage:
 *   node scripts/download-text-monitor.js [--force]
 */

const fs = require("fs");
const path = require("path");
const {
  downloadFile,
  extractArchive,
  fetchLatestRelease,
  setExecutable,
  verifyExistingOrRemove,
  installVerifiedFile,
} = require("./lib/download-utils");

const REPO = "OpenWhispr/openwhispr";
const BIN_DIR = path.join(__dirname, "..", "resources", "bin");

const PLATFORM_CONFIG = {
  linux: {
    label: "linux-text-monitor",
    tagPrefix: "linux-text-monitor-v",
    archiveName: "linux-text-monitor-linux-x64.tar.gz",
    binaryName: "linux-text-monitor",
    versionEnv: "LINUX_TEXT_MONITOR_VERSION",
    compileHint: "install libatspi2.0-dev and libglib2.0-dev",
  },
  win32: {
    label: "windows-text-monitor",
    tagPrefix: "windows-text-monitor-v",
    archiveName: "windows-text-monitor-win32-x64.zip",
    binaryName: "windows-text-monitor.exe",
    versionEnv: "WINDOWS_TEXT_MONITOR_VERSION",
    defaultVersion: "windows-text-monitor-v1.0.0",
    expectedSha256: "6e9a6677decdd834c1f7c1c7d498334ff5dcb2315d23e83b0a1718eeecc5ee1c",
    compileHint: "install Visual Studio Build Tools or MinGW-w64",
  },
};

async function main() {
  // --platform win32 (or TARGET_PLATFORM) stages another platform's binary for a cross build.
  const platformIndex = process.argv.indexOf("--platform");
  const targetPlatform =
    (platformIndex !== -1 && process.argv[platformIndex + 1]) ||
    process.env.TARGET_PLATFORM ||
    process.platform;
  const config = PLATFORM_CONFIG[targetPlatform];
  if (!config) {
    console.log(`[text-monitor] Skipping download (unsupported platform: ${targetPlatform})`);
    return;
  }

  const { label, tagPrefix, archiveName, binaryName, versionEnv, compileHint, defaultVersion = null, expectedSha256 = null } = config;
  const versionOverride = process.env[versionEnv] || null;
  const forceDownload = process.argv.includes("--force");
  const outputPath = path.join(BIN_DIR, binaryName);

  if (!forceDownload && verifyExistingOrRemove(outputPath, expectedSha256, label)) {
    console.log(`[${label}] Already exists (use --force to re-download)`);
    console.log(`  ${outputPath}`);
    return;
  }

  if (versionOverride) {
    console.log(`\n[${label}] Using pinned version: ${versionOverride}`);
  } else {
    console.log(`\n[${label}] Fetching pinned release...`);
  }
  const tagToFind = versionOverride || defaultVersion || tagPrefix;
  const release = await fetchLatestRelease(
    REPO,
    versionOverride || defaultVersion ? { tag: tagToFind } : { tagPrefix: tagToFind }
  );

  if (!release) {
    console.error(`[${label}] Could not find pinned release tag:`, tagPrefix);
    console.log(`[${label}] Auto-learn correction monitoring will be disabled`);
    return;
  }

  const asset = release.assets.find((a) => a.name === archiveName);
  if (!asset) {
    console.error(`[${label}] Release ${release.tag} does not contain ${archiveName}`);
    console.log(`[${label}] Available assets:`, release.assets.map((a) => a.name).join(", "));
    return;
  }

  console.log(`\nDownloading ${label} (${release.tag})...\n`);

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const archivePath = path.join(BIN_DIR, archiveName);
  console.log(`  Downloading from: ${asset.url}`);

  try {
    await downloadFile(asset.url, archivePath);

    const extractDir = path.join(BIN_DIR, `temp-${label}`);
    fs.mkdirSync(extractDir, { recursive: true });

    console.log("  Extracting...");
    await extractArchive(archivePath, extractDir);

    const binaryPath = path.join(extractDir, binaryName);
    if (fs.existsSync(binaryPath)) {
      await installVerifiedFile(binaryPath, outputPath, expectedSha256, label);
      setExecutable(outputPath);
      console.log(`  Extracted to: ${binaryName}`);
    } else {
      throw new Error(`Binary not found in archive: ${binaryName}`);
    }

    fs.rmSync(extractDir, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    const stats = fs.statSync(outputPath);
    console.log(
      `\n[${label}] Successfully downloaded ${release.tag} (${Math.round(stats.size / 1024)}KB)`
    );
  } catch (error) {
    console.error(`\n[${label}] Download failed: ${error.message}`);

    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    console.log(`[${label}] Auto-learn correction monitoring will be disabled`);
    console.log(`[${label}] To compile locally, ${compileHint}`);
  }
}

main().catch((error) => {
  console.error("[text-monitor] Unexpected error:", error);
});
