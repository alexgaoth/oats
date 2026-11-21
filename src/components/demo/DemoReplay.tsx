import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import ConversationContour from "../conversation/ConversationContour";
import ConversationFlow from "../conversation/ConversationFlow";
import { contourLabel } from "../conversation/contourLabel";
import { useStoredContour } from "../conversation/useContour";
import { offsetClock } from "../../helpers/conversationFlow.mjs";
import {
  REPLAY_STEP_MS,
  replayAdvance,
  replayContour,
  replayFrame,
  replayTimeline,
} from "../../helpers/conversationReplay.mjs";
import type { TourConversation } from "../../helpers/oatsTour.mjs";
import type { ConversationFlowView } from "../../stores/settingsStore";
import type { ConversationSuggestion } from "../../types/conversationEvents";
import { prefersReducedMotion } from "./demoMotion";
import { useInView } from "./useInView";

/** The example has no past conversations, so the card's footer stays empty. */
const NO_SUGGESTIONS: ConversationSuggestion[] = [];

/** The most one frame moves the replay: a page that was hidden resumes, not jumps. */
const MAX_FRAME_MS = 100;

/** How often the picture follows the clock while playing: 30 times a second. */
const DRAW_EVERY_MS = 33;

/**
 * The live view of the example conversation, played back: the line grows,
 * topics take their lanes as they are raised, and each question's mark
 * appears when it is asked and fills in when the room answers
 * (`helpers/conversationReplay.mjs`). The whole conversation takes 40
 * seconds, and it stops at the end, on the finished map.
 *
 * It plays only while on screen. Play / Pause and the scrubber are the
 * controls; the scrubber moves with the arrow keys too. Under reduced motion it
 * starts paused on the finished map, and the scrubber still works. The flow
 * card is the recording screen's while it plays, and the record's at the end,
 * Lanes or Graph and a topic's quote included.
 */
export default function DemoReplay({
  conversation,
  from = 0,
}: {
  conversation: TourConversation;
  /** Where it starts, in ms from the first words. */
  from?: number;
}) {
  const { t } = useTranslation();
  const timeline = useMemo(() => replayTimeline(conversation), [conversation]);
  const finished = useStoredContour(
    conversation.segments,
    conversation.events,
    conversation.topics,
    conversation.moments,
    conversation.loudness
  );
  const [reduced] = useState(prefersReducedMotion);
  const [at, setAt] = useState(() =>
    reduced ? timeline.duration : Math.min(timeline.duration, Math.max(0, from))
  );
  const [playing, setPlaying] = useState(() => !reduced);
  const [view, setView] = useState<ConversationFlowView>("lanes");
  const root = useRef<HTMLDivElement | null>(null);
  const inView = useInView(root);

  // The clock runs in a ref, and the picture follows it 30 times a second.
  const position = useRef(at);
  const scrubbing = useRef(false);
  useEffect(() => {
    if (!playing || !inView) return undefined;
    let frame = 0;
    let last: number | null = null;
    let drawn = -Infinity;
    const tick = (time: number) => {
      const elapsed = last === null ? 0 : Math.min(MAX_FRAME_MS, time - last);
      last = time;
      if (!scrubbing.current) {
        position.current = replayAdvance(timeline, position.current, elapsed);
      }
      const done = position.current >= timeline.duration;
      if (done || time - drawn >= DRAW_EVERY_MS) {
        drawn = time;
        setAt(position.current);
      }
      if (done) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, inView, timeline]);

  // The turns said so far keep their list between frames that add none.
  const previous = useRef<ReturnType<typeof replayFrame> | undefined>(undefined);
  const shown = useMemo(() => replayFrame(timeline, at, previous.current), [timeline, at]);
  useEffect(() => {
    previous.current = shown;
  }, [shown]);
  const contour = useMemo(() => replayContour(finished, timeline, at), [finished, timeline, at]);

  const seek = (value: number) => {
    position.current = value;
    setAt(value);
  };
  // Play at the end starts it again from the first words.
  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (position.current >= timeline.duration) seek(0);
    setPlaying(true);
  };
  const when = t("demo.replay.at", {
    at: offsetClock(at),
    length: offsetClock(timeline.duration),
  });

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={playing ? t("demo.replay.pause") : t("demo.replay.play")}
          onClick={toggle}
          className="shrink-0"
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          step={REPLAY_STEP_MS}
          value={at}
          aria-label={t("demo.replay.position")}
          aria-valuetext={when}
          onChange={(event) => seek(Number(event.currentTarget.value))}
          onPointerDown={() => {
            scrubbing.current = true;
          }}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
          }}
          // The chart's greys (DESIGN.md §6): what has played in the quiet
          // grey, the rest a rule, and honey only for now, the thumb.
          style={
            {
              "--played": `${timeline.duration ? (at / timeline.duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
          className={cn(
            "h-9 min-w-0 flex-1 cursor-pointer appearance-none rounded-md bg-transparent outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
            "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-muted-foreground)_var(--played),var(--color-border)_var(--played))]",
            "[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
            "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--color-card)]",
            "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border",
            "[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-muted-foreground",
            "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--color-card)]"
          )}
        />
        <span
          aria-hidden="true"
          className="shrink-0 text-[13px] tabular-nums text-muted-foreground"
        >
          {when}
        </span>
      </div>
      <Card className="px-5 pb-3 pt-6">
        <ConversationContour contour={contour} height={80} label={contourLabel(contour, t)} />
      </Card>
      {/* Live while it plays: the line ends at now, in honey, on the topic the
          room is on. At the end it is the finished conversation's card. */}
      <ConversationFlow
        live={!shown.finished}
        snapshot={shown.snapshot}
        segments={shown.segments}
        startedAt={timeline.start}
        now={shown.now}
        suggestions={NO_SUGGESTIONS}
        view={view}
        onViewChange={setView}
      />
    </div>
  );
}
