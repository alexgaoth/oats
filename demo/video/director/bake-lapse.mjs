// node director/bake-lapse.mjs
//
// Bakes the film's time-lapse into its own clip, public/clips/b-lapse.mp4,
// played at one frame per film frame. The b-timelapse take is the replay at
// six times from 0:20 to 17:36; the film runs it faster still, on a speed
// curve, from where the record scene leaves the clock (about 0:23, at 18x)
// to where the Words scene picks it up (17:32.6, at 6x).
//
// Why a clip of its own: Remotion clamps a frozen frame to the film's length,
// and a 66 s film could not reach the 3-minute take's last frames; moving the
// video's start every frame instead made Remotion hand back a scaled frame
// now and then, and the film flashed a mosaic of small windows.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const dir = path.join(root, "out/capture/b-timelapse");
const capture = JSON.parse(fs.readFileSync(path.join(dir, "capture.json"), "utf8"));
const FPS = 60;

// Where the take shows a demo time, read off its own clock: 0:22 at 1.0 s
// (the seek to 0:20 lands just before; earlier frames still show 0:00) and
// 17:34 at 173.1 s, six times exactly in between.
const A = { clip: 1.0, demo: 22 };
const B = { clip: 173.1, demo: 1054 };
const clipAt = (demoSeconds) => A.clip + ((demoSeconds - A.demo) * (B.clip - A.clip)) / (B.demo - A.demo);

const FROM = A.clip; // 0:22, about where the record scene leaves the clock
const TO = clipAt(1052.6); // 17:32.6, where the Words scene begins

// Speed, as clip seconds per film second (the replay's six times on top):
// from 3 (18x) up to 20 (120x), held, then down to 1 (6x) to meet the Words
// scene's real time. Each change is an S-curve.
const START = 3;
const TOP = 20;
const LAST = 1;
const UP = 0.8;
const DOWN = 0.8;
// An S-curve's mean is its midpoint, so each ramp covers (a + b) / 2 per second.
const HOLD = (TO - FROM - (UP * (START + TOP)) / 2 - (DOWN * (TOP + LAST)) / 2) / TOP;
const SECONDS = UP + HOLD + DOWN;
const smooth = (u) => u * u * (3 - 2 * u);
const speed = (t) => {
  if (t < UP) return START + (TOP - START) * smooth(t / UP);
  if (t < UP + HOLD) return TOP;
  return TOP + (LAST - TOP) * smooth(Math.min(1, (t - UP - HOLD) / DOWN));
};

// Clip time at each film frame: the speed, integrated in small steps.
const frames = Math.round(SECONDS * FPS);
const times = [];
let clip = FROM;
const STEPS = 20;
for (let index = 0; index < frames; index += 1) {
  times.push(Math.round(clip * 1000));
  for (let step = 0; step < STEPS; step += 1) {
    const t = (index + (step + 0.5) / STEPS) / FPS;
    clip += speed(t) / FPS / STEPS;
  }
}

const timesFile = path.join(dir, "lapse-times.json");
fs.writeFileSync(timesFile, JSON.stringify(times));
execFileSync("node", [path.join(here, "assemble.mjs"), dir, path.join(root, "public/clips/b-lapse.mp4"), "--times", timesFile], {
  stdio: "inherit",
});
fs.writeFileSync(
  path.join(root, "public/clips/b-lapse.json"),
  JSON.stringify({ ...capture, frames: [], cursor: [], moves: [], baked: { from: FROM, to: TO, seconds: frames / FPS } }, null, 1)
);
console.log(
  `b-lapse: ${frames} frames (${(frames / FPS).toFixed(3)} s) from clip ${FROM}s to ${(times.at(-1) / 1000).toFixed(2)}s (aim ${TO.toFixed(2)}s), hold ${HOLD.toFixed(2)} s at ${TOP * 6}x`
);
