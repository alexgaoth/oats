// node director/assemble.mjs <capture dir> <out.mp4> [--fps 60] [--times <times.json>]
//
// `--times` bakes a speed change into the clip: a JSON array with the capture
// time (ms) each output frame shows, made by bake-lapse.mjs. Without it, the
// output frames are evenly spaced, one per 1/fps of capture time.
//
// The screencast sends a frame only when the page repaints, at uneven times.
// This lays them on a constant clock (each output frame shows the latest
// captured frame, give or take half a frame) and encodes with Remotion's own
// ffmpeg, so no other install is needed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [dir, out, ...rest] = process.argv.slice(2);
const fps = rest.includes("--fps") ? Number(rest[rest.indexOf("--fps") + 1]) : 60;
const capture = JSON.parse(fs.readFileSync(path.join(dir, "capture.json"), "utf8"));
const frames = capture.frames.filter((frame) => frame.t >= 0).sort((a, b) => a.t - b.t);
const first = capture.frames.filter((frame) => frame.t < 0).at(-1);
if (first) frames.unshift({ ...first, t: 0 });
const end = capture.cues.find((cue) => cue.name === "end")?.t ?? frames.at(-1).t;

const sequence = path.join(dir, "sequence");
fs.rmSync(sequence, { recursive: true, force: true });
fs.mkdirSync(sequence);
// Each output frame shows the latest captured frame up to half a frame after
// its time. Strictly "at or before" held a frame twice and then skipped one
// whenever a timestamp landed a millisecond after a slot boundary, which the
// screencast's timing does all the time: judder in every glide and scroll.
// The nearest frame either side is wrong too: the screencast sends nothing
// while the page is still, so in a still second the nearest frame is half the
// time the next change, shown early (cut 5's first render lost a hover that
// way). A slow-motion capture has more frames than slots; the latest is kept.
const times = rest.includes("--times")
  ? JSON.parse(fs.readFileSync(rest[rest.indexOf("--times") + 1], "utf8"))
  : null;
const total = times ? times.length : Math.ceil((end / 1000) * fps);
const half = 500 / fps;
let next = 0;
for (let index = 0; index < total; index += 1) {
  const time = times ? times[index] : (index * 1000) / fps;
  while (next + 1 < frames.length && frames[next + 1].t <= time + half) next += 1;
  const shown = frames[next];
  fs.symlinkSync(
    path.resolve(dir, "frames", shown.file),
    path.join(sequence, `${String(index).padStart(6, "0")}.jpg`)
  );
}

const ffmpeg = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "node_modules", ".bin", "remotion");
execFileSync(
  ffmpeg,
  [
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(fps),
    "-i",
    path.join(sequence, "%06d.jpg"),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "8",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path.resolve(out),
  ],
  { stdio: "inherit" }
);
const unique = new Set(frames.map((frame) => frame.file)).size;
console.log(`${total} frames at ${fps} fps (${(end / 1000).toFixed(2)} s) from ${unique} captured -> ${out}`);
