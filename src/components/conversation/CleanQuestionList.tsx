import { memo, useId, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { selectCleanQuestions } from "../../helpers/conversationDetail.mjs";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { Card } from "../ui/card";
import { StateMark } from "./StateMark";

export default memo(function CleanQuestionList() {
  const { t } = useTranslation();
  const heading = useId();
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const shown = useMemo(() => selectCleanQuestions(cards), [cards]);
  const list = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);

  useLayoutEffect(() => {
    const node = list.current;
    // Follow only from the end. A verdict can move the browser's anchor to
    // the answered block, so disable native anchoring and leave the offset
    // alone while the reader is above the end.
    if (!node) atEnd.current = true;
    else if (atEnd.current) node.scrollTop = node.scrollHeight;
  }, [shown]);

  return (
    <Card className="min-h-0">
      <h2 id={heading} className="shrink-0 px-5 py-3 text-sm font-semibold">
        {t("oats.library.questionsTab")}
      </h2>
      {shown.length === 0 ? (
        <p className="px-5 pb-4 text-[13px] text-muted-foreground">{t("questionCard.empty")}</p>
      ) : (
        <div
          ref={list}
          role="region"
          aria-labelledby={heading}
          tabIndex={0}
          className="min-h-0 overflow-y-auto overscroll-contain rounded-b-xl outline-none [overflow-anchor:none] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          onScroll={(event) => {
            const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
            atEnd.current = scrollHeight - scrollTop - clientHeight <= 1;
          }}
        >
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((card) => (
              <li key={card.id} className="flex items-start gap-x-4 px-5 py-3">
                <p className="min-w-0 flex-1 text-sm leading-5 wrap-anywhere text-foreground">
                  {card.question}
                </p>
                <span className="flex shrink-0 items-center gap-2 text-[13px] leading-5 text-muted-foreground">
                  <StateMark state={card.state} className="mt-0" />
                  {t(`questionCard.state.${card.state}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
});
