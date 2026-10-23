// node director/stills.mjs <composition> <out dir> <second> [<second> ...]
// Renders stills of a composition from one bundle, for checking a cut.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const [id, outDir, ...seconds] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const browserExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const composition = await selectComposition({ serveUrl, id, browserExecutable });
for (const second of seconds) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(second) * composition.fps));
  const output = path.join(outDir, `${id}-${String(second).padStart(5, "0")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 80, browserExecutable });
  console.log(output);
}
