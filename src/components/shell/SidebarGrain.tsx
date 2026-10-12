import { useId } from "react";

/**
 * The sidebar's texture: oat grains, scattered and faded.
 *
 * The oat world dressing the frame, never the content (DESIGN.md §2, "Alive,
 * not busy"). One tile of nine grains, each in its own cell of a 3 x 3 grid
 * with some jitter, so they spread evenly without looking set out on a grid.
 * The browser paints it once as a pattern: nothing animates, and it costs
 * nothing after the first paint. Light mode draws the grains as a faint brown
 * shadow, dark mode as a faint honey light.
 */

const TILE = 150;

const GRAINS = (() => {
  let seed = 7;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cell = TILE / 3;
  return Array.from({ length: 9 }, (_, index) => ({
    x: (index % 3) * cell + cell / 2 + (next() - 0.5) * cell * 0.6,
    y: Math.floor(index / 3) * cell + cell / 2 + (next() - 0.5) * cell * 0.6,
    angle: Math.round(next() * 360),
    scale: 0.8 + next() * 0.5,
  }));
})();

export function SidebarGrain() {
  const id = `oats-grain-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 size-full text-[#6b4210] opacity-[0.07] dark:text-[#f5b544] dark:opacity-[0.08]"
    >
      <defs>
        <pattern id={id} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          {GRAINS.map((grain, index) => (
            <ellipse
              key={index}
              rx="4.4"
              ry="7.8"
              fill="currentColor"
              transform={`translate(${grain.x.toFixed(1)} ${grain.y.toFixed(1)}) rotate(${grain.angle}) scale(${grain.scale.toFixed(2)})`}
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
