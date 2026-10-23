// Renders Oats's icons with the app's own grain painter, in Electron:
//
//   node_modules/.bin/electron scripts/render-brand-icons.cjs <work dir>
//
// scripts/build-brand-icons.sh runs this, then packs the results. Written by it:
//   src/assets/icon.png                   the app icon, 1024 (Linux, and the source of icon.ico)
//   <work>/icon.iconset/*.png             the app icon at every macOS size, each painted at its size
//   <work>/ico/<size>.png                 the app icon for icon.ico
//   src/assets/oats.icon/Assets/ICON.png  the macOS 26 layer: the grain alone, on transparency
//   src/assets/iconTemplate@3x.png        the menu bar glyph, black on transparency
//   <work>/dmg/background{,@2x}.png       the DMG window, packed into src/assets/dmg-background.tiff
//
// Why it paints instead of converting an SVG: the icons used to be rendered from
// SVG by Quick Look, which draws onto white. Every one of them came out with no
// transparency at all: the app icon was a white square with the tile inside it,
// which macOS shows as a white margin around the icon; the macOS 26 layer put a
// white plate under the grain; and the menu bar glyph, a template image that
// macOS draws from its alpha alone, was a solid block. And the grain itself was
// a glossy vector drawing, while the app's mark and the film paint it as dither.
//
// So the grain here is the app's (src/components/shell/grainCanvas.ts), dithered
// the way the film shows it (demo/video/src/brand/Grain.tsx): about 110 dots
// across, each enlarged without smoothing to whole pixels, in the four honey
// tones pushed apart so the dither reads at a glance.
const { app, BrowserWindow, protocol } = require("electron");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const work = path.resolve(process.argv[process.argv.length - 1]);

