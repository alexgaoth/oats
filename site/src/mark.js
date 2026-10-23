// The Oats symbol on the site: the app's own grain (src/components/shell/
// grainCanvas.ts) and its own toss (src/helpers/oatsMarkMotion.mjs), dithered the
// way the film and the app icon show it: about 110 dots across, each a crisp
// square of device pixels, in the four honey tones pushed apart
// (demo/video/src/brand/Grain.tsx). Small marks keep one dot per device pixel.

import { AT_REST, paintGrain } from "../../src/components/shell/grainCanvas.ts";
import { SPIN_MS, tossFrame } from "../../src/helpers/oatsMarkMotion.mjs";
import { GRAIN_PALETTE } from "../../src/helpers/grainDither.mjs";

/** The film's tones: the app's four, pushed apart so the dither reads at size. */
const FILM_TONES = [
  [122, 49, 0],
  [178, 94, 0],
  [236, 154, 18],
  [255, 206, 104],
];
const TO_FILM = new Map(GRAIN_PALETTE.map((rgb, index) => [rgb.join(","), FILM_TONES[index]]));

/** Dots across the grain's square, as in the film and the app icon. */
const DOTS_ACROSS = 110;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Paints the grain into `canvas` and keeps it sharp at any size and pixel
 * ratio. Options: `shadow` (the stippled contact shadow, for large marks),
 * `toss` ("load" tosses once when first seen), `interactive` (a click tosses).
 */
export function mountMark(canvas, { shadow = false, toss = "none", interactive = false } = {}) {
  const scratch = document.createElement("canvas");
  const draw = scratch.getContext("2d", { willReadFrequently: true });
  let pose = AT_REST;
  let frame = 0;

  function paint() {
    const width = canvas.width;
    if (!width || !draw) return;
    const cell = Math.max(1, Math.round(width / DOTS_ACROSS));
    const dots = Math.max(8, Math.floor(width / cell));
    scratch.width = dots;
    scratch.height = dots;
    paintGrain(draw, dots, dots, pose, shadow);
    const image = draw.getImageData(0, 0, dots, dots);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const tone = TO_FILM.get(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      if (tone) [data[i], data[i + 1], data[i + 2]] = tone;
    }
    draw.putImageData(image, 0, 0);
    const context = canvas.getContext("2d");
    const side = dots * cell;
    const offset = Math.floor((width - side) / 2);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch, offset, offset, side, side);
  }

  // One canvas pixel per device pixel, so each dot lands on whole pixels.
  function fit() {
    const ratio = window.devicePixelRatio || 1;
    const size = Math.round(canvas.clientWidth * ratio);
    if (size && (canvas.width !== size || canvas.height !== size)) {
      canvas.width = size;
      canvas.height = size;
      paint();
    }
  }

  function spin() {
    if (reducedMotion()) return;
    cancelAnimationFrame(frame);
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / SPIN_MS);
      pose = tossFrame(p);
      paint();
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  fit();
  new ResizeObserver(fit).observe(canvas);
  window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.("change", fit);

  if (toss === "load") {
    // Once, and only when somebody can see it.
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        seen.disconnect();
        window.setTimeout(spin, 350);
      }
    });
    seen.observe(canvas);
  }
  if (interactive) {
    const target = canvas.closest("button") || canvas;
    target.addEventListener("click", spin);
  }
  return { spin };
}
