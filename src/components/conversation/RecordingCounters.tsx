import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  sittingQuestionCount,
  sittingWordCount,
  splitAroundCount,
} from "../../helpers/recordingCounters.mjs";

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
 * The muted line under the recording clock: words captured so far, and
 * questions heard so far, in this sitting (`helpers/recordingCounters.mjs`).
 *
 * Both change only when something lands, a finalized segment or a question
 * card, never while a word is still being transcribed: in Clean they are two
 * of the few things allowed to move. The questions count is left out when
 * question cards are off, because a zero there would be a guess, not a count.
 */
export default function RecordingCounters({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const segments = useMeetingRecordingStore((state) => state.segments);
  const cards = useMeetingRecordingStore((state) => state.questionCards);
  const startedAt = useMeetingRecordingStore((state) => state.recordingStartedAt);
  // The aide's own gates for a conversation in a room (startConversationAide),
  // as the preflight reads them. Settings is closed while recording.
  const questionsOn = useSettingsStore(
    (state) => state.conversationAideEnabled && state.conversationAideInRoomEnabled
  );
  const words = useMemo(() => sittingWordCount(segments, startedAt), [segments, startedAt]);
  const questions = useMemo(() => sittingQuestionCount(cards, startedAt), [cards, startedAt]);
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 text-[13px] leading-5 tabular-nums text-muted-foreground",
        className
      )}
    >
      <Counter
        label={t("oats.conversation.counters.words", { count: words })}
        count={words}
        formatted={number.format(words)}
      />
      {questionsOn && (
        <Counter
          label={t("oats.conversation.counters.questions", { count: questions })}
          count={questions}
          formatted={number.format(questions)}
        />
      )}
    </p>
  );
}
