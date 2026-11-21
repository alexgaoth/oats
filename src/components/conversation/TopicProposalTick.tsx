import { useState, type CSSProperties } from "react";
import { cn } from "../lib/utils";

export type ProposalTick = {
  id: string;
  x: number;
  state: "grey" | "faded";
  since: number;
};

/** One quiet tick, with a compositor fade. A remount cannot replay the fade. */
export function TopicProposalTick({
  tick,
  className,
  style,
}: {
  tick: ProposalTick;
  className?: string;
  style?: CSSProperties;
}) {
  // The parent keys by state, so this offset is captured once at the fade.
  const [age] = useState(() => Math.max(0, Date.now() - tick.since));
  const faded = tick.state === "faded";
  if (faded && age >= 600) return null;
  return (
    <span
      aria-hidden="true"
      data-topic-proposal={tick.state}
      className={cn(
        "pointer-events-none absolute h-1 w-px bg-muted-foreground",
        faded && "animate-out fade-out fill-mode-forwards duration-[600ms] motion-reduce:hidden",
        className
      )}
      style={{
        left: `${tick.x * 100}%`,
        animationDelay: faded ? `${-age}ms` : undefined,
        ...style,
      }}
    />
  );
}
