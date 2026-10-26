#!/usr/bin/env node
/**
 * Replay a recording of a room through the live conversation path, offline,
 * and measure how much of what was said reaches the transcript.
 *
 * A real conversation (28 min, 2026-10-24) came back with segments over 19% of
 * its timeline, while its loudness showed the room talking in the gaps.
 * Nothing in the app says where that speech went, so this replays a whole
 * recording the way the app hears it and keeps the evidence at every stage:
 *
 *   1. capture   the renderer's 24 kHz Int16 chunks of 800 samples, and main's
 *                own `downsample24kTo16k` (utils/audioUtils.js)
 *   2. segmenter the app's `SpeechSegmenter` (helpers/speechSegmenter.mjs), fed
 *                chunk by chunk as `feedInRoomAudio` feeds it, then `flush()`
 *   3. whisper   each closed segment through the app's own
 *                `WhisperServerManager` (start options, threads, FFmpeg
 *                conversion, request cuts, `/inference` fields) with Silero VAD
 *                on and the shipped config, as `_resolveWhisperVadOptions`
 *                ("meeting") gives it
 *   4. filters   `WhisperManager#parseWhisperResult` (the blank-audio marker),
 *                then the in-room path's own `trim()` and "no text, no segment"
 *
 * Partials are left out on purpose: they are previews read from the same open
 * segment, and a final is always sent, so they change when words appear, not
 * which words do.
 *
 * Against a reference with word times, every word gets a fate: under the
 * level (nothing opened a segment on it), a cough (it opened a segment the
 * segmenter threw away as too short), an edge (it had speech frames but lies
 * outside the segment), VAD or Whisper (its segment came back empty), or text.
 * Then: coverage (reference speech time inside a segment sent to Whisper),
 * words recovered and WER (one alignment per recording), segments with no
 * reference speech and their text, the share of a segment's words that belong
 * to its main speaker (the speaker pass gives a whole segment one voice), how
 * long a word waits for its segment to close, and the real-time factor.
 *
 *   node scripts/room-replay.js --audio <file> [--audio <file> ...]
 *        [--ami <annotations dir>] [--model <ggml.bin>] [--language en|auto]
 *        [--no-vad] [--ablate-vad] [--segmenter <speechSegmenter.mjs>]
 *        [--options '{"speechRatio":3}'] [--from S] [--seconds S]
 *        [--gain-db G | --level L] [--noise <file>] [--noise-level L]
 *        [--segment-only] [--oracle] [--cloud <openai model>] [--json out.json]
 *        [--quiet]
 *   node scripts/room-replay.js --librispeech <test-clean dir> [--conversations 9] ...
 *
 *   --ami          AMI annotations (`words/<meeting>.<X>.words.xml`); the meeting
 *                  is read from the audio's file name (ES2004a.Array1-01.wav).
 *                  Without a reference the replay reports only what was sent
 *                  and what came back: the noise runs.
 *   --librispeech  conversations built from LibriSpeech voices instead: near,
 *                  clean voices, the case the segmenter was first tuned on.
 *   --segmenter    another implementation of the segmenter, e.g. main's, to
 *                  measure "before" with exactly the code that shipped.
 *   --options      segmenter options, as JSON, over its defaults.
 *   --gain-db      a louder or quieter microphone: the AMI array records speech
 *                  near -50 dBFS, a laptop in a room hears it nearer -30.
 *   --level        or scale the recording so its median second has this level
 *                  (0..1, as the app keeps a conversation's loudness).
 *   --noise        a noise file mixed under the recording, looped, its median
 *                  second at --noise-level (default 0.01): a fan, a café.
 *   --segment-only stop after the segmenter: coverage without Whisper, seconds
 *                  per meeting, for tuning.
 *   --ablate-vad   also send every segment to a second server without VAD, to
 *                  tell a segment VAD emptied from one Whisper emptied, and to
 *                  score what VAD costs and what it keeps out.
 *   --oracle       send the reference's own speech instead of the segmenter's
 *                  segments: the ceiling a perfect segmenter would reach.
 *   --cloud        send the segments to OpenAI's transcription endpoint
 *                  (OPENAI_API_KEY in the environment) instead of whisper-server,
 *                  `--concurrency` at a time. Public corpora only: never a
 *                  person's own recording.
 *   --normalize-rms an experiment, not the app: raise each segment to this RMS
 *                  before it is sent.
 *
 * Words are scored after the normalisation the Whisper paper uses for English,
 * in small: case and punctuation dropped, the fillers (um, uh, mm, hmm and the
 * like) removed on both sides, hyphens split, digits spelled out, and AMI's
 * truncated words left out. WER is one alignment over the whole meeting, the
 * reference in time order, so overlapping speech costs every configuration
 * the same.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { pcm16ToWav, downsample24kTo16k } = require("../src/utils/audioUtils.js");
const { DEFAULT_WHISPER_VAD_CONFIG } = require("../src/helpers/whisperVadConfig.js");

const ROOT = path.join(__dirname, "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
function arg(name, fallback = null) {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
}

/** Every `--audio`, in order: one recording, or a set (a meeting each). */
const AUDIO = argv.flatMap((value, at) => (argv[at - 1] === "--audio" ? [value] : []));
const AMI = arg("ami");
/** Or conversations built from LibriSpeech voices: a near, clean room. */
const LIBRISPEECH = arg("librispeech");
const CONVERSATIONS = Number(arg("conversations", "9"));
const MODEL = arg("model", path.join(process.env.HOME, ".cache/oats/whisper-models/ggml-base.bin"));
const LANGUAGE = arg("language", "auto");
const VAD = !flag("no-vad");
const VAD_MODEL = arg(
  "vad-model",
  path.join(ROOT, "resources", "bin", "whisper-vad", "ggml-silero-v5.1.2.bin")
);
const SEGMENTER = path.resolve(
  arg("segmenter", path.join(ROOT, "src/helpers/speechSegmenter.mjs"))
);
const OPTIONS = JSON.parse(arg("options", "{}"));
const FROM = Number(arg("from", "0"));
/** A louder or quieter microphone than the recording's: dB applied at capture. */
const GAIN_DB = Number(arg("gain-db", "0"));
/**
 * Or the level to scale the recording to: its median second, measured as the
 * app keeps a conversation's loudness (conversationLoudness.mjs). 0.0225 is
 * the median of the real conversation this replay was built for.
 */
const LEVEL = arg("level") ? Number(arg("level")) : null;
const SECONDS = arg("seconds") ? Number(arg("seconds")) : null;
/**
 * A room's own sound under the recording: this file, looped, scaled so its
 * median second has `--noise-level`, and added after the recording's scaling.
 */
