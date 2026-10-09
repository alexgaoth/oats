// Cutting a recording that is too long for one Whisper request.
//
// Every local request goes out with `--no-timestamps` (whisperServer.js), and
// without a timestamp whisper.cpp cannot resume where its decoder stopped: it
// moves on by a whole 30 s window, and whatever was not yet written is gone.
// Dictation sent the whole recording as one request. Measured on 40 dictations
// of 31–89 s (base.en, Metal, docs/dictation-accuracy.md): 13.10% WER sent
// whole, 4.37% cut here. Sent whole, three of the 40 came back with ten words
// or fewer out of 80–124 — "the princess inquired. But" for 124.
//
// So a recording longer than MAX_REQUEST_MS is cut where the speaker pauses,
// found by the same `SpeechSegmenter` the room path uses, and the pieces are
// transcribed in order and joined. A recording that fits one request is not
// touched: `transcribeInPieces` returns null and the caller sends it whole,
// exactly as before.
//
// The pieces cover the recording end to end. A cut lands inside a pause, and
// nothing is dropped on either side of it, so a soft word that the segmenter
// took for silence still reaches Whisper.
//
// Pure and DOM-free: WAV bytes or 16 kHz mono Int16 in, sample ranges and text
// out. Pinned by test/helpers/whisperRequestCuts.test.js. `scripts/asr-eval.js`
// runs this same code, so the benchmark measures what ships.

import { SAMPLE_RATE, SpeechSegmenter } from "./speechSegmenter.mjs";

/** The longest request sent whole: one 30 s Whisper window, less a margin. */
export const MAX_REQUEST_MS = 25_000;

/**
 * The 16-bit PCM inside a WAV file, or null for anything else.
 *
 * Walks the chunks rather than assuming a 44-byte header: FFmpeg writes a
 * LIST chunk before `data`.
 *
 * @param {Uint8Array} bytes
 * @returns {{ sampleRate: number, channels: number, samples: Int16Array } | null}
 */
export function readPcm16Wav(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let format = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      format = {
        encoding: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format || format.encoding !== 1 || format.bitsPerSample !== 16) return null;
      // A streamed WAV can claim more data than it holds; whole samples only.
      const length = Math.min(size, bytes.length - body) & ~1;
      const start = bytes.byteOffset + body;
      // An Int16Array view needs an even byte offset; otherwise copy. (Not
      // `slice`: on a Node Buffer that is a view of the same memory.)
      let samples;
      if (start % 2 === 0) {
        samples = new Int16Array(bytes.buffer, start, length / 2);
      } else {
        const copy = new Uint8Array(length);
        copy.set(bytes.subarray(body, body + length));
        samples = new Int16Array(copy.buffer);
      }
      return { sampleRate: format.sampleRate, channels: format.channels, samples };
    }
    at = body + size + (size % 2); // chunks are padded to an even length
  }
  return null;
}

/**
 * Every stretch where nobody is speaking, as `[from, to]` sample positions in
 * order: before the first words, between every two segments, after the last.
 * Where the segmenter had to cut a monologue that never paused, the stretch is
 * empty and sits on that seam.
 *
 * The segmenter costs ~1.7 ms per second of audio (M5 Pro), so an hour-long
 * upload would hold the main process for seconds; it yields every ten seconds
 * of audio instead.
 */
async function quietStretches(samples) {
  const segmenter = new SpeechSegmenter();
  const quiet = [];
  let quietFrom = 0;
  const speech = (segment) => {
    quiet.push([quietFrom, segment.startSample]);
    quietFrom = segment.endSample;
  };
  // A second at a time, so only one open segment of audio is held at once.
  for (let at = 0; at < samples.length; at += SAMPLE_RATE) {
    segmenter.push(samples.subarray(at, at + SAMPLE_RATE)).forEach(speech);
    if (at % (10 * SAMPLE_RATE) === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  segmenter.flush().forEach(speech);
  quiet.push([quietFrom, samples.length]);
  return quiet;
}

/**
 * Where to cut a recording into Whisper requests.
 *
 * Each piece ends in the last quiet stretch within `maxRequestMs` of its start,
 * at the stretch's middle when that is in reach, so a recording is cut as few
 * times as it can be and never next to a word. Only when no quiet stretch is in
 * reach is a piece cut at the limit: a word cut in half costs less than a
 * window skipped.
 *
 * @param {Int16Array} samples 16 kHz mono
 * @returns {Promise<Array<{ startSample: number, endSample: number }> | null>}
 *   contiguous pieces from 0 to `samples.length`, or null when one request
 *   holds it all
 */
export async function planWhisperRequests(samples, { maxRequestMs = MAX_REQUEST_MS } = {}) {
  const limit = Math.floor((SAMPLE_RATE * maxRequestMs) / 1000);
  if (samples.length <= limit) return null;

  const quiet = await quietStretches(samples);
  const pieces = [];
  let start = 0;
  while (samples.length - start > limit) {
    const reach = start + limit;
    let stretch = null;
    for (const [from, to] of quiet) {
      if (from > reach) break;
      if (to > start) stretch = [from, to];
    }
    let end = reach;
    if (stretch) {
      const [from, to] = stretch;
      const middle = Math.round((from + to) / 2);
      const first = Math.max(from, start + 1);
      const last = Math.min(to, reach);
      // Past the middle already (a long silence): go as far into it as reach allows.
      end = middle < first ? last : Math.min(middle, last);
    }
    pieces.push({ startSample: start, endSample: end });
    start = end;
  }
  pieces.push({ startSample: start, endSample: samples.length });
  return pieces;
}

/** One transcript from the pieces' texts, in order; silent pieces add nothing. */
export function joinPieceTexts(texts) {
  return texts
    .map((text) =>
      String(text ?? "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((text) => text && !/^\[\s*blank_audio\s*\]$/i.test(text))
    .join(" ");
}

/**
 * Transcribe a recording that is too long for one request, piece by piece.
 *
 * @param {Uint8Array} wavBytes the WAV that would otherwise be sent whole
 * @param {(samples: Int16Array, index: number) => Promise<string>} transcribePiece
 *   sends one piece's 16 kHz mono samples and resolves to its text
 * @returns {Promise<{ text: string, pieces: Array<{ startSample: number,
 *   endSample: number }> } | null>} null when the recording fits in one request,
 *   or is not 16 kHz mono PCM: the caller sends it whole, as before
 */
export async function transcribeInPieces(wavBytes, transcribePiece, options = {}) {
  const pcm = readPcm16Wav(wavBytes);
  if (!pcm || pcm.sampleRate !== SAMPLE_RATE || pcm.channels !== 1) return null;
  const pieces = await planWhisperRequests(pcm.samples, options);
  if (!pieces) return null;
  const texts = [];
  for (const [index, piece] of pieces.entries()) {
    // In order, one at a time: whisper-server answers one request at a time anyway.
    const samples = pcm.samples.subarray(piece.startSample, piece.endSample);
    texts.push(await transcribePiece(samples, index));
  }
  return { text: joinPieceTexts(texts), pieces };
}
