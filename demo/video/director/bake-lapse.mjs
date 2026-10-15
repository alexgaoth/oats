// node director/bake-lapse.mjs
//
// Bakes the film's time-lapse into its own clip, public/clips/b-lapse.mp4,
// played at one frame per film frame. The b-timelapse take is the replay at
// six times from 0:20 to 17:36; the film runs it faster still, on a speed
// curve, from where the record scene leaves the clock (about 0:23, at 18x)
// to where the Words scene picks it up (17:32.6, at 6x).
//
// Why its own frames: a speed curve this steep is simplest as a list of the
// take's frames, one per film frame (public/seq/b-lapse), which the film
// shows as it shows any clip.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { speedCurve } from "../src/edit/speedCurve.mjs";

import pellwood from "./sets/pellwood.mjs";
import ideas from "./sets/ideas.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const SHEET = { pellwood, ideas }[process.env.OATS_SET ?? "pellwood"];
const prefix = SHEET.name === "pellwood" ? "" : `${SHEET.name}-`;
const dir = path.join(root, SHEET.name === "pellwood" ? "out/capture/b-timelapse" : `out/capture-${SHEET.name}/b-timelapse`);
const capture = JSON.parse(fs.readFileSync(path.join(dir, "capture.json"), "utf8"));
const FPS = 60;

// Where the take shows a demo time. The take logs the replay's own clock every
// two seconds ("demo" cues): a straight line through them, once the seek to
// 0:20 has landed. An older take without them uses two clock readings off its
// frames (the sheet's lapseClock).
const readings = capture.cues
  .filter((cue) => cue.name === "demo" && cue.seconds >= 20)
  .map((cue) => ({ clip: cue.t / 1000, demo: cue.seconds }));
let clipAt;
if (readings.length >= 2) {
  const n = readings.length;
  const mx = readings.reduce((sum, r) => sum + r.demo, 0) / n;
  const my = readings.reduce((sum, r) => sum + r.clip, 0) / n;
  const slope =
    readings.reduce((sum, r) => sum + (r.demo - mx) * (r.clip - my), 0) /
    readings.reduce((sum, r) => sum + (r.demo - mx) ** 2, 0);
  clipAt = (demoSeconds) => my + slope * (demoSeconds - mx);
} else {
  const [A, B] = SHEET.lapseClock;
  clipAt = (demoSeconds) => A.clip + ((demoSeconds - A.demo) * (B.clip - A.clip)) / (B.demo - A.demo);
}

// The sheet's speed curve, from demo times to the take's clip times, with
// S-curves between the points (src/edit/speedCurve.mjs).
const curve = speedCurve(SHEET.lapse.map((point) => ({ at: clipAt(point.demo), speed: point.speed })));
const FROM = curve.start;
const TO = curve.end;
const SECONDS = curve.seconds;
const frames = Math.round(SECONDS * FPS);
const times = Array.from({ length: frames }, (_, index) => Math.round(curve.clipAt(index / FPS) * 1000));

const timesFile = path.join(dir, "lapse-times.json");
fs.writeFileSync(timesFile, JSON.stringify(times));
execFileSync("node", [path.join(here, "assemble.mjs"), dir, path.join(root, `public/clips/${prefix}b-lapse.mp4`), "--times", timesFile, "--seq", "sequence-lapse"], {
  stdio: "inherit",
});
fs.writeFileSync(
  path.join(root, `public/clips/${prefix}b-lapse.json`),
  JSON.stringify({ ...capture, frames: [], cursor: [], moves: [], baked: { from: FROM, to: TO, seconds: frames / FPS } }, null, 1)
);
console.log(
  `${prefix}b-lapse: ${frames} frames (${(frames / FPS).toFixed(3)} s), clip ${FROM.toFixed(2)}s to ${(times.at(-1) / 1000).toFixed(2)}s (aim ${TO.toFixed(2)}s)`
);
