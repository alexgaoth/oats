// Where the question band sits while its newest card grows
// (components/conversation/QuestionBand.tsx).
//
// The band runs newest first, so the newest card starts near its top, under
// the "earlier" and "undo" controls. A context check then grows that card in
// place: "Found it" and the answer, and the file it came from under that. The
// band is capped (52% of the room under the flow card), and it did not move,
// so the new lines landed under its bottom fade or below its edge and stayed
// there until somebody scrolled. Measured in the demo at 1440x900, 24:03: the
// band 134px tall, the answer under the fade and the source line 8px below the
// band; in a 1440x900 browser window (812px of page), the same at 8:22, under
// the first check of the conversation.
//
// Pure and DOM-free, so the rule is pinned (test/helpers/questionBand.test.js).
// The component measures and scrolls.

/** How far from the hold the band may sit and still be holding, in px: a nudge is not leaving. */
export const HOLD_SLACK_PX = 8;

const NO_FADE = { top: 0, bottom: 0 };

/**
 * Where the band sits to show its newest card whole.
 *
 * `top` and `bottom` are the card's content edges in the band's scrolled
 * content, `viewHeight` is the band's visible height and `scrollHeight` its
 * content's, and `fade` is how far each scroll fade reaches in (useScrollFade).
 *
 * As near the band's rest (0) as the card allows, so the controls above it
 * stay in view while it fits; far enough down that its last line clears the
 * bottom fade; and never past its first line, so a card taller than the room
 * keeps its question in view.
 *
 * `bottomFade` is whether the bottom fade may still be drawn there. Not when
 * it would sit on the card's last line and that line ends inside the band: a
 * cue may say the text continues, and it may not erase a line that is legibly
 * there (useScrollFade.tsx). A card cut by the band's edge keeps its fade.
 */
export function newestCardHold({ top, bottom, viewHeight, scrollHeight, fade = NO_FADE }) {
  const most = Math.max(0, scrollHeight - viewHeight);
  const clear = bottom + fade.bottom - viewHeight;
  const first = top - fade.top;
  const scrollTop = Math.min(most, Math.max(0, Math.min(clear, first)));
  const end = bottom - scrollTop;
  return {
    scrollTop,
    bottomFade: !(end > viewHeight - fade.bottom && end <= viewHeight),
  };
}

/**
 * Whether the band sits where `newestCardHold` puts it. Read from where the
 * band is, not from which events fired, so the person who scrolled away, up
 * to the controls or down to older questions, keeps the place they chose until
 * they come back to the newest card.
 */
export function holdingNewest(scrollTop, hold) {
  return Math.abs(scrollTop - hold.scrollTop) <= HOLD_SLACK_PX;
}
