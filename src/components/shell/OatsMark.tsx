import { useCallback, useEffect, useId, useRef } from "react";
import { cn } from "../lib/utils";
import { HOP, SPIN_MS, tossFrame, tumbleHeight } from "../../helpers/oatsMarkMotion.mjs";

/**
 * The Oats symbol: a plump honey oat grain, shaded as a small 3D object.
 *
 * It is the same in light and dark mode. It has no tile behind it: the old
 * mark was a tile filled with the foreground colour, so it turned black on the
 * light app and white on the dark one, the opposite of the app every time.
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

// The grain in a 1024 box: centred, 688 tall, 480 wide at its widest.
const CX = 512;
const CY = 512;
const HALF_HEIGHT = 344;
const HALF_WIDTH = 240;
const OUTLINE =
  "M512 168 C584 168 752 326 752 512 C752 700 588 856 512 856 C436 856 272 700 272 512 C272 326 440 168 512 168 Z";
/** The tilt that gives it some life. */
const TILT = -18;
/** Where the crease sits, as an angle round the long axis (0 is the middle). */
const REST = 0.34;
const GROOVE_FROM = 252;
const GROOVE_TO = 772;
/** The crease at its resting place: its path, and its catch-light lip. */
function groove(theta: number): { d: string; lip: string } {
  const across = Math.sin(theta);
  const facing = Math.cos(theta);
  const points: [number, number][] = [];
  for (let i = 0; i <= 16; i += 1) {
    const y = GROOVE_FROM + ((GROOVE_TO - GROOVE_FROM) * i) / 16;
    const t = (y - CY) / HALF_HEIGHT;
    const radius = HALF_WIDTH * Math.sqrt(Math.max(0, 1 - t * t));
    points.push([CX + radius * across, y]);
  }
  const path = (shift: number) =>
    points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${(x + shift).toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
  // The lip catches the light, which comes from the upper left.
  return { d: path(0), lip: path(-13 * Math.max(0, facing)) };
}

const REST_GROOVE = groove(REST);

/** 0 when the crease faces away, 1 once it faces us properly. */
function visibility(facing: number) {
  const x = Math.min(1, Math.max(0, facing / 0.35));
  return x * x * (3 - 2 * x);
}

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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const grooveRef = useRef<SVGPathElement | null>(null);
  const lipRef = useRef<SVGPathElement | null>(null);
  const bodyRef = useRef<SVGGElement | null>(null);
  const tiltRef = useRef<SVGGElement | null>(null);
  const tumbleRef = useRef<SVGGElement | null>(null);
  const groundRef = useRef<SVGEllipseElement | null>(null);
  const frame = useRef(0);

  const paint = useCallback((phi: number, hop = 0, squash = 0, lean = 0) => {
    // The crease is on the front: it turns away as the grain tumbles over.
    const seen = visibility(Math.cos(phi));
    grooveRef.current?.setAttribute("opacity", (0.55 * seen).toFixed(3));
    lipRef.current?.setAttribute("opacity", (0.55 * seen).toFixed(3));
    tumbleRef.current?.setAttribute(
      "transform",
      `translate(${CX} ${CY}) scale(1 ${tumbleHeight(phi).toFixed(4)}) translate(${-CX} ${-CY})`
    );
    tiltRef.current?.setAttribute("transform", `rotate(${(TILT + lean).toFixed(2)} ${CX} ${CY})`);
    if (bodyRef.current) {
      // A small squash where it lands, from the bottom of the grain.
      const sx = 1 + 0.06 * squash;
      const sy = 1 - 0.08 * squash;
      bodyRef.current.setAttribute(
        "transform",
        `translate(0 ${(-hop).toFixed(1)}) translate(512 880) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-512 -880)`
      );
    }
    if (groundRef.current) {
      // The shadow shrinks and fades while the grain is in the air.
      const lift = Math.min(1, hop / HOP);
      groundRef.current.setAttribute(
        "transform",
        `translate(512 920) scale(${(1 - 0.35 * lift).toFixed(3)}) translate(-512 -920)`
      );
      groundRef.current.setAttribute("opacity", (1 - 0.55 * lift).toFixed(3));
    }
  }, []);

  const spin = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / SPIN_MS);
      const { phi, hop, squash, lean } = tossFrame(p);
      paint(phi, hop, squash, lean);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => {
    paint(0);
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

  const svg = (
    <svg
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className={cn(
        "shrink-0 overflow-visible",
        interactive ? "size-full" : cn("size-5", className)
      )}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Honey, lit from the upper left. Softer than the first version:
            its near-white top and bright spot read as plastic. */}
        <radialGradient id={`${uid}-body`} cx="0.36" cy="0.26" r="0.84" fx="0.33" fy="0.22">
          <stop offset="0" stopColor="#FCD27C" />
          <stop offset="0.36" stopColor="#F7B53A" />
          <stop offset="0.72" stopColor="#EC9810" />
          <stop offset="1" stopColor="#A9590A" />
        </radialGradient>
        <linearGradient id={`${uid}-shade`} x1="0.15" y1="0.1" x2="0.95" y2="0.92">
          <stop offset="0.45" stopColor="#7A3A00" stopOpacity="0" />
          <stop offset="1" stopColor="#7A3A00" stopOpacity="0.34" />
        </linearGradient>
        <radialGradient id={`${uid}-spec`}>
          <stop offset="0" stopColor="#FFF4DC" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FFF4DC" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-ground`}>
          <stop offset="0" stopColor="#3A1C00" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3A1C00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-bounce`} x1="0" y1="1" x2="0.75" y2="0.25">
          <stop offset="0" stopColor="#FFE9B8" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#FFE9B8" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      {shadow && (
        <ellipse ref={groundRef} cx="512" cy="920" rx="236" ry="36" fill={`url(#${uid}-ground)`} />
      )}
      <g ref={bodyRef}>
        <g ref={tiltRef} transform={`rotate(${TILT} ${CX} ${CY})`}>
          <g ref={tumbleRef}>
            <path d={OUTLINE} fill={`url(#${uid}-body)`} />
            <path d={OUTLINE} fill={`url(#${uid}-shade)`} />
            <g clipPath={`url(#${uid}-clip)`}>
              {/* Light bounced back onto the lower edge: the depth cue that
                  makes it read as a soft object rather than a flat shape. */}
              <path d={OUTLINE} fill="none" stroke={`url(#${uid}-bounce)`} strokeWidth="44" />
              <g filter={`url(#${uid}-soft)`}>
                <path
                  ref={grooveRef}
                  d={REST_GROOVE.d}
                  fill="none"
                  stroke="#9A4F05"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={30}
                  opacity={0.55}
                />
                <path
                  ref={lipRef}
                  d={REST_GROOVE.lip}
                  fill="none"
                  stroke="#FFE2A0"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={10}
                  opacity={0.55}
                />
              </g>
              <ellipse
                cx="420"
                cy="324"
                rx="56"
                ry="92"
                transform="rotate(-22 420 324)"
                fill={`url(#${uid}-spec)`}
              />
              <circle cx="402" cy="290" r="11" fill="#FFF6E2" opacity="0.38" />
              {/* A faint rim inside the edge, so the grain holds its shape on a
                  light page without a halo outside it. */}
              <path
                d={OUTLINE}
                fill="none"
                stroke="#7A3A00"
                strokeOpacity="0.28"
                strokeWidth="12"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );

  if (!interactive) return svg;
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
      {svg}
    </button>
  );
}
