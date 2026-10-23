const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The symbol's grain is dithered like the field: ordered 4x4 Bayer on device
// pixels over a small honey palette. The smooth version, with a pale top and a
// white highlight, read as a glow beside the rest of the app.

let BAYER_4,
  GRAIN_PALETTE,
  SHADOW_DOT_ALPHA,
  bayerThreshold,
  ditherGrain,
  ditherTone,
  stippleShadow;

test.before(async () => {
  ({
    BAYER_4,
    GRAIN_PALETTE,
    SHADOW_DOT_ALPHA,
    bayerThreshold,
    ditherGrain,
    ditherTone,
    stippleShadow,
  } = await import("../../src/helpers/grainDither.mjs"));
});

/** Every pixel of one 4x4 Bayer cell. */
const cell = () => Array.from({ length: 16 }, (_, index) => [index % 4, Math.floor(index / 4)]);

test("the dither is the field's: the same Bayer matrix as its shaders", () => {
  const shaders = fs.readFileSync(
    path.join(__dirname, "../../src/components/conversation/field/shaders.ts"),
    "utf8"
  );
  const body = /float bayer\[16\] = float\[16\]\(([^)]*)\)/.exec(shaders)[1];
  assert.deepEqual(
    BAYER_4,
    body.split(",").map((value) => Number.parseFloat(value))
  );
});

test("a Bayer cell holds sixteen different thresholds, centred on a half", () => {
  const thresholds = cell().map(([x, y]) => bayerThreshold(x, y));
  assert.equal(new Set(thresholds).size, 16);
  assert.ok(thresholds.every((value) => value > 0 && value < 1));
  const mean = thresholds.reduce((sum, value) => sum + value, 0) / 16;
  assert.ok(Math.abs(mean - 0.5) < 1e-12);
});

test("the pattern is locked to device pixels: it repeats every four of them", () => {
  for (const [x, y] of cell()) {
    const threshold = bayerThreshold(x, y);
    assert.equal(bayerThreshold(x + 4, y), threshold);
    assert.equal(bayerThreshold(x, y + 4), threshold);
    assert.equal(bayerThreshold(x + 40, y + 12), threshold);
  }
  assert.notEqual(bayerThreshold(0, 0), bayerThreshold(1, 0), "neighbours differ");
});

test("ordered dither keeps the tone on average, mixing only its two nearest colours", () => {
  for (const steps of [3, 4, 5]) {
    for (let tone = 0; tone <= 1; tone += 1 / 64) {
      const indices = cell().map(([x, y]) => ditherTone(tone, bayerThreshold(x, y), steps));
      const below = Math.floor(tone * (steps - 1));
      assert.ok(
        indices.every((index) => index === below || index === below + 1),
        `tone ${tone} with ${steps} colours mixes ${[...new Set(indices)]}`
      );
      const mean = indices.reduce((sum, index) => sum + index, 0) / 16 / (steps - 1);
      assert.ok(
        Math.abs(mean - tone) <= 1 / (32 * (steps - 1)) + 1e-12,
        `tone ${tone} with ${steps} colours comes out at ${mean}`
      );
    }
  }
});

test("a tone on a palette colour is that colour alone, and nothing falls outside it", () => {
  for (const [x, y] of cell()) {
    const threshold = bayerThreshold(x, y);
    assert.equal(ditherTone(0, threshold, 4), 0);
    assert.equal(ditherTone(1 / 3, threshold, 4), 1);
    assert.equal(ditherTone(1, threshold, 4), 3);
    assert.equal(ditherTone(-0.5, threshold, 4), 0);
    assert.equal(ditherTone(1.5, threshold, 4), 3);
  }
});

/** HSL hue (degrees), saturation and lightness of an [r, g, b] colour. */
function hsl([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  const hue =
    max === r
      ? 60 * (((g - b) / chroma + 6) % 6)
      : max === g
        ? 60 * ((b - r) / chroma + 2)
        : 60 * ((r - g) / chroma + 4);
  return { hue, saturation, lightness };
}

test("the palette is honey: deep amber to warm honey, saturated, with no near-white", () => {
  assert.ok(GRAIN_PALETTE.length >= 3 && GRAIN_PALETTE.length <= 5, "a small palette");
  // The first grain's top, #FCD27C, was pale enough to read as a glow.
  const paleTop = hsl([0xfc, 0xd2, 0x7c]);
  let previous = -1;
  for (const colour of GRAIN_PALETTE) {
    const { hue, saturation, lightness } = hsl(colour);
    assert.ok(hue >= 20 && hue <= 45, `${colour} is amber or honey (hue ${hue.toFixed(0)})`);
    assert.ok(saturation >= 0.85, `${colour} is saturated (${saturation.toFixed(2)})`);
    assert.ok(lightness <= 0.66 && lightness < paleTop.lightness, `${colour} is not near-white`);
    assert.ok(lightness > previous, "darkest first");
    previous = lightness;
  }
});

/** An RGBA buffer `width` wide: tone in red, coverage in alpha. */
function drawn(width, height, toneAt, coverageAt) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const tone = Math.round(toneAt(x, y) * 255);
      pixels.set([tone, tone, tone, Math.round(coverageAt(x, y) * 255)], i);
    }
  }
  return pixels;
}

