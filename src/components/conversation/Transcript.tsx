import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, Users } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StateMark } from "./StateMark";
import { questionTurns } from "../../helpers/conversationReview.mjs";
import { momentSegment } from "../../helpers/conversationMoments.mjs";
import { offsetClock } from "../../helpers/conversationFlow.mjs";
import { speakerKey } from "../../helpers/talkTime.mjs";
import { speakerText } from "../../utils/speakerLabel";
import { splitOnMatches } from "../../utils/conversationSearch";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";
import type { ConversationEvent, QuestionOutcome } from "../../types/conversationEvents";

/**
 * The transcript as the timed record it is, rather than as one wall of text.
 *
 * Each turn carries its offset from the first thing said, in a quiet gutter that
 * is `aria-hidden` (a screen reader working through a transcript does not want a
 * timestamp read before every line; the time is on the paragraph as a `title`).
 * The speaker is named once per run of turns, the way every transcript reader
 * does it, and the gutter also carries the margin marks: which turns asked a
 * question, and which the reader marked.
 *
 * `transcriptText` is untouched: copy still produces the plain text it always
 * did. The saved `.txt` carries the same offsets as this gutter, written by
 * `helpers/transcriptFormatter.js` from the same first turn.
 *
 * Its own module, with no store behind it. The reading view gives it the
 * stored turns and the naming of a voice (`onRenameSpeaker`), which writes the
 * note; the demo pieces (`components/demo/`) give it the example's turns and
 * no naming, so a voice's name there is words, not a button.
 */
