#!/usr/bin/env node
/**
 * Downloads nircmd.exe for Windows builds.
 *
 * nircmd is a small utility for Windows that allows sending keyboard input
 * and other system commands. Used for fast clipboard paste operations.
 *
 * Source: https://www.nirsoft.net/utils/nircmd.html
 * License (nirsoft.net/utils/nircmd.html, verified 2026-10-31): freeware; free
 * redistribution is allowed as long as nothing is charged and ALL files of the
 * distribution package are included unmodified - so nircmd.exe, nircmdc.exe and
 * NirCmd.chm all ship together.
 */

const fs = require("fs");
const path = require("path");
const { downloadFile, extractZip, verifySha256, verifyExistingOrRemove } = require("./lib/download-utils");

const NIRCMD_URL = "https://www.nirsoft.net/utils/nircmd-x64.zip";
// nirsoft publishes no versioned URL; pin the archive by hash instead.
const NIRCMD_ZIP_SHA256 = "51e34ed379dd099a96bbf0a2266003361e2864fe3ef2f8baed76634909763a7c";
const PACKAGE_FILES = ["nircmd.exe", "nircmdc.exe", "NirCmd.chm"];
// SHA256 of each file inside the pinned archive, for verifying an already-
// extracted install before skipping a re-download.
const PACKAGE_SHA256 = {
  "nircmd.exe": "2e81e048ab419fdc6e5f4336a951bd282ed6b740048dc38d7673678ee3490cda",
  "nircmdc.exe": "c3e28c6e201d5c0206d941bed96c1c6219397da9b563771d856da1b6cc390554",
  "NirCmd.chm": "573aa5b8db5f7b73cd0cb166514a197553e73659e881707c781691cbf2034516",
};
const BIN_DIR = path.join(__dirname, "..", "resources", "bin");

async function main() {
  // Skip if not Windows and not building for all platforms
  if (process.platform !== "win32" && !process.argv.includes("--all")) {
    console.log("\nSkipping nircmd.exe download (Windows-only utility)\n");
    return;
  }

  console.log("\nDownloading nircmd.exe for Windows...\n");

  // Create bin directory
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Check if already exists
  if (!process.argv.includes("--force") && PACKAGE_FILES.every((name) => fs.existsSync(path.join(BIN_DIR, name)))) {
    const allValid = PACKAGE_FILES.every((name) =>
      verifyExistingOrRemove(path.join(BIN_DIR, name), PACKAGE_SHA256[name], "nircmd")
    );
    if (allValid) {
      console.log("  nircmd package already exists, skipping\n");
      return;
    }
    // A bad or partial set must not ship: drop whatever remains and re-download.
    for (const name of PACKAGE_FILES) fs.rmSync(path.join(BIN_DIR, name), { force: true });
  }

  const zipPath = path.join(BIN_DIR, "nircmd-x64.zip");

  try {
    console.log(`  Downloading from ${NIRCMD_URL}`);
    await downloadFile(NIRCMD_URL, zipPath);
    await verifySha256(zipPath, NIRCMD_ZIP_SHA256, "nircmd");

    console.log("  Extracting...");
    const extractDir = path.join(BIN_DIR, "temp-nircmd");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    // The license requires shipping every file of the distribution package.
    for (const name of PACKAGE_FILES) {
      const extractedPath = path.join(extractDir, name);
      if (!fs.existsSync(extractedPath)) {
        console.error(`  ✗ ${name} not found in archive\n`);
        process.exit(1);
      }
      await verifySha256(extractedPath, PACKAGE_SHA256[name], "nircmd");
      fs.copyFileSync(extractedPath, path.join(BIN_DIR, name));
      console.log(`  ✓ ${name}`);
    }

    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);
  } catch (error) {
    console.error(`  ✗ Failed to download nircmd.exe: ${error.message}\n`);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    process.exit(1);
  }
}

main().catch(console.error);
