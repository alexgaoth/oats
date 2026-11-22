import { AIRBORNE, SPIN_MS, tossFrame } from "./oatsMarkMotion.mjs";

// 16 samples over the 1.15 s toss (about 14 fps). Frame zero doubles as the
// landing frame, so the recording mark can hold it without waking a timer.
export const RECORDING_TOSS_FRAMES = 16;
export const RECORDING_TOSS_STEP_MS = Math.round(SPIN_MS / RECORDING_TOSS_FRAMES);
export const RECORDING_TOSS_REST_MS = 440;
export const RECORDING_TOSS_PEAK = Math.round((AIRBORNE / 2) * RECORDING_TOSS_FRAMES);

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