const NOISE = arg("noise");
const NOISE_LEVEL = Number(arg("noise-level", "0.01"));
/**
 * An experiment, not the app: raise each segment to this RMS before it is sent
 * (never past a 0.9 peak, never quieter), to see whether level matters to
 * Whisper or its VAD.
 */
const NORMALIZE = arg("normalize-rms") ? Number(arg("normalize-rms")) : null;
const SEGMENT_ONLY = flag("segment-only");
const ABLATE_VAD = flag("ablate-vad");
const ORACLE = flag("oracle");
const CLOUD = arg("cloud");
const CLOUD_CONCURRENCY = Number(arg("concurrency", "6"));
const JSON_OUT = arg("json");
const QUIET = flag("quiet");

const CAPTURE_RATE = 24_000; // the renderer's AudioContext
const CHUNK = 800; // MEETING_AUDIO_BUFFER_SIZE, meetingRecordingStore.ts
const RATE = 16_000;
const FRAME = 320; // the segmenter's 20 ms

if (require.main === module && !AUDIO.length && !LIBRISPEECH) {
  console.error("usage: node scripts/room-replay.js --audio <file> [--ami <dir>] [--model x.bin]");
  process.exit(2);
}

const log = (...parts) => {
  if (!QUIET) console.log(...parts);
};

// ---------------------------------------------------------------------------
// 1. Capture: what main receives.

function ffmpegBinary() {
  try {
    const bundled = require("ffmpeg-static");
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {}
  return "ffmpeg";
}

/** The recording as the renderer hands it over: 24 kHz mono Int16, at the level asked for. */
function prepare(samples) {
  const before = medianSecondLevel(samples);
  const gainDb = LEVEL ? 20 * Math.log10(LEVEL / before) : GAIN_DB;
  scale(samples, gainDb);
  if (NOISE) {
    const noise = read24k(NOISE, 0, null);
    scale(noise, 20 * Math.log10(NOISE_LEVEL / medianSecondLevel(noise)));
    for (let i = 0; i < samples.length; i += 1) {
      const mixed = samples[i] + noise[i % noise.length];
      samples[i] = Math.max(-32768, Math.min(32767, mixed));
    }
  }
  return { samples, gainDb, levels: secondLevels(samples) };
}

function scale(samples, gainDb) {
  if (!gainDb) return;
  const gain = 10 ** (gainDb / 20);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)));
  }
}

function read24k(file, from, seconds, rate = CAPTURE_RATE) {
  const range = [];
  if (from > 0) range.push("-ss", String(from));
  if (seconds) range.push("-t", String(seconds));
  return ffmpegPcm([...range, "-i", file], rate);
}

/** 16-bit mono PCM at `rate` from FFmpeg, given its input arguments (and stdin). */
function ffmpegPcm(input, rate, stdin = undefined) {
  const result = spawnSync(
    ffmpegBinary(),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      ...input,
      "-ar",
      String(rate),
      "-ac",
      "1",
      "-f",
      "s16le",
      "-",
    ],
    { maxBuffer: 1 << 30, input: stdin }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
  const pcm = result.stdout;
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
}

/**
 * The median second's level, as the app measures it: the RMS of the last 256
 * samples ten times a second (MeetingRecordingMount.tsx), and each second the
 * RMS of those (conversationLoudness.mjs#addLevelSample). Without the
 * smoothing, which moves a median very little.
 */
function medianSecondLevel(samples) {
  return secondLevels(samples).p50;
}

