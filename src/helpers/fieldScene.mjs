// The oat field's geometry. Pure, DOM-free, deterministic — so it can be
// pinned, and so the field is a *place*: the same one every launch, not a fresh
// random picture each time the app opens.
//
// The depth constants are carried over from the retired WebGL field, which had
// them right. What is not carried over is its cost: nothing here runs per
// frame. This returns static paths, and the sway is CSS on a whole band.

/** Depth planes. Three reads as continuous at this element budget; six did not
 *  earn its keep once the renderer stopped being a shader. */
export const BANDS = 3;

/** The horizon, as a fraction of viewport height from the top. */
export const HORIZON = 0.57;

/** The sun, off-centre on a thirds line: dead centre reads as a target. */
export const SUN_X = 0.34;

/** Blades per band. The whole field is BANDS * BLADES elements — bounded on
 *  purpose, because an unbounded one is how the last field cost a core. */
export const BLADES = 27;

/**
 * A deterministic value in 0..1 from an integer.
 *
 * Not `Math.random`: the field must be identical on every launch, and a seeded
 * generator that anyone can reproduce is also the only way to pin the geometry.
 */
export function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One blade: a quadratic curve leaning from its root, with the ear at the tip.
 *
 * Coordinates are in the band's own 0..100 viewBox, so a band can be stretched
 * to any height without the curve changing shape.
 */
export function blade(index, depth) {
  const jitter = noise(index * 7 + depth * 131);
  const lean = (noise(index * 3 + depth * 17) - 0.5) * 2;
  // Spread with enough jitter to break the row. At low jitter this reads as a
  // planted grid rather than a field — evenly spaced stalks are the giveaway,
  // and no amount of height variation hides it.
  // Planted wider than the frame by construction, not by luck: the row spans
  // 116% starting at -8%, so even the least-jittered first and last stalks fall
  // outside the viewport. A field whose last stalk lands at 99% has a visible
  // edge, and an edge is the difference between standing in a field and looking
  // at a picture of one.
  const x = -8 + ((index + 0.5 + (jitter - 0.5) * 1.9) / BLADES) * 116;
  // Height in *pixels*, because a blade is drawn at its own size rather than
  // stretched to a band's box. The first attempt used one full-width SVG per
  // band with `preserveAspectRatio="none"`, which scales x by ~24 and y by ~4:
  // stems became slabs and the ears became lily pads. A stalk is a small fixed
  // shape placed with CSS, so its proportions are its own.
  const height = Math.round((34 + noise(index + depth * 53) * 52) * (0.55 + depth * 0.34));
  const bend = lean * 9;
  return {
    id: `${depth}-${index}`,
    x,
    lean,
    height,
    width: Math.round(height * 0.22),
    // The stem, in the blade's own 20x100 box.
    stem: `M 10 100 Q ${10 + bend * 0.5} 52 ${10 + bend} 8`,
    tip: { x: 10 + bend, y: 8 },
    // Ears alternate down the stalk; three is enough to read as oats.
    ears: [0, 1, 2].map((i) => ({
      cx: 10 + bend * (1 - i * 0.28) + (i % 2 === 0 ? -4.4 : 4.4),
      cy: 12 + i * 15,
      rot: i % 2 === 0 ? -26 : 26,
    })),
  };
}

/**
 * The bands, far to near — which is also draw order, so near occludes far.
 *
 * `depth` 0 is the far band. Each nearer band roots lower, sways further,
 * and sits at higher contrast; the nearest roots *below* the viewport so the
 * viewer is standing in the field rather than looking at it.
 */
export function buildField() {
  const bands = [];
  for (let depth = 0; depth < BANDS; depth += 1) {
    const t = depth / (BANDS - 1);
    bands.push({
      depth,
      // Far band breaks the horizon line slightly, as distant stalks should.
      rootTop: HORIZON - 0.01 + t * 0.30,
      // Aerial perspective: distance is lower contrast. Kept low overall — this
      // is a backdrop, and the conversation has to stay the brightest thing.
      opacity: 0.18 + t * 0.26,
      // Motion parallax — the strongest depth cue, so it gets the widest range.
      sway: 0.7 + t * 2.6,
      // Near blades are heavier and swing slower.
      swayMs: 5200 + depth * 1700,
      blades: Array.from({ length: BLADES }, (_, i) => blade(i, depth)),
    });
  }
  return bands;
}
