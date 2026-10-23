// The Oats symbol's grain, resolved into dither.
//
// The grain is drawn as a tone (0 its darkest, 1 its lightest) and every pixel
// then takes one colour of a small honey palette, chosen by ordered 4x4 Bayer
// dither on device pixels: the treatment the field gives its sky
// (components/conversation/field/shaders.ts), so the symbol belongs to the same
// world. A smooth gradient becomes grain, and the pattern stays crisp at every
// size and pixel ratio because it is indexed by device pixel, never scaled.
//
// Pure and DOM-free so it can be pinned (test/helpers/grainDither.test.js);
// OatsMark.tsx draws the tone into a canvas and hands its pixels here.

/** The 4x4 Bayer matrix, row by row: the field's (shaders.ts). */
export const BAYER_4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

/** The dither threshold at a device pixel, between 0 and 1: the field's `bayerThreshold()`. */
export function bayerThreshold(x, y) {
  return (BAYER_4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/**
 * The grain's colours, darkest first, as [r, g, b]: from a deep amber to a warm
 * honey in even steps of lightness (CIELAB L* 36, 51, 66, 81), so the dither is
 * as visible in the light as in the shade. Saturated all the way, with no
 * near-white: the first grain's pale top (#FCD27C, L* 86) read as a glow. Half
 * and half, the two lightest come out at the lightness and hue of the brand's
 * honey (`primary`). The same in light and dark mode, like the symbol.
 */
export const GRAIN_PALETTE = Object.freeze(
  ["#8d3d00", "#b86400", "#e18e08", "#ffbe49"].map((hex) =>
    Object.freeze([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)))
  )
);

/**
 * Which colour of a palette of `steps` a pixel of `tone` takes, given its Bayer
 * threshold. A tone between two colours becomes a mix of exactly those two, in
 * proportion, so the dither keeps the tone on average.
 */
export function ditherTone(tone, threshold, steps) {
  const at = Math.min(1, Math.max(0, tone)) * (steps - 1);
  const below = Math.floor(at);
  return Math.min(steps - 1, below + (at - below > threshold ? 1 : 0));
}

/**
 * Resolve a grain drawn in tone into its palette, in place.
 *
 * `pixels` is RGBA, `width` pixels to a row (an ImageData's data). Red carries
 * the tone, 0 to 255, and alpha how much of the pixel the grain covers. Every
 * covered pixel becomes one palette colour and keeps its coverage, so the
 * outline stays smooth while the shading is dither.
 */
export function ditherGrain(pixels, width, palette = GRAIN_PALETTE) {
  const steps = palette.length;
  for (let i = 0, x = 0, y = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) {
      const colour = palette[ditherTone(pixels[i] / 255, bayerThreshold(x, y), steps)];
      pixels[i] = colour[0];
      pixels[i + 1] = colour[1];
      pixels[i + 2] = colour[2];
    }
    x += 1;
    if (x === width) {
      x = 0;
      y += 1;
    }
  }
}

/** The contact shadow's colour, and the alpha of each of its dots. */
const SHADOW_INK = Object.freeze([58, 28, 0]);
export const SHADOW_DOT_ALPHA = 0.3;

/**
 * Stipple a soft contact shadow into the pixels the grain leaves empty.
 *
 * The shadow is an ellipse, `cx`, `cy`, `rx`, `ry` in device pixels, whose
 * darkness falls from `strength` (0 to 1, the alpha a smooth shadow would have
 * at its centre) to nothing at its edge. Drawn as dots of one alpha, the share
 * of dots on at each place is its darkness: dithered like the grain, not a
 * smooth blur.
 */
export function stippleShadow(pixels, width, { cx, cy, rx, ry, strength }) {
  if (!(rx > 0 && ry > 0 && strength > 0)) return;
  const height = pixels.length / 4 / width;
  const top = Math.max(0, Math.floor(cy - ry));
  const bottom = Math.min(height - 1, Math.ceil(cy + ry));
  const left = Math.max(0, Math.floor(cx - rx));
  const right = Math.min(width - 1, Math.ceil(cx + rx));
  const alpha = Math.round(SHADOW_DOT_ALPHA * 255);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 0) continue;
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const darkness = strength * (1 - Math.sqrt(dx * dx + dy * dy));
      if (darkness / SHADOW_DOT_ALPHA > bayerThreshold(x, y)) {
        pixels[i] = SHADOW_INK[0];
        pixels[i + 1] = SHADOW_INK[1];
        pixels[i + 2] = SHADOW_INK[2];
        pixels[i + 3] = alpha;
      }
    }
  }
}