/** Every second's level, as the app keeps it, and its percentiles. */
function secondLevels(samples) {
  const seconds = [];
  for (let at = 0; at + CAPTURE_RATE <= samples.length; at += CAPTURE_RATE) {
    let sum = 0;
    for (let tick = 0; tick < 10; tick += 1) {
      const from = at + tick * (CAPTURE_RATE / 10);
      let square = 0;
      for (let i = from; i < from + 256; i += 1) square += (samples[i] / 0x8000) ** 2;
      sum += square / 256;
    }
    seconds.push(Math.sqrt(sum / 10));
  }
  seconds.sort((a, b) => a - b);
  const at = (q) => (seconds.length ? seconds[Math.floor(q * (seconds.length - 1))] : 0);
  return { p05: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
}

/**
 * Main's 16 kHz stream, chunk by chunk, and where each of its samples really
 * was. `downsample24kTo16k` keeps floor(800 / 1.5) = 533 samples of each
 * 800-sample chunk, a third of a sample short, so the stream's own clock runs
 * 0.06% fast: 1.5 s over a 40-minute meeting. Scoring against the reference
 * uses the true time; the app's offsets are what the segmenter counts.
 */
function capture(samples24k) {
  const chunks = [];
  let total = 0;
  for (let at = 0; at < samples24k.length; at += CHUNK) {
    const piece = samples24k.subarray(at, Math.min(at + CHUNK, samples24k.length));
    const buffer = Buffer.from(piece.buffer, piece.byteOffset, piece.byteLength);
    const out = downsample24kTo16k(buffer);
    const pcm = new Int16Array(out.buffer, out.byteOffset, out.length >> 1);
    chunks.push(pcm);
    total += pcm.length;
  }
  const perChunk = Math.floor(CHUNK / 1.5);
  const trueSeconds = (sample) => {
    const chunk = Math.floor(sample / perChunk);
    return (chunk * CHUNK + (sample - chunk * perChunk) * 1.5) / CAPTURE_RATE;
  };
  return { chunks, total, trueSeconds };
}

// ---------------------------------------------------------------------------
// 2. Segmenter, with its decisions kept.

/**
 * The app's segmenter, fed as `feedInRoomAudio` feeds it, recording every
 * frame's decision and every opening it threw away as too short (a cough, a
 * click, or a word). It watches `_frame`, so a segmenter that renames it
 * fails here loudly rather than measuring nothing.
 */
async function segment(chunks) {
  const { SpeechSegmenter } = await import(SEGMENTER);
  if (typeof SpeechSegmenter.prototype._frame !== "function") {
    throw new Error(`${SEGMENTER} has no _frame to observe`);
  }
  const frames = { start: [], speech: [] };
  const discarded = [];
  class Observed extends SpeechSegmenter {
    _frame(start, frame, rms, speech, out) {
      const wasSpeaking = this.speaking;
      const openedAt = this.segmentStart;
      const before = out.length;
      super._frame(start, frame, rms, speech, out);
      frames.start.push(start);
      frames.speech.push(speech ? 1 : 0);
      if (wasSpeaking && !this.speaking && out.length === before) {
        discarded.push({ startSample: openedAt, endSample: start + FRAME });
      }
    }
  }
  const segmenter = new Observed(OPTIONS);
  const segments = [];
  const started = process.hrtime.bigint();
  for (const chunk of chunks) segments.push(...segmenter.push(chunk));
  segments.push(...segmenter.flush());
  const cpuMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { segments, frames, discarded, options: segmenter.options, cpuMs };
}

// ---------------------------------------------------------------------------
// 3 and 4. Whisper, and what the in-room path keeps of its answer.

function parseResult(result) {
  // The app's own parser, bound to a bare instance: it needs only its two
  // helper methods.
  const WhisperManager = require("../src/helpers/whisper.js");
  return WhisperManager.prototype.parseWhisperResult.call(
    Object.create(WhisperManager.prototype),
    result
  );
}

/**
 * A whisper-server started exactly as `WhisperManager#_runServerTranscription`
 * starts one, and the VAD's verdict on each request read from its log.
 */
async function startLocal(vadEnabled) {
  const WhisperServerManager = require("../src/helpers/whisperServer.js");
  const manager = new WhisperServerManager();
  if (!fs.existsSync(MODEL)) throw new Error(`model not found at ${MODEL}`);
  if (vadEnabled && !fs.existsSync(VAD_MODEL))
    throw new Error(`VAD model not found at ${VAD_MODEL}`);
  // Quiet the app's debug logger: it prints every request.
  const logger = require("../src/helpers/debugLogger");
  for (const level of ["debug", "info", "logWhisperPipeline"]) {
    if (typeof logger[level] === "function") logger[level] = () => {};
  }
  const startOptions = {
    useCuda: false,
    useVulkan: false,
    vadEnabled,
    vadModelPath: vadEnabled ? VAD_MODEL : null,
    vadConfig: DEFAULT_WHISPER_VAD_CONFIG,
  };
  let stderr = "";
  let listening = null;
  const ensure = async () => {
    // What `_runServerTranscription` does before every request: a no-op while
    // the server is up, a restart if it is not.
    await manager.start(MODEL, startOptions);
    // The replay blocks its own event loop for seconds between recordings
    // (decoding, scoring), which the health check reads as a dead server. The
    // app never holds main that long, so the check is off here.
    manager.stopHealthCheck();
    if (listening !== manager.process) {
      listening = manager.process;
      listening.stderr.on("data", (data) => {
        stderr += data;
        if (stderr.length > 1 << 20) stderr = stderr.slice(-(1 << 16));
      });
    }
  };
  await ensure();
  return {
    manager,
    async transcribe(samples) {
      stderr = "";
      const wav = pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
      const started = Date.now();
      let parsed;
      let failed = null;
      try {
        // `transcribeLocalWhisper` → `transcribeViaServer` → this, with the
        // language the meeting was started with and no prompt.
        await ensure();
        const raw = await manager.transcribe(wav, { language: LANGUAGE, initialPrompt: null });
        parsed = parseResult(raw);
      } catch (error) {
        failed = error.message;
        parsed = { success: false };
      }
      const ms = Date.now() - started;
      // ipcHandlers.js#transcribeInRoomSegment: `result?.success ? text.trim() : ""`.
      const text = parsed?.success ? (parsed.text || "").trim() : "";
      const vadSegments = /detected (\d+) speech segments/.exec(stderr);
      const vadSpeech = /total duration of speech segments: ([\d.]+) seconds/.exec(stderr);
      return {
        text,
        ms,
        failed,
        // The server logs what its VAD found; a request that failed found nothing.
        vadSegments: vadEnabled && !failed ? (vadSegments ? Number(vadSegments[1]) : 0) : null,
        vadSpeechSeconds: vadEnabled && !failed ? (vadSpeech ? Number(vadSpeech[1]) : 0) : null,
      };
    },
    stop: () => manager.stop(),
  };
}

/** OpenAI's transcription endpoint, one request per segment, as asr-eval.js sends it. */
function startCloud(model) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("--cloud needs OPENAI_API_KEY in the environment");
  return {
    async transcribe(samples) {
      const wav = pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
      const started = Date.now();
      for (let attempt = 0; ; attempt += 1) {
        const form = new FormData();
        form.append("file", new Blob([wav], { type: "audio/wav" }), "a.wav");
        form.append("model", model);
        form.append("response_format", "json");
        if (LANGUAGE !== "auto") form.append("language", LANGUAGE);
        try {
          const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: form,
          });
          if (!response.ok) {
            const body = (await response.text()).slice(0, 160);
            if ((response.status === 429 || response.status >= 500) && attempt < 5) {
              await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
              continue;
            }
            throw new Error(`openai ${response.status}: ${body}`);
          }
          const text = String((await response.json()).text ?? "").trim();
          return { text, ms: Date.now() - started, failed: null, vadSegments: null };
        } catch (error) {
          if (attempt < 5 && !/openai 4\d\d/.test(error.message)) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          return { text: "", ms: Date.now() - started, failed: error.message, vadSegments: null };
        }
      }
    },
    stop: async () => {},
  };
}

