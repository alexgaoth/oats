import { useEffect, useRef } from "react";
import {
  BANDS,
  EPILOGUE,
  HORIZON,
  INTRO_MS,
  MINKA,
  POINTER_RADIUS,
  SKY_BLOOM_ALPHA,
  SKY_BLUE,
  bandSpread,
  bandStyle,
  createField,
  epilogueAt,
  growthAt,
  mixRgb,
  parseHexColor,
  rgbToCss,
  windAt,
  type FieldScene,
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

function readBandColors(element: HTMLElement): string[] {
  const styles = getComputedStyle(element);
  const gold = parseHexColor(styles.getPropertyValue("--color-primary")) ?? FALLBACK_GOLD;
  const haze = parseHexColor(styles.getPropertyValue("--color-muted-foreground")) ?? FALLBACK_HAZE;
  return Array.from({ length: BANDS }, (_, band) =>
    rgbToCss(mixRgb(haze, gold, bandStyle(band).goldMix))
  );
}

export default function FieldCanvas({
  live,
  intensity,
  scene,
  reduced,
}: {
  live: boolean;
  intensity: number;
  /** Which post-recording epilogue plays. Drawn smooth here — §7 forbids
   *  counterfeiting the grain, so the fallback omits the dither, as it does
   *  for the blades. */
  scene: FieldScene;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const colorsRef = useRef<string[] | null>(null);

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
    colorsRef.current = readBandColors(canvas);
    const themeObserver = new MutationObserver(() => {
      colorsRef.current = readBandColors(canvas);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // Eases the wheat toward whether a conversation is live. Mirrors FieldGL:
    // arriving reads as weather, leaving as settling, so withdrawal is slower.
    let grown = live ? 1 : 0;
    let growFrom = grown;
    let growAt = 0;
    let wasLive = live;
    // The epilogue mirrors FieldGL too: only after a conversation ended in
    // this session, yielding quickly if a new one starts, skipped when reduced.
    let stoppedAt = -1;
    let epilogue = 0;
    let epilogueFrom = 0;
    const liveProgress = (elapsed: number) => {
      if (live !== wasLive) {
        wasLive = live;
        growFrom = grown;
        growAt = elapsed;
        if (live) {
          epilogueFrom = epilogue;
        } else {
          stoppedAt = elapsed;
        }
      }
      const span = live ? INTRO_MS : 2200;
      const p = Math.min(1, Math.max(0, (elapsed - growAt) / span));
      const eased = 1 - Math.pow(1 - p, 3);
      grown = growFrom + ((live ? 1 : 0) - growFrom) * eased;

      if (scene === "off") {
        epilogue = 0;
      } else if (live) {
        epilogue = epilogueFrom * (1 - Math.min(1, (elapsed - growAt) / EPILOGUE.interruptMs));
      } else if (stoppedAt >= 0) {
        epilogue = epilogueAt(elapsed - stoppedAt);
      }
      return grown;
    };

    const draw = (elapsed: number) => {
      const ctx = canvas.getContext("2d");
      const colors = colorsRef.current;
      if (!ctx || !colors) return;

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
      if (epilogue > 0.001 && (scene === "sky" || scene === "scene")) {
        const bloom = ctx.createLinearGradient(0, 0, 0, horizonY);
        bloom.addColorStop(0, rgbToCss(SKY_BLUE));
        // Fade to the *same* blue at zero alpha — "transparent" interpolates
        // through transparent black and would grey the wash on paper.
        const to255 = (v: number) => Math.round(v * 255);
        bloom.addColorStop(
          1,
          `rgba(${to255(SKY_BLUE[0])}, ${to255(SKY_BLUE[1])}, ${to255(SKY_BLUE[2])}, 0)`
        );
        ctx.globalAlpha = SKY_BLOOM_ALPHA * epilogue * intensity;
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

      // The epilogue's distant minka (scenes "minka" and "scene"): a farmhouse
      // silhouette on the horizon, drawn from the same geometry as the shader
      // (minkaHalfWidthAt). Smooth fade here — the fallback never counterfeits
      // the grain the GPU path condenses it from.
      if (epilogue > 0.001 && (scene === "minka" || scene === "scene")) {
        const cx = MINKA.x * width;
        const eaveY = horizonY - MINKA.bodyH * height;
        const ridgeY = horizonY - (MINKA.bodyH + MINKA.roofH) * height;
        const bodyPx = MINKA.bodyHalf * height;
        const eavePx = (MINKA.bodyHalf + MINKA.eave) * height;
        const ridgePx = MINKA.ridgeHalf * height;

        ctx.globalAlpha = 0.45 * epilogue * intensity;
        ctx.fillStyle = colors[0];
        ctx.beginPath();
        ctx.moveTo(cx - bodyPx, horizonY);
        ctx.lineTo(cx - bodyPx, eaveY);
        ctx.lineTo(cx - eavePx, eaveY);
        ctx.lineTo(cx - ridgePx, ridgeY);
        ctx.lineTo(cx + ridgePx, ridgeY);
        ctx.lineTo(cx + eavePx, eaveY);
        ctx.lineTo(cx + bodyPx, eaveY);
        ctx.lineTo(cx + bodyPx, horizonY);
        ctx.closePath();
        ctx.fill();
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
    const startedAt = performance.now();
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
  }, [live, intensity, scene, reduced]);

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
