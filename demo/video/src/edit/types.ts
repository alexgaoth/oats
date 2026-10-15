/** What director/capture.mjs writes beside each clip (times in ms from the clip's start). */
export type Capture = {
  scene: string;
  viewport: { width: number; height: number; scale: number };
  frames: { t: number; file: string }[];
  cursor: { t: number; x: number; y: number; kind: "move" | "down" | "up" }[];
  /** Each pointer move as the director made it: start time, duration, from, to. */
  moves?: { t: number; ms: number; from: { x: number; y: number }; to: { x: number; y: number } }[];
  cues: { t: number; name: string; [key: string]: unknown }[];
  /** A clip baked with a speed curve (director/bake-lapse.mjs): its length. */
  baked?: { from: number; to: number; seconds: number };
};

/** A region of the app window in its CSS pixels (the capture's viewport). */
export type Rect = { x: number; y: number; w: number; h: number };
