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
// and, in docs/media/, for the README (2x, shown at half size):
//   banner-light.png, banner-dark.png  the grain and the wordmark over the fluid,
//                                      light and dark, with the headline
//   download-mac.png                   the app's honey button: Download for Mac
//   social-preview.png                 1280x640, for the repository's settings
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
function field(context, width, height, t, base = 243, spread = 7) {
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x / 640, py = y / 640;
      const qx = fbm(px + 0.07 * t, py - 0.05 * t);
      const qy = fbm(px + 5.2 - 0.04 * t, py + 1.3 + 0.06 * t);
      const value = fbm(px + 1.8 * qx + 0.03 * t, py + 1.8 * qy - 0.02 * t);
      const level = Math.round(base + spread * (value * 2 - 1) + BAYER4[((y & 3) << 2) | (x & 3)]);
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
  context.fillText("The conversation,", width / 2, 330);
  context.fillText("mapped as it happens", width / 2, 412);
  context.letterSpacing = "0px";
  context.font = "500 26px Inter";
  context.fillStyle = "#71717a";
  context.fillText("Oats for Mac. Free and open source.", width / 2, 520);
  return element.toDataURL("image/png");
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

const HEADLINE = "The conversation, mapped as it happens";

/** The grain beside the wordmark, centred on cx with its baseline at baseline. */
function signature(context, cx, baseline, size, ink, shadow) {
  context.font = '400 ' + size + 'px "EB Garamond"';
  context.letterSpacing = Math.round(-0.03 * size) + "px";
  const word = context.measureText("Oats").width;
  const oat = Math.round(size * 1.02);
  // The grain sits in the middle of its square, so the visible gap is wider
  // than this: pull the word in by the square's empty side.
  const gap = Math.round(size * -0.12);
  const left = Math.round(cx - (oat + gap + word) / 2);
  const art = grain(oat, shadow);
  context.drawImage(art, left, Math.round(baseline - size * 0.86));
  context.fillStyle = ink;
  context.textAlign = "left";
  context.fillText("Oats", left + oat + gap, baseline);
  context.letterSpacing = "0px";
}

/** The README's banner: the film's fluid, the grain and the wordmark, the headline. */
async function banner(dark) {
  await document.fonts.load('400 168px "EB Garamond"');
  const width = 1600, height = 520;
  const element = canvas(width, height);
  const context = element.getContext("2d");
  const backdrop = canvas(width, height);
  field(backdrop.getContext("2d"), width, height, 52, dark ? 24 : 243, dark ? 5 : 7);
  roundedRect(context, 0, 0, width, height, 40);
  context.save();
  context.clip();
  context.drawImage(backdrop, 0, 0);
  context.restore();
  signature(context, width / 2, 268, 168, dark ? "#fafafa" : "#1a1a1a", !dark);
  context.font = '400 54px "EB Garamond"';
  context.letterSpacing = "-1.4px";
  context.textAlign = "center";
  context.fillStyle = dark ? "#d4d4d8" : "#3f3f46";
  context.fillText(HEADLINE, width / 2, 410);
  context.letterSpacing = "0px";
  return element.toDataURL("image/png");
}

/** The app's main action (.oats-cta in src/index.css), as a picture to link. */
async function downloadButton() {
  await document.fonts.load("600 34px Inter");
  const width = 520, height = 168;
  const element = canvas(width, height);
  const context = element.getContext("2d");
  const x = 28, y = 20, w = 464, h = 112, r = 22;
  context.save();
  context.shadowColor = "rgba(245, 163, 15, 0.45)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 10;
  roundedRect(context, x, y, w, h, r);
  context.fillStyle = "#f5a30f";
  context.fill();
  context.restore();
  context.save();
  context.shadowColor = "rgba(154, 91, 0, 0.35)";
  context.shadowBlur = 4;
  context.shadowOffsetY = 2;
  const honey = context.createLinearGradient(0, y, 0, y + h);
  honey.addColorStop(0, "#f8b52e");
  honey.addColorStop(1, "#f5a30f");
  roundedRect(context, x, y, w, h, r);
  context.fillStyle = honey;
  context.fill();
  context.restore();
  context.save();
  roundedRect(context, x, y, w, h, r);
  context.clip();
  context.fillStyle = "rgba(255, 255, 255, 0.45)";
  context.fillRect(x, y, w, 2);
  context.restore();
  context.font = "600 34px Inter";
  const label = "Download for Mac";
  const text = context.measureText(label).width;
  const icon = 36, gap = 18;
  const left = Math.round(x + (w - (icon + gap + text)) / 2);
  const mid = y + h / 2;
  context.save();
  context.translate(left, mid - icon / 2);
  context.scale(icon / 24, icon / 24);
  context.strokeStyle = "#1a1306";
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const d of ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"]) context.stroke(new Path2D(d));
  context.restore();
  context.fillStyle = "#1a1306";
  context.textBaseline = "middle";
  context.fillText(label, left + icon + gap, mid + 1);
  return element.toDataURL("image/png");
}

/** The repository's social preview (GitHub takes it by upload, in Settings). */
async function socialPreview() {
  await document.fonts.load('400 150px "EB Garamond"');
  await document.fonts.load("500 26px Inter");
  const width = 1280, height = 640;
  const element = canvas(width, height);
  const context = element.getContext("2d");
  field(context, width, height, 52);
  signature(context, width / 2, 300, 150, "#1a1a1a", true);
  context.font = '400 56px "EB Garamond"';
  context.letterSpacing = "-1.4px";
  context.textAlign = "center";
  context.fillStyle = "#3f3f46";
  context.fillText(HEADLINE, width / 2, 430);
  context.letterSpacing = "0px";
  context.font = "500 26px Inter";
  context.fillStyle = "#71717a";
  context.fillText("For Mac. Free and open source.", width / 2, 520);
  return element.toDataURL("image/png");
}

window.paintSite = async () => ({
  favicon32: favicon(32),
  favicon64: favicon(64),
  touch: touchIcon(),
  og: await ogImage(),
  bannerLight: await banner(false),
  bannerDark: await banner(true),
  download: await downloadButton(),
  social: await socialPreview(),
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

const docs = path.join(root, "docs/media");
const write = (name, dataUrl, dir = out) =>
  fs.writeFileSync(path.join(dir, name), Buffer.from(dataUrl.split(",")[1], "base64"));

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
    fs.mkdirSync(docs, { recursive: true });
    write("banner-light.png", images.bannerLight, docs);
    write("banner-dark.png", images.bannerDark, docs);
    write("download-mac.png", images.download, docs);
    write("social-preview.png", images.social, docs);
    console.log("render-images: painted the site's images and the README's");
    app.exit(0);
  } catch (error) {
    console.error("render-images:", error);
    app.exit(1);
  }
});
