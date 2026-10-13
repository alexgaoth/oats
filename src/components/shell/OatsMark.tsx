import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { SPIN_MS, tossFrame } from "../../helpers/oatsMarkMotion.mjs";
import { AT_REST, paintGrain, type GrainPose } from "./grainCanvas";

/**
 * The Oats symbol: a plump honey oat grain, shaded as a small 3D object and
 * dithered like the rest of the oat world.
 *
 * It is the same in light and dark mode. It has no tile behind it: the old
 * mark was a tile filled with the foreground colour, so it turned black on the
 * light app and white on the dark one, the opposite of the app every time.
 *
 * Its shading is ordered dither over a few honey tones, on device pixels, as
 * the field's sky is (`grainCanvas.ts`). A smooth gradient with a bright
 * highlight read as a glow beside everything else in the app.
 *
 * It flips. A grain is nearly round about its long axis, so turning it that
 * way changes nothing but the crease: at sidebar size the first version's roll
 * read as no animation at all. So the spin is a toss instead. The grain hops,
 * tumbles end over end twice, and lands with a small squash. Tumbling
 * foreshortens it towards its end-on shape, and its crease turns away and comes
 * back, which is what reads as a solid object turning. The light stays where
 * it is. It runs once when the app first comes into view (`spinOnLaunch`) and
 * when the mark is clicked (`interactive`), and not at all under
 * prefers-reduced-motion.
 */

let launchSpun = false;

export function OatsMark({
  className,
  spinOnLaunch = false,
  spinOnMount = false,
  interactive = false,
  shadow = false,
  label = "Oats",
}: {
  className?: string;
  /** Toss once, the first time any mark with this set is seen after launch. */
  spinOnLaunch?: boolean;
  /** Toss every time this mark appears (a loading screen, a welcome). */
  spinOnMount?: boolean;
  /** Render as a button that tosses the grain when clicked. */
  interactive?: boolean;
  /** A soft contact shadow under the grain, for large sizes. */
  shadow?: boolean;
  /** The accessible name when `interactive`. */
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pose = useRef<GrainPose>(AT_REST);
  const frame = useRef(0);

  const paint = useCallback(
    (next?: GrainPose) => {
      if (next) pose.current = next;
      const canvas = canvasRef.current;
      if (!canvas?.width || !canvas.height) return;
      // Every frame is read back to be dithered, so keep the pixels in memory.
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) paintGrain(context, canvas.width, canvas.height, pose.current, shadow);
    },
    [shadow]
  );

  // One canvas pixel per device pixel, at every size and pixel ratio, so each
  // dither dot is one device pixel. Watching the device-pixel box also reports
  // a move to a display with another ratio. The size itself comes from the
  // ratio: the device-pixel box ignores an emulated one (DevTools, headless).
  // Resizing clears the canvas, so it is painted again, before the next frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = (width: number, height: number) => {
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      paint();
    };
    fit(canvas.clientWidth, canvas.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      fit(entry.contentRect.width, entry.contentRect.height)
    );
    try {
      observer.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(canvas);
    }
    return () => observer.disconnect();
  }, [paint]);

  const spin = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / SPIN_MS);
      paint(tossFrame(p));
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => {
    paint(AT_REST);
    let timer = 0;
    let unsubscribe: (() => void) | undefined;
    const toss = (delay: number) => {
      timer = window.setTimeout(spin, delay);
    };
    if (spinOnMount) {
      toss(120);
    } else if (spinOnLaunch && !launchSpun) {
      // Once per launch, and only when somebody can see it: the window can
      // open hidden, and a toss nobody saw is the animation never happening.
      const api = window.electronAPI;
      const firstLook = () => {
        if (launchSpun) return;
        launchSpun = true;
        toss(350);
      };
      if (!api?.getWindowVisibility) {
        firstLook();
      } else {
        unsubscribe = api.onWindowVisibility?.((visible: boolean) => {
          if (visible) firstLook();
        });
        api
          .getWindowVisibility()
          .then((visible: boolean) => {
            if (visible) firstLook();
          })
          .catch(() => firstLook());
      }
    }
    return () => {
      window.clearTimeout(timer);
      unsubscribe?.();
      cancelAnimationFrame(frame.current);
    };
  }, [paint, spin, spinOnLaunch, spinOnMount]);

  const canvas = (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        // Nearest neighbour if the box ever lands between device pixels, so
        // the dither stays dots rather than blurring.
        "shrink-0 [image-rendering:pixelated]",
        interactive ? "size-full" : cn("size-5", className)
      )}
    />
  );

  if (!interactive) return canvas;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={spin}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      {canvas}
    </button>
  );
}
