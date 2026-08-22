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
  const getTrackClasses = () => {
    if (disabled) {
      return checked ? "bg-foreground/30" : "bg-muted";
    }
    // Ink, not gold. DESIGN.md §3 allows exactly one accent on screen and spends
    // it on the live pulse and the single primary action — a settings toggle is
    // neither, and Settings previously showed two golds at once.
    // The **off** state has to be visible too, and the track is what says
    // "switch".
    //
    // It was `bg-muted-foreground/30` at 1.50:1 against paper. Replacing it
    // with a `border-hover` hairline did not help: that token is also 1.50:1
    // in light and 1.72:1 in dark, so the measurement did not move and only
    // the knob became visible — leaving a dark dot floating with no perceptible
    // track, on the switch that decides whether question text leaves the
    // device. `muted-foreground` is the husk token and clears SC 1.4.11's 3:1
    // in both modes (5.19:1 on paper, 6.33:1 on charcoal).
    return checked
      ? "bg-foreground hover:bg-foreground/90 border border-foreground"
      : "border border-muted-foreground bg-surface-1 hover:bg-surface-2 dark:bg-surface-raised";
  };

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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${getTrackClasses()} ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-150 ${
          checked ? "translate-x-6" : "translate-x-1"
        } ${disabled ? "bg-muted-foreground/50" : checked ? "bg-background shadow-sm" : "bg-muted-foreground shadow-sm"}`}
      />
    </button>
  );
};
