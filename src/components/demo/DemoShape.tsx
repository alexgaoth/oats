import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../ui/card";
import ConversationContour from "../conversation/ConversationContour";
import ContourLegend from "../conversation/ContourLegend";
import { contourLabel } from "../conversation/contourLabel";
import { useStoredContour } from "../conversation/useContour";
import { offsetClock } from "../../helpers/conversationFlow.mjs";
import { momentSegment } from "../../helpers/conversationMoments.mjs";
import { speakerText } from "../../utils/speakerLabel";
import type { TourConversation } from "../../helpers/oatsTour.mjs";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";

/**
 * The contour and its key, as the top of a conversation's record draws them.
 *
 * In the record, a press on the trace opens the transcript at that moment,
 * and the hairline under the pointer says when that was. Here there is no
 * transcript to open, so the press shows the turn said at that moment under
 * the key instead, in the flow card's quote line: who said it, when, and the
 * words. Its room is kept from the first press on, so pressing again never
 * moves the card.
 */
export default function DemoShape({ conversation }: { conversation: TourConversation }) {
  const { t } = useTranslation();
  const contour = useStoredContour(
    conversation.segments,
    conversation.events,
    conversation.topics,
    conversation.moments,
    conversation.loudness
  );
  const [picked, setPicked] = useState<number | null>(null);
  const turn = useMemo(
    () =>
      picked === null
        ? null
        : (momentSegment({ at: picked }, conversation.segments) as TranscriptSegment | null),
    [picked, conversation.segments]
  );
  // The turn's time as the transcript's gutter gives it: from the first turn.
  const firstAt = conversation.segments.find((segment) =>
    Number.isFinite(segment.timestamp)
  )?.timestamp;
  const turnAt =
    turn && Number.isFinite(turn.timestamp) && Number.isFinite(firstAt)
      ? offsetClock(Math.max(0, (turn.timestamp as number) - (firstAt as number)))
      : "";
  const speaker = turn ? speakerText(turn, t) : null;

  return (
    <Card className="px-5 pb-4 pt-7">
      <ConversationContour
        contour={contour}
        height={92}
        label={contourLabel(contour, t)}
        onPick={setPicked}
        pickLabel={(time) => offsetClock(Math.max(0, time - (contour.start ?? time)))}
      />
      <ContourLegend contour={contour} className="mt-4" />
      {picked !== null && (
        <div className="-mx-5 mt-4 border-t border-border px-5 pt-2.5">
          <p className="line-clamp-2 h-10 text-[13px] leading-5 text-muted-foreground">
            {turn && (
              <>
                {speaker && <span className="mr-2 font-medium text-foreground">{speaker}</span>}
                {turnAt && <span className="mr-2 tabular-nums">{turnAt}</span>}
                <span>{t("oats.flow.quote", { text: String(turn.text ?? "").trim() })}</span>
              </>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}
