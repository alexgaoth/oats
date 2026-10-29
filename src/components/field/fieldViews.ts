import {
  CALM_TOP_FEATHER,
  MINKA,
  defaultComposition,
  type FieldClearing,
  type FieldComposition,
  type FieldDisc,
} from "../conversation/field/fieldModel.ts";

// The field, composed for the screen it stands behind (field mode only).
//
// One picture behind every screen did not work. The world sat in the same
// place whatever was in front of it, so the reading surfaces were given a disc
// of paper to keep text off the wheat — and that disc was the white circle in
// the middle of the field, and the 150vmax box it was painted in gave every
// screen a horizontal scrollbar. Each screen now gets its own composition:
//
//   * The world keeps clear of the content. The clearing is the content's own
//     column, from the top of the window down to where the content ends, so
//     text never sits on grain at any scroll position, and a short screen (an
//     empty state, Home with its one card) has the field under it.
//   * The horizon, the sky, the wheat and the light are set per screen. The two
//     Home screens are the field's own and get all of it; the reading screens
//     get a lower horizon and a quieter world, in the margins.
//   * The sun stands where the largest whole disc fits, low over the horizon:
//     on the open ground under short content, or in a margin. Where no whole
//     disc fits it is not drawn, and only its light stays on the horizon: a
//     card never cuts it in half.
//
// Pure and DOM-free, so the compositions can be pinned (test/helpers/
// fieldViews.test.js). FieldBackdrop measures the room; this decides the picture.

/** The screens the backdrop tells apart. */
export type FieldView = "home" | "recording" | "conversations" | "global" | "record" | "settings";

export const FIELD_VIEWS: readonly FieldView[] = [
  "home",
  "recording",
  "conversations",
  "global",
  "record",
  "settings",
];

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the backdrop measured of the screen in front of it, in CSS px. */
export interface FieldRoom {
  /** The window, which the backdrop's canvas covers. */
  width: number;
  height: number;
  /** The pane the screen is drawn in: right of the sidebar, under the title band. */
  pane: Box;
  /**
   * The content's box on screen: the left and right of its blocks, and where
   * the last of them ends. When the content scrolls, it ends at the pane's
   * bottom. Null when nothing could be measured.
   */
  content: { left: number; right: number; bottom: number } | null;
}

/** How a screen wears the field. */
export interface ViewKnobs {
  /** The horizon, as a fraction of the window's height from its top. */
  horizon: number;
  /** Strength of the sky's grain, the wheat and the warm light, 0..1. */
  sky: number;
  wheat: number;
  warmth: number;
  /** How large the sun may be, 0..1 of the largest; 0 is none. */
  sun: number;
  /**
   * Whether the sun may stand on open ground under short content. The screens
   * that are read keep it in a margin: their content arrives late (Settings
   * loads its pages lazily), and a sun that moved under the first, short
   * render would have to set and rise again a moment later.
   */
  sunUnder: boolean;
}

/**
 * Per screen. The Home screens are where the field is the point: the most sky,
 * full wheat, the whole sun. The reading screens put the horizon lower and the
 * world quieter, because what is on them is read for minutes at a time, and
 * Global conversations is a board of charts with its own grain, so the field
 * stays under it with no sun to compete with the graph.
 */
export const VIEW_KNOBS: Record<FieldView, ViewKnobs> = {
  home: { horizon: 0.62, sky: 0.8, wheat: 1, warmth: 1, sun: 1, sunUnder: true },
  recording: { horizon: 0.64, sky: 1, wheat: 1, warmth: 1, sun: 1, sunUnder: true },
  conversations: { horizon: 0.72, sky: 0.6, wheat: 0.72, warmth: 0.75, sun: 0.8, sunUnder: true },
  record: { horizon: 0.78, sky: 0.5, wheat: 0.6, warmth: 0.65, sun: 0.7, sunUnder: false },
  global: { horizon: 0.84, sky: 0.45, wheat: 0.55, warmth: 0.55, sun: 0, sunUnder: false },
  settings: { horizon: 0.75, sky: 0.55, wheat: 0.65, warmth: 0.65, sun: 0.75, sunUnder: false },
};

