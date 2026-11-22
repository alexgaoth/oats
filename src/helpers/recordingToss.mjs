import { SPIN_MS, tossFrame } from "./oatsMarkMotion.mjs";

// 16 samples over the 1.15 s toss (about 14 fps). Frame zero doubles as the
// landing frame, so the recording mark can hold it without waking a timer.
export const RECORDING_TOSS_FRAMES = 16;
export const RECORDING_TOSS_STEP_MS = Math.round(SPIN_MS / RECORDING_TOSS_FRAMES);
export const RECORDING_TOSS_REST_MS = 440;
/**
 * The one still pose of the recording mark, used under Reduce Motion and when
 * the toss cannot play: the grain early in its hop, face-on enough to show its
 * crease, lifted and more upright than at rest, so it is an oat and not the
 * resting oat. Never the top of the toss: the grain is end-on there, and at
 * 16 pt that reads as a dot, the generic recording light this mark replaces
 * (DESIGN.md, Motion).
 */
export const RECORDING_STILL_FRAME = 3;

export function recordingTossPose(index) {
  return tossFrame(index / RECORDING_TOSS_FRAMES);
}

/** Play one sampled toss at a time. A paint can return false to end the loop. */
export function playRecordingToss(paint) {
  if (paint(0) === false) return () => {};
  let index = 1;
  const step = () => {
    if (paint(index) === false) return;
    const delay = RECORDING_TOSS_STEP_MS + (index === 0 ? RECORDING_TOSS_REST_MS : 0);
    index = (index + 1) % RECORDING_TOSS_FRAMES;
    timer = setTimeout(step, delay);
  };
  let timer = setTimeout(step, RECORDING_TOSS_STEP_MS);
  return () => clearTimeout(timer);
}
