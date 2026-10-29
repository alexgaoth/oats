import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import ConversationFlow from "../conversation/ConversationFlow";
import ConversationSignalRail from "../conversation/ConversationSignalRail";
import ConversationContour from "../conversation/ConversationContour";
import ContourLegend from "../conversation/ContourLegend";
import { ScrollFade, useScrollFade } from "../conversation/useScrollFade";
import { useStoredContour } from "../conversation/useContour";
import { ConversationReview, TalkTime } from "../OatsWorkspace";
import { talkTime } from "../../helpers/talkTime.mjs";
import {
  CARD_STEP_MS,
  LAST_CARD_STEP,
  TOUR_SLIDES,
  tourCards,
  tourConversation,
  tourStep,
  type TourConversation,
} from "../../helpers/oatsTour.mjs";
import example from "../../helpers/sampleConversations/launch-readiness-review.json";
import type { ConversationSuggestion } from "../../types/conversationEvents";

// The tour at the end of setup: what Oats does with a conversation, one slide
// at a time, each slide one of the app's own components taken out of its page.
//
// Not a picture of the product: the flow card, the question rail, the contour,
// the talk-time bars and the review are the components the app renders, given
// the example conversation Home offers until the first recording
// (`helpers/oatsTour.mjs` reads it). So the tour cannot drift from the product,
// and what it shows is what the person can open next.
//
// It shows; it does not teach. There is no "press here", nothing to try and
// nothing to remember, and it never comes back: setup is already saved when it
// opens (OnboardingFlow.tsx), so Skip, Start or a quit all land in the app.
//
// Nothing on a slide can do anything. Each component gets its data as props,
// never through a store, and the box it is drawn in is `inert`: no click, key
// or focus reaches a Search, a Dismiss, a view switch or a row, so nothing is
// recorded, sent, opened or saved. The tour moves only when asked to: Back,
// Next, the dots and the arrow keys, never by itself.

/** The flow card's footer lists past conversations' subjects; the example has none. */
const NO_SUGGESTIONS: ConversationSuggestion[] = [];

const ignore = () => {};

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

interface SlideProps {
  conversation: TourConversation;
}

/** Topics found and named as the subject moves: the recording screen's flow card. */
function TopicsSlide({ conversation }: SlideProps) {
  return (
    <ConversationFlow
      snapshot={conversation.snapshot}
      segments={conversation.segments}
      suggestions={NO_SUGGESTIONS}
    />
  );
}

/**
 * The question rail, as it runs: two questions already settled, then a third
 * is asked and its card appears, then the reply settles that same card
 * (`CARD_STEP_MS`). Once, each time the slide is shown. Under reduced motion
 * the cards are simply there, settled.
 */
