#!/usr/bin/env node
// Builds resources/bin/macos-parakeet-ane, Apple Silicon only. It links FluidAudio
// (Apache-2.0) from source at a pinned commit, with swiftc and not `swift build`:
// the Command Line Tools' `swift-package` can crash, and swiftc needs no Xcode.
// The first build takes minutes. FluidAudio's sources and objects stay in
// resources/bin/.fluidaudio, so a later build only links.

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FLUIDAUDIO_TAG = "v0.18.2";
const FLUIDAUDIO_COMMIT = "e396cf780c4abf8e395087467c0585d3b0d17f68";
const TARGET = "arm64-apple-macos14.0";

const archIndex = process.argv.indexOf("--arch");
const targetArch =
  (archIndex !== -1 && process.argv[archIndex + 1]) || process.env.TARGET_ARCH || process.arch;
if (process.platform !== "darwin" || targetArch !== "arm64") {
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, "..");
const swiftSource = path.join(projectRoot, "resources", "macos-parakeet-ane.swift");
const outputDir = path.join(projectRoot, "resources", "bin");
const outputBinary = path.join(outputDir, "macos-parakeet-ane");
const hashFile = path.join(outputDir, ".macos-parakeet-ane.hash");
const work = path.join(outputDir, ".fluidaudio");
const checkout = path.join(work, "FluidAudio");
const sources = path.join(checkout, "Sources");
const objects = path.join(work, "build");
const noticesFile = path.join(outputDir, "macos-parakeet-ane-NOTICES.txt");

// What the helper links, and so what its license notices must travel with it:
// FluidAudio (Apache-2.0), its VBx clustering port (Apache-2.0) and fastcluster
// (BSD-2-Clause, whose binary form must carry its notice). FluidAudio's other
// third-party notices cover data files (the LuxTTS lexicon, Kokoro's word lists)
// that swiftc never compiles in: only .swift sources go to the compiler.
const NOTICES = [
  ["FluidAudio", "LICENSE"],
  ["fastcluster", path.join("ThirdPartyLicenses", "fastcluster-LICENSE.md")],
  ["VBx", path.join("ThirdPartyLicenses", "vbx-LICENSE.md")],
];

function writeNotices() {
  const parts = NOTICES.map(([name, file]) => {
    const text = fs.readFileSync(path.join(checkout, file), "utf8").trim();
    return `${name} (FluidAudio ${FLUIDAUDIO_TAG}, ${file})\n\n${text}\n`;
  });
  fs.writeFileSync(
    noticesFile,
    `macos-parakeet-ane links the following. Their notices, as each requires.\n\n${parts.join("\n\n")}`
  );
}

function log(message) {
  console.log(`[parakeet-ane] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`[parakeet-ane] Failed: ${command} ${args.slice(0, 6).join(" ")} ...`);
    process.exit(result.status ?? 1);
  }
}

function sdkPath() {
  if (process.env.SDKROOT) return process.env.SDKROOT;
  const result = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const hash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(swiftSource))
  .update(FLUIDAUDIO_COMMIT)
  .digest("hex");
if (
  fs.existsSync(outputBinary) &&
  fs.existsSync(hashFile) &&
  fs.readFileSync(hashFile, "utf8").trim() === hash &&
  (fs.existsSync(noticesFile) || fs.existsSync(checkout))
) {
  if (!fs.existsSync(noticesFile)) writeNotices();
  process.exit(0);
}

fs.mkdirSync(objects, { recursive: true });
if (!fs.existsSync(checkout)) {
  log(`Fetching FluidAudio ${FLUIDAUDIO_TAG}`);
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    FLUIDAUDIO_TAG,
    "https://github.com/FluidInference/FluidAudio.git",
    checkout,
  ]);
}
const head = spawnSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" });
if (head.stdout?.trim() !== FLUIDAUDIO_COMMIT) {
  console.error(
    `[parakeet-ane] FluidAudio is at ${head.stdout?.trim()}, expected ${FLUIDAUDIO_COMMIT}.`
  );
  process.exit(1);
}

const sdk = sdkPath();
const sdkArgs = sdk ? ["-sdk", sdk] : [];
const clangSdk = sdk ? ["-isysroot", sdk] : [];
const includes = [
  "-I",
  objects,
  "-I",
  path.join(sources, "FastClusterWrapper", "include"),
  "-I",
  path.join(sources, "MachTaskSelfWrapper", "include"),
];
const swift = ["-O", "-swift-version", "5", "-parse-as-library", "-target", TARGET, ...sdkArgs];
const library = path.join(objects, "libFluidAudio.a");

if (!fs.existsSync(library)) {
  log("Compiling FluidAudio, the first build takes minutes");
  const machTask = path.join(objects, "MachTaskSelf.o");
  const fastCluster = path.join(objects, "FastCluster.o");
  run("clang", [
    "-O2",
    "-target",
    TARGET,
    "-c",
    path.join(sources, "MachTaskSelfWrapper", "MachTaskSelf.c"),
    "-I",
    path.join(sources, "MachTaskSelfWrapper", "include"),
    ...clangSdk,
    "-o",
    machTask,
  ]);
  run("clang++", [
    "-O2",
    "-target",
    TARGET,
    "-std=c++17",
    "-c",
    path.join(sources, "FastClusterWrapper", "FastClusterWrapper.cpp"),
    "-I",
    path.join(sources, "FastClusterWrapper", "include"),
    ...clangSdk,
    "-o",
    fastCluster,
  ]);
  const luxDir = path.join(sources, "LuxTtsG2pResources");
  run("swiftc", [
    ...swift,
    "-module-name",
    "LuxTtsG2pResources",
    "-emit-module",
    "-emit-module-path",
    path.join(objects, "LuxTtsG2pResources.swiftmodule"),
    "-emit-library",
    "-static",
    "-o",
    path.join(objects, "libLux.a"),
    ...fs
      .readdirSync(luxDir)
      .filter((f) => f.endsWith(".swift"))
      .map((f) => path.join(luxDir, f)),
  ]);
  const list = path.join(objects, "files.txt");
  const swiftFiles = fs
    .readdirSync(path.join(sources, "FluidAudio"), { recursive: true })
    .filter((f) => f.endsWith(".swift"))
    .map((f) => path.join(sources, "FluidAudio", f));
  fs.writeFileSync(list, swiftFiles.join("\n"));
  run("swiftc", [
    ...swift,
    "-wmo",
    "-module-name",
    "FluidAudio",
    ...includes,
    // FluidAudio's manifest turns both on. The library does not build without them.
    "-D",
    "Diarizer",
    "-D",
    "TTS",
    "-emit-module",
    "-emit-module-path",
    path.join(objects, "FluidAudio.swiftmodule"),
    "-emit-library",
    "-static",
    "-o",
    library,
    `@${list}`,
    "-j8",
  ]);
}

log("Linking the helper");
run("swiftc", [
  ...swift,
  ...includes,
  swiftSource,
  library,
  path.join(objects, "libLux.a"),
  path.join(objects, "MachTaskSelf.o"),
  path.join(objects, "FastCluster.o"),
  "-lc++",
  "-framework",
  "CoreML",
  "-framework",
  "Accelerate",
  "-framework",
  "AVFoundation",
  "-o",
  outputBinary,
]);
fs.chmodSync(outputBinary, 0o755);
writeNotices();
fs.writeFileSync(hashFile, hash);
log(`Built ${outputBinary}`);
