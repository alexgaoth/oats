import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { ScrollFade, useScrollFade } from "./useScrollFade";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import type { TranscriptSegment } from "../../stores/meetingRecordingStore";

// The detected dialogue — what Oats has actually heard, while it is hearing it.
//
// This is the answer to the only question the recording surface could not
// previously answer: *is it getting this right?* Until now the surface offered
// one echoed line, which proves something arrived and nothing about whether it
// arrived correctly. Somebody deciding whether to trust an hour of their
// conversation to this needs to read a paragraph of it, not glimpse a clause.
//
// It is deliberately not the reading view. No timestamps, no per-utterance
// controls, no selection affordances: a live transcript that invites editing is
// a transcript somebody edits instead of listening. Speaker, words, and the
// order they came in.
//
// Turns, not segments. Speech arrives in ~5s chunks (LOCAL_MEETING_CHUNK_
// INTERVAL_MS), and rendering each as its own paragraph makes one person's
// sentence look like an argument between four of them. Consecutive chunks from
// the same speaker are joined into the turn they actually were.

/** A run of consecutive segments from one speaker. */
interface Turn {
  id: string;
  source: "mic" | "system";
  speaker?: string;
  text: string;
}

/**
 * Who said it, in the same two-voice vocabulary the stored transcript and every
 * export use — "you" and the room — extended with a diarized name when the
 * speaker has one. Hard-coding these would put English into nine locales.
 */
function speakerKey(segment: TranscriptSegment): string {
  return `${segment.source}:${segment.speakerName ?? segment.speaker ?? ""}`;
}

export function buildTurns(segments: TranscriptSegment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of segments) {
    const text = segment.text?.trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.id.startsWith(`${speakerKey(segment)}|`)) {
      last.text = `${last.text} ${text}`;
      continue;
    }
    turns.push({
      id: `${speakerKey(segment)}|${segment.id}`,
      source: segment.source,
      speaker: segment.speakerName ?? undefined,
      text,
    });
  }
  return turns;
}

export default function ConversationDialogue({ className }: { className?: string }) {
  const { t } = useTranslation();
  const segments = useMeetingRecordingStore((state) => state.segments);
  const turns = useMemo(() => buildTurns(segments), [segments]);

  // Follow the newest turn, but stop the moment the reader scrolls away.
  //
  // Auto-scrolling a reader off the line they are reading is the specific way
  // live transcripts become unusable: you go back to check what was said, and
  // the next chunk yanks you to the bottom. Following resumes only when they
  // return to the end themselves.
  const scroller = useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  followingRef.current = following;

  const stickToEnd = useCallback(() => {
    const element = scroller.current;
    if (!element || !followingRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, []);

  // Following has to survive the region *shrinking*, not only new speech
  // arriving. The dead-microphone warning appearing takes the log 208px to
  // 152px without a word being said, and that left the newest turn at zero
  // visible pixels with `atEnd` false — so the surface whose whole job is
  // proving "it is hearing me" showed a stale tail indefinitely, at the exact
  // moment reliability was in question, with no further segment coming to
  // re-scroll it. A window resize did the same, 208px to 85px.
  const { faded, measure } = useScrollFade(scroller, turns, stickToEnd);
  useEffect(stickToEnd, [turns, following, stickToEnd]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Not a live region.
      
          A transcript that announced itself would read every arriving chunk of
          a conversation aloud over the conversation — the one thing this
          surface must never do. The status region in the head, and the question
          announcements in the rail, are the spoken channel; this is the visual
          one, and a screen-reader user reaches it by navigating to it. */}
      {/* `min-h-0 flex-1`, never `max-h-full`.

          `max-height: 100%` resolves against a parent whose own height is its
          content, so it bounds nothing: measured at 40 turns this element had
          clientHeight === scrollHeight === 2266 and was not a scroller at all,
          which made `scrollTop = scrollHeight` a no-op and left the newest turn
          1850px below the fold for the whole conversation. A flex child with
          `min-h-0` inside a bounded column is the shape that actually scrolls. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollowing(element.scrollTop + element.clientHeight >= element.scrollHeight - 8);
            measure();
          }}
          role="log"
          aria-live="off"
          aria-label={t("oats.conversation.dialogueLabel")}
          tabIndex={0}
          className={cn(
            // `relative` and `contain` are load-bearing, not tidiness.
            //
            // The `sr-only` separators below are `position: absolute`, and a
            // `position: static` scroller is not their containing block — so they
            // escaped its clip and propagated into the *section's* scrollable
            // overflow. Measured at 600x400 with 20 turns: section clientHeight
            // 364, scrollHeight 2156, children summing to 490; scrolled to the
            // end the screen was blank paper with the dead-microphone warning
            // 1,306px above the viewport. `overflow: hidden` on this element did
            // not fix it (still 2156); containment did (530).
            "relative [contain:layout_paint] h-full overflow-y-auto",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {!turns.length && (
            // Inside the region, not instead of it: a labelled log that only
            // exists once somebody has spoken cannot be navigated to beforehand,
            // and then appears with no signal that it has.
            <p className="font-mono text-xs text-muted-foreground">
              {t("oats.conversation.dialogueWaiting")}
            </p>
          )}
          <ol className="space-y-3.5">
            {turns.map((turn) => (
              <li key={turn.id} className="font-mono text-[13px] leading-7">
                {/* Mono, because §5 gives transcripts the "machine heard this"
                  voice — it earns trust by looking verbatim — and because the
                  reading view renders this same content at `font-mono
                  text-[13px]`. One transcript must not have two voices on two
                  surfaces. Sentence case, like everything but the wordmark. */}
                <span className="mr-2 select-none text-muted-foreground">
                  {turn.speaker ??
                    (turn.source === "mic"
                      ? t("oats.intelligence.speakerYou")
                      : t("oats.intelligence.speakerRoom"))}
                  {/* The gap between the label and the words is margin, which is
                    invisible to `textContent` — so a screen reader, and anyone
                    copying the transcript, read "Youso the question is". The
                    separator has to be a character. */}
                  <span className="sr-only">: </span>
                </span>
                <span className="text-foreground/85">{turn.text}</span>
              </li>
            ))}
          </ol>
        </div>
        {/* Painted beside the scroller, never as a mask on it: a mask's painting
          area is the border box, so masking the focusable log clipped its own
          focus ring away — measured 5.21:1 unmasked, 1.00:1 masked, same
          element, same focus. The overlay sits inside the wrapper, so the ring
          (which is drawn outside the log's box) is untouched. */}
        <ScrollFade edges={faded} />
      </div>
    </div>
  );
}
