// Parakeet Ultra on the Neural Engine: the main process's side of
// resources/macos-parakeet-ane.swift. One helper stays up while a room uses it,
// and reads one segment at a time. The audio goes over a pipe, so no segment is
// ever written to disk. The protocol is at the top of the Swift file; the numbers
// that picked this model are in docs/speech-round-2.md.

const { spawn } = require("child_process");
const os = require("os");
const readline = require("readline");
const debugLogger = require("./debugLogger");
const { getSafeTempDir } = require("./safeTempDir");
const sidecarPidFile = require("./sidecarPidFile");
const { resolveBinaryPath, gracefulStopProcess } = require("../utils/serverUtils");

const BINARY_NAME = "macos-parakeet-ane";
const SIDECAR_NAME = "parakeet-ane";
const SAMPLE_RATE = 16000;
/** macOS 14 is Darwin 23. FluidAudio and this model start there. */
const MIN_DARWIN_MAJOR = 23;
/** The first load on a Mac compiles the model for its Neural Engine (48 s on an M5 Pro). */
const START_TIMEOUT_MS = 180000;
/** A segment is at most 20 s, and one read takes a fraction of a second. */
const READ_TIMEOUT_MS = 60000;

function isSupportedMac({
  platform = process.platform,
  arch = process.arch,
  darwinMajor = parseInt(os.release(), 10),
} = {}) {
  return platform === "darwin" && arch === "arm64" && darwinMajor >= MIN_DARWIN_MAJOR;
}

/** Whether this Mac can run the helper, and the build carries it. */
function isAneAvailable() {
  return isSupportedMac() && resolveBinaryPath(BINARY_NAME) !== null;
}

/** The 16-bit samples of a WAV, wherever its data chunk starts. */
function pcmFromWav(wav) {
  let at = 12;
  while (at + 8 <= wav.length) {
    const size = wav.readUInt32LE(at + 4);
    if (wav.toString("ascii", at, at + 4) === "data") {
      return wav.subarray(at + 8, Math.min(at + 8 + size, wav.length));
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data chunk");
}

class ParakeetAne {
  /**
   * @param {string} modelsDir holds `parakeet-ultra/` and Silero's `.mlmodelc`
   * @param {{ command?: string, args?: string[] }} [binary] a test's fake helper
   */
  constructor(modelsDir, binary = {}) {
    this.modelsDir = modelsDir;
    this.command = binary.command ?? null;
    this.args = binary.args ?? [];
    this.process = null;
    /** The helper still loading, before it is ready: a stop must reach it too. */
    this.spawned = null;
    this.starting = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  binaryPath() {
    return this.command ?? resolveBinaryPath(BINARY_NAME);
  }

  isRunning() {
    return this.process !== null;
  }

  /** Starts the helper once. Every caller waits for the same load. */
  start() {
    if (this.process) return Promise.resolve();
    if (!this.starting) {
      this.starting = this._start().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  _start() {
    return new Promise((resolve, reject) => {
      const binary = this.binaryPath();
      if (!binary) {
        reject(new Error(`${BINARY_NAME} not found`));
        return;
      }
      const child = spawn(binary, [...this.args, "--models", this.modelsDir], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: getSafeTempDir(),
        detached: true,
      });
      sidecarPidFile.write(SIDECAR_NAME, child.pid);
      this.spawned = child;
      let ready = false;
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`${BINARY_NAME} did not get ready`));
      }, START_TIMEOUT_MS);

      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        sidecarPidFile.clear(SIDECAR_NAME);
        if (this.spawned === child) this.spawned = null;
        if (!ready) reject(new Error(`${BINARY_NAME} exited (${code}): ${stderr.trim()}`));
        if (this.process === child) this.process = null;
        this._failAll(new Error(`${BINARY_NAME} exited (${code})`));
      });
      child.stdin.on("error", (error) => {
        debugLogger.warn("Parakeet helper's stdin failed", { error: error.message });
      });

      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.ready) {
          // Stopped while it loaded: its close rejects the start.
          if (this.spawned !== child) return;
          ready = true;
          clearTimeout(timer);
          this.process = child;
          resolve();
          return;
        }
        this._answer(message);
      });
    });
  }

  _answer(message) {
    const waiting = this.pending.get(message.id);
    if (!waiting) return;
    this.pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) waiting.reject(new Error(message.error));
    else waiting.resolve(message.text ?? "");
  }

  _failAll(error) {
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }

  /**
   * @param {Buffer} wav 16 kHz mono 16-bit
   * @param {Buffer} [before] the audio just before it, as context: the helper keeps
   *   only the words of the WAV
   * @returns {Promise<string>}
   */
  async transcribe(wav, before = null) {
    await this.start();
    const segment = pcmFromWav(wav);
    const pcm = (before ? Buffer.concat([before, segment]) : segment).toString("base64");
    const keepFrom = before ? before.length / 2 / SAMPLE_RATE : undefined;
    const helper = this.process;
    if (!helper) throw new Error(`${BINARY_NAME} exited`);
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${BINARY_NAME} did not answer`));
      }, READ_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      helper.stdin.write(`${JSON.stringify({ id, pcm, keepFrom })}\n`);
    });
  }

  async stop() {
    const child = this.process ?? this.spawned;
    if (!child) return;
    this.process = null;
    this.spawned = null;
    child.stdin.end();
    await gracefulStopProcess(child);
  }
}

module.exports = { ParakeetAne, isAneAvailable, isSupportedMac, pcmFromWav };