// ---------------------------------------------------------------------------
// The reference.

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Every word of an AMI meeting, with its speaker and its time in the recording. */
function loadAmi(dir, meeting) {
  const wordsDir = path.join(dir, "words");
  const files = fs
    .readdirSync(wordsDir)
    .filter((name) => name.startsWith(`${meeting}.`) && name.endsWith(".words.xml"));
  if (!files.length) throw new Error(`no AMI words for ${meeting} in ${wordsDir}`);
  const words = [];
  const nonSpeech = [];
  for (const file of files.sort()) {
    const speaker = file.split(".")[1];
    const xml = fs.readFileSync(path.join(wordsDir, file), "latin1");
    for (const match of xml.matchAll(
      /<(w|vocalsound|nonvocalsound)\b([^>]*?)(?:\/>|>([^<]*)<\/\1>)/g
    )) {
      const [, tag, attributes, body] = match;
      const read = (name) => {
        const found = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
        return found ? found[1] : null;
      };
      const start = Number(read("starttime"));
      const end = Number(read("endtime"));
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (tag !== "w") {
        nonSpeech.push({ speaker, start, end, type: read("type") || tag });
        continue;
      }
      if (read("punc") === "true") continue;
      words.push({
        speaker,
        start,
        end: Math.max(start, end),
        text: decodeEntities(body || "").trim(),
        truncated: read("trunc") === "true",
      });
    }
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  return { words, nonSpeech };
}

/**
 * Conversations of LibriSpeech voices: two or three readers taking twelve
 * turns, 0.25–1.15 s apart, over a quiet room, as the segmenter was first
 * measured (docs/dictation-accuracy.md). Everybody is near the microphone, so
 * this is the case a change for far voices must not make worse. LibriSpeech
 * has no word times, so each turn's words are spread over the turn.
 */
function librispeechConversations(dir, count) {
  const bySpeaker = new Map();
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".trans.txt")) {
        for (const line of fs.readFileSync(full, "utf8").split("\n")) {
          const at = line.indexOf(" ");
          if (at === -1) continue;
          const id = line.slice(0, at);
          const speaker = id.split("-")[0];
          if (!bySpeaker.has(speaker)) bySpeaker.set(speaker, []);
          bySpeaker
            .get(speaker)
            .push({ id, audio: path.join(folder, `${id}.flac`), text: line.slice(at + 1) });
        }
      }
    }
  };
  walk(dir);
  for (const list of bySpeaker.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  const speakers = [...bySpeaker.keys()].sort();
  let seed = 20261026;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const room = (seconds) =>
    Int16Array.from({ length: Math.round(seconds * RATE) }, () =>
      Math.round((random() * 2 - 1) * 16)
    );
  const out = [];
  let cursor = 0;
  for (let c = 0; c < count; c += 1) {
    const voices = 2 + (c % 2);
    const cast = speakers.slice(cursor, cursor + voices);
    cursor += voices;
    const pieces = [room(1.6)];
    let at = 1.6;
    const words = [];
    for (let turn = 0; turn < 12; turn += 1) {
      const speaker = cast[turn % voices];
      const utterance = bySpeaker.get(speaker).shift();
      const audio = read24k(utterance.audio, 0, null, RATE);
      const seconds = audio.length / RATE;
      const tokens = utterance.text.split(/\s+/).filter(Boolean);
      tokens.forEach((text, k) =>
        words.push({
          speaker,
          start: at + (seconds * k) / tokens.length,
          end: at + (seconds * (k + 1)) / tokens.length,
          text,
          truncated: false,
        })
      );
      pieces.push(audio);
      at += seconds;
      const gap = turn === 11 ? 1.6 : 0.25 + 0.9 * random();
      pieces.push(room(gap));
      at += gap;
    }
    const pcm16 = new Int16Array(pieces.reduce((n, p) => n + p.length, 0));
    pieces.reduce((offset, p) => (pcm16.set(p, offset), offset + p.length), 0);
    const raw = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
    out.push({
      name: `librispeech-${c + 1}`,
      load: () =>
        ffmpegPcm(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "-"], CAPTURE_RATE, raw),
      reference: () => ({ words, nonSpeech: [] }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring.

const FILLERS = new Set(["um", "uh", "hmm", "mm", "mhm", "mmm", "hm", "uhm", "erm"]);
const ONES = [
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
  "fifteen sixteen seventeen eighteen nineteen",
]
  .join(" ")
  .split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

function spellInteger(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1000)
    return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${spellInteger(n % 100)}` : ""}`;
  if (n < 1_000_000)
    return `${spellInteger(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${spellInteger(n % 1000)}` : ""}`;
  return String(n);
}

function spellNumbers(text) {
  return text
    .replace(/([$€£])\s?(\d[\d,]*(?:\.\d+)?)/g, (_, symbol, number) => {
      const unit = { $: "dollars", "€": "euros", "£": "pounds" }[symbol];
      return `${number} ${unit}`;
    })
    .replace(/(\d)%/g, "$1 percent")
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, number) => {
      const spelled = spellInteger(Number(number)).split(" ");
      const last = spelled.pop();
      const irregular = {
        one: "first",
        two: "second",
        three: "third",
        five: "fifth",
        eight: "eighth",
        nine: "ninth",
        twelve: "twelfth",
      };
      const ordinal =
        irregular[last] || (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
      return [...spelled, ordinal].join(" ");
    })
    .replace(/\b\d{1,3}(?:,\d{3})+\b/g, (number) => number.replace(/,/g, ""))
    .replace(
      /\b(\d+)\.(\d+)\b/g,
      (_, whole, fraction) =>
        `${spellInteger(Number(whole))} point ${[...fraction].map((d) => ONES[Number(d)]).join(" ")}`
    )
    .replace(/\b\d+\b/g, (number) => spellInteger(Number(number)));
}

/** Words as they are scored: see the header. */
function normalise(text) {
  return spellNumbers(String(text || ""))
    .toLowerCase()
    .replace(/[[(][^\])]*[\])]/g, " ") // [MUSIC], (laughs): not words anybody said
    .replace(/\b(mm-hmm|uh-huh|mm-mm|uh-uh|um-hum|hmm-mm|mm-hm|uh-hum)\b/g, " ")
    .replace(/\b(?:[a-z]_)+/g, (letters) => letters.replace(/_/g, "")) // AMI's L_C_D_
    .replace(/\bo\.k\.?|\bok\b|(^|\s)'kay\b/g, (_, before = "") => `${before}okay`)
    .replace(/\balright\b/g, "all right")
    .replace(/[-–—/]/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/(^|\s)'+|'+(\s|$)/g, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLERS.has(word));
}

/**
 * One Levenshtein alignment of the whole meeting: which reference words were
 * heard, and the substitutions, deletions and insertions.
 */
function align(reference, hypothesis) {
  const n = reference.length;
  const m = hypothesis.length;
  const back = new Uint8Array((n + 1) * (m + 1)); // 0 match, 1 sub, 2 del, 3 ins
  let previous = new Int32Array(m + 1);
  let current = new Int32Array(m + 1);
  for (let j = 0; j <= m; j += 1) {
    previous[j] = j;
    back[j] = 3;
  }
  for (let i = 1; i <= n; i += 1) {
    current[0] = i;
    back[i * (m + 1)] = 2;
    const word = reference[i - 1];
    for (let j = 1; j <= m; j += 1) {
      const same = word === hypothesis[j - 1];
      let best = previous[j - 1] + (same ? 0 : 1);
      let move = same ? 0 : 1;
      if (previous[j] + 1 < best) {
        best = previous[j] + 1;
        move = 2;
      }
      if (current[j - 1] + 1 < best) {
        best = current[j - 1] + 1;
        move = 3;
      }
      current[j] = best;
      back[i * (m + 1) + j] = move;
    }
    [previous, current] = [current, previous];
  }
  const heard = new Uint8Array(n);
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  for (let i = n, j = m; i > 0 || j > 0;) {
    const move = i === 0 ? 3 : j === 0 ? 2 : back[i * (m + 1) + j];
    if (move === 0) {
      heard[i - 1] = 1;
      i -= 1;
      j -= 1;
    } else if (move === 1) {
      substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (move === 2) {
      deletions += 1;
      i -= 1;
    } else {
      insertions += 1;
      j -= 1;
    }
  }
  return {
    heard,
    substitutions,
    deletions,
    insertions,
    errors: substitutions + deletions + insertions,
  };
}

/** Total length of a set of [from, to] intervals once merged. */
function unionLength(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let from = -Infinity;
  let to = -Infinity;
  for (const [a, b] of sorted) {
    if (a > to) {
      if (to > from) total += to - from;
      [from, to] = [a, b];
    } else if (b > to) to = b;
  }
  if (to > from) total += to - from;
  return total;
}

/** Merged, sorted copy of intervals. */
function merge(intervals, gap = 0) {
  const sorted = intervals.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** How much of [a, b] lies inside the merged, sorted intervals. */
function covered(a, b, intervals) {
  let lo = 0;
  let hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (intervals[mid][1] <= a) lo = mid + 1;
    else hi = mid;
  }
  let total = 0;
  for (let k = lo; k < intervals.length && intervals[k][0] < b; k += 1) {
    total += Math.max(0, Math.min(b, intervals[k][1]) - Math.max(a, intervals[k][0]));
  }
  return total;
}

function inside(t, intervals) {
  let lo = 0;
  let hi = intervals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (intervals[mid][1] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo < intervals.length && intervals[lo][0] <= t;
}

const pct = (part, whole) => (whole ? Number(((100 * part) / whole).toFixed(1)) : null);
const dbfs = (rms) => (rms > 0 ? Number((20 * Math.log10(rms)).toFixed(1)) : null);

/** The reference's own speech, as a perfect segmenter would cut it: pauses, ≤ 20 s. */
function oracleSegments(words, totalSeconds) {
  const regions = merge(
    words.map((w) => [Math.max(0, w.start - 0.15), Math.min(totalSeconds, w.end + 0.15)]),
    0.4
  );
  const out = [];
  for (const [a, b] of regions) {
    const pieces = Math.ceil((b - a) / 20);
    for (let k = 0; k < pieces; k += 1) {
      out.push([a + ((b - a) * k) / pieces, a + ((b - a) * (k + 1)) / pieces]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/** One recording, start to finish: capture, segmenter, transcription, scoring. */
async function replay(recording, backend, ablation) {
  const meeting = recording.name;
  const { samples: samples24k, gainDb, levels } = prepare(recording.load());
  const seconds = samples24k.length / CAPTURE_RATE;
  const { chunks, total, trueSeconds } = capture(samples24k);
  const stream = new Int16Array(total);
  chunks.reduce((at, chunk) => (stream.set(chunk, at), at + chunk.length), 0);

  const reference = recording.reference();
  if (reference) {
    // Only the part replayed, on the replay's own clock.
    const end = FROM + seconds;
    reference.words = reference.words
      .filter((w) => w.start >= FROM && w.end <= end)
      .map((w) => ({ ...w, start: w.start - FROM, end: w.end - FROM }));
    reference.nonSpeech = reference.nonSpeech
      .filter((w) => w.start >= FROM && w.end <= end)
      .map((w) => ({ ...w, start: w.start - FROM, end: w.end - FROM }));
  }

  const seg = await segment(chunks);
  let segments = seg.segments.map((s, index) => ({
    index,
    startSample: s.startSample,
    endSample: s.endSample,
    start: trueSeconds(s.startSample),
    end: trueSeconds(s.endSample),
    samples: s.samples,
  }));
  if (ORACLE) {
    if (!reference) throw new Error("--oracle needs a reference");
    // Cut from the same 16 kHz stream, placed on its own clock.
    const perChunk = Math.floor(CHUNK / 1.5);
    const toSample = (t) => {
      const position = t * CAPTURE_RATE;
      const chunk = Math.floor(position / CHUNK);
      return Math.min(total, Math.round(chunk * perChunk + (position - chunk * CHUNK) / 1.5));
    };
    segments = oracleSegments(reference.words, seconds).map(([a, b], index) => {
      const startSample = toSample(a);
      const endSample = toSample(b);
      return {
        index,
        startSample,
        endSample,
        start: a,
        end: b,
        samples: stream.slice(startSample, endSample),
      };
    });
  }
  const segmentSeconds = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  log(
    `${meeting}: ${seconds.toFixed(0)} s, ${segments.length} segments` +
      ` (${segmentSeconds.toFixed(0)} s, ${pct(segmentSeconds, seconds)}% of the recording)` +
      `, ${seg.discarded.length} openings discarded, segmenter ${seg.cpuMs.toFixed(0)} ms`
  );

  if (NORMALIZE) {
    for (const s of segments) {
      let square = 0;
      let peak = 0;
      for (const v of s.samples) {
        square += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(square / Math.max(1, s.samples.length)) / 0x8000;
      const gain = Math.max(1, Math.min(NORMALIZE / (rms || 1), (0.9 * 0x8000) / (peak || 1)));
      s.samples = Int16Array.from(s.samples, (v) => Math.round(v * gain));
    }
  }

  // --- transcription
  if (backend) {
    const started = Date.now();
    if (CLOUD) {
      let next = 0;
      const worker = async () => {
        while (next < segments.length) {
          const s = segments[next++];
          Object.assign(s, await backend.transcribe(s.samples));
        }
      };
      await Promise.all(Array.from({ length: CLOUD_CONCURRENCY }, worker));
    } else {
      for (const s of segments) {
        Object.assign(s, await backend.transcribe(s.samples));
        if (ablation) {
          const plain = await ablation.transcribe(s.samples);
          s.textWithoutVad = plain.text;
        }
        if (!QUIET && s.index % 100 === 99) {
          process.stdout.write(`  ${s.index + 1}/${segments.length}\r`);
        }
      }
    }
    log(`  transcribed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }

  // --- what was sent, and what came back
  const sent = merge(segments.map((s) => [s.start, s.end]));
  const withText = merge(segments.filter((s) => s.text).map((s) => [s.start, s.end]));
  const discarded = merge(
    seg.discarded.map((d) => [trueSeconds(d.startSample), trueSeconds(d.endSample)])
  );
  const speechFrames = merge(
    seg.frames.start
      .map((start, k) =>
        seg.frames.speech[k] ? [trueSeconds(start), trueSeconds(start + FRAME)] : null
      )
      .filter(Boolean),
    0.001
  );
  const latencies = segments
    .map((s) => s.ms)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const pick = (values, q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
  const summary = {
    meeting,
    audio: recording.audio ?? null,
    seconds: Number(seconds.toFixed(1)),
    gainDb: Number(gainDb.toFixed(1)),
    noise: NOISE ? { file: path.basename(NOISE), level: NOISE_LEVEL } : null,
    normalizeRms: NORMALIZE,
    // Each second's level at the microphone, as the app keeps it: p05 is the room.
    secondLevels: Object.fromEntries(
      Object.entries(levels).map(([k, v]) => [k, Number(v.toFixed(4))])
    ),
    segmenter: path.relative(ROOT, SEGMENTER),
    options: seg.options,
    oracle: ORACLE,
    backend: SEGMENT_ONLY
      ? null
      : CLOUD
        ? { cloud: CLOUD }
        : { model: path.basename(MODEL), language: LANGUAGE, vad: VAD },
    segments: segments.length,
    segmentSeconds: Number(segmentSeconds.toFixed(1)),
    sentShare: pct(segmentSeconds, seconds),
    discardedOpenings: seg.discarded.length,
    segmentLength: segments.length
      ? (() => {
          const lengths = segments.map((s) => s.end - s.start).sort((a, b) => a - b);
          return {
            p10: Number(pick(lengths, 0.1).toFixed(2)),
            median: Number(pick(lengths, 0.5).toFixed(2)),
            p90: Number(pick(lengths, 0.9).toFixed(2)),
            max: Number(lengths[lengths.length - 1].toFixed(2)),
          };
        })()
      : null,
  };
  if (backend) {
    const texts = segments.filter((s) => s.text);
    summary.segmentsWithText = texts.length;
    summary.emptySegments = segments.length - texts.length;
    summary.failedRequests = segments.filter((s) => s.failed).length;
    summary.hypothesisWords = segments.reduce((n, s) => n + normalise(s.text).length, 0);
    summary.requestMs = { median: pick(latencies, 0.5), p95: pick(latencies, 0.95) };
    // Seconds of transcription per second of recording: under 1, the server keeps up.
    summary.realTimeFactor = Number(
      (latencies.reduce((a, b) => a + b, 0) / 1000 / seconds).toFixed(4)
    );
    if (!CLOUD && VAD) {
      summary.vadEmptied = segments.filter((s) => s.vadSegments === 0).length;
      summary.vadSpeechSeconds = Number(
        segments.reduce((n, s) => n + (s.vadSpeechSeconds || 0), 0).toFixed(1)
      );
    }
    if (ablation) {
      summary.emptyWithVadOnly = segments.filter((s) => !s.text && s.textWithoutVad).length;
      summary.hypothesisWordsWithoutVad = segments.reduce(
        (n, s) => n + normalise(s.textWithoutVad).length,
        0
      );
    }
    // Text that is only a bracketed sound, e.g. "[MUSIC]": the app shows it.
    summary.bracketOnlyTexts = texts.filter((s) => /^[[(*][^\])*]*[\])*]$/.test(s.text)).length;
  }

  if (reference) {
    const { words, nonSpeech } = reference;
    const speakers = [...new Set(words.map((w) => w.speaker))].sort();
    const level = (from, to) => {
      const a = Math.max(0, Math.floor(from * RATE));
      const b = Math.min(stream.length, Math.ceil(to * RATE));
      let sum = 0;
      for (let i = a; i < b; i += 1) sum += (stream[i] / 0x8000) ** 2;
      return { sum, n: Math.max(0, b - a) };
    };
    // Speech time and coverage, per speaker and overall.
    const allSpeech = merge(words.map((w) => [w.start, w.end]));
    const speechSeconds = unionLength(allSpeech.map((x) => [...x]));
    const speechIn = (intervals) =>
      allSpeech.reduce((n, [a, b]) => n + covered(a, b, intervals), 0);
    const solo = (() => {
      // Each speaker's speech where nobody else speaks: for their level at the mic.
      const bySpeaker = new Map(
        speakers.map((sp) => [
          sp,
          merge(words.filter((w) => w.speaker === sp).map((w) => [w.start, w.end])),
        ])
      );
      return bySpeaker;
    })();

    // Every reference word's fate, in pipeline order.
    const STAGES = ["quiet", "discarded", "edges", "failed", "vad", "whisper", "text"];
    const fate = words.map((w) => {
      const mid = (w.start + w.end) / 2;
      const span = Math.max(w.end - w.start, 0.02);
      const inSent =
        covered(w.start - 0.01, w.start + span, sent) / span >= 0.5 || inside(mid, sent);
      if (inSent) {
        if (!backend) return "sent";
        const s =
          segments.find((x) => x.start <= mid && x.end >= mid) ||
          segments.find((x) => x.start < w.start + span && x.end > w.start);
        if (s && s.text) return "text";
        if (s && s.failed) return "failed";
        if (s && s.vadSegments === 0) return "vad";
        if (s && s.textWithoutVad) return "vad";
        return "whisper";
      }
      if (inside(mid, discarded)) return "discarded";
      if (covered(w.start - 0.01, w.start + span + 0.01, speechFrames) > 0) return "edges";
      return "quiet";
    });

    // Scored words, in time order.
    const scored = [];
    words.forEach((w, k) => {
      if (w.truncated) return;
      for (const token of normalise(w.text)) scored.push({ token, word: w, fate: fate[k] });
    });
    const hypothesis = [];
    if (backend) {
      for (const s of [...segments].sort((a, b) => a.start - b.start)) {
        hypothesis.push(...normalise(s.text));
      }
    }
    const alignment = backend
      ? align(
          scored.map((x) => x.token),
          hypothesis
        )
      : null;

    const stageCounts = (filter) => {
      const out = {};
      const chosen = words.filter((w) => filter(w) && !w.truncated && normalise(w.text).length);
      const index = new Map(words.map((w, k) => [w, k]));
      for (const name of [...STAGES, "sent"]) out[name] = 0;
      for (const w of chosen) out[fate[index.get(w)]] += 1;
      for (const name of Object.keys(out)) if (!out[name]) delete out[name];
      return { words: chosen.length, ...out };
    };

    const perSpeaker = speakers.map((sp) => {
      const mine = solo.get(sp);
      const own = mine.reduce((n, [a, b]) => n + (b - a), 0);
      // Their level where nobody else talks.
      const others = merge(words.filter((w) => w.speaker !== sp).map((w) => [w.start, w.end]));
      let sum = 0;
      let n = 0;
      for (const [a, b] of mine) {
        const overlap = covered(a, b, others);
        if (overlap > 0) continue;
        const l = level(a, b);
        sum += l.sum;
        n += l.n;
      }
      const tokens = scored.filter((x) => x.word.speaker === sp);
      const heard = alignment
        ? scored.reduce((h, x, k) => h + (x.word.speaker === sp ? alignment.heard[k] : 0), 0)
        : null;
      return {
        speaker: sp,
        speechSeconds: Number(own.toFixed(1)),
        levelDbfs: dbfs(n ? Math.sqrt(sum / n) : 0),
        coverage: pct(
          mine.reduce((c, [a, b]) => c + covered(a, b, sent), 0),
          own
        ),
        coveredSeconds: Number(mine.reduce((c, [a, b]) => c + covered(a, b, sent), 0).toFixed(1)),
        words: tokens.length,
        heard,
        recovered: heard === null ? null : pct(heard, tokens.length),
        fate: stageCounts((w) => w.speaker === sp),
      };
    });

    // Segments with no reference speech in them: what the room's other sounds cost.
    const speechWithMargin = merge(words.map((w) => [w.start - 0.05, w.end + 0.05]));
    const falseSegments = segments.filter((s) => covered(s.start, s.end, speechWithMargin) < 0.05);

    // What a segment's length costs. The speaker pass labels a whole segment
    // with one voice (speakerTurns.mjs), so a segment holding two people's
    // words gives one of them the other's: `purity` is the share of words in a
    // segment that belong to its main speaker, the best a perfect diarizer can
    // do. And a word is final only when its segment closes: the question
    // cards, the topics and the counters wait for that (`finalDelay`, from
    // the end of a word to the end of its segment).
    const bySegment = new Map();
    const delays = [];
    const order = [...segments].sort((a, b) => a.start - b.start);
    const starts = order.map((x) => x.start);
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      let lo = 0;
      let hi = starts.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (starts[m] <= mid) lo = m + 1;
        else hi = m;
      }
      const segment = order[lo - 1];
      if (!segment || segment.end < mid) continue;
      if (!bySegment.has(segment)) bySegment.set(segment, new Map());
      const counts = bySegment.get(segment);
      counts.set(w.speaker, (counts.get(w.speaker) || 0) + 1);
      delays.push(Math.max(0, segment.end - w.end));
    }
    let inSegments = 0;
    let ownSpeaker = 0;
    for (const counts of bySegment.values()) {
      const values = [...counts.values()];
      inSegments += values.reduce((a, b) => a + b, 0);
      ownSpeaker += Math.max(...values);
    }
    delays.sort((a, b) => a - b);
    const delayAt = (q) =>
      delays.length ? Number(delays[Math.floor(q * (delays.length - 1))].toFixed(2)) : null;
    summary.reference = {
      words: scored.length,
      speechSeconds: Number(speechSeconds.toFixed(1)),
      speechShare: pct(speechSeconds, seconds),
      nonSpeechEvents: nonSpeech.length,
      coverage: pct(speechIn(sent), speechSeconds),
      coveredSeconds: Number(speechIn(sent).toFixed(1)),
      coverageInSpeechFrames: pct(speechIn(speechFrames), speechSeconds),
      coverageWithText: backend ? pct(speechIn(withText), speechSeconds) : null,
      coveredSecondsWithText: backend ? Number(speechIn(withText).toFixed(1)) : null,
      fate: stageCounts(() => true),
      purity: pct(ownSpeaker, inSegments),
      wordsInSegments: inSegments,
      wordsWithOwnSpeaker: ownSpeaker,
      finalDelay: {
        median: delayAt(0.5),
        p90: delayAt(0.9),
        // Quarter-second bins, for pooling recordings.
        bins: delays.reduce((bins, d) => {
          const bin = Math.min(120, Math.floor(d * 4));
          bins[bin] = (bins[bin] || 0) + 1;
          return bins;
        }, []),
      },
      falseSegments: falseSegments.length,
      falseSegmentSeconds: Number(
        falseSegments.reduce((n, s) => n + s.end - s.start, 0).toFixed(1)
      ),
      falseSegmentsWithText: backend ? falseSegments.filter((s) => s.text).length : null,
      falseSegmentWords: backend
        ? falseSegments.reduce((n, s) => n + normalise(s.text).length, 0)
        : null,
      perSpeaker,
    };
    if (alignment) {
      const heard = alignment.heard.reduce((a, b) => a + b, 0);
      summary.reference.wer = pct(alignment.errors, scored.length);
      summary.reference.substitutions = alignment.substitutions;
      summary.reference.deletions = alignment.deletions;
      summary.reference.insertions = alignment.insertions;
      summary.reference.heard = heard;
      summary.reference.hypothesisWords = hypothesis.length;
      summary.reference.recovered = pct(heard, scored.length);
      summary.reference.wordRatio = pct(hypothesis.length, scored.length);
      // Of the words that reached a segment with text, how many came back right.
      const textWords = scored.map((x, k) => (x.fate === "text" ? alignment.heard[k] : -1));
      const reached = textWords.filter((v) => v >= 0);
      summary.reference.recoveredWhereText = pct(
        reached.filter((v) => v === 1).length,
        reached.length
      );
    }
    if (ablation) {
      // The same segments read without VAD: what VAD costs speech, and what it
      // keeps out of the transcript.
      const plain = [];
      for (const s of [...segments].sort((a, b) => a.start - b.start)) {
        plain.push(...normalise(s.textWithoutVad));
      }
      const without = align(
        scored.map((x) => x.token),
        plain
      );
      summary.reference.withoutVad = {
        wer: pct(without.errors, scored.length),
        heard: without.heard.reduce((a, b) => a + b, 0),
        errors: without.errors,
        hypothesisWords: plain.length,
        recovered: pct(
          without.heard.reduce((a, b) => a + b, 0),
          scored.length
        ),
        falseSegmentsWithText: falseSegments.filter((s) => s.textWithoutVad).length,
        falseSegmentWords: falseSegments.reduce(
          (n, s) => n + normalise(s.textWithoutVad).length,
          0
        ),
      };
    }
  }

  return { summary, segments: segments.map(({ samples: _samples, ...rest }) => rest) };
}

