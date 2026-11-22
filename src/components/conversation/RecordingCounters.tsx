import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { sittingQuestionCount, splitAroundCount } from "../../helpers/recordingCounters.mjs";

/**
 * A number that rolls up into place when it changes, and only then.
 *
 * Each change mounts a new span (the `key`), so the roll plays once per change
 * and an unrelated re-render (the clock, every second) neither replays it nor
 * cuts it short. The first value does not roll. `oats-roll` is off under
 * reduced motion (index.css).
 */
function RollingNumber({ value, children }: { value: number; children: ReactNode }) {
  const [shown, setShown] = useState(value);
  const [changes, setChanges] = useState(0);
  if (value !== shown) {
    // Derived from the previous render, React's documented way: no extra commit.
    setShown(value);
    setChanges((count) => count + 1);
  }
  return (
    <span key={changes} className={cn("inline-block", changes > 0 && "oats-roll")}>
      {children}
    </span>
  );
}

function Counter({ label, count, formatted }: { label: string; count: number; formatted: string }) {
  const parts = splitAroundCount(label, count);
  if (!parts) return <span className="whitespace-nowrap">{label}</span>;
  return (
    <span className="whitespace-nowrap">
      {parts.before}
      <RollingNumber value={count}>{formatted}</RollingNumber>
      {parts.after}
    </span>
  );
}

/**
 * The muted line under the recording clock: the questions heard so far, in this
 * sitting (`helpers/recordingCounters.mjs`).
 *
 * It changes only when a question card lands, never while a word is still being
 * transcribed: in Clean it is one of the few things allowed to move. It is left
 * out when question cards are off, because a zero there would be a guess, not a
 * count. There is no word count: how many words were spoken helps nobody during
 * a conversation (DESIGN.md §5).
 */
export default function RecordingCounters({
  className,
  onQuestions,
}: {
  className?: string;
  onQuestions?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const startedAt = useMeetingRecordingStore((state) => state.recordingStartedAt);
  // The aide's own gates for a conversation in a room (startConversationAide),
  // as the preflight reads them. Settings is closed while recording.
  const questionsOn = useSettingsStore(
    (state) => state.conversationAideEnabled && state.conversationAideInRoomEnabled
  );
  const questions = useMemo(() => sittingQuestionCount(cards, startedAt), [cards, startedAt]);
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  if (!questionsOn) return null;

  const counter = (
    <Counter
      label={t("oats.conversation.counters.questions", { count: questions })}
      count={questions}
      formatted={number.format(questions)}
    />
  );
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 text-[13px] leading-5 tabular-nums text-muted-foreground",
        className
      )}
    >
      {onQuestions ? (
        <Button
          variant="ghost"
          size="sm"
          className="-mx-1 h-6 px-1 text-[13px] font-normal text-muted-foreground"
          onClick={onQuestions}
        >
          {counter}
        </Button>
      ) : (
        counter
      )}
    </p>
  );
}
