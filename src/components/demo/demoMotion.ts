/**
 * Whether the person asked the system for less motion. Read once, when a
 * piece appears (a lazy `useState`), so a piece does not change course while
 * it plays.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
