#!/usr/bin/env node
/**
 * The two models that tell speakers apart in a conversation recorded from one
 * microphone: pyannote segmentation 3.0 (where speech changes hands) and
 * NVIDIA TitaNet-small (whose voice is whose), run by the bundled
 * `sherpa-onnx-diarize` binary after a recording stops.
 *
 * TitaNet, not the 3D-Speaker CAM++ model upstream ships. Measured over nine
 * unseen LibriSpeech conversations of two and three speakers, with the count
 * known: CAM++ attributed 49% of turns correctly — a coin flip — and TitaNet
 * 94%. Guessing the count (threshold 0.85), TitaNet attributed 92%.
 *
 *   node scripts/download-diarization-models.js [--output-dir <dir>] [--force]
 *
 * Default output is `resources/bin/diarization-models`, which is what the
 * build bundles and what a development run reads.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { downloadFile, parseArgs } = require("./lib/download-utils");

const SEGMENTATION_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2";
const SEGMENTATION_DIR = "sherpa-onnx-pyannote-segmentation-3-0";
const SEGMENTATION_FILE = "model.onnx";

const EMBEDDING_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx";
const EMBEDDING_FILE = "nemo_en_titanet_small.onnx";

function modelDir() {
  const at = process.argv.indexOf("--output-dir");
  if (at !== -1 && process.argv[at + 1]) return path.resolve(process.argv[at + 1]);
  return path.join(__dirname, "..", "resources", "bin", "diarization-models");
}

async function main() {
  const args = parseArgs();
  const dir = modelDir();
  const segPath = path.join(dir, SEGMENTATION_DIR, SEGMENTATION_FILE);
  const embPath = path.join(dir, EMBEDDING_FILE);

  if (fs.existsSync(segPath) && fs.existsSync(embPath) && !args.isForce) {
    console.log("[diarization-models] already present (use --force to re-download)");
    return;
  }
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(segPath) || args.isForce) {
    const archive = path.join(dir, `${SEGMENTATION_DIR}.tar.bz2`);
    const extract = path.join(dir, "temp-segmentation");
    try {
      console.log(`[diarization-models] segmentation model ← ${SEGMENTATION_URL}`);
      await downloadFile(SEGMENTATION_URL, archive);
      fs.mkdirSync(extract, { recursive: true });
      execFileSync("tar", ["-xjf", path.basename(archive), "-C", path.relative(dir, extract)], {
        stdio: "inherit",
        cwd: dir,
      });
      const extracted = path.join(extract, SEGMENTATION_DIR, SEGMENTATION_FILE);
      if (!fs.existsSync(extracted)) throw new Error(`${SEGMENTATION_FILE} not found in archive`);
      fs.mkdirSync(path.dirname(segPath), { recursive: true });
      fs.copyFileSync(extracted, segPath);
    } catch (error) {
      console.error(`[diarization-models] segmentation model failed: ${error.message}`);
      process.exitCode = 1;
      return;
    } finally {
      fs.rmSync(extract, { recursive: true, force: true });
      fs.rmSync(archive, { force: true });
    }
  }

  if (!fs.existsSync(embPath) || args.isForce) {
    try {
      console.log(`[diarization-models] embedding model ← ${EMBEDDING_URL}`);
      await downloadFile(EMBEDDING_URL, embPath);
    } catch (error) {
      console.error(`[diarization-models] embedding model failed: ${error.message}`);
      fs.rmSync(embPath, { force: true });
      process.exitCode = 1;
      return;
    }
  }

  console.log(`[diarization-models] ready at ${dir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