/** Calm space kept around the content's blocks (their shadows, focus rings). */
export const CLEAR_PAD = 10;
/**
 * How far the grain takes to come back outside the clearing. Wide on purpose:
 * over a shorter run the dots drop out in a few steps and the clearing reads
 * as a white box laid on the field instead of a place the field thins out.
 */
export const CLEAR_FEATHER = 64;
/**
 * The sun may stand over the outer part of the clearing's feather, where the
 * grain is already thin and no text is near: it is drawn in front of the
 * dissolve there (BACKDROP_FRAGMENT), so it stays whole.
 */
export const SUN_INTO_FEATHER = 0.5;
/** How dark the sky's grain is on oat milk, behind a whole window. */
export const SKY_TONE = 0.6;
/** Space kept between the sun and anything else: content, the edge, the clearing. */
export const SUN_GAP = 14;
/** Below this radius a sun is a dot, so none is drawn. */
export const SUN_MIN_R = 12;
/** How far above the horizon the sun's centre stands, in radii: low, and whole. */
export const SUN_RISE = 1.15;
/** The moon is smaller than the sun, and higher. */
export const MOON_SCALE = 0.62;

/** The farmhouse's height, as a fraction of the scene's (fieldModel.ts). */
const MINKA_HEIGHT = MINKA.bodyH + MINKA.hipH + MINKA.gableH + MINKA.capH;

/** The largest sun a window this tall carries. */
export function sunRadius(height: number): number {
  return Math.min(40, Math.max(18, height * 0.045));
}

/** The content's width when nothing was measured: `max-w-3xl` less its gutters. */
const FALLBACK_COLUMN = 704;

/** Where the world keeps clear of: the content, padded, from the top of the window. */
export function clearingFor(room: FieldRoom): FieldClearing {
  const { pane, content, height } = room;
  const centre = (pane.left + pane.right) / 2;
  const half = Math.min(FALLBACK_COLUMN, pane.right - pane.left) / 2;
  const left = content ? content.left : centre - half;
  const right = content ? content.right : centre + half;
  // Content that reaches the pane's bottom, or that was not measured, is
  // treated as running on past it: the clearing goes off the window, so no
  // feather shows at the bottom edge of a page that scrolls.
  const ends = content && content.bottom < pane.bottom - 1;
  const past = CLEAR_FEATHER * 2;
  return {
    left: left - CLEAR_PAD,
    right: right + CLEAR_PAD,
    top: -past,
    bottom: ends && content ? content.bottom + CLEAR_PAD : height + past,
    feather: CLEAR_FEATHER,
  };
}

interface Place {
  x: number;
  r: number;
  /** The free space's top: the sun and the moon stay below it. */
  top: number;
}

/**
 * Where the sun can stand whole, as large as the view allows: on the open
 * ground under short content (the middle of the picture, so it wins a near
 * tie), or in a margin, the right one first. Null when nowhere holds a disc of
 * SUN_MIN_R.
 */
function placeSun(
  room: FieldRoom,
  clear: FieldClearing,
  horizonY: number,
  rMax: number,
  under: boolean
): Place | null {
  if (rMax < SUN_MIN_R) return null;
  const { pane, height } = room;
  const skyTop = pane.top + CALM_TOP_FEATHER;
  // How far the sun keeps from the clearing: past the inner part of its feather.
  const reach = clear.feather * (1 - SUN_INTO_FEATHER);
  const places: (Place & { score: number })[] = [];

  // Under the content: between the clearing's feather and the horizon, on the
  // column's right-hand third (off centre, as light is).
  if (under && clear.bottom < height) {
    const top = clear.bottom + reach + SUN_GAP;
    const r = Math.min(rMax, (horizonY - top) / (SUN_RISE + 1));
    const x = clear.left + (clear.right - clear.left) * 0.7;
    places.push({ x, r, top, score: r * 1.25 });
  }
  const margins = [
    { from: clear.right + reach, to: pane.right },
    { from: pane.left, to: clear.left - reach },
  ];
  margins.forEach((margin, index) => {
    const across = (margin.to - margin.from - 2 * SUN_GAP) / 2;
    const below = (horizonY - skyTop) / (SUN_RISE + 1);
    const r = Math.min(rMax, across, below);
    const x = (margin.from + margin.to) / 2;
    places.push({ x, r, top: skyTop, score: r * (index === 0 ? 1.05 : 1) });
  });

  const best = places.filter((place) => place.r >= SUN_MIN_R).sort((a, b) => b.score - a.score)[0];
  return best ? { x: best.x, r: best.r, top: best.top } : null;
}

