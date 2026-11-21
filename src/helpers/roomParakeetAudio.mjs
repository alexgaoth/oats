import audioUtils from "../utils/audioUtils.js";
import { raiseQuietSegment } from "./roomSegmentLevel.mjs";

const { pcm16ToWav } = audioUtils;
const ROOM_CONTEXT_SAMPLES = 8 * 16000;

/** The exact same input preparation for finals and previews. */
export function roomParakeetAudio(pcm, neuralEngine, recent, startSample, lastWord) {
  if (!neuralEngine) return { wav: pcm16ToWav(pcm) };
  const segment = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const before = recent.before(startSample, ROOM_CONTEXT_SAMPLES);
  const whole = new Int16Array(before.length + segment.length);
  whole.set(before);
  whole.set(segment, before.length);
  const raised = raiseQuietSegment(whole);
  const bytes = Buffer.from(raised.buffer, raised.byteOffset, raised.byteLength);
  return {
    wav: pcm16ToWav(bytes.subarray(before.length * 2)),
    audioBefore: bytes.subarray(0, before.length * 2),
    wordBefore: lastWord,
  };
}
