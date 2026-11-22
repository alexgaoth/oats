import { useCallback, useEffect, useState } from "react";
import type { TransitionEvent } from "react";

/**
 * Expand details and Hide details as one movement (DESIGN.md §5).
 *
 * The composition being left stays drawn while the change runs, so the contour
 * and the flow card can close in height and the question list can cross-fade,
 * instead of the old composition vanishing at the press. `settled` is the
 * composition last drawn alone. While it is not the chosen one, both are drawn,
 * and the first part that ends its opacity transition (`onTransitionEnd`, on an
 * element with `data-detail-part`) settles the change. A press during a change
 * turns it around from where it is: the composition it was heading for becomes
 * the one it leaves, and every transition reverses from its current value.
 *
 * Under reduced motion nothing lingers: the change is at once. If no part ends
 * a transition (an unseen window, the recording stopping mid-change), the
 * change settles after a second anyway, so a composition is never left drawn
 * under the other.
 */
export function useDetailChange(detailed: boolean) {
  const [settled, setSettled] = useState(detailed);
  const [chosen, setChosen] = useState(detailed);
  // Whether the change started from one composition drawn alone, rather than
  // by turning another change around.
  const [fromRest, setFromRest] = useState(true);
  if (chosen !== detailed) {
    // Adjusted while rendering, so the composition being left is never
    // dropped for one commit before it is drawn again.
    setChosen(detailed);
    setFromRest(settled === chosen);
    setSettled(prefersReducedMotion() ? detailed : chosen);
  }
  const changing = settled !== detailed;

  useEffect(() => {
    if (!changing) return undefined;
    const timer = window.setTimeout(() => setSettled(detailed), 1000);
    return () => window.clearTimeout(timer);
  }, [changing, detailed]);

  const onTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (event.propertyName !== "opacity" || !target.hasAttribute("data-detail-part")) return;
      setSettled(detailed);
    },
    [detailed]
  );

  return {
    /** A change is running: both compositions are drawn. */
    changing,
    /** The details are drawn: chosen, or closing. */
    drawDetails: detailed || settled,
    /** The plain view is drawn: chosen, or being left for the details. */
    drawClean: !detailed || !settled,
    /**
     * The details' tabs come out of hiding: they stay mounted in the plain
     * view (the question rail announces from them), so they fade in by an
     * animation, not from a starting style. A turn-around reverses their
     * transition instead.
     */
    tabsFadeIn: detailed && !settled && fromRest,
    onTransitionEnd,
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
