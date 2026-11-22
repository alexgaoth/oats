// Rasterize the existing tray SVG in Chromium, as render-brand-icons.cjs does.
// CHROME=/path/to/chrome node scripts/render-recording-tray.mjs [contact-sheet.png]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tumbleHeight } from "../src/helpers/oatsMarkMotion.mjs";
import {
  RECORDING_TOSS_FRAMES,
  RECORDING_TOSS_PEAK,
  recordingTossPose,
} from "../src/helpers/recordingToss.mjs";

const chrome =
  process.env.CHROME ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "chromium");
const assets = new URL("../src/assets/tray-recording/", import.meta.url);
const template = readFileSync(new URL("./brand-tray-template.svg", import.meta.url), "utf8");

const svgFrames = Array.from({ length: RECORDING_TOSS_FRAMES }, (_, i) => {
  const { phi, hop, squash, lean } = recordingTossPose(i);
  // Same transform order as grainCanvas.ts. The rest pose is the existing
  // tray glyph, including its transparent crease. Turn the crease away with
  // the face, instead of tilting a flat copy of the glyph.
  const transform = [
    `translate(0 ${-hop})`,
    "translate(512 880)",
    `scale(${1 + 0.06 * squash} ${1 - 0.08 * squash})`,
    "translate(0 -368)",
    `rotate(${-18 + lean})`,
    `scale(1 ${tumbleHeight(phi)})`,
    "translate(-512 -512)",
  ].join(" ");
  const face = Math.min(1, Math.max(0, Math.cos(phi) / 0.35));
  const crease = face * face * (3 - 2 * face);
  return template
    .replace("rotate(-18 512 512)", transform)
    .replace('stroke="black"', `stroke="black" stroke-opacity="${crease}"`);
});

const page = `<!doctype html><meta charset=utf-8><pre id="output"></pre><script>
const canvas = (w, h) => Object.assign(document.createElement("canvas"), {width: w, height: h});
const png = (canvas) => canvas.toDataURL().split(",")[1];
const output = document.getElementById("output");
Promise.all(${JSON.stringify(svgFrames)}.map(async (svg) => {
  const image = new Image();
  image.src = "data:image/svg+xml," + encodeURIComponent(svg);
  await image.decode();
  return [16, 32].map(size => {
    const frame = canvas(size, size);
    frame.getContext("2d").drawImage(image, 0, 0, size, size);
    return frame;
  });
})).then((frames) => {
  const sheet = canvas(748, 294);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#18181b";
  ctx.font = "600 16px system-ui";
  ctx.fillText("Oats recording toss", 24, 29);
  ctx.font = "13px system-ui";
  ctx.fillText("1x left, 2x right. Honey outline: reduced motion pose.", 24, 51);
  ctx.imageSmoothingEnabled = false;
  for (const [i, pair] of frames.entries()) {
    const x = 24 + (i % 8) * 88;
    const y = 68 + Math.floor(i / 8) * 110;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, 84, 78);
    if (i === ${RECORDING_TOSS_PEAK}) {
      ctx.strokeStyle = "#9a5b00";
      ctx.strokeRect(x + 0.5, y + 0.5, 83, 77);
    }
    for (const [j, frame] of pair.entries()) {
      ctx.drawImage(frame, x + 1 + j * 41, y + 19, 40, 40);
    }
    ctx.fillStyle = "#3f3f46";
    ctx.fillText(String(i).padStart(2, "0"), x + 34, y + 96);
  }
  output.textContent = JSON.stringify({ frames: frames.map(pair => pair.map(png)), sheet: png(sheet) });
}).catch((error) => output.textContent = String(error));
</script>`;

const result = execFileSync(
  chrome,
  [
    "--headless",
    "--no-first-run",
    "--disable-background-networking",
    "--virtual-time-budget=4000",
    "--dump-dom",
    `data:text/html;base64,${Buffer.from(page).toString("base64")}`,
  ],
  { encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
);
const { frames, sheet } = JSON.parse(result.match(/<pre id="output">([^<]*)<\/pre>/)?.[1] ?? "");
if (frames.length !== RECORDING_TOSS_FRAMES) throw new Error("Chromium did not paint all frames");
mkdirSync(assets, { recursive: true });
for (const [index, [one, two]] of frames.entries()) {
  const name = `recording-${String(index).padStart(2, "0")}Template`;
  writeFileSync(new URL(`${name}.png`, assets), Buffer.from(one, "base64"));
  writeFileSync(new URL(`${name}@2x.png`, assets), Buffer.from(two, "base64"));
}
if (process.argv[2]) {
  const proof = resolve(process.argv[2]);
  mkdirSync(dirname(proof), { recursive: true });
  writeFileSync(proof, Buffer.from(sheet, "base64"));
}
console.log(`Painted ${frames.length} tray frames, in 1x and 2x`);
