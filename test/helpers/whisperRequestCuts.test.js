const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const WhisperServerManager = require("../../src/helpers/whisperServer");
const { pcm16ToWav } = require("../../src/utils/audioUtils");

let readPcm16Wav, planWhisperRequests, joinPieceTexts, transcribeInPieces, MAX_REQUEST_MS;
const SAMPLE_RATE = 16000;

test.before(async () => {
  ({ readPcm16Wav, planWhisperRequests, joinPieceTexts, transcribeInPieces, MAX_REQUEST_MS } =
    await import("../../src/helpers/whisperRequestCuts.mjs"));
});

// Deterministic noise, so a failing run fails the same way twice.
let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/**
 * `[kind, seconds]` pieces, as in speechSegmenter.test.js: "speech" is a voiced
 * tone whose loudness rises and falls like syllables, "quiet" is the room.
 * Returns the samples and where the quiet was, in seconds.
 */
function signal(pieces) {
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const samples = new Int16Array(total);
  const quiet = [];
  let at = 0;
  for (const [kind, seconds] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    if (kind === "quiet") quiet.push([at / SAMPLE_RATE, (at + n) / SAMPLE_RATE]);
    for (let i = 0; i < n; i += 1) {
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      const voice =
        kind === "speech"
          ? syllable * (0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) + 0.02 * noise())
          : 0.001 * noise();
      samples[at + i] = Math.round(voice * 32767);
    }
    at += n;
  }
  return { samples, quiet };
}

/** Sentences of `talk` seconds with `pause` seconds between them, `count` times. */
function dictation(count, talk, pause) {
  return signal(
    Array.from({ length: count }, () => [
      ["speech", talk],
      ["quiet", pause],
    ]).flat()
  );
}

function assertCoversEverything(pieces, length) {
  assert.equal(pieces[0].startSample, 0);
  assert.equal(pieces[pieces.length - 1].endSample, length);
  for (let i = 1; i < pieces.length; i += 1) {
    assert.equal(pieces[i].startSample, pieces[i - 1].endSample, "contiguous across the cut");
  }
  for (const piece of pieces) {
    const ms = ((piece.endSample - piece.startSample) / SAMPLE_RATE) * 1000;
    assert.ok(ms > 0 && ms <= MAX_REQUEST_MS, `a ${ms}ms piece`);
  }
}

const cutsOf = (pieces) => pieces.slice(1).map((piece) => piece.startSample / SAMPLE_RATE);
const insideQuiet = (seconds, quiet, margin = 0.1) =>
  quiet.some(([from, to]) => seconds >= from + margin && seconds <= to - margin);

test("a recording that fits one request is not cut", async () => {
  assert.equal(await planWhisperRequests(new Int16Array(25 * SAMPLE_RATE)), null);
  assert.equal(await planWhisperRequests(dictation(2, 4, 1).samples), null);
  assert.notEqual(await planWhisperRequests(new Int16Array(25 * SAMPLE_RATE + 1)), null);
});

test("a minute of dictation is cut in its pauses, as few times as it can be", async () => {
  // Pauses at 6–7 s, 13–14 s, … 62–63 s.
  const { samples, quiet } = dictation(9, 6, 1);
  const pieces = await planWhisperRequests(samples);
  assertCoversEverything(pieces, samples.length);
  // 63 s needs three requests of at most 25 s, and that is all it gets.
  assert.equal(pieces.length, 3);
  for (const cut of cutsOf(pieces)) assert.ok(insideQuiet(cut, quiet), `cut at ${cut}s`);
});

test("a monologue that never pauses is still cut within the window, losing nothing", async () => {
  const { samples } = signal([
    ["speech", 47],
    ["quiet", 1],
  ]);
  const pieces = await planWhisperRequests(samples);
  assert.ok(pieces.length >= 2);
  assertCoversEverything(pieces, samples.length);
});

// A long silence is one quiet stretch, and its middle can be out of reach: the
// cut must still land in it rather than at the limit, inside the words.
test("a long silence before the words does not push a cut into them", async () => {
  const { samples, quiet } = signal([
    ["quiet", 40],
    ["speech", 15],
    ["quiet", 1],
  ]);
  const pieces = await planWhisperRequests(samples);
  assertCoversEverything(pieces, samples.length);
  for (const cut of cutsOf(pieces)) assert.ok(insideQuiet(cut, quiet, 0), `cut at ${cut}s`);
});

test("every sample reaches Whisper exactly once, in order", async () => {
  const { samples } = dictation(9, 6, 1);
  const wav = pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  const sent = [];
  const result = await transcribeInPieces(wav, async (piece, index) => {
    sent.push(Int16Array.from(piece));
    return ` piece ${index}. `;
  });
  assert.equal(result.text, "piece 0. piece 1. piece 2.");
  const joined = new Int16Array(sent.reduce((n, piece) => n + piece.length, 0));
  sent.reduce((at, piece) => (joined.set(piece, at), at + piece.length), 0);
  assert.deepEqual(joined, samples);
});

