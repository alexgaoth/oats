import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { ScrollFade, useScrollFade } from "../conversation/useScrollFade";
import { DemoFlow, DemoOpen, DemoQuestions, DemoShape, DemoVoices } from "../demo";
import {
  TOUR_SLIDES,
  tourArrow,
  tourConversation,
  tourStep,
  type TourConversation,
} from "../../helpers/oatsTour.mjs";
import example from "../../helpers/sampleConversations/launch-readiness-review.json";

// The tour at the end of setup: what Oats does with a conversation, one slide
// at a time, each slide one of the app's own components taken out of its page.
//
// Not a picture of the product: the flow card, the question rail, the contour,
// the talk-time bars and the review are the components the app renders, given
// the example conversation Home offers until the first recording
// (`helpers/oatsTour.mjs` reads it). So the tour cannot drift from the product,
// and what it shows is what the person can open next.
//
// It shows; it does not teach. There is no "press here" and nothing to
// remember, and it never comes back: setup is already saved when it opens
// (OnboardingFlow.tsx), so Skip, Start or a quit all land in the app.
//
// The components can be used, as in the app: Lanes or Graph, a topic's quote,
// a press on the contour, a voice's turns, the answers, a card dismissed and
// brought back. Nothing in the tour is saved or sent. The slides are the demo
// pieces (`components/demo/`): they read no store, never call the main
// process, and are given none of the actions that would leave the window (a
// web search, opening a turn or a source, naming a voice), so those are not
// drawn. The tour moves only when asked to: Back, Next, the dots and the arrow
// keys, never by itself.

interface SlideProps {
  conversation: TourConversation;
}

/**
 * Room kept under a slide when it arrives, in px: what a press adds under the
 * flow card or the contour (the quote line, 63 to 67px), so the flow card
 * still fits the stage whole once a topic is quoted, in Lanes or Graph.
 */
const ROOM_FOR_PRESS = 64;

const VIEWS: Record<string, (props: SlideProps) => React.ReactElement> = {
  topics: DemoFlow,
  questions: DemoQuestions,
  shape: DemoShape,
  voices: DemoVoices,
  open: DemoOpen,
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

  // The arrow keys, while the focus is on the tour's own controls or on
  // nothing (`tourArrow`). On a control in a slide they are that control's:
  // the Lanes / Graph switch moves between its choices with them.
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const focusOf = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return "none";
      if (target === document.body || target === document.documentElement) return "none";
      if (stageRef.current?.contains(target)) return "slide";
      if (sectionRef.current?.contains(target)) return "tour";
      return "other";
    };
    const onKey = (event: KeyboardEvent) => {
      const delta = tourArrow(event, focusOf(event.target));
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

  // A slide taller than the stage (the review with its answers, a voice's
  // turns, or the review in a short window) scrolls inside the stage, with the
  // fade the app puts on any band that holds more.
  const { faded, measure } = useScrollFade(stageRef, slide);

  // A slide arrives a little above the middle of the stage, leaving room under
  // it for what a press adds (`ROOM_FOR_PRESS`), and stays where it arrived:
  // a quote, a voice's turns or the answers grow downward, so nothing moves
  // under the pointer, and past the stage's foot the stage scrolls. Placed
  // again only for a new slide or a new stage height.
  const slideRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const content = slideRef.current;
    if (!stage || !content) return undefined;
    // A new slide starts at its top, whatever the last one was scrolled to.
    stage.scrollTop = 0;
    let height = -1;
    const place = () => {
      if (stage.clientHeight === height) return;
      height = stage.clientHeight;
      setOffset(Math.max(0, Math.floor((height - content.offsetHeight - ROOM_FOR_PRESS) / 2)));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [slide]);

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
          ref={sectionRef}
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

          {/* The stage: the component, as the app draws it, and usable. One
              height for every slide, so the controls under it never move:
              the tallest slide's at rest (the review, about 400px), or what
              the window has left, whichever is less. */}
          <div className="group relative mt-6">
            <div
              ref={stageRef}
              onScroll={measure}
              className="h-[clamp(320px,calc(100vh-260px),408px)] overflow-y-auto overscroll-contain"
            >
              <div style={{ paddingTop: offset }}>
                <div key={slide} ref={slideRef} className="oats-enter">
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
