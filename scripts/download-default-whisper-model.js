#!/usr/bin/env node
// The small, offline-first speech model shipped in every release. Keeping this
// as a separate build step makes its network boundary explicit and reproducible.
const fs = require("fs");
const path = require("path");
const { downloadFile, parseArgs } = require("./lib/download-utils");

// Two models ship, not one.
//
// `base` is multilingual and is what language auto-detection needs, so it stays
// the default and the offline guarantee. `base.en` is the same size and the same
// speed class, and for an English speaker it is simply better — measured on 40
// LibriSpeech utterances, 5.72% WER against base's 7.18%, at a 431ms median
// against 584ms. `helpers/whisperEnglishModel.mjs` picks it automatically when
// the configured language is English, and silently keeps `base` when it is not.
//
// Together they cost ~290MB in the installer. That is the price of the product's
// two promises at once: works offline in any language on first run, and is not
// needlessly worse at the language most people will use it in.
const MODELS = [
  {
    fileName: "ggml-base.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  },
  {
    fileName: "ggml-base.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  },
];
const outputDir = path.join(__dirname, "..", "resources", "bin", "whisper-models");

async function main() {
  const args = parseArgs();
  fs.mkdirSync(outputDir, { recursive: true });
  for (const model of MODELS) {
    const outputPath = path.join(outputDir, model.fileName);
    if (fs.existsSync(outputPath) && !args.isForce) {
      console.log(`[default-whisper-model] ${model.fileName} already present`);
      continue;
    }
    console.log(`[default-whisper-model] Downloading ${model.fileName}`);
    try {
      await downloadFile(model.url, outputPath);
      console.log(`[default-whisper-model] Ready at ${outputPath}`);
    } catch (error) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(`[default-whisper-model] ${error.message}`);
  process.exitCode = 1;
});
