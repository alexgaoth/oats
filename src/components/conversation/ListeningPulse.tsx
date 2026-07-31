import { cn } from "../lib/utils";

// The listening pulse (DESIGN.md §9.1) — the most important visual in the
// product. A husked-oat seed that breathes while a session is live.
//
// At `lg` it is also the record control itself: the seed you press is the seed
// that starts breathing, so there is one object with two states rather than a
// button and an unrelated indicator sitting next to each other.
//
// Never a red dot, never a "REC" chip, never a banner the other person could
// read. Idle is a static gold seed; paused is husk-grey and still.
// `prefers-reduced-motion` drops the breath globally (see index.css) and leaves
// the static seed, which is exactly the intended fallback.

type PulseState = "idle" | "live" | "paused";
type PulseSize = "sm" | "lg";

const RING = {
  sm: "h-10 w-10",
  lg: "h-24 w-24",
} as const;

const SEED = {
  sm: "",
  lg: "oats-seed--lg",
} as const;

export default function ListeningPulse({
  state,
  size = "sm",
  className,
  label,
}: {
  state: PulseState;
  size?: PulseSize;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "oats-listening-pulse",
          RING[size],
          size === "lg" && "oats-listening-pulse--lg",
          state !== "live" && "before:hidden"
        )}
      >
        <span
          className={cn("oats-seed", SEED[size])}
          style={state === "paused" ? { background: "var(--color-muted-foreground)" } : undefined}
        />
      </span>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </span>
  );
}
