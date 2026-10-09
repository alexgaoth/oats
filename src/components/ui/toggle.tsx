import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Required where the toggle is the only control in its row. */
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export const Toggle = ({
  checked,
  onChange,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ToggleProps) => {
  // shadcn/ui switch: ink when on, the input tone when off, so both states
  // read as a switch in both modes.
  const track = checked ? "bg-primary" : "bg-input dark:bg-input/80";

  return (
    // `role="switch"` with `aria-checked`, because knob position and track
    // colour are the only other places the state exists. Without this a screen
    // reader announces "button", unnamed and stateless — including for the one
    // control that governs whether question text ever leaves the device.
    //
    // The focus ring is full-strength: at `ring-ring/40` it measured 1.5:1
    // against paper, which is invisible to the person who needs it most.
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${track} ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform dark:bg-foreground ${
          checked ? "translate-x-[calc(100%-2px)] dark:bg-primary-foreground" : "translate-x-0"
        }`}
      />
    </button>
  );
};
