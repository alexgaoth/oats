// How a scripted conversation plays out in time: when each turn is said, how
// loud the room is at each moment, what the live line shows partway through a
// turn, and when each turn's final text arrives from transcription.
//
// Shared by the fixture builder (Node) and the demo harness (browser), so the
// stored sample and its live replay are the same conversation, second by
// second. Pure and deterministic: one script always gives the same numbers.

/** The first words come this long after Record is pressed. */
export const LEAD_IN_MS = 2400;

/** Room tone: a quiet room, still well above the dead-microphone floor (0.004). */
export const ROOM_FLOOR = 0.0064;

/** What a voice of gain 1 averages while speaking, as a 0..1 level. */
const VOICE_LEVEL = 0.046;

/** Silence the speech segmenter waits for before it closes a segment. */
const CLOSE_AFTER_MS = 450;

/** A room's live line is re-read every 1.2s once it holds 1s of speech (`partialScheduler.mjs`). */
export const PARTIAL_EVERY_MS = 1200;
const PARTIAL_AFTER_MS = 1000;

// --- Deterministic noise ----------------------------------------------------

/** FNV-1a: a stable 32-bit seed from a string. */
export function hash32(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function unit(seed, index) {
  let h = (seed ^ Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): `x` advances one cell per unit. */
export function noise(seed, x) {
  const cell = Math.floor(x);
  const t = x - cell;
  const eased = t * t * (3 - 2 * t);
  const a = unit(seed, cell);
  return a + (unit(seed, cell + 1) - a) * eased;
}

// --- Turns in time ------------------------------------------------------------

/** Words as a transcript counts them: runs with a letter or a digit in them. */
export function countWords(text) {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Lay a script's turns out in time.
 *
 * Each turn is `[speakerKey, text, options?]`. A turn's length comes from its
 * words and its speaker's rate; the pause before it from who spoke last.
 * Options: `gap` and `dur` in seconds override both, `cut` starts a turn on the
 * heels of the last one (an interruption), `loud` scales the voice (a raised
 * one is 1.5 to 2), and `mark` presses Mark during the turn (`{ after, note }`,
 * seconds into it and the note added afterwards).
 *
 * @returns {Array<{ index: number, speaker: string, name: string, text: string,
 *   words: number, startMs: number, endMs: number, loud: number, cut: boolean,
 *   mark: { after?: number, note?: string } | null }>}
 */
export function layoutTurns(script) {
  const seed = hash32(script.id);
  let cursor = script.leadInMs ?? LEAD_IN_MS;
  let previous = null;
  return script.turns.map((turn, index) => {
    const [speaker, text, options = {}] = turn;
    const voice = script.speakers[speaker];
    if (!voice) throw new Error(`Turn ${index} has an unknown speaker: ${speaker}`);
    const words = countWords(text);
    const jitter = noise(seed, index * 0.71 + 0.13);
    const gapMs =
      options.gap != null
        ? options.gap * 1000
        : options.cut
          ? 70 + 110 * jitter
          : previous === speaker
            ? 560 + 520 * jitter
            : 480 + 1200 * jitter;
    const startMs = Math.round(cursor + gapMs);
    const rate = voice.rate * (0.93 + 0.14 * noise(hash32(speaker), index * 0.37));
    const durMs = Math.round(
      options.dur != null ? options.dur * 1000 : Math.max(650, (words / rate) * 1000 + 240)
    );
    cursor = startMs + durMs;
    previous = speaker;
    return {
      index,
      speaker,
      name: voice.name,
      text,
      words,
      startMs,
      endMs: startMs + durMs,
      loud: options.loud ?? 1,
      cut: Boolean(options.cut),
      mark: options.mark ?? null,
    };
  });
}

/**
 * The same timeline, read back from a stored transcript: what the harness
 * replays. `replay.loud` holds the raised turns by segment id.
 */
export function timelineFromTranscript(transcript, replay = {}) {
  const loud = replay.loud ?? {};
  return transcript
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs))
    .sort((a, b) => a.startMs - b.startMs)
    .map((segment, index) => ({
      index,
      id: segment.id,
      speaker: segment.speakerName ?? segment.speaker ?? "",
      name: segment.speakerName ?? segment.speaker ?? "",
      text: segment.text,
      words: countWords(segment.text),
      startMs: segment.startMs,
      endMs: segment.endMs,
      loud: loud[segment.id] ?? 1,
    }));
}

/**
 * When each turn's final text reaches the renderer: the segmenter closes it
 * after a short silence, and the one Whisper server transcribes segments in
 * order, a little over a second for a ten-second turn.
 *
 * @returns {number[]} ms from the start of the recording, one per turn.
 */
export function finalArrivals(timeline) {
  let busyUntil = 0;
  return timeline.map((segment) => {
    const working = 260 + 0.045 * (segment.endMs - segment.startMs);
    const at = Math.max(segment.endMs + CLOSE_AFTER_MS, busyUntil) + working;
    busyUntil = at;
    return Math.round(at);
  });
}

/**
 * The live line's text partway through a turn: the words said so far, a beat
 * behind the voice, as a re-read of the open segment would have them.
 */
export function partialText(segment, atMs) {
  const spoken =
    (atMs - segment.startMs - 350) / Math.max(1, segment.endMs - segment.startMs - 350);
  const words = String(segment.text).trim().split(/\s+/);
  const shown = Math.max(0, Math.min(words.length, Math.floor(words.length * spoken)));
  return words.slice(0, shown).join(" ");
}

/** When the live line is re-read during a turn, in ms from the recording's start. */
export function partialTimes(segment) {
  const times = [];
  for (
    let at = segment.startMs + PARTIAL_AFTER_MS;
    at < segment.endMs - 200;
    at += PARTIAL_EVERY_MS
  ) {
    times.push(at);
  }
  return times;
}

// --- The room's loudness ------------------------------------------------------

/**
 * How loud the room is at each moment: room tone, and over it the voice of
 * whoever is speaking, with syllables, phrases and breaths in it. Raised turns
 * (`loud`) are what make the contour's peaks.
 *
 * @param {ReturnType<typeof layoutTurns>} timeline
 * @param {Record<string, { gain?: number }>} voices By speaker key or name.
 * @param {string} seedText The conversation's id.
 */
export function createRoom(timeline, voices, seedText) {
  const seed = hash32(seedText);
  const starts = timeline.map((segment) => segment.startMs);

  function segmentAt(ms) {
    let low = 0;
    let high = starts.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (starts[middle] <= ms) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (found < 0) return null;
    const segment = timeline[found];
    return ms < segment.endMs ? segment : null;
  }

  /** The level (0..1, an RMS) at `ms` from the start of the recording. */
  function levelAt(ms) {
    const floor =
      ROOM_FLOOR * (0.82 + 0.36 * noise(seed, ms / 900)) + 0.0011 * noise(seed + 7, ms / 70);
    const segment = segmentAt(ms);
    if (!segment) return floor;
    const voice = voices[segment.speaker] ?? voices[segment.name] ?? {};
    const envelope = Math.min(1, (ms - segment.startMs) / 90, (segment.endMs - ms) / 160);
    const syllable = 0.42 + 0.58 * noise(seed + segment.index * 31, ms / 150);
    const phrase = 0.7 + 0.3 * noise(seed + segment.index * 17 + 3, ms / 1400);
    const breath = noise(seed + segment.index * 13 + 5, ms / 2300) < 0.1 ? 0.3 : 1;
    const level =
      VOICE_LEVEL * (voice.gain ?? 1) * segment.loud * syllable * phrase * breath * envelope;
    return Math.min(0.6, floor + Math.max(0, level));
  }

  return { levelAt, segmentAt };
}

/**
 * The microphone level as the app's meter publishes it
 * (`MeetingRecordingMount`): sampled every 100ms, each sample half the last
 * one and half the new reading.
 *
 * @returns {Array<{ at: number, level: number }>} `at` in ms from the start.
 */
export function meterReadings(room, fromMs, toMs) {
  const readings = [];
  let smoothed = 0;
  for (let at = fromMs; at <= toMs; at += 100) {
    smoothed = 0.5 * smoothed + 0.5 * room.levelAt(at);
    readings.push({ at, level: Math.min(1, Math.max(0, smoothed)) });
  }
  return readings;
}
