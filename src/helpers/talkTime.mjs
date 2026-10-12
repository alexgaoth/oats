// How long each voice in a conversation spoke.
//
// Measured, not guessed: each transcript segment knows its own place in the
// recording (`startMs`/`endMs`, from the speech segmenter), and after Finish the
// speaker pass puts a voice on it (`speakerTurns.mjs`). A voice's talk time is
// the sum of its segments' lengths. A segment with no place in the recording
// (an online call's chunk, a legacy transcript) has no length, so it is left
// out rather than given one.
//
// Voices are told apart by the rule the transcript labels them by
// (`speakerLabelKind`), so a name the reader gave counts as that person, and
// two voices given the same name count as one, the way the transcript reads.
//
// Pure and DOM-free; pinned by test/helpers/talkTime.test.js.

import { speakerLabelKind } from "./speakerTurns.mjs";

/**
 * Which voice said a segment, as a key: `name:Sam`, `number:2`, `you`, `room`.
 * Null when the voices of a room have not been told apart.
 */
export function speakerKey(segment) {
  const kind = speakerLabelKind(segment);
  if (!kind) return null;
  if (kind.kind === "name") return `name:${kind.name}`;
  if (kind.kind === "number") return `number:${kind.n}`;
  return kind.kind;
}

/**
 * Whole percentages that add up to 100: each share rounded down, then the
 * points left over go to the largest remainders.
 */
function wholePercents(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return values.map(() => 0);
  const exact = values.map((value) => (value / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * @param {Array<{ startMs?: number, endMs?: number, speaker?: string,
 *   speakerName?: string, speakerIsPlaceholder?: boolean, source?: string }>} segments
 * @returns {{
 *   totalMs: number,
 *   speakers: Array<{ key: string, ms: number, percent: number, segment: object }>,
 *   unattributedMs: number,
 *   unattributedPercent: number,
 * }}
 *   `speakers` most talk first; `segment` is the voice's first segment, for
 *   its label. Percentages are of all timed speech, unattributed included, and
 *   add up to 100.
 */
export function talkTime(segments) {
  const voices = new Map();
  let unattributedMs = 0;
  let order = 0;
  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)) continue;
    const ms = segment.endMs - segment.startMs;
    if (!(ms > 0)) continue;
    const key = speakerKey(segment);
    if (!key) {
      unattributedMs += ms;
      continue;
    }
    const voice = voices.get(key);
    if (voice) voice.ms += ms;
    else voices.set(key, { key, ms, segment, order: order++ });
  }
  const speakers = [...voices.values()].sort((a, b) => b.ms - a.ms || a.order - b.order);
  const totalMs = speakers.reduce((sum, voice) => sum + voice.ms, 0) + unattributedMs;
  const percents = wholePercents([...speakers.map((voice) => voice.ms), unattributedMs]);
  return {
    totalMs,
    speakers: speakers.map((voice, index) => ({
      key: voice.key,
      ms: voice.ms,
      percent: percents[index],
      segment: voice.segment,
    })),
    unattributedMs,
    unattributedPercent: percents[speakers.length],
  };
}
