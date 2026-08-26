// The oat field's data model and motion math (DESIGN.md §9.8).
//
// Deliberately DOM-free and deterministic so it can be unit-tested, and so the
// WebGL renderer and the 2D canvas fallback are demonstrably the *same field* at
// different densities rather than two things that drift apart. The GLSL vertex
// shader is generated from the `WIND` constants below for the same reason: the
// two implementations cannot disagree about the wind because they read the same
// numbers.
//
// Depth is the whole trick. This is pseudo-2D — there is no camera and no
// perspective divide — so every depth cue has to be manufactured:
//
//   1. **Position.** Far bands root just under the horizon; the nearest band
//      roots *below* the viewport, so you are standing inside the field rather
//      than looking at it.
//   2. **Motion parallax.** Near blades sway several times further in screen
//      pixels than far ones. This is the strongest cue by a wide margin — a
//      still frame of the field reads flatter than one second of it moving.
//   3. **Aerial perspective.** Far blades are lower contrast and closer to the
//      haze colour; near blades are gold and solid.
//   4. **Dither density.** Distance is also spelled in the brand's own texture:
//      far blades dissolve into grain, near blades are solid. DESIGN.md §4 uses
//      density for uncertainty, and distance is a kind of uncertainty.
//   5. **Draw order.** Bands render far to near, so near blades occlude far
//      ones. This is why blades are grouped by band rather than fully shuffled.

/** Number of discrete depth planes. Six is enough to read as continuous. */
export const BANDS = 6;

/**
 * The horizon, as a fraction of viewport height measured from the top.
 *
 * This is the app's ground plane, not just the field's. Sky is above it, earth
 * below, and the workspace anchors its navigation to it — which is why it lives
 * here rather than inside the renderer. The far band roots just below it at
 * 0.60, so distant stalks break the line slightly, as they should.
 */
export const HORIZON = 0.57;

/**
 * Where the sun sits, as a fraction of viewport width. Off-centre on a thirds
 * line: a light source dead centre reads as a target rather than as weather.
 */
export const SUN_X = 0.34;

/** How many motes of chaff drift in the air. Few — this is atmosphere, not snow. */
export const CHAFF_COUNT = 34;

/** Segments per blade. More segments = smoother curve; 5 is past the point of
 *  diminishing returns at the sizes a background layer is drawn at. */
export const BLADE_SEGMENTS = 5;

/**
 * Wind constants, shared verbatim between the JS and GLSL implementations.
 *
 * The field's resting motion is deliberately *not* a uniform sine sway — that
 * reads as a screensaver. Instead two gusts travel across the field at
 * incommensurate speeds, so the pattern never visibly repeats, and between them
 * the field is nearly still. Watching a real field, the gust crossing is the
 * thing that holds attention; the ambient term only stops it looking frozen.
 */
export const WIND = {
  /** Low-amplitude idle sway so the settled field is never completely static. */
  ambientAmp: 0.16,
  ambientFreqA: 0.55,
  ambientFreqB: 0.21,
  /** Displacement of a full-strength gust, relative to blade height. */
  gustAmp: 0.4,
  /** Two generators. `speed` is crossings per second, so 0.055 ≈ 18s per pass. */
  gustSpeedA: 0.055,
  gustWidthA: 0.26,
  gustSpeedB: 0.037,
  gustWidthB: 0.44,
  gustStrengthB: 0.6,
  /** Phase offset between generators; irrational-ish so they rarely coincide. */
  gustOffsetB: 0.41,
} as const;

/** How long the growth intro runs, in ms. DESIGN.md §9.8 specifies ~1.4s. */
export const INTRO_MS = 1400;

/** Cursor influence radius, in CSS pixels. */
export const POINTER_RADIUS = 190;

export interface Blade {
  /** Horizontal position, 0..1 across the field. */
  x: number;
  /** Which depth plane this blade belongs to. 0 is farthest. */
  band: number;
  /** 0 at the horizon, 1 at the very front. Derived from band plus jitter so
   *  the planes do not read as hard stripes. */
  depth: number;
  /** Position within this blade's own band, 0 at its back edge and ~1 at its
   *  front. Without this every blade in a band roots at exactly the same height
   *  and the bands show up as horizontal seams across the field. */
  spread: number;
  /** Per-blade height multiplier around the band's base height. */
  height: number;
  /** Static lean, so a windless field still has character. */
  lean: number;
  /** Wind phase offset. */
  phase: number;
  /** Fraction of the intro window before this blade starts growing. */
  growDelay: number;
  /** Fraction of the intro window this blade takes to reach full height. */
  growSpan: number;
  /** How far the grain head nods over at the tip. An oat panicle droops; a
   *  blade that stands straight up reads as grass. */
  droop: number;
}

