import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { readTranscriptLag } from "../../stores/meetingRecordingStore";

type LagView = ReturnType<typeof readTranscriptLag>;

const NOTHING: LagView = { visible: false, behindMs: 0, warning: false };

/**
 * How far behind the conversation the transcript is, beside the clock: "3.2 s
 * behind", only once it trails by more than 2 s, in the warning tone past 5 s.
 * Measured in `helpers/transcriptLag.mjs`, which says why the number is honest
 * and where it is off (a cloud provider, Parakeet): there it never appears.
 *
 * It reads once a second, on its own beat, and renders only when what it
 * shows changes, so a lag that is not there costs the card nothing.
 * `hidden` is for the "not transcribing" warning: once that says the
 * transcript has stopped, a growing number beside the clock would say the same
 * thing twice.
 */
function TranscriptLagBadge({ hidden, className }: { hidden: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<LagView>(NOTHING);

  useEffect(() => {
    const read = () => {
      const next = readTranscriptLag(Date.now());
      setView((shown) =>
        shown.visible === next.visible &&
        shown.warning === next.warning &&
        (!next.visible || shown.behindMs === next.behindMs)
          ? shown
          : next
      );
    };
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(view.behindMs / 1000),
    [i18n.language, view.behindMs]
  );

  if (hidden || !view.visible) return null;
  const described = t("oats.conversation.lag.described", { seconds });
  return (
    <Badge
      variant={view.warning ? "warning" : "outline"}
      className={cn("tabular-nums", !view.warning && "text-muted-foreground", className)}
      title={described}
    >
      <span aria-hidden="true">{t("oats.conversation.lag.behind", { seconds })}</span>
      <span className="sr-only">{described}</span>
    </Badge>
  );
}

export default memo(TranscriptLagBadge);