export function TranscriptView({
  segments,
  fallback = "",
  query = "",
  scrollToId,
  events,
  moments,
  currentMatch = null,
  speaker = null,
  onRenameSpeaker,
}: {
  /** The timed turns, as stored. */
  segments: TranscriptSegment[];
  /** The plain text shown when there are no timed turns (an imported or
   *  legacy transcript). */
  fallback?: string;
  query?: string;
  /** The segment a search matched, so arriving from a result lands on it. */
  scrollToId?: string | null;
  events: ConversationEvent[];
  moments: { id: string; at: number; note: string }[];
  /** Which highlighted match the find bar is on, or null when it is not open. */
  currentMatch?: number | null;
  /** Only this speaker's turns (a `talkTime.mjs` key), or everyone's. */
  speaker?: string | null;
  /** Names a voice (its `speaker_N` key) for every turn it said; an empty
   *  name puts the number back. Absent, a voice cannot be named here. */
  onRenameSpeaker?: (speaker: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const target = useRef<HTMLLIElement | null>(null);
  // The match the find bar is on: marked, and brought to the middle of the
  // screen. Children's effects run first, so this lands after `Highlighted`
  // has scrolled to the first match on a new query.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const marks = transcriptRef.current?.querySelectorAll("mark") ?? [];
    marks.forEach((mark, index) => {
      if (index === currentMatch) mark.setAttribute("data-current", "");
      else mark.removeAttribute("data-current");
    });
    if (currentMatch == null) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    marks[currentMatch]?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [currentMatch, query]);
  const asked = useMemo(() => questionTurns(events), [events]);
  const marked = useMemo(() => {
    const ids = new Set<string>();
    for (const moment of moments) {
      const segment = momentSegment(moment, segments);
      if (segment?.id != null) ids.add(String(segment.id));
    }
    return ids;
  }, [moments, segments]);

  useEffect(() => {
    if (!target.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [scrollToId, segments]);

  // No segments means no timings — an imported or legacy transcript. Fall back
  // to the plain text rather than to an empty page.
  if (!segments.length) {
    return (
      <div ref={transcriptRef}>
        <article className="whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">
          <Highlighted text={fallback} query={query} />
        </article>
      </div>
    );
  }

  const startedAt = segments.find((segment) => Number.isFinite(segment.timestamp))?.timestamp;
  // With one speaker showing, their runs keep their breaks: a turn after
  // somebody else's starts a new run under their name, as it would unfiltered.
  let shown = 0;

  return (
    <div ref={transcriptRef}>
      <ol>
        {segments.map((segment, index) => {
          if (speaker && speakerKey(segment) !== speaker) return null;
          const first = shown === 0;
          shown += 1;
          const at =
            Number.isFinite(segment.timestamp) && Number.isFinite(startedAt)
              ? offsetClock(Math.max(0, (segment.timestamp as number) - (startedAt as number)))
              : null;
          const matched = scrollToId != null && String(segment.id) === scrollToId;
          const outcome = asked.get(String(segment.id));
          const isMarked = marked.has(String(segment.id));
          const previous = index > 0 ? segments[index - 1] : null;
          const newSpeaker = !previous || speakerText(previous, t) !== speakerText(segment, t);
          return (
            <li
              key={segment.id}
              ref={matched ? target : undefined}
              className={cn(
                "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 rounded-md",
                !first && (newSpeaker ? "mt-5" : "mt-1.5"),
                // The turn a search landed on. Not a highlight — a semantic match
                // has no span to highlight — but "this is the one".
                matched && "-mx-2 bg-muted/70 px-2 py-1"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex items-center justify-end gap-1.5 self-start text-xs leading-5 tabular-nums text-muted-foreground",
                  newSpeaker ? "pt-0" : "pt-1"
                )}
              >
                {isMarked && <Bookmark className="size-3 fill-current text-foreground" />}
                {outcome && (
                  <StateMark
                    state={(outcome === "open" ? "asked" : outcome) as QuestionOutcome}
                    className=""
                  />
                )}
                {at ?? ""}
              </span>
              <div className="min-w-0">
                {newSpeaker && <SpeakerName segment={segment} onRename={onRenameSpeaker} />}
                <p
                  title={at ?? undefined}
                  className="max-w-[70ch] text-[15px] leading-7 text-foreground/90"
                >
                  {isMarked && <span className="sr-only">{t("oats.review.markedTurn")} </span>}
                  <Highlighted text={String(segment.text ?? "")} query={query} />
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A run of turns' speaker, and the way to name them.
 *
 * Oats tells voices apart after a conversation stops and numbers them by who
 * spoke first; it cannot know names, and guessing one would put words in a
 * stranger's mouth. Pressing "Speaker 2" names them — once, for every turn
 * that voice said in this conversation.
 */
function SpeakerName({
  segment,
  onRename,
}: {
  segment: TranscriptSegment;
  onRename?: (speaker: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const label = speakerText(segment, t);
  if (!label) return null;
  const nameable = Boolean(onRename && segment.speaker && /^speaker_\d+$/.test(segment.speaker));

  const save = (value: string) => {
    setNaming(false);
    const name = value.replace(/\s+/g, " ").trim().slice(0, 60);
    if (segment.speaker) onRename?.(segment.speaker, name);
  };

  if (naming) {
    return (
      <Input
        autoFocus
        defaultValue={segment.speakerIsPlaceholder ? "" : (segment.speakerName ?? "")}
        placeholder={label}
        aria-label={t("oats.intelligence.nameSpeaker", { speaker: label })}
        maxLength={60}
        spellCheck={false}
        onBlur={(event) => save(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setNaming(false);
        }}
        className="mb-1 h-7 w-48 px-2 text-[13px]"
      />
    );
  }

  return (
    <span className="block select-none text-[13px] font-medium leading-5 text-foreground">
      {nameable ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          aria-label={t("oats.intelligence.nameSpeaker", { speaker: label })}
          title={t("oats.intelligence.nameSpeaker", { speaker: label })}
          className="rounded-sm outline-none decoration-muted-foreground/50 underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {label}
        </button>
      ) : (
        label
      )}
      <span className="sr-only">: </span>
    </span>
  );
}

/** Plain text with the search term marked, scrolled so the first hit is on screen. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const first = useRef<HTMLElement | null>(null);
  const parts = useMemo(() => splitOnMatches(text, query), [text, query]);

  useEffect(() => {
    if (!first.current) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [parts]);

  let seen = false;
  return (
    <>
      {parts.map((part, index) => {
        if (!part.match) return <span key={index}>{part.text}</span>;
        const isFirst = !seen;
        seen = true;
        return (
          <mark
            key={index}
            ref={
              isFirst
                ? (node) => {
                    first.current = node;
                  }
                : undefined
            }
            // The one the find bar is on is the stronger of the two marks.
            className="rounded-sm bg-highlight px-0.5 text-foreground data-[current]:bg-highlight-strong"
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

/**
 * Over a transcript that shows one voice's turns: why the others are missing,
 * and the way back to them.
 */
export function ShownSpeaker({
  label,
  onEveryone,
}: {
  label: string | null;
  onEveryone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center gap-2 text-[13px] text-muted-foreground">
      <Users aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        {t("oats.intelligence.talkTime.only", { speaker: label })}
      </span>
      <Button variant="ghost" size="sm" className="-my-1 ml-auto shrink-0" onClick={onEveryone}>
        {t("oats.intelligence.talkTime.everyone")}
      </Button>
    </div>
  );
}