export interface BandRange {
  start: number;
  count: number;
}

export interface Field {
  blades: Blade[];
  /** Index ranges into `blades`, one per band, ordered far to near. Blades are
   *  shuffled *within* each range, so drawing a prefix of a range is a uniform
   *  subsample of that band — which is what makes adaptive density work without
   *  the field visibly thinning out in one region. */
  bands: BandRange[];
}

/** Deterministic LCG. A field that reshuffled on every resize would read as
 *  noise rather than as a place. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** In-place Fisher-Yates over a slice, so any prefix is a uniform subsample. */
function shuffleRange<T>(items: T[], start: number, count: number, random: () => number): void {
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = start + i;
    const b = start + j;
    const tmp = items[a];
    items[a] = items[b];
    items[b] = tmp;
  }
}

/**
 * Build a field of `count` blades spread across the depth bands.
 *
 * Nearer bands get progressively fewer blades: they cover more screen area per
 * blade, and crowding the foreground is what makes a field look like a hedge.
 */
export function createField(count: number, seed = 20260728): Field {
  const random = makeRandom(seed);

  // Relative population per band, far to near.
  const weights = Array.from({ length: BANDS }, (_, band) => 1 - (band / (BANDS - 1)) * 0.55);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const blades: Blade[] = [];
  const bands: BandRange[] = [];

  for (let band = 0; band < BANDS; band += 1) {
    const start = blades.length;
    const bandCount =
      band === BANDS - 1
        ? Math.max(0, count - start) // last band absorbs the rounding remainder
        : Math.max(1, Math.round((count * weights[band]) / weightSum));

    for (let i = 0; i < bandCount; i += 1) {
      // Jitter depth within the band so the planes blend into each other.
      const spread = random() * 0.85;
      const depth = (band + spread) / (BANDS - 1);

      // Growth order is the second depth cue, and it happens before the field
      // has had time to move: the horizon fills first and the near rows come up
      // last, so the field builds *toward* the viewer. A small left-to-right
      // sweep and per-blade jitter stop it looking like a row-by-row wipe.
      const growDelay = Math.min(0.58, depth * 0.5 + random() * 0.26);

      blades.push({
        x: random(),
        band,
        depth,
        spread,
        height: 0.62 + random() * 0.72,
        lean: (random() - 0.5) * 0.55,
        phase: random() * Math.PI * 2,
        growDelay,
        growSpan: 0.34 + random() * 0.16,
        droop: 0.1 + random() * 0.24,
      });
    }

    shuffleRange(blades, start, blades.length - start, random);
    bands.push({ start, count: blades.length - start });
  }

  // Apply the horizontal sweep after the fact so it reads across the whole
  // field rather than per band, then guarantee every blade actually finishes
  // inside the intro window. Without the clamp, late blades with a long span
  // are still growing when the window closes and visibly snap to full height.
  for (const blade of blades) {
    blade.growDelay = Math.min(0.58, blade.growDelay * 0.82 + blade.x * 0.14);
    blade.growSpan = Math.min(blade.growSpan, 1 - blade.growDelay);
  }

  return { blades, bands };
}