function QuestionsSlide({ conversation }: SlideProps) {
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

/** The contour and its key, as the top of a conversation's record draws them. */
function ShapeSlide({ conversation }: SlideProps) {
  const contour = useStoredContour(
    conversation.segments,
    conversation.events,
    conversation.topics,
    conversation.moments,
    conversation.loudness
  );
  return (
    <Card className="px-5 pb-4 pt-7">
      <ConversationContour contour={contour} height={92} />
      <ContourLegend contour={contour} className="mt-4" />
    </Card>
  );
}

/** Who talked how much, once Finish has told the voices apart. */
function VoicesSlide({ conversation }: SlideProps) {
  const talk = useMemo(() => talkTime(conversation.segments), [conversation.segments]);
  return (
    <Card className="px-5 py-4">
      <TalkTime talk={talk} selected={null} onSelect={ignore} />
    </Card>
  );
}

/** What nobody answered, the first thing in a record's summary tab. */
function OpenSlide({ conversation }: SlideProps) {
  return (
    <ConversationReview
      events={conversation.events}
      topics={conversation.topics}
      onOpenTurn={ignore}
    />
  );
}

const VIEWS: Record<string, (props: SlideProps) => React.ReactElement> = {
  topics: TopicsSlide,
  questions: QuestionsSlide,
  shape: ShapeSlide,
  voices: VoicesSlide,
  open: OpenSlide,
};

export default function OatsTour({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  // Read once: the example is placed in time as Home's copy of it would be.
  const conversation = useMemo(() => tourConversation(example), []);
  const count = TOUR_SLIDES.length;
  const slide = TOUR_SLIDES[index];
  const first = index === 0;
  const last = index === count - 1;
  const View = VIEWS[slide];

  const text = useMemo<Record<string, { title: string; body: string }>>(
    () => ({
      topics: { title: t("onboarding.tour.topics.title"), body: t("onboarding.tour.topics.body") },
      questions: {
        title: t("onboarding.tour.questions.title"),
        body: t("onboarding.tour.questions.body"),
      },
      shape: { title: t("onboarding.tour.shape.title"), body: t("onboarding.tour.shape.body") },
      voices: { title: t("onboarding.tour.voices.title"), body: t("onboarding.tour.voices.body") },
      open: { title: t("onboarding.tour.open.title"), body: t("onboarding.tour.open.body") },
    }),
    [t]
  );

  // The arrow keys, from anywhere in the window. There is nothing here to type
  // into, and the stage cannot hold focus, so an arrow is always for the tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      setIndex((current) => tourStep(current, delta, count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  // The way forward has the focus, so Enter goes on, as on the setup screen.
  // Back is hidden on the first slide and Skip on the last: a hidden control
  // cannot keep the focus, so it comes back to the way forward instead of
  // falling to the page.
  const forwardRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      (first && active === backRef.current) ||
      (last && active === skipRef.current)
    ) {
      forwardRef.current?.focus();
    }
  }, [index, first, last]);

  // Said once per slide, through a region that is on the page, empty, before
  // its first words: one that arrives already holding them is not read out,
  // and the first slide would be the one nobody hears.
  const [spoken, setSpoken] = useState("");
  const current = text[slide];
  useEffect(() => {
    setSpoken(t("onboarding.tour.announce", { current: index + 1, count, title: current.title }));
  }, [t, index, count, current.title]);

  // A slide taller than the stage (the review, in a short window) is cut at
  // the stage's foot, with the fade the app puts on any band that holds more.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { faded } = useScrollFade(stageRef, slide);

  const go = (delta: number) => setIndex((value) => tourStep(value, delta, count));

  return (
    // The same frame as the setup screen before it.
    <div
      className="oats-surface flex h-screen flex-col bg-background antialiased"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* The window is frameless; this band moves it and holds the traffic
          lights, at the same height as the app's own. */}
      <div
        className="h-[52px] shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div className="flex min-h-0 flex-1 items-center-safe overflow-y-auto px-8 pb-8">
        <section
          aria-label={t("onboarding.tour.label")}
          className="mx-auto flex w-full max-w-3xl flex-col"
        >
          <p role="status" aria-live="polite" className="sr-only">
            {spoken}
          </p>

          {/* Centred, as the setup screen before it is. Two lines are kept for
              the sentence, so a slide whose sentence is one line long does
              not move everything under it. */}
          <div key={slide} className="oats-enter text-center">
            <h1 className="text-balance text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {current.title}
            </h1>
            <p className="mx-auto mt-2 min-h-12 max-w-[64ch] text-sm leading-6 text-muted-foreground">
              {current.body}
            </p>
          </div>

          {/* The stage: the component, as the app draws it, in a box that
              takes no input. One height for every slide, so the controls
              under it never move: the tallest slide's (the review, about
              400px), or what the window has left, whichever is less. */}
          <div className="group relative mt-6">
            <div
              ref={stageRef}
              inert
              className="flex h-[clamp(320px,calc(100vh-260px),408px)] flex-col justify-center-safe overflow-clip"
            >
              <div>
                <div key={slide} className="oats-enter">
                  <View conversation={conversation} />
                </div>
              </div>
            </div>
            <ScrollFade edges={faded} />
          </div>

          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Button
              ref={skipRef}
              variant="ghost"
              onClick={onDone}
              className={cn("-ml-3 justify-self-start", last && "invisible")}
            >
              {t("onboarding.tour.skip")}
            </Button>

            <div className="flex items-center">
              {TOUR_SLIDES.map((id, position) => {
                const shown = position === index;
                return (
                  <Button
                    key={id}
                    variant="ghost"
                    size="icon-xs"
                    aria-label={text[id].title}
                    aria-current={shown ? "step" : undefined}
                    onClick={() => setIndex(position)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 rounded-full transition-colors duration-150 motion-reduce:transition-none",
                        shown ? "bg-primary" : "bg-border"
                      )}
                    />
                  </Button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 justify-self-end">
              <Button
                ref={backRef}
                variant="outline"
                onClick={() => go(-1)}
                className={cn(first && "invisible")}
              >
                {t("onboarding.tour.back")}
              </Button>
              <Button ref={forwardRef} onClick={last ? onDone : () => go(1)}>
                {last ? t("onboarding.tour.start") : t("onboarding.tour.next")}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
