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
export function useScrollFade(
  ref: RefObject<HTMLElement | null>,
  revision: unknown,
  /** Called when the box or its content resizes — the caller may want to
   *  re-follow rather than silently fall behind. */
  onResize?: () => void
) {
  const [faded, setFaded] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const scrollable = element.scrollHeight > element.clientHeight + 1;
    const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    setFaded({
      // Both edges clip, and the *top* one is the edge a live conversation
      // spends its whole life against: following the newest turn means the
      // oldest visible line is the sliced one. Measured at 40 turns while
      // following: 12px of a 28px line under the hairline, with no cue.
      top: scrollable && element.scrollTop > 8,
      bottom: scrollable && !atEnd,
    });
  }, [ref]);

  useEffect(() => {
    measure();
  }, [measure, revision]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      measure();
      onResize?.();
    });
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref, measure, onResize]);

  return { faded, measure };
}

/** The fades themselves, painted beside a scroller rather than over it. */
export function ScrollFade({ edges }: { edges: { top: boolean; bottom: boolean } }) {
  return (
    <>
      {edges.top && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-t from-transparent to-background"
        />
      )}
      {edges.bottom && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-background"
        />
      )}
    </>
  );
}
