import { useEffect, useRef } from "react";
import {
  BANDS,
  BIRDS,
  EPILOGUE,
  HORIZON,
  INTRO_MS,
  MINKA,
  POINTER_RADIUS,
  SKY_BLOOM_ALPHA,
  SKY_BLUE,
  SKY_LIGHT_BOOST,
  bandSpread,
  bandStyle,
  createField,
  epilogueAt,
  growthAt,
  kuraHalfWidthAt,
  minkaHalfWidthAt,
  mixRgb,
  parseHexColor,
  rgbToCss,
  windAt,
  type FieldScene,
  type MinkaStyle,
  type Rgb,
} from "./fieldModel";

// 2D canvas fallback for the oat field (DESIGN.md §9.8), used when WebGL2 is
// unavailable or is only offered in software.
//
// It draws the *same* field as the GPU path — same bands, same growth stagger,
// same travelling gusts — at a density a CPU can afford, so the fallback is a
// quieter version of one design rather than a second one. What it does not do
// is dither: ordered dithering per pixel is not affordable here, and §7 is
// explicit that faking the grain with noise or blur looks cheap rather than
// intentional. Better to omit the texture than to counterfeit it.

const BLADE_COUNT = 900;
const FRAME_MS = 1000 / 30;

const FALLBACK_GOLD: Rgb = [198 / 255, 123 / 255, 39 / 255];
const FALLBACK_HAZE: Rgb = [107 / 255, 100 / 255, 89 / 255];

interface CanvasPalette {
  colors: string[];
  /** SKY_LIGHT_BOOST on paper, 1 on charcoal — mirrors FieldGL's warmScale test. */
  skyBoost: number;
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
  return {
    colors: Array.from({ length: BANDS }, (_, band) =>
      rgbToCss(mixRgb(haze, gold, bandStyle(band).goldMix))
    ),
    skyBoost: luminance(surface) > luminance(ink) ? SKY_LIGHT_BOOST : 1,
  };
}

