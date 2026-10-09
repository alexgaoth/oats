#!/usr/bin/env node
/**
 * Measure what dictation actually hears.
 *
 * "It feels less accurate than it used to" is not something you can act on, and
 * every previous claim in this repository that passed a re-read failed a probe.
 * This runs the *real* transcription path — the same `whisper-server` binary the
 * app spawns, the same `/inference` endpoint, the same arguments, and the same
 * cutting of a long recording into requests — over a corpus with human reference
 * transcripts, and reports word error rate and latency.
 *
 * Corpus: LibriSpeech (`.flac` beside a `*.trans.txt` of `ID WORDS...` lines).
 * `test-clean` is read speech in quiet conditions, so treat its WER as a floor:
 * real dictation is worse than this, never better.
 *
 *   node scripts/asr-eval.js --corpus <dir> [--model <ggml.bin>] [--n 40]
 *                            [--language auto|en] [--threads N] [--json out.json]
 *                            [--vad [--vad-model <ggml-silero.bin>]]
 *                            [--concat N] [--whole]
 *
 *   --vad        Silero VAD on, with the shipped config (constants/whisperVad.json).
 *                It is on by default for dictation in the app.
 *   --concat N   Each sample is N consecutive utterances of one chapter joined into
 *                one 30–90 s recording: a long dictation.
 *   --whole      Send every recording as one request, as dictation did before it
 *                cut long recordings. Without it, a recording longer than one
 *                request is cut exactly as the app cuts it (whisperRequestCuts.mjs).
 *
 * Word error rate is the standard Levenshtein-over-words measure, computed after
 * the normalisation ASR benchmarks agree on: case folded, punctuation dropped,
 * whitespace collapsed. Numbers are left alone deliberately — "16" and "sixteen"
 * are a real difference to somebody dictating, and hiding it would flatter every
 * system equally.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const { buildWhisperServerArgs } = require("../src/helpers/whisperServer.js");
const { DEFAULT_WHISPER_VAD_CONFIG } = require("../src/helpers/whisperVadConfig.js");
const { pcm16ToWav } = require("../src/utils/audioUtils.js");

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const ROOT = path.join(__dirname, "..");
const CORPUS = arg("corpus");
const MODEL = arg("model", path.join(process.env.HOME, ".cache/oats/whisper-models/ggml-base.bin"));
const LIMIT = Number(arg("n", "40"));
const LANGUAGE = arg("language", "auto");
const THREADS = arg("threads", String(Math.max(1, require("os").cpus().length - 2)));
const JSON_OUT = arg("json");
const VAD = process.argv.includes("--vad");
// Where `whisper.js#getVadModelPath` finds it in a source checkout.
const VAD_MODEL = arg(
  "vad-model",
  path.join(ROOT, "resources", "bin", "whisper-vad", "ggml-silero-v5.1.2.bin")
);
const CONCAT = Number(arg("concat", "1"));
const WHOLE = process.argv.includes("--whole");
/** A long dictation, for `--concat`: past one 30 s window, and not a lecture. */
const CLIP_SECONDS = { min: 30, max: 90 };
/**
 * Measure the cloud path instead of the local one — what `useLocalWhisper:false`
 * actually gets you, which is what the pre-Oats build used by default.
 *
 * Not run automatically: it sends audio to OpenAI and spends the key owner's
 * credits. LibriSpeech is public domain so there is no privacy question, but the
 * money is not this script's to spend. Run it deliberately:
 *
 *   OPENAI_API_KEY=sk-... node scripts/asr-eval.js --corpus <dir> --cloud
 */
const CLOUD = process.argv.includes("--cloud");
const CLOUD_MODEL = arg("cloud-model", "gpt-4o-mini-transcribe");
const PORT = Number(arg("port", "8899"));
const SAMPLE_RATE = 16000;

if (!CORPUS || !(CONCAT >= 1)) {
  console.error(
    "usage: node scripts/asr-eval.js --corpus <librispeech-dir> [--model x.bin] [--n 40]" +
      " [--vad] [--concat N] [--whole]"
  );
  process.exit(2);
}

