import { useCallback, useEffect, useId, useRef } from "react";
import { cn } from "../lib/utils";

/**
 * The Oats symbol: a plump honey oat grain, shaded as a small 3D object.
 *
 * It is the same in light and dark mode. It has no tile behind it: the old
 * mark was a tile filled with the foreground colour, so it turned black on the
 * light app and white on the dark one, the opposite of the app every time.
 *
 * It can spin. A grain is round about its long axis, so spinning it on that
 * axis leaves its outline where it is: only the groove travels across the
 * surface, and the light stays put. Drawing exactly that reads as a real roll,
 * where turning a flat shape like a coin would not. The spin runs once when
 * the app starts (`spinOnLaunch`) and when the mark is clicked
 * (`interactive`), and not at all under prefers-reduced-motion.
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
/** Where the groove rests, as an angle round the long axis (0 is the middle). */
const REST = 0.34;
const GROOVE_FROM = 252;
const GROOVE_TO = 772;
const SPIN_MS = 1200;
/** Two full turns. */
const SPIN_TURNS = 2;

/** The groove at angle `theta`: its path, and how directly it faces us. */
function groove(theta: number): { d: string; lip: string; facing: number } {
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
  return { d: path(0), lip: path(-13 * Math.max(0, facing)), facing };
}

/** 0 when the groove is round the back, 1 once it faces us properly. */
function visibility(facing: number) {
  const x = Math.min(1, Math.max(0, facing / 0.35));
  return x * x * (3 - 2 * x);
}

function easeInOutCubic(p: number) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
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
  /** Spin once, the first time any mark with this set appears after launch. */
  spinOnLaunch?: boolean;
  /** Spin every time this mark appears (a loading screen, a welcome). */
  spinOnMount?: boolean;
  /** Render as a button that spins when clicked. */
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
  const frame = useRef(0);

  const paint = useCallback((theta: number, hop = 0, squash = 0) => {
    const { d, lip, facing } = groove(theta);
    const seen = visibility(facing);
    const width = 0.35 + 0.65 * Math.abs(facing);
    if (grooveRef.current) {
      grooveRef.current.setAttribute("d", d);
      grooveRef.current.setAttribute("opacity", (0.62 * seen).toFixed(3));
      grooveRef.current.setAttribute("stroke-width", (30 * width).toFixed(1));
    }
    if (lipRef.current) {
      lipRef.current.setAttribute("d", lip);
      lipRef.current.setAttribute("opacity", (0.75 * seen).toFixed(3));
      lipRef.current.setAttribute("stroke-width", (10 * width).toFixed(1));
    }
    if (bodyRef.current) {
      // A hop while it spins, and a small squash where it lands.
      const sx = 1 + 0.05 * squash;
      const sy = 1 - 0.07 * squash;
      bodyRef.current.setAttribute(
        "transform",
        `translate(0 ${(-hop).toFixed(1)}) translate(512 880) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-512 -880)`
      );
    }
  }, []);

  const spin = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / SPIN_MS);
      const theta = REST + SPIN_TURNS * 2 * Math.PI * easeInOutCubic(p);
      const hop = p < 0.72 ? 70 * Math.sin((Math.PI * p) / 0.72) : 0;
      const squash = p >= 0.72 && p < 0.92 ? Math.sin((Math.PI * (p - 0.72)) / 0.2) : 0;
      paint(theta, hop, squash);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => {
    paint(REST);
    const wanted = spinOnMount || (spinOnLaunch && !launchSpun);
    if (!wanted) return () => cancelAnimationFrame(frame.current);
    if (spinOnLaunch) launchSpun = true;
    const timer = window.setTimeout(spin, 250);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [paint, spin, spinOnLaunch, spinOnMount]);

  const rest = groove(REST);
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
        <radialGradient id={`${uid}-body`} cx="0.36" cy="0.26" r="0.82" fx="0.32" fy="0.2">
          <stop offset="0" stopColor="#FFE6A8" />
          <stop offset="0.32" stopColor="#FBBE45" />
          <stop offset="0.68" stopColor="#F5A30F" />
          <stop offset="1" stopColor="#B9610A" />
        </radialGradient>
        <linearGradient id={`${uid}-shade`} x1="0.15" y1="0.1" x2="0.95" y2="0.92">
          <stop offset="0.45" stopColor="#7A3A00" stopOpacity="0" />
          <stop offset="1" stopColor="#7A3A00" stopOpacity="0.32" />
        </linearGradient>
        <radialGradient id={`${uid}-spec`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-ground`}>
          <stop offset="0" stopColor="#3A1C00" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3A1C00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-bounce`} x1="0" y1="1" x2="0.75" y2="0.25">
          <stop offset="0" stopColor="#FFF1CF" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#FFF1CF" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      {shadow && <ellipse cx="512" cy="920" rx="236" ry="36" fill={`url(#${uid}-ground)`} />}
      <g ref={bodyRef}>
        <g transform={`rotate(${TILT} ${CX} ${CY})`}>
          <path d={OUTLINE} fill={`url(#${uid}-body)`} />
          <path d={OUTLINE} fill={`url(#${uid}-shade)`} />
          <g clipPath={`url(#${uid}-clip)`}>
            {/* Light bounced back onto the lower edge: the depth cue that makes
                it read as a soft object rather than a flat shape. */}
            <path d={OUTLINE} fill="none" stroke={`url(#${uid}-bounce)`} strokeWidth="44" />
            <g filter={`url(#${uid}-soft)`}>
              <path
                ref={grooveRef}
                d={rest.d}
                fill="none"
                stroke="#9A4F05"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={30}
                opacity={0.62}
              />
              <path
                ref={lipRef}
                d={rest.lip}
                fill="none"
                stroke="#FFE7AE"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={10}
                opacity={0.75}
              />
            </g>
            <ellipse
              cx="418"
              cy="318"
              rx="64"
              ry="108"
              transform="rotate(-22 418 318)"
              fill={`url(#${uid}-spec)`}
            />
            <circle cx="398" cy="282" r="17" fill="#FFFFFF" opacity="0.85" />
            {/* A faint rim inside the edge, so the grain holds its shape on a
                light page without a halo outside it. */}
            <path d={OUTLINE} fill="none" stroke="#7A3A00" strokeOpacity="0.28" strokeWidth="12" />
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
