#!/usr/bin/env node
// The small, offline-first speech model shipped in every release. Keeping this
// as a separate build step makes its network boundary explicit and reproducible.
const fs = require("fs");
const path = require("path");
const { downloadFile, parseArgs } = require("./lib/download-utils");

const MODEL = {
  fileName: "ggml-base.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
};
const outputDir = path.join(__dirname, "..", "resources", "bin", "whisper-models");
const outputPath = path.join(outputDir, MODEL.fileName);

async function main() {
  const args = parseArgs();
  if (fs.existsSync(outputPath) && !args.isForce) {
    console.log(`[default-whisper-model] ${MODEL.fileName} already present`);
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`[default-whisper-model] Downloading ${MODEL.fileName}`);
  try {
    await downloadFile(MODEL.url, outputPath);
    console.log(`[default-whisper-model] Ready at ${outputPath}`);
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw error;
  }
}

main().catch((error) => {
  console.error(`[default-whisper-model] ${error.message}`);
  process.exitCode = 1;
});
