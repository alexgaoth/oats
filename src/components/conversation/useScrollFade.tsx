import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Whether a scroller should show its "more below" fade.
 *
 * Two things this exists to get right, both of which shipped wrong:
 *
 * **The fade must never be on when there is nothing below.** Gating it on an
 * `atEnd` flag that starts `false` and is only updated by `onScroll` means a
 * region that never scrolls never fires the event, so the fade stays on
 * forever. Measured with one question card: band `clientHeight 68 ===
 * scrollHeight 68`, no scroll event possible, and the card's outcome line
 * rendered at **1.58:1** against paper with its Search control's focus ring at
 * 1.00:1 along the bottom — the ordinary single-question case, permanently
 * half-erased with no gesture that could restore it.
 *
 * So it is measured, not remembered: a `ResizeObserver` re-measures when the
 * box or its content changes, and the caller re-measures on scroll.
 *
 * **The fade must not be a mask on the scroller.** A CSS mask's painting area
 * is the border box, so masking the element that carries the focus ring clips
 * the ring away: measured 5.21:1 unmasked, **1.00:1** masked, same element,
 * same focus. Callers paint an overlay beside the scroller instead.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>, revision: unknown) {
  const [faded, setFaded] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const scrollable = element.scrollHeight > element.clientHeight + 1;
    const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    setFaded(scrollable && !atEnd);
  }, [ref]);

  useEffect(() => {
    measure();
  }, [measure, revision]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref, measure]);

  return { faded, measure };
}

/** The fade itself, painted beside a scroller rather than over it. */
export function ScrollFade({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-background"
    />
  );
}
