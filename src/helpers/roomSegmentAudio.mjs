// A room's steady sound taken out of a segment before Whisper hears it, when
// the room has one.
//
// Replayed through the live path with steady sound under the AMI meetings (an
// air conditioner's pink noise, the level of a real conversation that lost
// most of its words; scripts/room-replay.js, docs/dictation-accuracy.md),
// FFmpeg's `afftdn` brought back two points of the words `small.en` missed.
// In a quiet room and on a quiet microphone it brought back nothing and cost
// content words, and wrote phrases where nobody spoke. So it runs only where
// the room itself stays loud: the segmenter's steady floor (the lowest its
// floor went over the last minute, speechSegmenter.mjs) at 0.009 (-41 dBFS)
// or over. With steady sound it never went under -39.9 dBFS; on the quiet
// microphone it never went over -47.1, and in the quiet room 2% of segments
// reached it. The floor at the moment alone was a worse sign: a busy minute of
// talk raises it, and 6.7% of the quiet room's segments passed -40 dBFS.
// Against the raise and labels, `small.en` with steady sound got 1.8 points
// of the words back (content words 1.4) and wrote nothing more where nobody
// spoke; the quiet microphone's text did not change, nor the quiet room's
// words.
//
// Only for `base` and `small`, English-only or not. Turbo heard more with it
// too (content words +1.3 with steady sound), but wrote more wrong words
// (content-word precision 67.7% → 66.2%) and two more phrases where nobody
// spoke: not a clear gain. The other models were not measured.
//
// afftdn's own floor must sit where the room's is: its default (-50 dB) is
// under a fan's sound and over a quiet microphone's speech. It is the
// segment's own floor (the RMS of its quietest tenth of 20 ms frames) plus
// 1 dB: a segment opens a little before its speech and closes after a pause,
// so its quietest frames are the room.
//
// Pure and DOM-free: 16 kHz mono Int16 in, an FFmpeg filter chain or null out.

const FRAME = 320; // 20 ms at 16 kHz, the segmenter's frame

/** The Whisper models (their ids in modelRegistryData.json) whose rooms are denoised. */
export const ROOM_DENOISE_MODELS = Object.freeze(["base", "base.en", "small", "small.en"]);

export const ROOM_DENOISE = Object.freeze({
  /** The steady floor (RMS, 0..1) from which a room's sound is taken out: -41 dBFS. */
  minSteadyFloor: 0.009,
  /** afftdn's noise floor: the segment's own, plus this many dB. */
  floorOffsetDb: 1,
  /** The quietest share of a segment's frames its floor is read from. */
  floorQuantile: 0.1,
  /** Fewer frames than this, and a segment's floor cannot be told. */
  minFrames: 10,
});

/**
 * A segment's noise floor, in dBFS: the RMS of the frame at its quietest
 * tenth of 20 ms frames. Null for a segment too short to tell.
 */
export function segmentFloorDb(samples, options = ROOM_DENOISE) {
  const { floorQuantile, minFrames } = { ...ROOM_DENOISE, ...options };
  const levels = [];
  for (let at = 0; at + FRAME <= samples.length; at += FRAME) {
    let square = 0;
    for (let i = at; i < at + FRAME; i += 1) square += (samples[i] / 0x8000) ** 2;
    levels.push(Math.sqrt(square / FRAME));
  }
  if (levels.length < minFrames) return null;
  levels.sort((a, b) => a - b);
  const floor = levels[Math.floor(floorQuantile * (levels.length - 1))];
  return 20 * Math.log10(Math.max(1e-5, floor));
}

/**
 * The FFmpeg filter that takes the room's steady sound out of these samples,
 * the ones Whisper `model` will hear; null for another model, in a room under
 * the floor that needs it (`steadyFloor`, the segmenter's, in RMS), or for a
 * segment too short to tell its own floor: it is then sent as it is.
 */
export function roomDenoiseFilter(samples, steadyFloor, model, options = ROOM_DENOISE) {
  const { minSteadyFloor, floorOffsetDb } = { ...ROOM_DENOISE, ...options };
  if (!ROOM_DENOISE_MODELS.includes(model)) return null;
  if (!(steadyFloor >= minSteadyFloor)) return null;
  const floor = segmentFloorDb(samples, options);
  if (floor === null) return null;
  // afftdn takes a floor from -80 to -20 dB.
  const nf = Math.max(-80, Math.min(-20, Math.round(floor + floorOffsetDb)));
  return `afftdn=nf=${nf}`;
}
