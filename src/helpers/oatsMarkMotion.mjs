// The Oats symbol's toss: a hop, two tumbles end over end, and a landing.
//
// Pure and DOM-free so the motion can be pinned (test/helpers/oatsMarkMotion
// .test.js); OatsMark.tsx paints each frame from it.

/**
 * The grain's depth against its length. Seen end-on, mid-tumble, it is this
 * much of its full height: a grain is not a coin, so it never goes flat.
 */
export const DEPTH_RATIO = 0.64;
export const SPIN_MS = 1150;
/** Two full tumbles. */
export const FLIPS = 2;
/** How high the toss goes, in the symbol's 1024 box. */
export const HOP = 150;
/** The share of the animation spent in the air; the rest is the landing. */
export const AIRBORNE = 0.8;

function easeOutCubic(p) {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * One frame of the toss, `p` from 0 to 1: how far it has tumbled (radians),
 * how high it is, how squashed, and how far it leans off its tilt (degrees).
 * The tumble starts fast and slows into the landing, which is what reads as a
 * toss rather than a turntable.
 */
export function tossFrame(p) {
  const at = Math.min(1, Math.max(0, p));
  const air = Math.min(1, at / AIRBORNE);
  const phi = FLIPS * 2 * Math.PI * easeOutCubic(air);
  const hop = at < AIRBORNE ? HOP * Math.sin(Math.PI * air) : 0;
  const landing = (at - AIRBORNE) / (1 - AIRBORNE);
  const squash = at >= AIRBORNE && at < 1 ? Math.sin(Math.PI * landing) * (1 - 0.4 * landing) : 0;
  const lean = 9 * Math.sin(2 * Math.PI * air) * (1 - air);
  return { phi, hop, squash, lean };
}

/** How tall the grain looks after tumbling `phi`: 1 face-on, DEPTH_RATIO end-on. */
export function tumbleHeight(phi) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return Math.sqrt(c * c + DEPTH_RATIO * DEPTH_RATIO * s * s);
}