test("every covered pixel becomes a palette colour and keeps its coverage", () => {
  const width = 13;
  const height = 9;
  const coverage = (x, y) => (x === 0 ? 0 : x === 1 ? 0.4 : y === 8 ? 0.75 : 1);
  const pixels = drawn(width, height, (x) => x / (width - 1), coverage);
  ditherGrain(pixels, width);
  const palette = new Set(GRAIN_PALETTE.map((colour) => colour.join()));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      assert.equal(pixels[i + 3], Math.round(coverage(x, y) * 255), `coverage at ${x},${y}`);
      if (pixels[i + 3] === 0) {
        assert.deepEqual([...pixels.slice(i, i + 3)], [0, 0, 0], `empty at ${x},${y}`);
      } else {
        assert.ok(palette.has([...pixels.slice(i, i + 3)].join()), `palette colour at ${x},${y}`);
      }
    }
  }
});

test("a smooth tone becomes a dither, not a smooth gradient and not flat bands", () => {
  const width = 64;
  const height = 8;
  const pixels = drawn(
    width,
    height,
    (x) => x / (width - 1),
    () => 1
  );
  ditherGrain(pixels, width);
  const lightest = GRAIN_PALETTE.length - 1;
  const index = (x, y) =>
    GRAIN_PALETTE.findIndex(
      (colour) =>
        colour[0] === pixels[(y * width + x) * 4] && colour[1] === pixels[(y * width + x) * 4 + 1]
    );
  // Between two palette colours a column is a mix of both, top to bottom.
  const column = Math.round((width - 1) * (0.5 / lightest));
  const seen = new Set(Array.from({ length: height }, (_, y) => index(column, y)));
  assert.equal(seen.size, 2, "a mid tone mixes two colours down its column");
  // And the dither keeps the light: darker on the left, lighter on the right.
  const mean = (x0, x1) => {
    let sum = 0;
    for (let y = 0; y < height; y += 1) for (let x = x0; x < x1; x += 1) sum += index(x, y);
    return sum / (height * (x1 - x0));
  };
  assert.ok(mean(0, 16) < mean(24, 40) && mean(24, 40) < mean(48, 64));
});

test("the contact shadow is stippled: dots of one alpha, densest at its centre", () => {
  const width = 80;
  const height = 24;
  const pixels = new Uint8ClampedArray(width * height * 4);
  stippleShadow(pixels, width, { cx: 40, cy: 12, rx: 36, ry: 9, strength: 0.3 });
  const dot = Math.round(SHADOW_DOT_ALPHA * 255);
  let inner = 0;
  let outer = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      assert.ok(alpha === 0 || alpha === dot, `one alpha for every dot, got ${alpha}`);
      const distance = Math.hypot((x + 0.5 - 40) / 36, (y + 0.5 - 12) / 9);
      if (alpha && distance < 0.3) inner += 1;
      if (alpha && distance > 0.7) outer += 1;
      if (distance >= 1) assert.equal(alpha, 0, "nothing outside the ellipse");
    }
  }
  assert.ok(inner > 0 && outer > 0, "a soft falloff, not a hard disc");
  // The centre's share of dots is its darkness: 0.3 of alpha, in dots of SHADOW_DOT_ALPHA.
  let centre = 0;
  for (let y = 10; y < 14; y += 1)
    for (let x = 38; x < 42; x += 1) centre += pixels[(y * width + x) * 4 + 3] > 0;
  assert.ok(
    Math.abs((centre / 16) * SHADOW_DOT_ALPHA - 0.3) < 0.06,
    `centre darkness ${(centre / 16) * SHADOW_DOT_ALPHA}`
  );
});

test("the shadow never draws over the grain, and nothing at all at no strength", () => {
  const width = 20;
  const height = 10;
  const pixels = drawn(
    width,
    height,
    () => 0.5,
    (x) => (x < 10 ? 1 : 0)
  );
  ditherGrain(pixels, width);
  const grain = pixels.slice();
  stippleShadow(pixels, width, { cx: 10, cy: 5, rx: 10, ry: 5, strength: 0.3 });
  for (let i = 0; i < pixels.length; i += 4) {
    if (grain[i + 3]) assert.deepEqual([...pixels.slice(i, i + 4)], [...grain.slice(i, i + 4)]);
  }
  const empty = new Uint8ClampedArray(width * height * 4);
  stippleShadow(empty, width, { cx: 10, cy: 5, rx: 10, ry: 5, strength: 0 });
  stippleShadow(empty, width, { cx: 10, cy: 5, rx: 0, ry: 5, strength: 0.3 });
  assert.ok(empty.every((value) => value === 0));
});
