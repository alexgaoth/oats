import * as React from "react";

import { cn } from "../lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * A choice between a few options, drawn as a segmented control (the macOS and
 * shadcn idiom for "one of these"). It is a radio group to assistive tech.
 */
function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  "aria-label"?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
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
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("inline-flex h-9 items-center rounded-lg bg-muted p-[3px]", className)}
    >
      {options.map((option, position) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[position] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={position === index ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-full cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium",
              "transition-[color,background-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? "bg-background text-foreground shadow-sm dark:bg-input/40"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