/** Totals over every recording: sums first, shares last. */
function totals(summaries) {
  const sum = (pick) => summaries.reduce((n, s) => n + (pick(s) || 0), 0);
  const seconds = sum((s) => s.seconds);
  const out = {
    recordings: summaries.length,
    seconds: Number(seconds.toFixed(1)),
    segments: sum((s) => s.segments),
    segmentSeconds: Number(sum((s) => s.segmentSeconds).toFixed(1)),
    discardedOpenings: sum((s) => s.discardedOpenings),
  };
  if (summaries[0]?.backend) {
    out.segmentsWithText = sum((s) => s.segmentsWithText);
    out.emptySegments = sum((s) => s.emptySegments);
    out.failedRequests = sum((s) => s.failedRequests);
    out.hypothesisWords = sum((s) => s.hypothesisWords);
    out.bracketOnlyTexts = sum((s) => s.bracketOnlyTexts);
    out.vadEmptied = sum((s) => s.vadEmptied);
    out.emptyWithVadOnly = sum((s) => s.emptyWithVadOnly);
    out.hypothesisWordsWithoutVad = sum((s) => s.hypothesisWordsWithoutVad);
    out.realTimeFactor = Number(
      (sum((s) => s.realTimeFactor * s.seconds) / (seconds || 1)).toFixed(4)
    );
  }
  const refs = summaries.map((s) => s.reference).filter(Boolean);
  if (refs.length) {
    const r = (pick) => refs.reduce((n, x) => n + (pick(x) || 0), 0);
    const words = r((x) => x.words);
    const speech = r((x) => x.speechSeconds);
    const fate = {};
    for (const x of refs) {
      for (const [k, v] of Object.entries(x.fate)) fate[k] = (fate[k] || 0) + v;
    }
    out.reference = {
      words,
      speechSeconds: Number(speech.toFixed(1)),
      coverage: pct(
        r((x) => x.coveredSeconds),
        speech
      ),
      coverageWithText:
        refs[0].coveredSecondsWithText === null
          ? null
          : pct(
              r((x) => x.coveredSecondsWithText),
              speech
            ),
      fate,
      purity: pct(
        r((x) => x.wordsWithOwnSpeaker),
        r((x) => x.wordsInSegments)
      ),
      finalDelay: (() => {
        const bins = [];
        for (const x of refs) {
          (x.finalDelay?.bins || []).forEach((n, k) => (bins[k] = (bins[k] || 0) + (n || 0)));
        }
        const total = bins.reduce((a, b) => a + (b || 0), 0);
        const at = (q) => {
          let seen = 0;
          for (let k = 0; k < bins.length; k += 1) {
            seen += bins[k] || 0;
            if (seen >= q * total) return (k + 0.5) / 4;
          }
          return null;
        };
        return total ? { median: at(0.5), p90: at(0.9) } : null;
      })(),
      falseSegments: r((x) => x.falseSegments),
      falseSegmentSeconds: Number(r((x) => x.falseSegmentSeconds).toFixed(1)),
      falseSegmentsWithText: r((x) => x.falseSegmentsWithText),
      falseSegmentWords: r((x) => x.falseSegmentWords),
    };
    if (refs[0].withoutVad) {
      const w = (pick) => refs.reduce((n, x) => n + (pick(x.withoutVad) || 0), 0);
      out.reference.withoutVad = {
        wer: pct(
          w((x) => x.errors),
          words
        ),
        recovered: pct(
          w((x) => x.heard),
          words
        ),
        falseSegmentsWithText: w((x) => x.falseSegmentsWithText),
        falseSegmentWords: w((x) => x.falseSegmentWords),
      };
    }
    if (refs[0].wer !== undefined) {
      const errors = r((x) => x.substitutions + x.deletions + x.insertions);
      Object.assign(out.reference, {
        wer: pct(errors, words),
        substitutions: r((x) => x.substitutions),
        deletions: r((x) => x.deletions),
        insertions: r((x) => x.insertions),
        recovered: pct(
          r((x) => x.heard),
          words
        ),
        wordRatio: pct(
          r((x) => x.hypothesisWords),
          words
        ),
      });
    }
    // Voices by how loud they reach the microphone, loudest first in each
    // meeting: whether the far end of the table is heard.
    const ranks = [];
    for (const x of refs) {
      [...x.perSpeaker]
        .sort((a, b) => (b.levelDbfs ?? -200) - (a.levelDbfs ?? -200))
        .forEach((p, rank) => {
          ranks[rank] ??= { speech: 0, covered: 0, words: 0, heard: 0, levels: [] };
          ranks[rank].speech += p.speechSeconds;
          ranks[rank].covered += p.coveredSeconds;
          ranks[rank].words += p.words;
          ranks[rank].heard += p.heard || 0;
          ranks[rank].levels.push(p.levelDbfs);
        });
    }
    out.reference.byLoudness = ranks.map((x, rank) => {
      const levels = x.levels.filter(Number.isFinite).sort((a, b) => a - b);
      return {
        rank: rank + 1,
        medianLevelDbfs: levels[Math.floor(levels.length / 2)] ?? null,
        coverage: pct(x.covered, x.speech),
        recovered: refs[0].wer !== undefined ? pct(x.heard, x.words) : null,
      };
    });
  }
  return out;
}

