const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The chart fill (DESIGN.md §6, rule 7): the field's 4×4 ordered dither, as
// masks a canvas can paint with no work per pixel.

let BAYER_4X4;
let bayerThreshold;
let ditherStep;
let ditherMask;
let ditherLayers;

test.before(async () => {
  ({ BAYER_4X4, bayerThreshold, ditherStep, ditherMask, ditherLayers } =
    await import("../../src/helpers/chartDither.mjs"));
});

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

test("the matrix is the field's own, so a chart is made of the sidebar's grain", () => {
  const shader = read("src/components/conversation/field/shaders.ts");
  const found = /float bayer\[16\]\s*=\s*float\[16\]\(([^)]*)\)/.exec(shader);
  assert.ok(found, "shaders.ts should declare the 16-cell Bayer matrix");
  const field = found[1].split(",").map((value) => Number.parseFloat(value));
  assert.deepEqual([...BAYER_4X4], field);
});

test("the matrix is an ordered dither: every rank once", () => {
  assert.deepEqual(
    [...BAYER_4X4].sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, index) => index)
  );
  assert.ok(Object.isFrozen(BAYER_4X4));
});

test("a threshold is the shader's: (rank + 0.5) / 16, and it wraps every 4 pixels", () => {
  assert.equal(bayerThreshold(0, 0), 0.5 / 16);
  assert.equal(bayerThreshold(1, 0), 8.5 / 16);
  assert.equal(bayerThreshold(3, 3), 5.5 / 16);
  assert.equal(bayerThreshold(4, 4), bayerThreshold(0, 0));
  assert.equal(bayerThreshold(-1, -1), bayerThreshold(3, 3));
  assert.equal(bayerThreshold(6, 9), bayerThreshold(2, 1));
});

test("a step counts the cells a density lights, the same as thresholding each pixel", () => {
  for (let index = 0; index <= 200; index += 1) {
    const density = index / 200;
    let lit = 0;
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) if (bayerThreshold(x, y) < density) lit += 1;
    }
    assert.equal(ditherStep(density), lit, `density ${density}`);
  }
});

test("a step is 0 to 16, and nothing that is not a density lights a pixel", () => {
  assert.equal(ditherStep(0), 0);
  assert.equal(ditherStep(1), 16);
  assert.equal(ditherStep(4), 16);
  assert.equal(ditherStep(-1), 0);
  assert.equal(ditherStep(Number.NaN), 0);
  assert.equal(ditherStep(undefined), 0);
  // Half lights half: the checkerboard.
  assert.equal(ditherStep(0.5), 8);
  assert.deepEqual(ditherMask(0.5), [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1]);
});

test("masks are nested, so a denser layer painted over a sparser one only adds pixels", () => {
  let previous = ditherMask(0);
  assert.equal(
    previous.reduce((sum, value) => sum + value, 0),
    0
  );
  for (let index = 1; index <= 64; index += 1) {
    const mask = ditherMask(index / 64);
    previous.forEach((lit, cell) => {
      if (lit) assert.equal(mask[cell], 1, `cell ${cell} went dark at ${index / 64}`);
    });
    previous = mask;
  }
  assert.equal(
    previous.reduce((sum, value) => sum + value, 0),
    16
  );
});

/** The step a pixel at fraction `f` of a fade gets, painting the layers in order. */
function painted(layers, f) {
  let step = 0;
  for (const layer of layers) if (f >= layer.start && f < layer.end) step = layer.step;
  return step;
}

test("a fade's layers paint exactly the per-pixel dither of the fade", () => {
  for (const [from, to] of [
    [0.5, 0.08],
    [0.08, 0.5],
    [0.34, 0.34],
    [1, 0],
    [0.62, 0.2],
  ]) {
    const layers = ditherLayers(from, to);
    for (let index = 0; index < 400; index += 1) {
      const f = (index + 0.5) / 400;
      const expected = ditherStep(from + (to - from) * f);
      assert.equal(painted(layers, f), expected, `fade ${from} -> ${to} at ${f}`);
    }
  }
});

test("the contour's fade thins from 8 cells under the line to 1 at the baseline", () => {
  const layers = ditherLayers(0.5, 0.08);
  assert.deepEqual(
    layers.map((layer) => layer.step),
    [1, 2, 3, 4, 5, 6, 7, 8]
  );
  // Sparsest first, and each one nested in the one before it.
  for (const [index, layer] of layers.entries()) {
    assert.equal(layer.start, 0);
    if (index) assert.ok(layer.end <= layers[index - 1].end);
    assert.equal(ditherStep(layer.density), layer.step);
  }
  assert.equal(layers[0].end, 1);
});

test("a constant fill is one layer, and an empty one is none", () => {
  assert.deepEqual(ditherLayers(0.5, 0.5).length, 8);
  assert.ok(ditherLayers(0.5, 0.5).every((layer) => layer.start === 0 && layer.end === 1));
  assert.deepEqual(ditherLayers(0, 0), []);
  assert.deepEqual(ditherLayers(Number.NaN, Number.NaN), []);
});
