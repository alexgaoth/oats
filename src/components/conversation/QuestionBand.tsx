import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "../lib/utils";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { holdingNewest, newestCardHold } from "../../helpers/questionBand.mjs";
import ConversationSignalRail from "./ConversationSignalRail";
import {
  SCROLL_FADE_BOTTOM_PX,
  SCROLL_FADE_TOP_PX,
  ScrollFade,
  useScrollFade,
} from "./useScrollFade";

// The question cards' band on the recording surface: the rail, in the room the
// surface leaves it between the flow card and the live dialogue, scrolling
// inside itself rather than pushing the dead-microphone warning off screen.
//
// Its own component so that its hooks mount with it. The band exists only
// while recording, and the surface that used to hold this ref mounted long
// before it: the fade's ResizeObserver found no element, never attached, and
// the fade was measured only when the card count changed. A check line that
// grew the newest card pushed the next one under the band's edge with no fade
// over it: measured at 1440x900, 8:22.

/** What the band's two fades cover, which the newest card is held clear of. */
const FADES = { top: SCROLL_FADE_TOP_PX, bottom: SCROLL_FADE_BOTTOM_PX };

/**
 * Keeps the newest card whole while it grows, unless the person has scrolled
 * the band away from it.
 *
 * The band scrolls itself and nothing else: `scrollIntoView` scrolls every
 * ancestor that can scroll, the section and the workspace included, and a box
 * that must never scroll can still be moved by it (CLAUDE.md, `overflow-clip`).
 *
 * Holding is read from where the band is (`holdingNewest`). The band's own
 * smooth scroll passes other places on its way, so its scroll events are not
 * the person's and are skipped until it ends.
 */
function useHoldNewest(
  band: RefObject<HTMLDivElement | null>,
  newest: RefObject<HTMLLIElement | null>,
  active: boolean
) {
  const holding = useRef(true);
  const steering = useRef(false);
  const [bottomFade, setBottomFade] = useState(true);

  const measure = useCallback(() => {
    const scroller = band.current;
    const card = newest.current;
    if (!scroller || !card) return null;
    // Layout offsets, not rects: a card that has just arrived is still rising
    // into place (`oats-enter`), and the band aims where it will land. The band
    // is `relative`, so these are positions in its scrolled content.
    const style = getComputedStyle(card);
    return newestCardHold({
      top: card.offsetTop + parseFloat(style.paddingTop),
      bottom: card.offsetTop + card.offsetHeight - parseFloat(style.paddingBottom),
      viewHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      fade: FADES,
    });
  }, [band, newest]);

  const place = useCallback(() => {
    const scroller = band.current;
    const hold = measure();
    setBottomFade(!hold || !holding.current || hold.bottomFade);
    if (!scroller || !hold || !holding.current) return;
    if (Math.abs(scroller.scrollTop - hold.scrollTop) < 1) return;
    // A check lands while somebody is talking, so the band glides the few
    // pixels rather than jumping them; under reduced motion it is there at once.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    steering.current = !reduced;
    scroller.scrollTo({ top: hold.scrollTop, behavior: reduced ? "auto" : "smooth" });
  }, [band, measure]);

  const onScroll = useCallback(() => {
    if (steering.current) return;
    const scroller = band.current;
    const hold = measure();
    if (!scroller || !hold) return;
    holding.current = holdingNewest(scroller.scrollTop, hold);
    setBottomFade(!holding.current || hold.bottomFade);
  }, [band, measure]);

  const onScrollEnd = useCallback(() => {
    steering.current = false;
    onScroll();
  }, [onScroll]);

  // The band and everything in it: a card arriving, a check line growing the
  // newest, the undo appearing above it, the room under the flow card changing.
  useEffect(() => {
    const scroller = band.current;
    if (!active || !scroller) return undefined;
    // Words opens on the band at rest, which is on the newest card.
    holding.current = true;
    const observer = new ResizeObserver(place);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [active, band, place]);

  return { bottomFade, onScroll, onScrollEnd };
}

export default function QuestionBand({
  detailed,
  onFocus,
}: {
  /** Words draws the cards here; Calm keeps the rail mounted to announce them. */
  detailed: boolean;
  /** Which question group the pointer or keyboard is on, for the contour. */
  onFocus: (groupKey: string | null) => void;
}) {
  const band = useRef<HTMLDivElement | null>(null);
  const newest = useRef<HTMLLIElement | null>(null);
  // The fade says "more below", so it must be measured rather than remembered.
  //
  // It used to be an `atEnd` flag starting `false` and updated only by
  // `onScroll` — so a band that never scrolls never fired the event and the
  // fade stayed on forever. Measured with a single question card: band
  // `clientHeight 68 === scrollHeight 68`, the card's outcome line at **1.58:1**
  // against paper and its Search control's focus ring at 1.00:1 along the
  // bottom. The ordinary one-question case, permanently half-erased.
  const cardCount = useMeetingRecordingStore((s) => s.questionCards.length);
  const { faded, measure } = useScrollFade(band, cardCount);
  const hold = useHoldNewest(band, newest, detailed);

  return (
    <div
      className={cn(
        "group relative flex min-h-0 shrink-0 flex-col",
        detailed ? "max-h-[52%]" : "max-h-0"
      )}
    >
      <div
        ref={band}
        onScroll={() => {
          measure();
          hold.onScroll();
        }}
        onScrollEnd={hold.onScrollEnd}
        className={cn("relative min-h-0", detailed ? "overflow-y-auto" : "overflow-hidden")}
      >
        <ConversationSignalRail onFocus={onFocus} announceOnly={!detailed} newestRef={newest} />
      </div>
      <ScrollFade
        edges={
          detailed
            ? { top: faded.top, bottom: faded.bottom && hold.bottomFade }
            : { top: false, bottom: false }
        }
      />
    </div>
  );
}
