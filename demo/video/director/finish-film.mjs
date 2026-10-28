// node director/finish-film.mjs <frames dir> <out.mp4> [--composition OatsDemo] [--check-only]
//
// Turns a rendered frame sequence (`remotion render --sequence
// --image-format=png`) into the film, after checking every frame.
//
// Remotion now and then got a frame back from Chrome at the wrong size, and
// the encoder, told every frame is 1920x1080, laid it out as a mosaic of small
// windows: a one-frame flash. It came at random (none in one render, seven in
// the next), so each render is checked instead:
//   - a frame whose PNG is not the film's size is bad;
//   - a frame unlike both its neighbours, while they are like each other, is
//     bad. A cut, a click or a scroll changes the picture and keeps it.
// A bad frame is rendered again on its own (`remotion still`) and checked
// again. Then the frames are encoded once: H.264, crf 12, yuv420p, BT.709.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [framesDir, out, ...rest] = process.argv.slice(2);
if (!framesDir || !out) {
  console.error("usage: node director/finish-film.mjs <frames dir> <out.mp4> [--composition OatsDemo]");
  process.exit(1);
}
const composition = rest.includes("--composition") ? rest[rest.indexOf("--composition") + 1] : "OatsDemo";
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const remotion = path.join(root, "node_modules", ".bin", "remotion");
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;

const files = fs
  .readdirSync(framesDir)
  .filter((name) => name.endsWith(".png"))
  .sort();
const indexOf = (name) => Number(name.match(/(\d+)\.png$/)[1]);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const W = 320;
const H = 180;
const decodeGrey = (input) => {
  const result = spawnSync(
    remotion,
    ["ffmpeg", "-loglevel", "error", ...input, "-fps_mode", "passthrough", "-vf", `scale=${W}:${H},format=gray`, "-f", "image2pipe", "-c:v", "rawvideo", "pipe:1"],
    { maxBuffer: 2 ** 31 - 1 }
  );
  const size = W * H;
  const frames = [];
  for (let offset = 0; offset + size <= result.stdout.length; offset += size) frames.push(result.stdout.subarray(offset, offset + size));
  return frames;
};
/** Each frame as 320x180 grey: the whole run through its numbered pattern, a few files one by one. */
function greyFrames(list) {
  if (list.length === files.length) {
    return decodeGrey(["-framerate", String(FPS), "-start_number", "0", "-i", path.join(framesDir, "element-%04d.png")]);
  }
  return list.flatMap((name) => decodeGrey(["-i", path.join(framesDir, name)]));
}

const meanDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};

function findBad(list) {
  const bad = new Set();
  for (const name of list) {
    const { width, height } = pngSize(path.join(framesDir, name));
    if (width !== WIDTH || height !== HEIGHT) bad.add(name);
  }
  const grey = greyFrames(list);
  for (let i = 1; i + 1 < grey.length; i += 1) {
    const before = meanDiff(grey[i - 1], grey[i]);
    const after = meanDiff(grey[i], grey[i + 1]);
    const across = meanDiff(grey[i - 1], grey[i + 1]);
    if (Math.min(before, after) > 2 && across < 0.4 * Math.min(before, after)) bad.add(list[i]);
  }
  return [...bad];
}

let bad = findBad(files);
console.log(`${files.length} frames; ${bad.length} bad: ${bad.map(indexOf).join(" ") || "none"}`);
if (rest.includes("--check-only")) process.exit(bad.length ? 2 : 0);
for (let round = 1; bad.length && round <= 3; round += 1) {
  for (const name of bad) {
    const frame = indexOf(name);
    execFileSync(remotion, ["still", "src/index.ts", composition, path.join(framesDir, name), `--frame=${frame}`, "--log=error"], {
      cwd: root,
      stdio: "inherit",
    });
  }
  // Check the redone frames in their place: each with its neighbours.
  const around = new Set();
  for (const name of bad) {
    const at = files.indexOf(name);
    for (let k = Math.max(0, at - 1); k <= Math.min(files.length - 1, at + 1); k += 1) around.add(files[k]);
  }
  const recheck = findBad([...around].sort()).filter((name) => bad.includes(name));
  console.log(`round ${round}: redid ${bad.length}; still bad: ${recheck.map(indexOf).join(" ") || "none"}`);
  bad = recheck;
}
if (bad.length) {
  console.error("Some frames are still bad; not encoding.");
  process.exit(1);
}

execFileSync(
  remotion,
  [
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(FPS),
    "-start_number",
    "0",
    "-i",
    path.join(framesDir, "element-%04d.png"),
    "-vf",
    "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "12",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
    "-movflags",
    "+faststart",
    path.resolve(out),
  ],
  { stdio: "inherit" }
);
console.log(`-> ${out}`);
