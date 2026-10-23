const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const MARK = fs.readFileSync(
  path.join(__dirname, "../../src/components/shell/OatsMark.tsx"),
  "utf8"
);
const PAINTER = fs.readFileSync(
  path.join(__dirname, "../../src/components/shell/grainCanvas.ts"),
  "utf8"
);

// The old mark filled its tile with the foreground colour, so it turned black
// on the light app and white on the dark one. The symbol is the same in both.
test("the brand mark uses no theme colours", () => {
  for (const source of [MARK, PAINTER]) {
    assert.doesNotMatch(source, /(fill|stroke)-(foreground|background|brand|primary)/);
    assert.doesNotMatch(source, /var\(--color-|getComputedStyle/);
  }
});

test("the brand mark does not spin under reduced motion", () => {
  assert.match(MARK, /prefers-reduced-motion: reduce/);
  const spin = MARK.slice(MARK.indexOf("const spin = useCallback"));
  assert.ok(
    spin.indexOf("prefers-reduced-motion") < spin.indexOf("requestAnimationFrame"),
    "the reduced-motion check comes before any frame is requested"
  );
});

test("every icon file is built by the brand script", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "../../scripts/build-brand-icons.sh"),
    "utf8"
  );
  for (const output of [
    "icon.png",
    "icon.icns",
    "icon.ico",
    "ICON.png",
    "iconTemplate@3x.png",
    "dmg-background.tiff",
  ]) {
    assert.ok(script.includes(output), `${output} is produced by the script`);
  }
});

// A minimal PNG reader: 8-bit RGBA, every row filter. Enough to read the alpha
// of the icons this repository ships.
function readPng(file) {
  const zlib = require("zlib");
  const data = fs.readFileSync(file);
  let width = 0;
  let height = 0;
  let colourType = 0;
  const parts = [];
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at);
    const type = data.toString("ascii", at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colourType = body[9];
    }
    if (type === "IDAT") parts.push(body);
    at += 12 + length;
  }
  assert.equal(colourType, 6, `${path.basename(file)} is RGBA`);
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      pixels[y * stride + x] = (value + predicted) & 255;
    }
  }
  return { width, height, alpha: (x, y) => pixels[(y * width + x) * 4 + 3] };
}

// The icons were once rendered by Quick Look, which draws onto white: the app
// icon came out as a white square with the tile inside it (a white margin in
// the Dock), the macOS 26 layer put a white plate under the grain, and the menu
// bar glyph, drawn by macOS from its alpha alone, was a solid block.
test("the app icon is a tile on transparency, not a white square", () => {
  const icon = readPng(path.join(__dirname, "../../src/assets/icon.png"));
  assert.equal(icon.width, 1024);
  for (const [x, y] of [
    [0, 0],
    [1023, 0],
    [0, 1023],
    [1023, 1023],
    [512, 40],
  ]) {
    assert.equal(icon.alpha(x, y), 0, `pixel ${x},${y} is transparent`);
  }
  assert.equal(icon.alpha(512, 512), 255, "the tile itself is opaque");
});

test("the macOS 26 layer and the menu bar glyph keep their transparency", () => {
  const layer = readPng(path.join(__dirname, "../../src/assets/oats.icon/Assets/ICON.png"));
  assert.equal(layer.alpha(0, 0), 0);
  assert.equal(layer.alpha(512, 512), 255, "the grain is opaque");
  const tray = readPng(path.join(__dirname, "../../src/assets/iconTemplate@3x.png"));
  assert.equal(tray.alpha(0, 0), 0);
  assert.equal(tray.alpha(24, 30), 255, "the glyph is drawn");
});

test("the DMG window has its background", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../electron-builder.json"), "utf8")
  );
  assert.equal(config.dmg.background, "src/assets/dmg-background.tiff");
  assert.ok(fs.existsSync(path.join(__dirname, "../../src/assets/dmg-background.tiff")));
});