/**
 * Where the farmhouse can stand whole on the horizon, away from the light:
 * the margin the sun is not in, or the open ground under short content on the
 * other side of the sun. -1 when it fits nowhere.
 */
function placeMinka(
  room: FieldRoom,
  clear: FieldClearing,
  horizonY: number,
  sunX: number | null
): number {
  const { pane, width, height } = room;
  const halfWidth = MINKA.hipEaveHalf * height + SUN_GAP;
  const spaces: { from: number; to: number }[] = [
    { from: pane.left, to: clear.left - clear.feather },
    { from: clear.right + clear.feather, to: pane.right },
  ];
  // Under short content only if its roof clears the feather: half a house
  // dissolving into the clearing is the cut this is here to avoid.
  const roof = horizonY - MINKA_HEIGHT * height;
  if (clear.bottom < height && roof >= clear.bottom + clear.feather) {
    spaces.push({ from: clear.left, to: clear.right });
  }
  const candidates = spaces
    .filter((space) => space.to - space.from >= 2 * halfWidth)
    .map((space) => {
      // On open ground, a third of the way across from the side away from the sun.
      const across = space.to - space.from;
      const x =
        sunX !== null && sunX > space.from && sunX < space.to
          ? sunX > space.from + across / 2
            ? space.from + across * 0.28
            : space.from + across * 0.72
          : space.from + across / 2;
      return { x, distance: sunX === null ? 0 : Math.abs(x - sunX) };
    })
    .filter((place) => sunX === null || place.distance > 3 * halfWidth)
    .sort((a, b) => b.distance - a.distance);
  return candidates.length ? candidates[0].x / width : -1;
}

/** The picture for `view`, in the room the backdrop measured. */
export function composeField(view: FieldView, room: FieldRoom): FieldComposition {
  const knobs = VIEW_KNOBS[view];
  const { width, height, pane } = room;
  const clear = clearingFor(room);
  const horizonY = knobs.horizon * height;

  const place = placeSun(room, clear, horizonY, knobs.sun * sunRadius(height), knobs.sunUnder);
  const sun: FieldDisc = place
    ? { x: place.x, y: horizonY - place.r * SUN_RISE, r: place.r }
    : { x: 0, y: 0, r: 0 };
  // The moon stands in the same free space, higher, so the warm light left on
  // the horizon under it is the sun's, set.
  const moonR = place ? place.r * MOON_SCALE : 0;
  const moon: FieldDisc = place
    ? {
        x: place.x,
        y: Math.max(place.top + moonR + SUN_GAP, place.top + (horizonY - place.top) * 0.3),
        r: moonR,
      }
    : { x: 0, y: 0, r: 0 };
  // The light on the horizon comes from the sun; with none, from the pane's
  // right-hand third, where it would have stood.
  const lightX = (place ? place.x : pane.left + (pane.right - pane.left) * 0.7) / width;

  return {
    ...defaultComposition(),
    horizon: knobs.horizon,
    sky: knobs.sky,
    skyTone: SKY_TONE,
    wheat: knobs.wheat,
    warmth: knobs.warmth,
    lightX,
    sun,
    moon,
    minkaX: placeMinka(room, clear, horizonY, place ? place.x : null),
    clear,
    calmTop: pane.top,
    layout: [width, height, pane.left, pane.top, pane.right, pane.bottom].join(","),
  };
}

/** The screen a surface shows when nothing more specific was measured. */
export function fallbackView(surface: string, recording: boolean): FieldView {
  if (surface === "conversation") return recording ? "recording" : "home";
  if (surface === "settings") return "settings";
  return "conversations";
}
