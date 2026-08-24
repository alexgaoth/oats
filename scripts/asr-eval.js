#!/usr/bin/env node
/**
 * Measure what dictation actually hears.
 *
 * "It feels less accurate than it used to" is not something you can act on, and
 * every previous claim in this repository that passed a re-read failed a probe.
 * This runs the *real* transcription path — the same `whisper-server` binary the
 * app spawns, the same `/inference` endpoint, the same `--language auto` — over a
 * corpus with human reference transcripts, and reports word error rate and
 * latency.
 *
 * Corpus: LibriSpeech (`.flac` beside a `*.trans.txt` of `ID WORDS...` lines).
 * `test-clean` is read speech in quiet conditions, so treat its WER as a floor:
 * real dictation is worse than this, never better.
 *
 *   node scripts/asr-eval.js --corpus <dir> [--model <ggml.bin>] [--n 40]
 *                            [--language auto|en] [--threads N] [--json out.json]
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

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const CORPUS = arg("corpus");
const MODEL = arg("model", path.join(process.env.HOME, ".cache/oats/whisper-models/ggml-base.bin"));
const LIMIT = Number(arg("n", "40"));
const LANGUAGE = arg("language", "auto");
const THREADS = arg("threads", String(Math.max(1, require("os").cpus().length - 2)));
const JSON_OUT = arg("json");
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

if (!CORPUS) {
  console.error("usage: node scripts/asr-eval.js --corpus <librispeech-dir> [--model x.bin] [--n 40]");
  process.exit(2);
}

/** The normalisation every ASR benchmark agrees on, and no more than that. */
function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:"“”‘’()\[\]—–]/g, " ")
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

function toWav(flac) {
  const out = path.join(require("os").tmpdir(), `asr-eval-${path.basename(flac, ".flac")}.wav`);
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", flac, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", out, "-y"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${flac}: ${result.stderr}`);
  return out;
}

async function cloudInference(wav) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("--cloud needs OPENAI_API_KEY in the environment");
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), "a.wav");
  form.append("model", CLOUD_MODEL);
  form.append("response_format", "json");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`openai ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return (await response.json()).text ?? "";
}

function inference(wav) {
  return new Promise((resolve, reject) => {
    const boundary = `----asr${Date.now()}`;
    const audio = fs.readFileSync(wav);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`
    );
    const mid = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n--${boundary}--\r\n`
    );
    const body = Buffer.concat([head, audio, mid]);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/inference",
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
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

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const r = http.request({ hostname: "127.0.0.1", port: PORT, path: "/", method: "GET" }, () => resolve(true));
      r.on("error", () => resolve(false));
      r.end();
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function audioSeconds(wav) {
  const out = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", wav],
    { encoding: "utf8" }
  );
  return Number(out.stdout.trim()) || 0;
}

(async () => {
  const items = stratify(loadCorpus(CORPUS), LIMIT);
  const label = CLOUD ? `cloud ${CLOUD_MODEL}` : `model ${path.basename(MODEL)}`;
  console.log(`${label}  language ${LANGUAGE}  threads ${THREADS}  ${items.length} utterances`);

  const binary = path.join(__dirname, "..", "resources", "bin", "whisper-server-linux-x64");
  if (!CLOUD) {
    if (!fs.existsSync(binary)) throw new Error(`whisper-server not found at ${binary}`);
    if (!fs.existsSync(MODEL)) throw new Error(`model not found at ${MODEL}`);
  }

  // The same arguments `buildWhisperServerArgs` produces, so this measures the
  // shipped path rather than a favourable one.
  const server = CLOUD
    ? null
    : spawn(
        binary,
        ["--model", MODEL, "--host", "127.0.0.1", "--port", String(PORT), "--threads", THREADS, "--language", LANGUAGE],
        { stdio: "ignore", env: { ...process.env, LD_LIBRARY_PATH: path.dirname(binary) } }
      );
  const stop = () => { try { server?.kill("SIGKILL"); } catch {} };
  process.on("exit", stop);

  if (!CLOUD && !(await waitForServer())) { stop(); throw new Error("whisper-server never became ready"); }

  let totalErrors = 0;
  let totalWords = 0;
  let totalAudio = 0;
  const latencies = [];
  const rows = [];

  for (const item of items) {
    const wav = toWav(item.audio);
    const seconds = audioSeconds(wav);
    const started = Date.now();
    const text = CLOUD ? await cloudInference(wav) : await inference(wav);
    const ms = Date.now() - started;
    fs.unlinkSync(wav);

    const { errors, words } = wordErrors(item.reference, text);
    totalErrors += errors;
    totalWords += words;
    totalAudio += seconds;
    latencies.push(ms);
    rows.push({ id: item.id, seconds, ms, errors, words, reference: item.reference, hypothesis: text.trim() });
    process.stdout.write(`  ${item.id} ${String(ms).padStart(6)}ms  ${errors}/${words}\n`);
  }
  stop();

  latencies.sort((a, b) => a - b);
  const pick = (q) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];
  const wer = totalWords ? (100 * totalErrors) / totalWords : 0;
  const summary = {
    model: CLOUD ? CLOUD_MODEL : path.basename(MODEL),
    path: CLOUD ? "cloud" : "local",
    language: LANGUAGE,
    threads: Number(THREADS),
    utterances: items.length,
    werPercent: Number(wer.toFixed(2)),
    errors: totalErrors,
    words: totalWords,
    medianMs: pick(0.5),
    p95Ms: pick(0.95),
    audioSeconds: Number(totalAudio.toFixed(1)),
    // Below 1.0 means it transcribes faster than the speech arrives, which is
    // what makes dictation feel instant rather than merely fast.
    realTimeFactor: Number((latencies.reduce((a, b) => a + b, 0) / 1000 / (totalAudio || 1)).toFixed(3)),
  };

  console.log("\n" + JSON.stringify(summary, null, 2));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, rows }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
