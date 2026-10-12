// How loud each second of a recording was, kept with the conversation.
//
// The live line takes its height from each second's loudness: the RMS of the
// microphone level over that second (`buildLiveContour`). A finished
// conversation used to keep none of it, so its contour, and every strip in the
// lists, was drawn from words alone, which spread evenly over a turn and draw
// every conversation as the same flat block. This keeps the same per-second RMS
// for the whole recording, one byte a second, so the finished contour is drawn
// from what was measured live (`buildContour`, given `levels`).
//
// Stored on the note (`notes.conversation_loudness`) as JSON:
//
//   {"v":1,"runs":[{"at":1760000000000,"b":"<base64>"}]}
//
// One run per sitting: `at` is the wall-clock second the run starts on, and
// each byte is one second after it. A byte is the level on a decibel scale,
// 1..255 for -90..0 dBFS (0.35 dB a step); 0 means no sample that second.
// A resumed conversation keeps its earlier runs and adds one.
//
// Pure and DOM-free; pinned by test/helpers/conversationLoudness.test.js.

/** One stored value per second, the live line's own bucket. */
export const LOUDNESS_STEP_MS = 1000;

/** The quietest level a byte can hold; anything below it is stored as it. */
const DB_FLOOR = -90;
const FORMAT_VERSION = 1;

/**
 * A gap this long inside a sitting starts a new run instead of being filled
 * with "no sample" bytes: a clock that jumped, not an hour of nothing.
 */
const MAX_FILLED_GAP_MS = 10 * 60_000;

/**
 * Add one microphone sample to a list of per-second levels: the RMS of the
 * samples in each wall-clock second. The live line's rule, shared so the line
 * on screen and the line kept are the same numbers.
 *
 * @param {Array<{ at: number, level: number, sumSq: number, n: number }>} seconds
 *   Oldest first; mutated.
 * @param {number} at Epoch ms of the sample.
 * @param {number} level 0..1.
 */
export function addLevelSample(seconds, at, level) {
  if (!Number.isFinite(at) || !Number.isFinite(level)) return;
  const second = Math.floor(at / LOUDNESS_STEP_MS) * LOUDNESS_STEP_MS;
  const last = seconds[seconds.length - 1];
  if (last && last.at === second) {
    last.sumSq += level * level;
    last.n += 1;
    last.level = Math.sqrt(last.sumSq / last.n);
    return;
  }
  seconds.push({ at: second, level, sumSq: level * level, n: 1 });
}

/** A level (0..1) as a byte: 1..255 in decibels; 0 is kept for no sample. */
export function levelToByte(level) {
  if (!(level > 0)) return 1;
  const position = (20 * Math.log10(level) - DB_FLOOR) / -DB_FLOOR;
  return 1 + Math.round(254 * Math.min(1, Math.max(0, position)));
}

/** A stored byte back as a level, or null for a second with no sample. */
export function byteToLevel(byte) {
  if (!byte) return null;
  return Math.pow(10, (DB_FLOOR + ((byte - 1) / 254) * -DB_FLOOR) / 20);
}

function toBase64(bytes) {
  let binary = "";
  // In slices: String.fromCharCode takes its bytes as arguments.
  for (let index = 0; index < bytes.length; index += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x2000));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The runs a stored value holds, or none for anything that is not one. */
function readRuns(raw) {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== FORMAT_VERSION || !Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter(
      (run) => run && Number.isFinite(run.at) && typeof run.b === "string" && run.b
    );
  } catch {
    return [];
  }
}

/** One sitting's seconds as runs of bytes, a run per stretch without a long gap. */
function sittingRuns(seconds) {
  const sorted = (Array.isArray(seconds) ? seconds : [])
    .filter((second) => Number.isFinite(second?.at) && Number.isFinite(second?.level))
    .sort((a, b) => a.at - b.at);
  const runs = [];
  let start = null;
  let bytes = [];
  for (const second of sorted) {
    const at = Math.floor(second.at / LOUDNESS_STEP_MS) * LOUDNESS_STEP_MS;
    const offset = start === null ? -1 : (at - start) / LOUDNESS_STEP_MS;
    if (start !== null && offset < bytes.length) continue; // a second already held
    if (start === null || at - (start + bytes.length * LOUDNESS_STEP_MS) > MAX_FILLED_GAP_MS) {
      if (start !== null) runs.push({ at: start, b: toBase64(Uint8Array.from(bytes)) });
      start = at;
      bytes = [];
    }
    while (start + bytes.length * LOUDNESS_STEP_MS < at) bytes.push(0);
    bytes.push(levelToByte(second.level));
  }
  if (start !== null) runs.push({ at: start, b: toBase64(Uint8Array.from(bytes)) });
  return runs;
}

/**
 * The stored form of a conversation's loudness: what it already held (a
 * resumed conversation's earlier sittings), then this sitting.
 *
 * @param {string | null} previous The note's stored value, if any.
 * @param {Array<{ at: number, level: number }>} seconds This sitting, from
 *   `addLevelSample`.
 * @returns {string | null} Null when there is nothing to keep.
 */
export function encodeLoudness(previous, seconds) {
  const runs = [...readRuns(previous), ...sittingRuns(seconds)].sort((a, b) => a.at - b.at);
  if (!runs.length) return null;
  return JSON.stringify({ v: FORMAT_VERSION, runs });
}

/**
 * The stored loudness as levels, one per second it holds, oldest first: the
 * shape `buildContour` and `buildLiveContour` take. Seconds with no sample are
 * left out. Anything unreadable is no loudness at all, so the contour falls
 * back to words rather than failing.
 *
 * @param {string | null | undefined} raw
 * @returns {Array<{ at: number, level: number }>}
 */
export function decodeLoudness(raw) {
  const levels = [];
  for (const run of readRuns(raw)) {
    let bytes;
    try {
      bytes = fromBase64(run.b);
    } catch {
      continue;
    }
    for (let index = 0; index < bytes.length; index += 1) {
      const level = byteToLevel(bytes[index]);
      if (level !== null) levels.push({ at: run.at + index * LOUDNESS_STEP_MS, level });
    }
  }
  return levels.sort((a, b) => a.at - b.at);
}
