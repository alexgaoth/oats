// The chart fill: an ordered 4×4 Bayer dither (DESIGN.md §6, rule 7).
//
// Pure, DOM-free and pinned by `test/helpers/chartDither.test.js`, like
// `conversationContour.mjs`: the canvas side (`components/charts/chartStyle.ts`)
// only paints the masks this file decides. The matrix is the field's own
// (`components/conversation/field/shaders.ts`), so a chart is made of the same
// grain as the sidebar's field; the test reads the shader source to keep the two
// equal.

/**
 * The 4×4 Bayer matrix, row-major. Cell (x, y) of a device pixel is
 * `BAYER_4X4[(y & 3) * 4 + (x & 3)]`.
 */
export const BAYER_4X4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

/** Cells in one tile of the pattern. */
export const DITHER_CELLS = 16;

/** The tile's side, in device pixels. */
export const DITHER_TILE = 4;

const cell = (value) => ((Math.trunc(value) % DITHER_TILE) + DITHER_TILE) % DITHER_TILE;

/**
 * A device pixel's threshold, in (0, 1). The pixel is lit when the density
 * there is above it, as the field's shader does (`bayerThreshold()`).
 * Negative coordinates wrap, so a pattern can start anywhere.
 */
export function bayerThreshold(x, y) {
  return (BAYER_4X4[cell(y) * DITHER_TILE + cell(x)] + 0.5) / DITHER_CELLS;
}

/**
 * How many of the 16 cells a density lights, 0..16. Two densities with the same
 * step draw the same pixels, so the step is what a pattern is cached by.
 * A density that is not a number lights nothing.
 */
export function ditherStep(density) {
  if (!(density > 0)) return 0;
  return Math.min(DITHER_CELLS, Math.max(0, Math.ceil(density * DITHER_CELLS - 0.5)));
}

/**
 * The 16-cell mask a density lights, row-major: 1 lit, 0 clear. The masks are
 * nested: every cell lit at one density is lit at every higher density. That
 * is what lets a denser layer be painted over a sparser one with no gaps.
 */
export function ditherMask(density) {
  const step = ditherStep(density);
  return BAYER_4X4.map((rank) => (rank < step ? 1 : 0));
}

/**
 * The layers of a fill whose density changes in a straight line across a shape:
 * `from` at its start edge (0), `to` at its end edge (1).
 *
 * Each layer is one step of the dither and the span of the shape, as fractions
 * from the start edge, where the fill lights at least that many cells. Painted
 * sparsest first, each at one fixed density, they make exactly the per-pixel
 * dither of the fade: the masks are nested, so a denser layer only adds
 * pixels. A fade is then a few path fills, with no work per pixel.
 *
 * @returns {{ step: number, density: number, start: number, end: number }[]}
 *   Sparsest first. `density` is the middle of the step's range.
 */
export function ditherLayers(from, to) {
  const a = Number.isFinite(from) ? from : 0;
  const b = Number.isFinite(to) ? to : a;
  const top = Math.max(ditherStep(a), ditherStep(b));
  const layers = [];
  for (let step = 1; step <= top; step += 1) {
    // A pixel lights at least `step` cells when its density is above this.
    const level = (step - 0.5) / DITHER_CELLS;
    let start = 0;
    let end = 1;
    if (a !== b) {
      const crossing = (level - a) / (b - a);
      if (b < a) end = Math.min(1, crossing);
      else start = Math.max(0, crossing);
    }
    if (end > start) layers.push({ step, density: step / DITHER_CELLS, start, end });
  }
  return layers;
}
