// Paints the site's images with the app's own grain painter, in Electron, the
// way scripts/render-brand-icons.cjs paints the app icons:
//
//   node_modules/.bin/electron site/render-images.cjs
//
// Writes, in site/assets/:
//   favicon-32.png, favicon-64.png   the grain alone, on transparency
//   apple-touch-icon.png             the grain on white, 180 px (iOS rounds it)
//   og.png                           the link preview, 1200x630: the film's grey
//                                    fluid, the grain, and the headline
const { app, BrowserWindow, protocol } = require("electron");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const out = path.join(__dirname, "assets");

protocol.registerSchemesAsPrivileged([
  { scheme: "brand", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: "EB Garamond"; src: url(brand://repo/site/assets/fonts/eb-garamond-latin-400.woff2) format("woff2"); }
  @font-face { font-family: Inter; src: url(brand://repo/site/assets/fonts/inter-latin-wght.woff2) format("woff2"); font-weight: 100 900; }
</style>
<script type="module" src="brand://repo/__paint__.mjs"></script>`;

const PAINTER = `
import { AT_REST, paintGrain } from "brand://repo/src/components/shell/grainCanvas.ts";
import { GRAIN_PALETTE } from "brand://repo/src/helpers/grainDither.mjs";

const FILM_TONES = [[122, 49, 0], [178, 94, 0], [236, 154, 18], [255, 206, 104]];
const TO_FILM = new Map(GRAIN_PALETTE.map((rgb, index) => [rgb.join(","), FILM_TONES[index]]));

const canvas = (width, height) => Object.assign(document.createElement("canvas"), { width, height });

/** The grain in a square of px, about 110 dots across (one per pixel when small). */
function grain(px, shadow) {
  const cell = Math.max(1, Math.round(px / 110));
  const dots = Math.max(8, Math.floor(px / cell));
  const small = canvas(dots, dots);
  const paint = small.getContext("2d", { willReadFrequently: true });
  paintGrain(paint, dots, dots, AT_REST, shadow);
  const image = paint.getImageData(0, 0, dots, dots);
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] === 0) continue;
    const tone = TO_FILM.get(image.data[i] + "," + image.data[i + 1] + "," + image.data[i + 2]);
    if (tone) [image.data[i], image.data[i + 1], image.data[i + 2]] = tone;
  }
  paint.putImageData(image, 0, 0);
  const big = canvas(dots * cell, dots * cell);
  const draw = big.getContext("2d");
  draw.imageSmoothingEnabled = false;
  draw.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

// The film's field (demo/video/src/brand/Fluid.tsx), one still frame.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
function hash(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y) {
  let value = 0, amplitude = 0.5, frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    value += amplitude * noise(x * frequency, y * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value / 0.9375;
}
function field(context, width, height, t) {
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x / 640, py = y / 640;
      const qx = fbm(px + 0.07 * t, py - 0.05 * t);
      const qy = fbm(px + 5.2 - 0.04 * t, py + 1.3 + 0.06 * t);
      const value = fbm(px + 1.8 * qx + 0.03 * t, py + 1.8 * qy - 0.02 * t);
      const level = Math.round(243 + 7 * (value * 2 - 1) + BAYER4[((y & 3) << 2) | (x & 3)]);
      const k = (y * width + x) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = level;
      image.data[k + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function favicon(size) {
  const element = canvas(size, size);
  element.getContext("2d").drawImage(grain(size, false), 0, 0);
  return element.toDataURL("image/png");
}

function touchIcon() {
  const element = canvas(180, 180);
  const context = element.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 180, 180);
  const art = grain(132, false);
  context.drawImage(art, Math.round((180 - art.width) / 2), Math.round((180 - art.height) / 2));
  return element.toDataURL("image/png");
}

async function ogImage() {
  await document.fonts.load('400 72px "EB Garamond"');
  await document.fonts.load("500 24px Inter");
  const width = 1200, height = 630;
  const element = canvas(width, height);
  const context = element.getContext("2d");
  field(context, width, height, 52);
  const art = grain(148, true);
  context.drawImage(art, Math.round((width - art.width) / 2), 64);
  context.fillStyle = "#1a1a1a";
  context.textAlign = "center";
  context.font = '400 76px "EB Garamond"';
  context.letterSpacing = "-2.6px";
  context.fillText("High-signal tool for", width / 2, 330);
  context.fillText("high-signal conversations", width / 2, 412);
  context.letterSpacing = "0px";
  context.font = "500 26px Inter";
  context.fillStyle = "#71717a";
  context.fillText("Oats for Mac. Free and open source.", width / 2, 520);
  return element.toDataURL("image/png");
}

window.paintSite = async () => ({
  favicon32: favicon(32),
  favicon64: favicon(64),
  touch: touchIcon(),
  og: await ogImage(),
});
window.paintReady = true;
`;

const TYPES = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".ts": "text/javascript",
  ".woff2": "font/woff2",
};

function serve(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/__paint__.html") return new Response(PAGE, { headers: { "content-type": "text/html" } });
  if (pathname === "/__paint__.mjs") return new Response(PAINTER, { headers: { "content-type": "text/javascript" } });
  const file = path.join(root, decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
  let body = fs.readFileSync(file);
  if (file.endsWith(".ts")) {
    body = ts.transpileModule(body.toString("utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
  }
  return new Response(body, { headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" } });
}

const write = (name, dataUrl) => fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(",")[1], "base64"));

app.whenReady().then(async () => {
  try {
    protocol.handle("brand", serve);
    const window = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { offscreen: true } });
    await window.loadURL("brand://repo/__paint__.html");
    for (let tries = 0; !(await window.webContents.executeJavaScript("window.paintReady === true")); tries += 1) {
      if (tries > 100) throw new Error("the painting page did not load");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const images = await window.webContents.executeJavaScript("window.paintSite()");
    write("favicon-32.png", images.favicon32);
    write("favicon-64.png", images.favicon64);
    write("apple-touch-icon.png", images.touch);
    write("og.png", images.og);
    console.log("render-images: painted the favicons, the touch icon and the link preview");
    app.exit(0);
  } catch (error) {
    console.error("render-images:", error);
    app.exit(1);
  }
});
