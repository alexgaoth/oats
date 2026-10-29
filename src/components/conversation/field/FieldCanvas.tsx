import { useEffect, useRef } from "react";
import {
  BANDS,
  BIRDS,
  INTRO_MS,
  MINKA,
  POINTER_RADIUS,
  SKY_BLOOM_ALPHA,
  SKY_BLUE,
  SKY_LIGHT_BOOST,
  bandPlacement,
  bandStyle,
  calmAt,
  createField,
  defaultComposition,
  easeOutCubic,
  growthAt,
  minkaHalfWidthAt,
  mixComposition,
  mixRgb,
  parseHexColor,
  rgbToCss,
  sameComposition,
  sceneFrame,
  windAt,
  type Field,
  type FieldComposition,
  type FieldScene,
  type Rgb,
} from "./fieldModel";
import {
  FRAME_INTERVAL_MS,
  MOVE_MS,
  createFieldClock,
  easeToward,
  fieldLoopState,
  frameDelay,
  frameDue,
  type FieldClock,
} from "./fieldLoop";
import { backingSize, observeDevicePixels, watchPixelRatio } from "./canvasSize";

// 2D canvas fallback for the oat field (DESIGN.md §9.8), used when WebGL2 is
// unavailable or is only offered in software.
//
// It draws the *same* field as the GPU path — same bands, same growth stagger,
// same travelling gusts — at a density a CPU can afford, so the fallback is a
// quieter version of one design rather than a second one. What it does not do
// is dither: ordered dithering per pixel is not affordable here, and §7 is
// explicit that faking the grain with noise or blur looks cheap rather than
// intentional. Better to omit the texture than to counterfeit it.
//
// It keeps the GPU path's frame rules (`fieldLoop.ts`): one frame per change
// while still, at most 30 a second while the wind blows, none while nobody can
// see it.

const BLADE_COUNT = 1700;

/** How far the pointer's parting closes per 60 Hz frame (see `easeToward`). */
const POINTER_EASE = 0.18;

const FALLBACK_GOLD: Rgb = [198 / 255, 123 / 255, 39 / 255];
const FALLBACK_HAZE: Rgb = [107 / 255, 100 / 255, 89 / 255];

interface CanvasPalette {
  colors: string[];
  /** SKY_LIGHT_BOOST on paper, 1 on charcoal — mirrors FieldGL's warmScale test. */
  skyBoost: number;
  /** Paper rather than charcoal: the sun is drawn, not the moon. */
  light: boolean;
  gold: Rgb;
  ink: Rgb;
}

function readCanvasPalette(element: HTMLElement): CanvasPalette {
  const styles = getComputedStyle(element);
  const gold = parseHexColor(styles.getPropertyValue("--color-primary")) ?? FALLBACK_GOLD;
  const haze = parseHexColor(styles.getPropertyValue("--color-muted-foreground")) ?? FALLBACK_HAZE;
  const ink = parseHexColor(styles.getPropertyValue("--color-foreground")) ?? [0.17, 0.15, 0.13];
  const surface =
    parseHexColor(styles.getPropertyValue("--color-surface-raised")) ??
    parseHexColor(styles.getPropertyValue("--color-background")) ??
    ([1, 0.99, 0.97] as Rgb);
  const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const light = luminance(surface) > luminance(ink);
  return {
    colors: Array.from({ length: BANDS }, (_, band) =>
      rgbToCss(mixRgb(haze, gold, bandStyle(band).goldMix))
    ),
    skyBoost: light ? SKY_LIGHT_BOOST : 1,
    light,
    gold,
    ink,
  };
}

