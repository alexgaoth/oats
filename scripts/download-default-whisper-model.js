#!/usr/bin/env node
// The speech models shipped inside a release, so Oats transcribes offline from
// the first launch. Keeping this as a separate build step makes its network
// boundary explicit and reproducible.
//
// What ships depends on the build target, and src/helpers/bundledWhisperModels.mjs
// says what and why:
//
//   macOS arm64 (Apple Silicon)   ggml-base.bin + ggml-small.en.bin   ~636 MB
//   macOS x64, Linux, Windows     ggml-base.bin + ggml-base.en.bin    ~296 MB
//
// Multilingual `base` is what auto-detection and every language but English
// need, so it ships everywhere. The English model is picked automatically when
// the configured language is English (helpers/whisperEnglishModel.mjs).
//
// The target comes from `--platform`/`--arch`, else TARGET_PLATFORM/TARGET_ARCH
// (CI sets TARGET_ARCH for each build), else this machine. The machine is only
// a fallback for a local build: an arm64 Mac can build the x64 app, and the two
// ship different models, so in CI a macOS build without an explicit arch fails.
//
// The output folder ends up holding exactly the target's files. Models another
// target ships are moved to `<output>-spare/`, which the app does not pack, and
// moved back when a build needs them again, so switching targets does not
// download them twice.
//
//   node scripts/download-default-whisper-model.js [--platform darwin] [--arch arm64]
//                                                  [--output-dir <dir>] [--force]
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { downloadFile } = require("./lib/download-utils");

const MODELS_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "resources", "bin", "whisper-models");
const TABLE = path.join(__dirname, "..", "src", "helpers", "bundledWhisperModels.mjs");

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  const value = index === -1 ? null : argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

/**
 * The target a build is for. An explicit `--arch` or TARGET_ARCH wins. This
 * machine's arch is the fallback outside CI; in CI a macOS build must name one.
 */
function resolveTarget({
  argv = process.argv,
  env = process.env,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const targetPlatform = argValue(argv, "--platform") || env.TARGET_PLATFORM || platform;
  const explicitArch = argValue(argv, "--arch") || env.TARGET_ARCH || null;
  const inCi = env.CI === "true" || env.GITHUB_ACTIONS === "true";
  if (!explicitArch && inCi && targetPlatform === "darwin") {
    throw new Error(
      "a macOS build in CI must name its arch (TARGET_ARCH or --arch): arm64 and x64 " +
        "ship different speech models, and the runner's own arch is not necessarily the target's"
    );
  }
  return { platform: targetPlatform, arch: explicitArch || arch, explicit: Boolean(explicitArch) };
}

async function main() {
  const argv = process.argv;
  const isForce = argv.includes("--force");
  const target = resolveTarget();
  const label = `${target.platform}-${target.arch}`;
  const { bundledWhisperModels } = await import(pathToFileURL(TABLE).href);
  const { files } = bundledWhisperModels(target.platform, target.arch);
  const outputDir = path.resolve(argValue(argv, "--output-dir") || DEFAULT_OUTPUT_DIR);
  const spareDir = `${outputDir}-spare`;

  const source = target.explicit ? "" : " (this machine; set TARGET_ARCH to build for another)";
  console.log(`[default-whisper-model] ${label}${source}: ${files.join(", ")}`);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const name of fs.readdirSync(outputDir)) {
    if (!name.endsWith(".bin") || files.includes(name)) continue;
    fs.mkdirSync(spareDir, { recursive: true });
    fs.renameSync(path.join(outputDir, name), path.join(spareDir, name));
    console.log(
      `[default-whisper-model] ${name} is not bundled for ${label}: moved to ${spareDir}`
    );
  }

  for (const fileName of files) {
    const outputPath = path.join(outputDir, fileName);
    if (fs.existsSync(outputPath) && !isForce) {
      console.log(`[default-whisper-model] ${fileName} already present`);
      continue;
    }
    const sparePath = path.join(spareDir, fileName);
    if (fs.existsSync(sparePath) && !isForce) {
      fs.renameSync(sparePath, outputPath);
      console.log(`[default-whisper-model] ${fileName} moved back from ${spareDir}`);
      continue;
    }
    console.log(`[default-whisper-model] Downloading ${fileName}`);
    try {
      await downloadFile(`${MODELS_URL}/${fileName}`, outputPath);
      console.log(`[default-whisper-model] Ready at ${outputPath}`);
    } catch (error) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[default-whisper-model] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { resolveTarget };
