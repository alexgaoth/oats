import { useCallback, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";

/** Where a change between the two compositions stands. One state, so its fields never part. */
interface ChangeState {
  /** The composition the person chose, as of the last render. */
  chosen: boolean;
  /** The composition last drawn alone. */
  settled: boolean;
  /** The change started from one composition drawn alone, not by turning another around. */
  fromRest: boolean;
}

/**
 * Expand details and Hide details as one movement (DESIGN.md §5).
 *
 * The composition being left stays drawn while the change runs, so the contour
 * and the flow card can close in height and the question lists can hand over,
 * instead of the old composition vanishing at the press. While the settled
 * composition is not the chosen one, both are drawn. The parts (elements with
 * `data-detail-part`) do not all end together: the leaving list is gone after
 * 40% of the movement. So the change settles when a part ends a transition or
 * an animation and no part has one running any more (`onMotionEnd`). A press
 * during a change turns it around from where it is: the composition it was
 * heading for becomes the one it leaves, and every transition reverses from
 * its current value.
 *
 * Under reduced motion nothing lingers: the change is at once. If no part ends
 * a transition (an unseen window, the recording stopping mid-change), the
 * change settles after a second anyway, so a composition is never left drawn
 * under the other.
 */
export function useDetailChange(detailed: boolean) {
  const [state, setState] = useState<ChangeState>(() => ({
    chosen: detailed,
    settled: detailed,
    fromRest: true,
  }));
  let current = state;
  if (state.chosen !== detailed) {
    // Adjusted while rendering, so the composition being left is never
    // dropped for one commit before it is drawn again. One object, adjusted
    // whole. React can throw such an adjustment away and render from the
    // state before it (seen in development, a press after the questions
    // count); then the adjustment is simply made again. As three states,
    // the new choice was kept and the settled view dropped, so a
    // reduced-motion change drew both views for a second.
    current = {
      chosen: detailed,
      fromRest: state.settled === state.chosen,
      settled: prefersReducedMotion() ? detailed : state.chosen,
    };
    setState(current);
  }
  const { settled, fromRest } = current;
  const changing = settled !== detailed;

  const settle = useCallback(
    () =>
      setState((previous) =>
        previous.settled === detailed && previous.chosen === detailed
          ? previous
          : { ...previous, chosen: detailed, settled: detailed }
      ),
    [detailed]
  );

  useEffect(() => {
    if (!changing) return undefined;
    const timer = window.setTimeout(settle, 1000);
    return () => window.clearTimeout(timer);
  }, [changing, settle]);

  // For `onTransitionEnd` and `onAnimationEnd` on the element that holds the
  // parts. A transition still waiting out its delay counts as running.
  const onMotionEnd = useCallback(
    (event: SyntheticEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (!target.hasAttribute("data-detail-part")) return;
      const parts = event.currentTarget.querySelectorAll("[data-detail-part]");
      const moving = [...parts].some((part) =>
        part.getAnimations().some((animation) => animation.playState === "running")
      );
      if (!moving) settle();
    },
    [settle]
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
    onMotionEnd,
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