/** The normalisation every ASR benchmark agrees on, and no more than that. */
function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:"“”‘’()[\]—–]/g, " ")
    .replace(/'\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein over words: substitutions + deletions + insertions, over reference length. */
function wordErrors(reference, hypothesis) {
  const ref = normalise(reference).split(" ").filter(Boolean);
  const hyp = normalise(hypothesis).split(" ").filter(Boolean);
  const d = Array.from({ length: ref.length + 1 }, (_, i) =>
    Array.from({ length: hyp.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      d[i][j] =
        ref[i - 1] === hyp[j - 1]
          ? d[i - 1][j - 1]
          : 1 + Math.min(d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]);
    }
  }
  return { errors: d[ref.length][hyp.length], words: ref.length };
}

/** Every (audio, reference) pair in a LibriSpeech tree, in a stable order. */
function loadCorpus(root) {
  const items = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".trans.txt")) {
        for (const line of fs.readFileSync(full, "utf8").split("\n")) {
          const at = line.indexOf(" ");
          if (at === -1) continue;
          const id = line.slice(0, at);
          const audio = path.join(dir, `${id}.flac`);
          if (fs.existsSync(audio)) items.push({ id, audio, reference: line.slice(at + 1).trim() });
        }
      }
    }
  };
  walk(root);
  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

/**
 * Spread the sample across the corpus instead of taking the first N.
 *
 * LibriSpeech is ordered by speaker, so the first N utterances are two or three
 * voices — a number that would move a lot between runs and would not describe
 * the system at all.
 */