function table(summaries) {
  const rows = summaries.map((s) => {
    const r = s.reference || {};
    return [
      s.meeting,
      s.seconds.toFixed(0),
      String(s.segments),
      r.coverage ?? "",
      r.recovered ?? "",
      r.wer ?? "",
      r.falseSegments ?? "",
      s.realTimeFactor ?? "",
    ];
  });
  const head = ["recording", "s", "segments", "coverage%", "recovered%", "WER%", "false", "RTF"];
  const widths = head.map((h, k) =>
    Math.max(h.length, ...rows.map((row) => String(row[k]).length))
  );
  const line = (cells) => cells.map((c, k) => String(c).padStart(widths[k])).join("  ");
  return [line(head), ...rows.map(line)].join("\n");
}

async function main() {
  const backend = SEGMENT_ONLY ? null : CLOUD ? startCloud(CLOUD) : await startLocal(VAD);
  const ablation = !SEGMENT_ONLY && !CLOUD && ABLATE_VAD && VAD ? await startLocal(false) : null;
  if (backend) {
    const label = CLOUD
      ? `cloud ${CLOUD}`
      : `${path.basename(MODEL)} language ${LANGUAGE} vad ${VAD ? "on" : "off"}`;
    log(`transcribing with ${label}${ablation ? ", and again without VAD" : ""}`);
  }
  const recordings = LIBRISPEECH
    ? librispeechConversations(LIBRISPEECH, CONVERSATIONS)
    : AUDIO.map((file) => {
        const name = path.basename(file).split(".")[0];
        return {
          name,
          audio: path.basename(file),
          load: () => read24k(file, FROM, SECONDS),
          reference: () => (AMI ? loadAmi(AMI, name) : null),
        };
      });
  const results = [];
  try {
    for (const recording of recordings) results.push(await replay(recording, backend, ablation));
  } finally {
    if (backend) await backend.stop();
    if (ablation) await ablation.stop();
  }
  const summaries = results.map((r) => r.summary);
  const all = totals(summaries);
  if (summaries.length === 1) log(JSON.stringify(summaries[0], null, 2));
  else log(JSON.stringify(all, null, 2));
  console.log(table(summaries));
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ totals: all, recordings: results }, null, 1));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { normalise, align, loadAmi };