test("a short recording, or audio that is not 16 kHz mono PCM, is left to the caller", async () => {
  const never = async () => assert.fail("nothing should be sent in pieces");
  const short = pcm16ToWav(Buffer.alloc(10 * SAMPLE_RATE * 2));
  assert.equal(await transcribeInPieces(short, never), null);
  assert.equal(await transcribeInPieces(Buffer.from("audio"), never), null);
  const stereo = pcm16ToWav(Buffer.alloc(60 * SAMPLE_RATE * 4), SAMPLE_RATE, 2);
  assert.equal(await transcribeInPieces(stereo, never), null);
});

test("reads the PCM after FFmpeg's LIST chunk, even at an odd byte offset", () => {
  const pcm = Buffer.alloc(8);
  pcm.writeInt16LE(1234, 0);
  pcm.writeInt16LE(-5, 6);
  const plain = pcm16ToWav(pcm);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.alloc(4), Buffer.from("INFOISFT")]);
  list.writeUInt32LE(list.length - 8, 4);
  // RIFF header, fmt chunk, LIST chunk, then data — as `ffmpeg -c:a pcm_s16le` writes it.
  const withList = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
  const odd = Buffer.concat([Buffer.alloc(1), withList]).subarray(1);

  for (const bytes of [plain, withList, odd]) {
    const wav = readPcm16Wav(bytes);
    assert.equal(wav.sampleRate, 16000);
    assert.equal(wav.channels, 1);
    assert.deepEqual(Array.from(wav.samples), [1234, 0, 0, -5]);
  }

  const float = Buffer.from(plain);
  float.writeUInt16LE(3, 20); // IEEE float
  assert.equal(readPcm16Wav(float), null);
  assert.equal(readPcm16Wav(Buffer.from("RIFF....WAVE")), null);
  // Cut off inside its own header: not a WAV to cut, and no exception either.
  assert.equal(readPcm16Wav(plain.subarray(0, 30)), null);
});

test("joins the pieces' text and drops the silent ones", () => {
  assert.equal(
    joinPieceTexts([" Hello there. ", "", "[BLANK_AUDIO]", "  General\nKenobi.", undefined]),
    "Hello there. General Kenobi."
  );
  assert.equal(joinPieceTexts(["[ BLANK_AUDIO ]"]), "");
});

// The server path itself: what goes over the wire.

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function recordRequests(texts) {
  const requests = [];
  const handler = (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const boundary = req.headers["content-type"].split("boundary=")[1];
      const riff = body.indexOf("RIFF");
      const seconds = body.readUInt32LE(riff + 40) / (2 * SAMPLE_RATE);
      requests.push({ body, boundary, seconds });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: texts[requests.length - 1] ?? "" }));
    });
  };
  return { requests, handler };
}

function createManager(port) {
  const manager = new WhisperServerManager();
  manager.ready = true;
  manager.hostname = "127.0.0.1";
  manager.port = port;
  manager.canConvert = true;
  manager.process = {};
  manager.modelPath = "/tmp/model.bin";
  manager._convertToWav = async (buffer) => buffer;
  return manager;
}

test("a short dictation is still one request, byte for byte what it always was", async (t) => {
  const { requests, handler } = recordRequests([" Short and sweet."]);
  const { server, port } = await startServer(handler);
  t.after(() => server.close());

  const { samples } = dictation(3, 6, 1);
  const wav = pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  const result = await createManager(port).transcribe(wav, {
    language: "en",
    initialPrompt: "Oats, Whisper",
  });

  assert.equal(result.text, " Short and sweet.");
  assert.equal(requests.length, 1);
  const { body, boundary } = requests[0];
  const expected = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`
    ),
    wav,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nOats, Whisper\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n` +
        `--${boundary}--\r\n`
    ),
  ]);
  assert.ok(body.equals(expected), "the single-request body changed");
});

test("a minute of dictation goes out in pieces, in order, and comes back whole", async (t) => {
  const { requests, handler } = recordRequests([" One.", " Two.", " Three."]);
  const { server, port } = await startServer(handler);
  t.after(() => server.close());

  const { samples } = dictation(9, 6, 1);
  const wav = pcm16ToWav(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  const result = await createManager(port).transcribe(wav, {
    language: "en",
    initialPrompt: "Oats",
  });

  assert.equal(result.text, "One. Two. Three.");
  assert.equal(requests.length, 3);
  for (const { body, seconds } of requests) {
    assert.ok(seconds <= MAX_REQUEST_MS / 1000, `a ${seconds}s request`);
    // Every piece carries the same language and dictionary as a whole recording.
    assert.ok(body.includes('name="language"\r\n\r\nen\r\n'));
    assert.ok(body.includes('name="prompt"\r\n\r\nOats\r\n'));
  }
  const total = requests.reduce((sum, request) => sum + request.seconds, 0);
  assert.equal(total, samples.length / SAMPLE_RATE);
});