function stratify(items, count) {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

/** A FLAC file's length from its STREAMINFO header, without decoding it. */
function flacSeconds(file) {
  const head = Buffer.alloc(26);
  const fd = fs.openSync(file, "r");
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  if (head.toString("ascii", 0, 4) !== "fLaC") throw new Error(`not a FLAC file: ${file}`);
  const info = 8; // "fLaC" and the metadata block header
  const sampleRate = (head[info + 10] << 12) | (head[info + 11] << 4) | (head[info + 12] >> 4);
  const samples = (head[info + 13] & 0x0f) * 2 ** 32 + head.readUInt32BE(info + 14);
  return samples / sampleRate;
}

/**
 * Long dictations: every run of `count` consecutive utterances of one chapter —
 * one reader, one passage — that adds up to 30–90 s, as one recording.
 */
function concatClips(items, count) {
  const chapters = new Map();
  for (const item of items) {
    const chapter = item.id.split("-").slice(0, 2).join("-");
    if (!chapters.has(chapter)) chapters.set(chapter, []);
    chapters.get(chapter).push(item);
  }
  const clips = [];
  for (const utterances of chapters.values()) {
    for (let i = 0; i + count <= utterances.length; i += count) {
      const parts = utterances.slice(i, i + count);
      const seconds = parts.reduce((sum, part) => sum + flacSeconds(part.audio), 0);
      if (seconds < CLIP_SECONDS.min || seconds > CLIP_SECONDS.max) continue;
      clips.push({
        id: `${parts[0].id}+${count - 1}`,
        parts,
        reference: parts.map((part) => part.reference).join(" "),
      });
    }
  }
  return clips;
}

/** The FFmpeg the app itself converts with (`ffmpeg-static`), else the one on PATH. */
function ffmpegBinary() {
  try {
    const bundled = require("ffmpeg-static");
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {}
  return "ffmpeg";
}
const FFMPEG = ffmpegBinary();

/** 16 kHz mono 16-bit samples, as whisper.cpp takes them. */
function decode(audio) {
  const result = spawnSync(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      audio,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "-",
    ],
    { maxBuffer: 256 * 1024 * 1024 }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${audio}: ${result.stderr}`);
  const pcm = result.stdout;
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
}

function wavOf(samples) {
  return pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
}

async function cloudInference(wav) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("--cloud needs OPENAI_API_KEY in the environment");
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "a.wav");
  form.append("model", CLOUD_MODEL);
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok)
    throw new Error(`openai ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return (await response.json()).text ?? "";
}

/** One `/inference` request with the fields the app sends (whisperServer.js#transcribe). */
function inference(wav) {
  return new Promise((resolve, reject) => {
    const boundary = `----asr${Date.now()}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`
    );
    const tail = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${LANGUAGE}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n` +
        `--${boundary}--\r\n`
    );
    const body = Buffer.concat([head, wav, tail]);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/inference",
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(data).text ?? "");
          } catch {
            reject(new Error(`bad response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

async function waitForServer(server, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && server.exitCode === null) {
    const ok = await new Promise((resolve) => {
      const r = http.request(
        { hostname: "127.0.0.1", port: PORT, path: "/", method: "GET" },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      r.on("error", () => resolve(false));
      r.end();
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 100)); // the app polls every 100 ms too
  }
  return false;
}

/**
 * The binary the app spawns on this machine (whisperServer.js#getServerBinaryPath),
 * started the way the app starts it: its own directory first on PATH and as the
 * working directory, so a build that ships libraries beside it finds them.
 */
function startServer(args) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const binary = path.join(
    ROOT,
    "resources",
    "bin",
    `whisper-server-${process.platform}-${process.arch}${ext}`
  );
  if (!fs.existsSync(binary)) throw new Error(`whisper-server not found at ${binary}`);
  const dir = path.dirname(binary);
  const env = { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH || ""}` };
  if (process.platform === "linux") env.LD_LIBRARY_PATH = dir;
  const server = spawn(binary, args, { cwd: dir, env, stdio: ["ignore", "ignore", "pipe"] });
  server.log = "";
  server.stderr.on("data", (chunk) => (server.log = (server.log + chunk).slice(-4000)));
  return server;
}

/** A 95% interval for the WER, by resampling whole recordings (deterministic). */
function werInterval(rows, rounds = 2000) {
  let seed = 20260824;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wers = [];
  for (let r = 0; r < rounds; r += 1) {
    let errors = 0;
    let words = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[Math.floor(random() * rows.length)];
      errors += row.errors;
      words += row.words;
    }
    wers.push(words ? (100 * errors) / words : 0);
  }
  wers.sort((a, b) => a - b);
  return [wers[Math.floor(rounds * 0.025)], wers[Math.floor(rounds * 0.975)]].map((w) =>
    Number(w.toFixed(2))
  );
}

(async () => {
  const { transcribeInPieces } = await import("../src/helpers/whisperRequestCuts.mjs");
  const corpus = loadCorpus(CORPUS);
  const samples =
    CONCAT > 1
      ? stratify(concatClips(corpus, CONCAT), LIMIT)
      : stratify(corpus, LIMIT).map((item) => ({ ...item, parts: [item] }));
  const label = CLOUD ? `cloud ${CLOUD_MODEL}` : `model ${path.basename(MODEL)}`;
  const how = [
    `vad ${VAD ? "on" : "off"}`,
    CONCAT > 1 ? `concat ${CONCAT}` : null,
    WHOLE ? "whole" : null,
  ];
  console.log(
    `${label}  language ${LANGUAGE}  threads ${THREADS}  ${how.filter(Boolean).join("  ")}` +
      `  ${samples.length} ${CONCAT > 1 ? "recordings" : "utterances"}`
  );

  if (!CLOUD) {
    if (!fs.existsSync(MODEL)) throw new Error(`model not found at ${MODEL}`);
    if (VAD && !fs.existsSync(VAD_MODEL)) throw new Error(`VAD model not found at ${VAD_MODEL}`);
  }

  // The app's own argument builder, not a copy of it. A benchmark that assembles
  // its own flags measures a configuration nobody ships, and drifts the first
  // time the real one changes. `--vad` passes what ipcHandlers.js passes for
  // dictation: enabled, the bundled Silero model, the shipped config.
  const args = CLOUD
    ? []
    : buildWhisperServerArgs({
        modelPath: MODEL,
        port: PORT,
        language: LANGUAGE,
        threads: Number(THREADS),
        vadEnabled: VAD,
        vadModelPath: VAD ? VAD_MODEL : null,
        vadConfig: DEFAULT_WHISPER_VAD_CONFIG,
      });
  if (!CLOUD) console.log(`  args: ${args.join(" ")}`);
  const spawnedAt = Date.now();
  const server = CLOUD ? null : startServer(args);
  const stop = () => {
    try {
      server?.kill("SIGKILL");
    } catch {}
  };
  process.on("exit", stop);

  if (!CLOUD && !(await waitForServer(server))) {
    stop();
    throw new Error(`whisper-server never became ready\n${server.log.slice(-1000)}`);
  }
  // Model load, to the port answering: what a cold start costs.
  const startupMs = CLOUD ? null : Date.now() - spawnedAt;

  let totalErrors = 0;
  let totalWords = 0;
  let totalAudio = 0;
  let totalRequests = 0;
  const latencies = [];
  const rows = [];

  for (const item of samples) {
    const parts = item.parts.map((part) => decode(part.audio));
    const pcm = new Int16Array(parts.reduce((n, part) => n + part.length, 0));
    parts.reduce((at, part) => (pcm.set(part, at), at + part.length), 0);
    const wav = wavOf(pcm);
    const seconds = pcm.length / SAMPLE_RATE;

    const started = Date.now();
    let text;
    let pieces = null;
    if (CLOUD) text = await cloudInference(wav);
    else {
      // What the app does with a recording (whisperServer.js#transcribe): too long
      // for one request, it is cut at its pauses and sent in order.
      const cut = WHOLE ? null : await transcribeInPieces(wav, (piece) => inference(wavOf(piece)));
      pieces =
        cut?.pieces.map((p) => Number(((p.endSample - p.startSample) / SAMPLE_RATE).toFixed(1))) ??
        null;
      text = cut ? cut.text : await inference(wav);
    }
    const ms = Date.now() - started;
    const requests = pieces?.length ?? 1;

    const { errors, words } = wordErrors(item.reference, text);
    totalErrors += errors;
    totalWords += words;
    totalAudio += seconds;
    totalRequests += requests;
    latencies.push(ms);
    rows.push({
      id: item.id,
      seconds,
      ms,
      requests,
      pieces,
      errors,
      words,
      reference: item.reference,
      hypothesis: text.trim(),
    });
    process.stdout.write(
      `  ${item.id} ${seconds.toFixed(1).padStart(5)}s ${String(ms).padStart(6)}ms  ${errors}/${words}` +
        `${requests > 1 ? `  ${requests} requests` : ""}\n`
    );
  }
  stop();

  latencies.sort((a, b) => a - b);
  const pick = (values, q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
  const lengths = rows.map((row) => row.seconds).sort((a, b) => a - b);
  const wer = totalWords ? (100 * totalErrors) / totalWords : 0;
  const summary = {
    model: CLOUD ? CLOUD_MODEL : path.basename(MODEL),
    path: CLOUD ? "cloud" : "local",
    language: LANGUAGE,
    vad: VAD,
    concat: CONCAT,
    cut: CLOUD || WHOLE ? "whole" : "pauses",
    threads: Number(THREADS),
    startupMs,
    utterances: samples.length,
    requests: totalRequests,
    werPercent: Number(wer.toFixed(2)),
    werCi95: werInterval(rows),
    errors: totalErrors,
    words: totalWords,
    medianMs: pick(latencies, 0.5),
    p95Ms: pick(latencies, 0.95),
    audioSeconds: Number(totalAudio.toFixed(1)),
    recordingSeconds: {
      min: Number(lengths[0].toFixed(1)),
      median: Number(pick(lengths, 0.5).toFixed(1)),
      max: Number(lengths[lengths.length - 1].toFixed(1)),
    },
    // Below 1.0 means it transcribes faster than the speech arrives, which is
    // what makes dictation feel instant rather than merely fast.
    realTimeFactor: Number(
      (latencies.reduce((a, b) => a + b, 0) / 1000 / (totalAudio || 1)).toFixed(3)
    ),
  };

  console.log("\n" + JSON.stringify(summary, null, 2));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, rows }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
