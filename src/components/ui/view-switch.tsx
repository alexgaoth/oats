import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";

export interface ViewSwitchOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** A small drawing of what this choice shows. */
  icon: LucideIcon;
}

/**
 * A choice that changes what you see, drawn with some character.
 *
 * DESIGN.md §2, "Character for the choices that matter": only the few choices
 * that change what the screen shows use this; every other choice is a plain
 * `SegmentedControl`. It behaves exactly like one (a radio group, one tab
 * stop, the arrow keys), but the choice is a honey indicator that slides to
 * it, and each option carries a drawing of its view whose parts arrive once
 * when you choose it. Nothing moves at rest, and nothing moves at all under
 * reduced motion (`.oats-view-*` in index.css).
 */
function ViewSwitch<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ViewSwitchOption<T>[];
  className?: string;
  "aria-label"?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const track = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{ left: number; width: number } | null>(null);
  // The first placement is not a slide: the indicator starts where it belongs.
  const [placed, setPlaced] = React.useState(false);
  // Only a choice the person made animates its drawing, never the first paint.
  const [chosen, setChosen] = React.useState<T | null>(null);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  React.useLayoutEffect(() => {
    const measure = () => {
      const button = refs.current[index];
      if (button) setBox({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    // Labels change width with the language and when the font arrives.
    const observer = new ResizeObserver(measure);
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
  }, [index, options.length]);

  React.useEffect(() => {
    if (box && !placed) setPlaced(true);
  }, [box, placed]);

  const choose = (next: number) => {
    setChosen(options[next].value);
    onValueChange(options[next].value);
  };

  // A radio group moves with the arrow keys and is one tab stop, as on macOS.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    choose(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex h-9 items-center rounded-lg bg-muted p-[3px] isolate",
        className
      )}
    >
      {box && (
        <span
          aria-hidden="true"
          className={cn(
            "oats-view-indicator absolute top-[3px] bottom-[3px] left-0 -z-10 rounded-md",
            !placed && "[transition:none]"
          )}
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
        />
      )}
      {options.map((option, position) => {
        const selected = position === index;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[position] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(position)}
            className={cn(
              "inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium",
              "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              // A new key when it is chosen replays the arrival of its parts.
              key={selected && chosen === option.value ? "chosen" : "rest"}
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0",
                selected && chosen === option.value && "oats-view-glyph"
              )}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { ViewSwitch };