/** `rgb` at `alpha`, for a gradient stop. */
function rgba([r, g, b]: Rgb, alpha: number): string {
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

/** The calm mask is drawn at a quarter of the canvas's size: it is all feather. */
const MASK_SCALE = 0.25;

/**
 * The composition's calm as an alpha mask, for one `destination-out` draw over
 * the finished frame. Built once per picture and size, from `calmAt`, the same
 * distance the shaders compute; null when nothing is kept clear. The disc in
 * the sky (`light`: the sun, else the moon) is left whole where it stands over
 * the feather's outer half, as the shader leaves it.
 */
function calmMask(
  picture: FieldComposition,
  light: boolean,
  width: number,
  height: number,
  cache: { key: string; canvas: HTMLCanvasElement } | null
): { key: string; canvas: HTMLCanvasElement } | null {
  if (picture.clear.feather <= 0 && picture.calmTop <= 0) return null;
  const w = Math.max(1, Math.ceil(width * MASK_SCALE));
  const h = Math.max(1, Math.ceil(height * MASK_SCALE));
  const { clear } = picture;
  const disc = light ? picture.sun : picture.moon;
  const key = [w, h, clear.left, clear.top, clear.right, clear.bottom, clear.feather]
    .concat(picture.calmTop, disc.x, disc.y, disc.r)
    .map((n) => Math.round(n))
    .join(",");
  if (cache?.key === key) return cache;
  const canvas = cache?.canvas ?? document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const px = (x + 0.5) / MASK_SCALE;
      const py = (y + 0.5) / MASK_SCALE;
      let calm = calmAt(picture, px, py);
      if (calm < 0.5 && disc.r > 0 && Math.hypot(px - disc.x, py - disc.y) < disc.r + 2) calm = 0;
      image.data[(y * w + x) * 4 + 3] = Math.round(calm * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return { key, canvas };
}

export default function FieldCanvas({
  live,
  intensity,
  composition,
  animate,
  visible,
  scene,
  sceneHeight,
  reduced,
}: {
  live: boolean;
  intensity: number;
  /** The picture to draw (fieldModel.ts); a change eases there over MOVE_MS. */
  composition?: FieldComposition;
  /** Whether the world moves. False on the reading surfaces: one settled frame
   *  and no loop at all. */
  animate: boolean;
  /** Whether anybody can see it. A moving field with nobody watching draws
   *  nothing, and its clock stops until somebody is. */
  visible: boolean;
  /** Which scenery accompanies recording. Drawn smooth here — §7 forbids
   *  counterfeiting the grain, so the fallback omits the dither, as it does
   *  for the blades. */
  scene: FieldScene;
  /** The scene's own height in CSS px, standing on the canvas's bottom edge;
   *  by default the canvas's height (`sceneFrame` in fieldModel.ts). */
  sceneHeight?: number;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /** 0..1, eased toward the pointer's presence so the parting cannot pop. */
  const pointerFadeRef = useRef(0);
  /** Where the pointer last was, kept while the parting fades out. */
  const pointerLastRef = useRef<{ x: number; y: number } | null>(null);
  const paletteRef = useRef<CanvasPalette | null>(null);
  // Growth state lives in a ref, not the effect closure: `live` is in the
  // effect's deps, so the closure is torn down on every transition — exactly
  // the moment the recede needs its history.
  const motionRef = useRef({
    grown: 0,
    growFrom: 0,
    growAt: 0,
    wasLive: false,
    /** Animation time of the last frame drawn, for the pointer's easing. */
    lastElapsed: 0,
  });
  // One clock for the component's whole life: the effect re-runs on every
  // `live` transition, and a clock that restarted at zero would invalidate the
  // growAt timestamps `motionRef` carries across runs. Created by the first
  // frame that moves, and stopped while nobody can see the field.
  const clockRef = useRef<FieldClock | null>(null);
  // The field never changes; built once rather than on every re-run.
  const fieldRef = useRef<Field | null>(null);
  // The canvas's size as the observer last measured it: CSS px, and the device
  // pixels it covers (0 until measured). See FieldGL.
  const sizeRef = useRef({ width: 0, height: 0, deviceWidth: 0, deviceHeight: 0 });
  // Set by the drawing effect while the field is still: a still frame is drawn
  // once, so a resize has to draw it again or the old frame is stretched.
  const redrawRef = useRef<(() => void) | null>(null);
  // The picture, and the move toward a new one, as in FieldGL.
  const pictureRef = useRef({
    from: composition ?? defaultComposition(intensity),
    to: composition ?? defaultComposition(intensity),
    now: composition ?? defaultComposition(intensity),
    at: null as number | null,
    drawn: false,
  });
  const maskRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const css = entry?.contentBoxSize?.[0];
      const device = entry?.devicePixelContentBoxSize?.[0];
      sizeRef.current = {
        width: css ? css.inlineSize : canvas.clientWidth,
        height: css ? css.blockSize : canvas.clientHeight,
        deviceWidth: device ? device.inlineSize : 0,
        deviceHeight: device ? device.blockSize : 0,
      };
      redrawRef.current?.();
    });
    observeDevicePixels(observer, canvas);
    const stopWatching = watchPixelRatio(() => redrawRef.current?.());
    return () => {
      observer.disconnect();
      stopWatching();
    };
  }, []);

  useEffect(() => {
    if (reduced) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const clear = () => {
      pointerRef.current = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
    };
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A new picture: moved to over MOVE_MS, or drawn as it is (see FieldGL).
    const picture = pictureRef.current;
    const next = composition ?? defaultComposition(intensity);
    if (!sameComposition(picture.to, next)) {
      if (!picture.drawn || reduced || !visible) {
        picture.from = next;
        picture.now = next;
        picture.at = null;
      } else {
        picture.from = picture.now;
        picture.at = performance.now();
      }
      picture.to = next;
    }
    const pictureAt = (now: number) => {
      picture.drawn = true;
      if (picture.at === null) return (picture.now = picture.to);
      const p = (now - picture.at) / MOVE_MS;
      if (p >= 1 || reduced || !visible) {
        picture.at = null;
        return (picture.now = picture.to);
      }
      return (picture.now = mixComposition(picture.from, picture.to, easeOutCubic(p)));
    };

    // See FieldGL: the world only moves on Conversation, for a user who wants
    // motion, while somebody can see it, and for the length of a move to
    // another screen's picture. Everywhere else it is a photograph of itself.
    const state = fieldLoopState({ animate, reduced, visible, easing: picture.at !== null });
    // Still frames: no wind, no cursor. A move between pictures draws still
    // frames too, so its last frame is the settled one.
    const still = state === "still" || state === "easing";

    const field = (fieldRef.current ??= createField(BLADE_COUNT));
    const styles = Array.from({ length: BANDS }, (_, b) => bandStyle(b));

    // Read once, and again only when the theme changes — never per frame.
    paletteRef.current = readCanvasPalette(canvas);
    const themeObserver = new MutationObserver(() => {
      paletteRef.current = readCanvasPalette(canvas);
      // Nothing is looping to pick the new palette up on a still surface, and
      // the theme switch lives on one of them (Advanced Settings). A paused
      // field draws with it when it moves again.
      if (still) draw(INTRO_MS);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // Eases the wheat toward whether a conversation is live. Mirrors FieldGL:
    // arriving reads as weather, leaving as settling, so withdrawal is slower.
    // The scenery rides the same signal. State lives in `motionRef`, which
    // outlives this closure.
    const motion = motionRef.current;
    const liveProgress = (elapsed: number) => {
      if (live !== motion.wasLive) {
        motion.wasLive = live;
        motion.growFrom = motion.grown;
        motion.growAt = elapsed;
      }
      const span = live ? INTRO_MS : 2200;
      const p = Math.min(1, Math.max(0, (elapsed - motion.growAt) / span));
      const eased = 1 - Math.pow(1 - p, 3);
      motion.grown = motion.growFrom + ((live ? 1 : 0) - motion.growFrom) * eased;
      return motion.grown;
    };

    const draw = (elapsed: number) => {
      const ctx = canvas.getContext("2d");
      const palette = paletteRef.current;
      if (!ctx || !palette) return;
      const colors = palette.colors;

      // Before the observer's first measurement, the layout's own numbers.
      const measured = sizeRef.current;
      const width = measured.width || canvas.clientWidth;
      const height = measured.height || canvas.clientHeight;
      if (!width || !height) return;

      const backing = backingSize(
        width,
        height,
        measured.deviceWidth,
        measured.deviceHeight,
        window.devicePixelRatio || 1
      );
      if (canvas.width !== backing.w || canvas.height !== backing.h) {
        canvas.width = backing.w;
        canvas.height = backing.h;
      }
      ctx.setTransform(backing.w / width, 0, 0, backing.h / height, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The wheat follows `live`; the world below does not.
      const grow = still ? (live ? 1 : 0) : liveProgress(elapsed);
      const time = still ? 0 : elapsed / 1000;
      const live_pointer = still ? null : pointerRef.current;
      // Eased, and holding the last position while it fades — as a flag the
      // parting dropped between two frames when the cursor left the window.
      // Eased by time rather than per frame, so the frame rate cannot change
      // it, and never in a still frame: at rest the cursor does nothing.
      const dt = Math.min(FRAME_INTERVAL_MS, Math.max(0, elapsed - motion.lastElapsed));
      motion.lastElapsed = elapsed;
      if (live_pointer) pointerLastRef.current = live_pointer;
      pointerFadeRef.current = still
        ? 0
        : easeToward(pointerFadeRef.current, live_pointer ? 1 : 0, dt, POINTER_EASE);
      if (pointerFadeRef.current < 0.002) pointerFadeRef.current = 0;
      const pointer = pointerFadeRef.current > 0 ? (live_pointer ?? pointerLastRef.current) : null;
      const pointerFade = pointerFadeRef.current;
      // No parallax. It shifted every blade by the cursor's offset from centre,
      // so the whole field slid with the mouse and snapped back on the way out.
      const parallax = 0;

      // The world: sky warming toward the horizon, and earth below it. No
      // dither — ordered dithering per pixel is not affordable here, and §7 is
      // explicit that faking the grain with noise looks cheap rather than
      // intentional. Better to omit the texture than to counterfeit it.
      // The scene stands on the canvas's bottom edge at its own scale.
      const view = pictureAt(performance.now());
      const frame = sceneFrame(height, sceneHeight);
      const sceneH = frame.scale;
      const horizonY = frame.y(view.horizon);

      // The recording's cleared sky (scenes "sky" and "scene"): a slate-blue
      // wash blooming from the top of the frame down toward the horizon,
      // behind the warm light, which keeps the horizon. Rides `grow`.
      if (grow > 0.001 && (scene === "sky" || scene === "scene")) {
        const bloom = ctx.createLinearGradient(0, 0, 0, horizonY);
        bloom.addColorStop(0, rgbToCss(SKY_BLUE));
        // Fade to the *same* blue at zero alpha — "transparent" interpolates
        // through transparent black and would grey the wash on paper.
        const to255 = (v: number) => Math.round(v * 255);
        bloom.addColorStop(
          1,
          `rgba(${to255(SKY_BLUE[0])}, ${to255(SKY_BLUE[1])}, ${to255(SKY_BLUE[2])}, 0)`
        );
        const tone = palette.light ? view.skyTone : 1;
        ctx.globalAlpha =
          Math.min(SKY_BLOOM_ALPHA * palette.skyBoost * tone, 0.5) * grow * view.sky;
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, width, horizonY);
      }

      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, "transparent");
      sky.addColorStop(1, colors[BANDS - 1]);
      ctx.globalAlpha = (0.1 + 0.05 * grow) * view.warmth;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, horizonY);

      const earth = ctx.createLinearGradient(0, horizonY, 0, height);
      earth.addColorStop(0, colors[BANDS - 1]);
      earth.addColorStop(1, "transparent");
      ctx.globalAlpha = (0.09 + 0.05 * grow) * view.warmth;
      ctx.fillStyle = earth;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // The light's source, where the picture found room for all of it: a low
      // honey sun in a soft glow on paper, a pale crescent moon on charcoal.
      // Smooth here, as the rest of this renderer is.
      if (palette.light && view.sun.r > 0.5) {
        const { x, y, r } = view.sun;
        const halo = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.8);
        halo.addColorStop(0, rgba(palette.gold, 0.32));
        halo.addColorStop(1, rgba(palette.gold, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 2.8, y - r * 2.8, r * 5.6, r * 5.6);
        const disc = ctx.createRadialGradient(x, y, 0, x, y, r);
        disc.addColorStop(0, rgba(palette.gold, 0.9));
        disc.addColorStop(0.55, rgba(palette.gold, 0.84));
        disc.addColorStop(1, rgba(palette.gold, 0.62));
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (!palette.light && view.moon.r > 0.5) {
        const { x, y, r } = view.moon;
        const pale = mixRgb(palette.ink, palette.gold, 0.16);
        const halo = ctx.createRadialGradient(x, y, r, x, y, r * 2);
        halo.addColorStop(0, rgba(pale, 0.06));
        halo.addColorStop(1, rgba(pale, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
        // The crescent: the disc less a smaller one shifted to the upper right,
        // clipped to the disc so nothing of the second circle shows outside it.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = rgba(pale, 0.05);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.arc(x + 0.42 * r, y - 0.3 * r, 0.84 * r, 0, Math.PI * 2, true);
        ctx.fillStyle = rgba(pale, 0.78);
        ctx.fill("evenodd");
        ctx.restore();
      }

      // The recording's farmhouse (scenes "minka" and "scene"): drawn from
      // the same half-width function as the shader, sampled into a path so
      // the concave irimoya sweep is the same curve in both renderers.
      // Smooth fade here; never counterfeit grain. Rides `grow`.
      if (grow > 0.001 && (scene === "minka" || scene === "scene") && view.minkaX >= 0) {
        const cx = view.minkaX * width;
        const top = MINKA.bodyH + MINKA.hipH + MINKA.gableH + MINKA.capH;
        const steps = 36;

        ctx.globalAlpha = 0.45 * grow * view.sky;
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        // Up the right side, across the top, down the left.
        for (let i = 0; i <= steps; i += 1) {
          const yy = (i / steps) * top;
          const hw = minkaHalfWidthAt(Math.min(yy, top - 1e-5)) * sceneH;
          const py = horizonY - yy * sceneH;
          if (i === 0) ctx.moveTo(cx + hw, py);
          else ctx.lineTo(cx + hw, py);
        }
        for (let i = steps; i >= 0; i -= 1) {
          const yy = (i / steps) * top;
          const hw = minkaHalfWidthAt(Math.min(yy, top - 1e-5)) * sceneH;
          ctx.lineTo(cx - hw, horizonY - yy * sceneH);
        }
        ctx.closePath();
        ctx.fill();
      }

      // The recording's birds (scene "scene" only): a few distant "v" strokes
      // crossing the cleared sky right to left, wingbeat as a slow flex. Same
      // positions as the shader's specks, from the same BIRDS constants.
      if (grow > 0.001 && scene === "scene" && !still) {
        ctx.strokeStyle = colors[0];
        ctx.globalAlpha = 0.5 * grow * view.sky;
        ctx.lineWidth = 1;
        for (let i = 0; i < BIRDS.count; i += 1) {
          const phase = (i * 0.618 + 0.21) % 1;
          const bx = (1.1 - ((time * BIRDS.speed + phase) % 1) * 1.2) * width;
          const byTop = BIRDS.yMin + ((phase * 7.31) % 1) * (BIRDS.yMax - BIRDS.yMin);
          // As high above the horizon as they fly in a scene the canvas's size.
          const by = horizonY - (view.horizon - byTop - Math.sin(time * 0.7 + i) * 0.006) * sceneH;
          const wing = 3.2;
          const beat = 1.6 * Math.sin(time * 9 + i * 2.4);
          ctx.beginPath();
          ctx.moveTo(bx - wing, by - beat);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + wing, by - beat);
          ctx.stroke();
        }
      }

      // The horizon itself, fading out toward the edges.
      const line = ctx.createLinearGradient(0, 0, width, 0);
      line.addColorStop(0, "transparent");
      line.addColorStop(0.5, colors[0]);
      line.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.22 * view.warmth;
      ctx.fillStyle = line;
      ctx.fillRect(0, horizonY, width, 1);

      ctx.globalAlpha = 1;
      ctx.lineCap = "round";

      // Last: the content's column, and the title band, kept clear of all of it.
      const keepClear = () => {
        maskRef.current = calmMask(view, palette.light, width, height, maskRef.current);
        if (!maskRef.current) return;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(maskRef.current.canvas, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      };

      if (grow <= 0.001) {
        keepClear();
        ctx.globalAlpha = 1;
        return;
      }
      const intro = grow;

      // Far to near, so nearer blades overlap the ones behind them.
      for (let band = 0; band < BANDS; band += 1) {
        const style = styles[band];
        // Where this band stands under the picture's horizon.
        const place = bandPlacement(band, view.horizon);
        const range = field.bands[band];
        ctx.strokeStyle = colors[band];
        ctx.lineWidth = style.width;

        for (let i = range.start; i < range.start + range.count; i += 1) {
          const blade = field.blades[i];
          const growth = growthAt(blade, intro);
          if (growth <= 0) continue;

          const bladeHeight =
            place.height * (0.86 + blade.spread * 0.28) * sceneH * blade.height * growth;
          if (bladeHeight < 1.5) continue;

          const baseX = blade.x * width + parallax * style.parallax;
          const baseY = frame.y(place.baseY + blade.spread * place.spread);

          let bend = windAt(blade, time, growth) * bladeHeight * style.windScale * 0.3;

          if (pointer) {
            const dx = baseX - pointer.x;
            const dy = baseY - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < POINTER_RADIUS) {
              const push = (1 - distance / POINTER_RADIUS) ** 2;
              bend += (dx >= 0 ? 1 : -1) * push * bladeHeight * 0.55 * pointerFade;
            }
          }

          ctx.globalAlpha = style.alpha * growth * view.wheat;
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.quadraticCurveTo(
            baseX + bend * 0.35,
            baseY - bladeHeight * 0.6,
            baseX + bend,
            baseY - bladeHeight
          );
          ctx.stroke();
        }
      }

      keepClear();
      ctx.globalAlpha = 1;
    };

    if (state === "still") {
      draw(INTRO_MS);
      redrawRef.current = () => draw(INTRO_MS);
      return () => {
        redrawRef.current = null;
        themeObserver.disconnect();
      };
    }

    // Moving to another screen's picture, with no wind: a still frame per
    // vsync for MOVE_MS, the last of them the settled picture.
    if (state === "easing") {
      let easeFrame = 0;
      const ease = () => {
        draw(INTRO_MS);
        easeFrame = picture.at !== null ? requestAnimationFrame(ease) : 0;
      };
      easeFrame = requestAnimationFrame(ease);
      redrawRef.current = () => draw(INTRO_MS);
      return () => {
        cancelAnimationFrame(easeFrame);
        redrawRef.current = null;
        themeObserver.disconnect();
      };
    }

    // Nobody can see it: no frames, no timers, and the clock stops, so the
    // wind resumes where it was left. The effect re-runs when that changes.
    if (state === "paused") {
      clockRef.current?.pause(performance.now());
      return () => themeObserver.disconnect();
    }

    const clock = (clockRef.current ??= createFieldClock(performance.now()));
    clock.resume(performance.now());

    let raf = 0;
    let timer = 0;
    let lastDrawAt = -Infinity;
    const requestFrame = () => {
      timer = 0;
      raf = requestAnimationFrame(tick);
    };
    const tick = (now: number) => {
      raf = 0;
      // At most FIELD_FPS: between frames the loop sleeps on a timer and asks
      // for no vsync at all.
      if (!frameDue(now, lastDrawAt)) {
        timer = window.setTimeout(requestFrame, frameDelay(now, lastDrawAt));
        return;
      }
      lastDrawAt = now;
      draw(clock.elapsed(now));

      // Mirrors FieldGL: with no conversation running and the wheat withdrawn,
      // every remaining draw paints the identical picture. The effect re-runs
      // on the next `live` transition, which is what starts it again.
      if (!live && motion.grown <= 0.001) return;
      timer = window.setTimeout(requestFrame, frameDelay(performance.now(), lastDrawAt));
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      themeObserver.disconnect();
    };
  }, [live, intensity, composition, animate, visible, scene, sceneHeight, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