/** No overshoot — DESIGN.md §8 forbids bounce and spring anywhere in Oats. */
export function easeOutCubic(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** How far through its own growth a blade is, given overall intro progress. */
export function growthAt(blade: Blade, introProgress: number): number {
  return easeOutCubic((introProgress - blade.growDelay) / blade.growSpan);
}

/** Centre of a travelling gust at `time`, in the same 0..1 space as `blade.x`.
 *  Enters at -0.3 and leaves at 1.3 so it arrives and departs off-screen. */
export function gustCenter(time: number, speed: number, offset = 0): number {
  const cycle = (time * speed + offset) % 1;
  return (cycle < 0 ? cycle + 1 : cycle) * 1.6 - 0.3;
}

/** Gaussian falloff around a gust centre. */
function gustEnvelope(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

/**
 * Normalised wind displacement for a blade, before it is scaled into pixels.
 *
 * Multiplied by growth squared, so a young blade is stiff and upright and only
 * starts catching the wind as it reaches full height. That single term is most
 * of what makes the intro look like growing rather than like scaling up.
 */
export function windAt(blade: Blade, time: number, growth: number): number {
  const ambient =
    Math.sin(time * WIND.ambientFreqA + blade.phase) * 0.62 +
    Math.sin(time * WIND.ambientFreqB + blade.phase * 1.7) * 0.38;

  const gustA = gustEnvelope(blade.x, gustCenter(time, WIND.gustSpeedA), WIND.gustWidthA);
  const gustB =
    gustEnvelope(blade.x, gustCenter(time, WIND.gustSpeedB, WIND.gustOffsetB), WIND.gustWidthB) *
    WIND.gustStrengthB;

  const stiffness = growth * growth;
  return (blade.lean + ambient * WIND.ambientAmp + (gustA + gustB) * WIND.gustAmp) * stiffness;
}

export interface BandStyle {
  /** Where blades in this band are rooted, as a fraction of viewport height.
   *  The nearest band exceeds 1 so it rises from below the viewport. */
  baseY: number;
  /** Blade height as a fraction of viewport height. */
  height: number;
  /** Blade width in CSS pixels at the root. */
  width: number;
  /** Peak opacity. The field as a whole stays under DESIGN.md §9.8's ~50% cap. */
  alpha: number;
  /** How far this band's blades swing, relative to their height. */
  windScale: number;
  /** Parallax response to the cursor, in CSS pixels per unit of pointer offset. */
  parallax: number;
  /** 0 = fully dissolved into dither, 1 = solid. Far bands are grainier. */
  solidity: number;
  /** How far this band's colour is mixed toward gold, 0..1. */
  goldMix: number;
}

/**
 * Per-band rendering parameters. Pure, so both renderers and the tests agree.
 *
 * These numbers are quiet on purpose. The field is a background: it sits in the
 * lower part of the frame under the horizon haze, it never reaches the middle
 * of the screen where the copy lives, and its peak opacity is a fifth rather
 * than the half §9.8 allows — because opacity accumulates. Several thousand
 * blades at a "safe" individual alpha still stack into an opaque wall.
 */
export function bandStyle(band: number): BandStyle {
  const d = band / (BANDS - 1);
  return {
    baseY: 0.6 + 0.52 * Math.pow(d, 1.15),
    height: 0.05 + 0.17 * Math.pow(d, 0.95),
    width: 0.7 + 2.2 * d,
    alpha: 0.05 + 0.16 * d,
    windScale: 0.3 + 1.5 * d,
    parallax: 2 + 24 * d * d,
    solidity: 0.3 + 0.62 * Math.pow(d, 1.1),
    goldMix: Math.pow(d, 1.3),
  };
}

/** Vertical gap to the next band, in viewport fractions. Blades are spread
 *  across this gap so band boundaries never show as horizontal seams. */
export function bandSpread(band: number): number {
  const here = bandStyle(band).baseY;
  const next =
    band < BANDS - 1 ? bandStyle(band + 1).baseY : here + (here - bandStyle(band - 1).baseY);
  return next - here;
}

// ---------------------------------------------------------------------------
// The countryside — what recording brings into the world (DESIGN.md §9.9).
//
// Pressing record grows the wheat, and the countryside comes with it: the sky
// clears and a farmhouse condenses on the horizon, **in sync with the wheat's
// own grow/recede signal** — one gesture, not a sequence. There is no timing
// of its own here and no post-recording show: while a conversation is live
// the world is awake, and stopping lets all of it settle back together.

/** Which scenery accompanies recording. `off` is bare wheat. */
export type FieldScene = "off" | "sky" | "minka" | "scene";

/** Scene ids as the shader sees them. */
export const SCENE_IDS: Record<FieldScene, number> = {
  off: 0,
  sky: 1,
  minka: 2,
  scene: 3,
};

/**
 * A cleared sky, as a colour. There is no blue token — Oats is gold and ink —
 * so this is deliberately a desaturated slate blue that reads as weather
 * rather than as a new brand colour, and it is used only at low alpha.
 */
export const SKY_BLUE: Rgb = [0.27, 0.47, 0.72];

/** Peak alpha of the sky bloom at the top of the frame. Opacity accumulates. */
export const SKY_BLOOM_ALPHA = 0.28;

/**
 * Extra sky strength on oat-milk paper. Blue over near-white washes out long
 * before it breaks the §9.8 ceiling, so light mode gets a deeper pour; on
 * charcoal the same alpha already reads as dusk. Applied wherever the
 * renderer already distinguishes paper from charcoal (FieldGL's warmScale,
 * FieldCanvas's palette read).
 */
export const SKY_LIGHT_BOOST = 1.45;

/**
 * The farmhouse on the horizon: an irimoya (hip-and-gable) minka — a broad
 * hip roof with a gently concave sweep, a short gable tier above it, and a
 * raised ridge cap. One clean building, nothing additional.
 *
 * All units are fractions of viewport *height* (horizontal distances are
 * aspect-corrected, like the sun), measured up from where it sits on the
 * horizon. The concave roof curve is the load-bearing cultural cue: a
 * straight-edged roof reads as a Western barn no matter its proportions.
 */
export const MINKA = {
  /** Horizontal position, fraction of width. Opposite thirds line from the
   *  sun, so the light and the dwelling balance rather than stack. */
  x: 0.72,
  bodyHalf: 0.042,
  bodyH: 0.016,
  /** Eave tips of the hip roof. Generous: the overhang carries the reading. */
  hipEaveHalf: 0.066,
  hipH: 0.03,
  /** Concavity exponent of the hip sweep. >1 = the Japanese sag: near-vertical
   *  at the ridge, flaring out toward the eave tips. <1 would bulge outward
   *  and read as a thatched dome. */
  hipCurve: 1.6,
  /** Where the hip meets the gable tier. */
  gableHalf: 0.03,
  gableH: 0.015,
  ridgeHalf: 0.017,
  /** The raised ridge cap — a thin bar slightly wider than the ridge. */
  capHalf: 0.022,
  capH: 0.0045,
} as const;

/**
 * Half-width of the farmhouse silhouette at height `y` above the horizon
 * (same height units), or 0 outside it. Shared by the 2D fallback and the
 * tests; the GLSL implements the same clauses from the same constants.
 */
export function minkaHalfWidthAt(y: number): number {
  if (y < 0) return 0;
  if (y <= MINKA.bodyH) return MINKA.bodyHalf;
  const hipT = (y - MINKA.bodyH) / MINKA.hipH;
  if (hipT <= 1) {
    return (
      MINKA.gableHalf + (MINKA.hipEaveHalf - MINKA.gableHalf) * Math.pow(1 - hipT, MINKA.hipCurve)
    );
  }
  const gableT = (y - MINKA.bodyH - MINKA.hipH) / MINKA.gableH;
  if (gableT <= 1) {
    return MINKA.ridgeHalf + (MINKA.gableHalf - MINKA.ridgeHalf) * (1 - gableT);
  }
  const capY = y - MINKA.bodyH - MINKA.hipH - MINKA.gableH;
  if (capY <= MINKA.capH + 1e-6) return MINKA.capHalf;
  return 0;
}

/** Birds for the full scene: few, far, and gone again. */
export const BIRDS = {
  count: 4,
  /** Crossing speed, screens per second. A crossing takes ~50s. */
  speed: 0.02,
  /** Vertical band they fly in, fractions of height from the top. */
  yMin: 0.18,
  yMax: 0.34,
} as const;

export type Rgb = [number, number, number];

/** Parse `#rgb` / `#rrggbb` into 0..1 floats. Returns null on anything else so
 *  callers fall back to a literal rather than rendering black. */
export function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    return Number.isNaN(r + g + b) ? null : [r / 255, g / 255, b / 255];
  }
  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return Number.isNaN(r + g + b) ? null : [r / 255, g / 255, b / 255];
  }
  return null;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * c, a[1] + (b[1] - a[1]) * c, a[2] + (b[2] - a[2]) * c];
}

export function rgbToCss(rgb: Rgb): string {
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${to255(rgb[0])} ${to255(rgb[1])} ${to255(rgb[2])})`;
}
