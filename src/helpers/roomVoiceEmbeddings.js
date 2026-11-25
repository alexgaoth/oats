// The speaker pass of a conversation in a room, main's side: where its voice
// model is, and the requests to the ONNX worker that give a line its voice and
// group a conversation's lines into people (onnxWorker.js, roomVoices.mjs).
//
// The model is 3D-Speaker's ERes2Net (VoxCeleb, English, 26.5 MB), bundled
// with the app (scripts/download-diarization-models.js): over twelve two-person
// conversations recorded in rooms it puts 92% of the lines on the right person
// with the pass in roomVoices.mjs (docs/room-speakers.md).

const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");
const { getModelsDirForService } = require("./modelDirUtils");
const onnxWorkerClient = require("./onnxWorkerClient");

const MODEL_FILE = "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx";

class RoomVoiceEmbeddings {
  constructor() {
    this.loadPromise = null;
  }

  getModelPath() {
    const candidates = [];
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, "bin", "diarization-models", MODEL_FILE));
    }
    // A development checkout reads the model the build bundles.
    candidates.push(
      path.join(__dirname, "..", "..", "resources", "bin", "diarization-models", MODEL_FILE)
    );
    candidates.push(path.join(getModelsDirForService("diarization"), MODEL_FILE));
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
  }

  isAvailable() {
    return fs.existsSync(this.getModelPath());
  }

  _ensureLoaded() {
    if (this.loadPromise) return this.loadPromise;
    const modelPath = this.getModelPath();
    this.loadPromise = onnxWorkerClient.request("roomVoice.load", { modelPath }).catch((error) => {
      this.loadPromise = null;
      throw error;
    });
    return this.loadPromise;
  }

  /**
   * One line's voice from its 16 kHz samples, or null.
   * @param {Int16Array} samples
   * @returns {Promise<Float32Array | null>}
   */
  async extract(samples) {
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
    const ask = async () => {
      await this._ensureLoaded();
      // No transfer list: MessagePortMain cannot transfer ArrayBuffers, so the samples are cloned.
      return onnxWorkerClient.request("roomVoice.extract", { samplesBuffer: floats.buffer });
    };
    let result;
    try {
      result = await ask();
    } catch (error) {
      // A worker that crashed and came back holds no model: load it again, once.
      if (!/not loaded/.test(error?.message ?? "")) throw error;
      this.loadPromise = null;
      result = await ask();
    }
    return result?.embeddingBuffer ? new Float32Array(result.embeddingBuffer) : null;
  }

  /**
   * A conversation's lines grouped into people, as the diarizer's turns.
   * @param {Array<{ startMs: number, endMs: number, embedding: Float32Array | null }>} lines
   * @returns {Promise<Array<{ start: number, end: number, speaker: string }>>}
   */
  async group(lines) {
    const { turns } = await onnxWorkerClient.request("roomVoice.group", {
      lines: lines.map((line) => ({
        startMs: line.startMs,
        endMs: line.endMs,
        embeddingBuffer: line.embedding ? line.embedding.slice().buffer : null,
      })),
    });
    debugLogger.debug("Room voices grouped", {
      lines: lines.length,
      people: new Set(turns.map((turn) => turn.speaker)).size,
    });
    return turns;
  }
}

const instance = new RoomVoiceEmbeddings();
module.exports = instance;
module.exports.RoomVoiceEmbeddings = RoomVoiceEmbeddings;
module.exports.MODEL_FILE = MODEL_FILE;
