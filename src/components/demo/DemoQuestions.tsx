import { useEffect, useMemo, useState } from "react";
import ConversationSignalRail from "../conversation/ConversationSignalRail";
import { CARD_STEP_MS, LAST_CARD_STEP, tourCards } from "../../helpers/oatsTour.mjs";
import type { TourConversation } from "../../helpers/oatsTour.mjs";
import { prefersReducedMotion } from "./demoMotion";

/** No contour sits above these cards, so there is no mark to raise. */
const ignore = () => {};

/**
 * The question rail, as it runs: two questions already settled, then a third
 * is asked and its card appears, then the reply settles that same card
 * (`CARD_STEP_MS`). Once, each time the piece is shown. Under reduced motion
 * the cards are simply there, settled.
 *
 * The rail is given no search and no record of a dismissal: a card offers no
 * Search, and Dismiss (with its Undo) takes it off this screen only.
 */
export default function DemoQuestions({ conversation }: { conversation: TourConversation }) {
  const [now] = useState(() => Date.now());
  const [reduced] = useState(prefersReducedMotion);
  const [step, setStep] = useState(() => (reduced ? LAST_CARD_STEP : 0));
  useEffect(() => {
    if (reduced) return undefined;
    const timers = CARD_STEP_MS.slice(1).map((at, index) =>
      window.setTimeout(() => setStep(index + 1), at)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced]);
  const cards = useMemo(() => tourCards(conversation, { now, step }), [conversation, now, step]);
  return <ConversationSignalRail cards={cards} onFocus={ignore} />;
}
