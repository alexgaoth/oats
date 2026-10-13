// node director/assemble.mjs <capture dir> <out.mp4> [--fps 60]
//
// The screencast sends a frame only when the page repaints, at uneven times.
// This lays them on a constant clock (each output frame shows the latest
// captured frame at or before its time) and encodes with Remotion's own
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
let at = 0;
const total = Math.ceil((end / 1000) * fps);
for (let index = 0; index < total; index += 1) {
  const time = (index / fps) * 1000;
  while (at + 1 < frames.length && frames[at + 1].t <= time) at += 1;
  fs.symlinkSync(
    path.resolve(dir, "frames", frames[at].file),
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
    "12",
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
