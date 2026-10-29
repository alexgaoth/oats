// A quiet segment of a conversation in a room, raised before it is transcribed.
//
// Capture has no automatic gain in a room (meetingRecordingStore.ts), so a
// laptop's microphone across the table hands Whisper speech near -50 dBFS.
// Whisper and its VAD hear less of it there than at a room's usual level:
// replayed with the AMI meetings as their microphone recorded them, each
// segment raised to an RMS of 0.05 (never past a 0.9 peak, never made
// quieter) brings back what the quiet microphone lost
// (scripts/room-replay.js, docs/dictation-accuracy.md).
//
// Pure: 16 kHz mono Int16 in, the same or a louder copy out.

export const ROOM_SEGMENT_LEVEL = Object.freeze({
  /** The RMS a quiet segment is raised to (0..1 of full scale). */
  targetRms: 0.05,
  /** The loudest sample may reach this share of full scale, and no more. */
  maxPeak: 0.9,
});

/** The gain that would raise `samples` to the target, ≥ 1; 1 when it is loud enough. */
export function segmentGain(samples, options = ROOM_SEGMENT_LEVEL) {
  const { targetRms, maxPeak } = { ...ROOM_SEGMENT_LEVEL, ...options };
  let square = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    square += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  if (!samples.length || peak === 0) return 1;
  const rms = Math.sqrt(square / samples.length) / 0x8000;
  return Math.max(1, Math.min(targetRms / rms, (maxPeak * 0x8000) / peak));
}

/** `samples` raised to the target level, or `samples` itself when it is loud enough. */
export function raiseQuietSegment(samples, options = ROOM_SEGMENT_LEVEL) {
  const gain = segmentGain(samples, options);
  if (gain <= 1) return samples;
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * gain)));
  }
  return out;
}