protocol.registerSchemesAsPrivileged([
  { scheme: "brand", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// The page that paints. It runs in Chromium, so the painter's Canvas 2D calls
// are the same ones the app makes.
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  @font-face {
    font-family: Inter;
    src: url(brand://repo/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2) format("woff2");
    font-weight: 100 900;
  }
</style>
<script type="module" src="brand://repo/__paint__.mjs"></script>`;

const PAINTER = `
import { AT_REST, paintGrain } from "brand://repo/src/components/shell/grainCanvas.ts";
import { GRAIN_PALETTE } from "brand://repo/src/helpers/grainDither.mjs";

/** The film's tones: the app's four, pushed apart (demo/video/src/brand/Grain.tsx). */
const VISIBLE_TONES = [[122, 49, 0], [178, 94, 0], [236, 154, 18], [255, 206, 104]];
const VISIBLE = new Map(GRAIN_PALETTE.map((rgb, index) => [rgb.join(","), VISIBLE_TONES[index]]));
/** Dots across the grain's square: the film's 220 px grain at 2 px a dot. */
const DOTS_ACROSS = 110;

const canvas = (width, height) => {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
};

/** The grain, at rest, dithered into whole-pixel dots, in a square of about px. */
function grain(px, shadow) {
  const cell = Math.max(1, Math.round(px / DOTS_ACROSS));
  const dots = Math.max(8, Math.floor(px / cell));
  const small = canvas(dots, dots);
  const paint = small.getContext("2d", { willReadFrequently: true });
  paintGrain(paint, dots, dots, AT_REST, shadow);
  const image = paint.getImageData(0, 0, dots, dots);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const tone = VISIBLE.get(data[i] + "," + data[i + 1] + "," + data[i + 2]);
    if (tone) [data[i], data[i + 1], data[i + 2]] = tone;
  }
  paint.putImageData(image, 0, 0);
  const big = canvas(dots * cell, dots * cell);
  const draw = big.getContext("2d");
  draw.imageSmoothingEnabled = false;
  draw.drawImage(small, 0, 0, dots * cell, dots * cell);
  return big;
}

/** The macOS icon shape, a superellipse: the continuous corners of Apple's grid. */
function squircle(context, x, y, size) {
  const n = 5;
  const r = size / 2;
  context.beginPath();
  for (let degree = 0; degree <= 360; degree += 1) {
    const t = (degree * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = x + r + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const py = y + r + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (degree === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

/**
 * The app icon at one size: one white tile on Apple's grid (824 of 1024), on
 * transparency, with the system's soft drop shadow, and the grain in it. The
 * tile is the only white: nothing around it, so it sits on the Dock, the
 * desktop or a window as one shape.
 */
function appIcon(size) {
  const element = canvas(size, size);
  const context = element.getContext("2d");
  const tile = (size * 824) / 1024;
  const inset = (size - tile) / 2;
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.2)";
  context.shadowBlur = (size * 18) / 1024;
  context.shadowOffsetY = (size * 8) / 1024;
  squircle(context, inset, inset, tile);
  context.fillStyle = "#ffffff";
  context.fill();
  context.restore();
  const art = grain(Math.round(size * 0.74), true);
  context.drawImage(art, Math.round((size - art.width) / 2), Math.round((size - art.height) / 2));
  return element.toDataURL("image/png");
}

/**
 * The macOS 26 layer: the grain alone, full size, on transparency. The system
 * draws the white tile (oats.icon/icon.json) and its own shadow, so the stippled
 * contact shadow is left out here.
 */
function layer() {
  const element = canvas(1024, 1024);
  const art = grain(1024, false);
  element.getContext("2d").drawImage(art, Math.round((1024 - art.width) / 2), Math.round((1024 - art.height) / 2));
  return element.toDataURL("image/png");
}

/** The menu bar glyph: the template SVG drawn onto transparency, 48 px (16 pt at 3x). */
async function trayTemplate() {
  const image = new Image();
  image.src = "brand://repo/scripts/brand-tray-template.svg";
  await image.decode();
  const element = canvas(48, 48);
  element.getContext("2d").drawImage(image, 0, 0, 48, 48);
  return element.toDataURL("image/png");
}

/**
 * The DMG window, at 1x or 2x: white, so the white tile of the icon in it has no
 * edge to show; the app and Applications side by side (electron-builder.json,
 * dmg.contents), a thin arrow between them, and one line saying what to do.
 */
async function dmgBackground(scale) {
  const font = (size) => "500 " + size * scale + "px Inter";
  await document.fonts.load(font(15));
  const width = 600 * scale;
  const height = 400 * scale;
  const element = canvas(width, height);
  const context = element.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const y = 200 * scale;
  const from = 254 * scale;
  const to = 346 * scale;
  const head = 8 * scale;
  context.strokeStyle = "#a1a1aa";
  context.lineWidth = 2 * scale;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from, y);
  context.lineTo(to, y);
  context.moveTo(to - head, y - head);
  context.lineTo(to, y);
  context.lineTo(to - head, y + head);
  context.stroke();
  context.fillStyle = "#71717a";
  context.font = font(15);
  context.textAlign = "center";
  context.fillText("Drag Oats to Applications", width / 2, 336 * scale);
  return element.toDataURL("image/png");
}

window.paintBrand = async () => {
  const icons = {};
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) icons[size] = appIcon(size);
  return {
    icons,
    layer: layer(),
    tray: await trayTemplate(),
    dmg: [await dmgBackground(1), await dmgBackground(2)],
  };
};
window.paintReady = true;
`;

const TYPES = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".ts": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function serve(request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/__paint__.html")
    return new Response(PAGE, { headers: { "content-type": "text/html" } });
  if (pathname === "/__paint__.mjs")
    return new Response(PAINTER, { headers: { "content-type": "text/javascript" } });
  const file = path.join(root, decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file))
    return new Response("not found", { status: 404 });
  let body = fs.readFileSync(file);
  // The painter is TypeScript: its types are stripped, nothing else changes.
  if (file.endsWith(".ts")) {
    body = ts.transpileModule(body.toString("utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
  }
  return new Response(body, {
    headers: { "content-type": TYPES[path.extname(file)] || "application/octet-stream" },
  });
}

const write = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
};

app.whenReady().then(async () => {
  try {
    protocol.handle("brand", serve);
    const window = new BrowserWindow({
      show: false,
      width: 64,
      height: 64,
      webPreferences: { offscreen: true },
    });
    await window.loadURL("brand://repo/__paint__.html");
    for (
      let tries = 0;
      !(await window.webContents.executeJavaScript("window.paintReady === true"));
      tries += 1
    ) {
      if (tries > 100) throw new Error("the painting page did not load");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const { icons, layer, tray, dmg } =
      await window.webContents.executeJavaScript("window.paintBrand()");

    write(path.join(root, "src/assets/icon.png"), icons[1024]);
    const set = path.join(work, "icon.iconset");
    for (const size of [16, 32, 128, 256, 512]) {
      write(path.join(set, `icon_${size}x${size}.png`), icons[size]);
      write(path.join(set, `icon_${size}x${size}@2x.png`), icons[size * 2]);
    }
    for (const size of [16, 24, 32, 48, 64, 128, 256])
      write(path.join(work, "ico", `${size}.png`), icons[size]);
    write(path.join(root, "src/assets/oats.icon/Assets/ICON.png"), layer);
    write(path.join(root, "src/assets/iconTemplate@3x.png"), tray);
    write(path.join(work, "dmg", "background.png"), dmg[0]);
    write(path.join(work, "dmg", "background@2x.png"), dmg[1]);
    console.log(
      "render-brand-icons: painted the app icon, the macOS 26 layer, the menu bar glyph and the DMG window"
    );
    app.exit(0);
  } catch (error) {
    console.error("render-brand-icons:", error);
    app.exit(1);
  }
});
