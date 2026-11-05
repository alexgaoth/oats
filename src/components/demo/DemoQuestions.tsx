import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import ConversationSignalRail from "../conversation/ConversationSignalRail";
import { CARD_STEP_MS, LAST_CARD_STEP, tourCards } from "../../helpers/oatsTour.mjs";
import type { TourConversation } from "../../helpers/oatsTour.mjs";
import { prefersReducedMotion } from "./demoMotion";
import { useInView } from "./useInView";

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
 *
 * On a page (`replay`), the cards wait until the piece is on screen, and a
 * Replay control runs them again, with any dismissed card back. Under reduced
 * motion there is nothing to run again, so there is no Replay.
 */
export default function DemoQuestions({
  conversation,
  replay = false,
}: {
  conversation: TourConversation;
  replay?: boolean;
}) {
  const { t } = useTranslation();
  const [reduced] = useState(prefersReducedMotion);
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState(() => (reduced ? LAST_CARD_STEP : 0));
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const inView = useInView(root, 0.5);
  // In the tour the cards run as the slide appears; on a page, once it is seen.
  const [started, setStarted] = useState(!replay);
  useEffect(() => {
    if (inView) setStarted(true);
  }, [inView]);

  useEffect(() => {
    if (reduced || !started) return undefined;
    const timers = CARD_STEP_MS.slice(1).map((at, index) =>
      window.setTimeout(() => setStep(index + 1), at)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced, started, run]);
  const cards = useMemo(() => tourCards(conversation, { now, step }), [conversation, now, step]);

  const again = () => {
    setStep(0);
    setNow(Date.now());
    setRun((value) => value + 1);
  };

  return (
    <div ref={root}>
      <ConversationSignalRail key={run} cards={cards} onFocus={ignore} className="mt-0" />
      {replay && !reduced && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={again}
          className="-ml-2.5 mt-4 text-muted-foreground"
        >
          <RotateCcw aria-hidden="true" />
          {t("demo.questions.replay")}
        </Button>
      )}
    </div>
  );
}