export default function FieldCanvas({
  live,
  intensity,
  scene,
  minkaStyle = "hamlet",
  reduced,
}: {
  live: boolean;
  intensity: number;
  /** Which post-recording epilogue plays. Drawn smooth here — §7 forbids
   *  counterfeiting the grain, so the fallback omits the dither, as it does
   *  for the blades. */
  scene: FieldScene;
  /** Which dwelling the minka/scene epilogues draw. */
  minkaStyle?: MinkaStyle;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const paletteRef = useRef<CanvasPalette | null>(null);
  // Growth and epilogue state lives in a ref, not the effect closure: `live`
  // is in the effect's deps, so the closure is torn down on every transition —
  // exactly the moment the recede and the epilogue need their history.
  const motionRef = useRef({
    startedAt: -1,
    grown: 0,
    growFrom: 0,
    growAt: 0,
    wasLive: false,
    stoppedAt: -1,
    epilogue: 0,
    epilogueFrom: 0,
  });

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

    const field = createField(BLADE_COUNT);
    const styles = Array.from({ length: BANDS }, (_, b) => bandStyle(b));
    const spreads = Array.from({ length: BANDS }, (_, b) => bandSpread(b));

    // Read once, and again only when the theme changes — never per frame.
    paletteRef.current = readCanvasPalette(canvas);
    const themeObserver = new MutationObserver(() => {
      paletteRef.current = readCanvasPalette(canvas);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // Eases the wheat toward whether a conversation is live. Mirrors FieldGL:
    // arriving reads as weather, leaving as settling, so withdrawal is slower.
    // The epilogue mirrors FieldGL too: only after a conversation ended in
    // this session, yielding quickly if a new one starts, skipped when reduced.
    // All of it reads and writes `motionRef`, which outlives this closure.
    const motion = motionRef.current;
    const liveProgress = (elapsed: number) => {
      if (live !== motion.wasLive) {
        motion.wasLive = live;
        motion.growFrom = motion.grown;
        motion.growAt = elapsed;
        if (live) {
          motion.epilogueFrom = motion.epilogue;
        } else {
          motion.stoppedAt = elapsed;
        }
      }
      const span = live ? INTRO_MS : 2200;
      const p = Math.min(1, Math.max(0, (elapsed - motion.growAt) / span));
      const eased = 1 - Math.pow(1 - p, 3);
      motion.grown = motion.growFrom + ((live ? 1 : 0) - motion.growFrom) * eased;

      if (scene === "off") {
        motion.epilogue = 0;
      } else if (live) {
        motion.epilogue =
          motion.epilogueFrom * (1 - Math.min(1, (elapsed - motion.growAt) / EPILOGUE.interruptMs));
      } else if (motion.stoppedAt >= 0) {
        motion.epilogue = epilogueAt(elapsed - motion.stoppedAt);
      }
      return motion.grown;
    };

    const draw = (elapsed: number) => {
      const ctx = canvas.getContext("2d");
      const palette = paletteRef.current;
      if (!ctx || !palette) return;
      const colors = palette.colors;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The wheat follows `live`; the world below does not.
      const grow = reduced ? (live ? 1 : 0) : liveProgress(elapsed);
      const time = reduced ? 0 : elapsed / 1000;
      const pointer = reduced ? null : pointerRef.current;
      const parallax = pointer ? (pointer.x / width - 0.5) * 2 : 0;

      // The world: sky warming toward the horizon, and earth below it. No
      // dither — ordered dithering per pixel is not affordable here, and §7 is
      // explicit that faking the grain with noise looks cheap rather than
      // intentional. Better to omit the texture than to counterfeit it.
      const horizonY = HORIZON * height;

      // The epilogue's cleared sky (scenes "sky" and "scene"): a slate-blue
      // wash blooming from the top of the frame down toward the horizon,
      // behind the warm light, which keeps the horizon.
      if (motion.epilogue > 0.001 && (scene === "sky" || scene === "scene")) {
        const bloom = ctx.createLinearGradient(0, 0, 0, horizonY);
        bloom.addColorStop(0, rgbToCss(SKY_BLUE));
        // Fade to the *same* blue at zero alpha — "transparent" interpolates
        // through transparent black and would grey the wash on paper.
        const to255 = (v: number) => Math.round(v * 255);
        bloom.addColorStop(
          1,
          `rgba(${to255(SKY_BLUE[0])}, ${to255(SKY_BLUE[1])}, ${to255(SKY_BLUE[2])}, 0)`
        );
        ctx.globalAlpha =
          Math.min(SKY_BLOOM_ALPHA * palette.skyBoost, 0.5) * motion.epilogue * intensity;
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, width, horizonY);
      }

      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, "transparent");
      sky.addColorStop(1, colors[BANDS - 1]);
      ctx.globalAlpha = (0.1 + 0.05 * grow) * intensity;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, horizonY);

      const earth = ctx.createLinearGradient(0, horizonY, 0, height);
      earth.addColorStop(0, colors[BANDS - 1]);
      earth.addColorStop(1, "transparent");
      ctx.globalAlpha = (0.09 + 0.05 * grow) * intensity;
      ctx.fillStyle = earth;
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // The epilogue's distant dwelling (scenes "minka" and "scene"): drawn
      // from the same half-width functions as the shader, sampled into a
      // path so every style — including the concave irimoya sweep — is the
      // same shape in both renderers. Smooth fade here; never counterfeit
      // grain.
      if (motion.epilogue > 0.001 && (scene === "minka" || scene === "scene")) {
        const cx = MINKA.x * width;
        const top =
          minkaStyle === "gassho"
            ? MINKA.gasshoBodyH + MINKA.gasshoH
            : MINKA.bodyH + MINKA.hipH + MINKA.gableH + MINKA.capH;
        const steps = 36;

        ctx.globalAlpha = 0.45 * motion.epilogue * intensity;
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        // Up the right side, across the top, down the left.
        for (let i = 0; i <= steps; i += 1) {
          const yy = (i / steps) * top;
          const hw = minkaHalfWidthAt(Math.min(yy, top - 1e-5), minkaStyle) * height;
          const py = horizonY - yy * height;
          if (i === 0) ctx.moveTo(cx + hw, py);
          else ctx.lineTo(cx + hw, py);
        }
        for (let i = steps; i >= 0; i -= 1) {
          const yy = (i / steps) * top;
          const hw = minkaHalfWidthAt(Math.min(yy, top - 1e-5), minkaStyle) * height;
          ctx.lineTo(cx - hw, horizonY - yy * height);
        }
        ctx.closePath();
        ctx.fill();

        if (minkaStyle === "hamlet") {
          // The kura storehouse.
          const kx = cx + MINKA.kuraDx * height;
          const kTop = MINKA.kuraBodyH + MINKA.kuraRoofH;
          ctx.beginPath();
          for (let i = 0; i <= steps; i += 1) {
            const yy = (i / steps) * kTop;
            const hw = kuraHalfWidthAt(Math.min(yy, kTop - 1e-5)) * height;
            const py = horizonY - yy * height;
            if (i === 0) ctx.moveTo(kx + hw, py);
            else ctx.lineTo(kx + hw, py);
          }
          for (let i = steps; i >= 0; i -= 1) {
            const yy = (i / steps) * kTop;
            const hw = kuraHalfWidthAt(Math.min(yy, kTop - 1e-5)) * height;
            ctx.lineTo(kx - hw, horizonY - yy * height);
          }
          ctx.closePath();
          ctx.fill();

          // The lone tree: canopy fainter than the buildings — grown, not built.
          const tx = cx + MINKA.treeDx * height;
          ctx.fillRect(
            tx - MINKA.trunkHalf * height,
            horizonY - MINKA.trunkH * height,
            MINKA.trunkHalf * 2 * height,
            MINKA.trunkH * height
          );
          ctx.globalAlpha = 0.34 * motion.epilogue * intensity;
          ctx.beginPath();
          ctx.ellipse(
            tx,
            horizonY - MINKA.treeCy * height,
            MINKA.treeRx * height,
            MINKA.treeRy * height,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      // The epilogue's birds (scene "scene" only): a few distant "v" strokes
      // crossing the cleared sky right to left, wingbeat as a slow flex. Same
      // positions as the shader's specks, from the same BIRDS constants.
      if (motion.epilogue > 0.001 && scene === "scene" && !reduced) {
        ctx.strokeStyle = colors[0];
        ctx.globalAlpha = 0.5 * motion.epilogue * intensity;
        ctx.lineWidth = 1;
        for (let i = 0; i < BIRDS.count; i += 1) {
          const phase = (i * 0.618 + 0.21) % 1;
          const bx = (1.1 - ((time * BIRDS.speed + phase) % 1) * 1.2) * width;
          const byTop = BIRDS.yMin + ((phase * 7.31) % 1) * (BIRDS.yMax - BIRDS.yMin);
          const by = byTop * height + Math.sin(time * 0.7 + i) * 0.006 * height;
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
      ctx.globalAlpha = 0.22 * intensity;
      ctx.fillStyle = line;
      ctx.fillRect(0, horizonY, width, 1);

      ctx.globalAlpha = 1;
      ctx.lineCap = "round";

      if (grow <= 0.001) {
        ctx.globalAlpha = 1;
        return;
      }
      const intro = grow;

      // Far to near, so nearer blades overlap the ones behind them.
      for (let band = 0; band < BANDS; band += 1) {
        const style = styles[band];
        const range = field.bands[band];
        ctx.strokeStyle = colors[band];
        ctx.lineWidth = style.width;

        for (let i = range.start; i < range.start + range.count; i += 1) {
          const blade = field.blades[i];
          const growth = growthAt(blade, intro);
          if (growth <= 0) continue;

          const bladeHeight =
            style.height * (0.86 + blade.spread * 0.28) * height * blade.height * growth;
          if (bladeHeight < 1.5) continue;

          const baseX = blade.x * width + parallax * style.parallax;
          const baseY = (style.baseY + blade.spread * spreads[band]) * height;

          let bend = windAt(blade, time, growth) * bladeHeight * style.windScale * 0.3;

          if (pointer) {
            const dx = baseX - pointer.x;
            const dy = baseY - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < POINTER_RADIUS) {
              const push = (1 - distance / POINTER_RADIUS) ** 2;
              bend += (dx >= 0 ? 1 : -1) * push * bladeHeight * 0.55;
            }
          }

          ctx.globalAlpha = style.alpha * growth * intensity;
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

      ctx.globalAlpha = 1;
    };

    if (reduced) {
      draw(INTRO_MS);
      return () => themeObserver.disconnect();
    }

    let raf = 0;
    // One clock for the component's whole life: the effect re-runs on every
    // `live` transition, and a clock that restarted at zero would invalidate
    // the growAt/stoppedAt timestamps `motionRef` carries across runs.
    if (motion.startedAt < 0) motion.startedAt = performance.now();
    const startedAt = motion.startedAt;
    let lastFrame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      draw(now - startedAt);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
    };
  }, [live, intensity, scene, minkaStyle, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
