import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AppShot, cueAt } from "../edit/AppShot";
import { Caption } from "../edit/Caption";
import { Fade } from "../edit/Fade";
import { SpeedChip } from "../edit/SpeedChip";
import { TitleCard } from "../scenes/TitleCard";
import type { Rect } from "../edit/types";

/**
 * The demo film: 90 seconds, twelve scenes, captions only. The storyboard is
 * https://claude.ai/artifact/XcnMd4dEkEaDXENkSHcSSo. Every app shot is the real
 * renderer, captured by director/capture.mjs from the demo kit's sample
 * launch review; regions are in the app's CSS pixels (1440×900).
 */

export const FPS = 60;
const s = (seconds: number) => Math.round(seconds * FPS);

/** Regions of the app the camera moves to. */
const R: Record<string, Rect> = {
  // The recording card: clock, counters, the live line, Calm / Words.
  status: { x: 236, y: 64, w: 968, h: 312 },
  // The recording card and the flow card under it.
  live: { x: 220, y: 56, w: 1000, h: 640 },
  // The flow card on its own.
  flow: { x: 236, y: 366, w: 968, h: 605 },
  // The question card under the flow card, and the live words under it.
  questions: { x: 236, y: 560, w: 968, h: 340 },
  // The top of Recent conversations on Home.
  recent: { x: 470, y: 250, w: 740, h: 462 },
  // The Stop button with its key.
  stop: { x: 780, y: 30, w: 480, h: 300 },
  // Search and its results.
  search: { x: 452, y: 56, w: 760, h: 420 },
  // The sidebar's foot: On this Mac, over the field.
  footer: { x: 0, y: 600, w: 480, h: 300 },
};

/** A caption over a shot that has its own, for a second line within one scene. */
const CaptionOnly: React.FC<{ text: string; from: number; to: number; instant?: boolean }> = ({
  text,
  from,
  to,
  instant,
}) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 54 }}>
    <Caption text={text} from={instant ? -1 : from} to={to} />
  </AbsoluteFill>
);

type SceneProps = { seconds: number; children: React.ReactNode; fadeIn?: number; fadeOut?: number };

/** One scene of the film; OatsDemo places each after the one before it. */
const Scene: React.FC<SceneProps> = ({ children }) => <>{children}</>;

const SCENES = (
  <>
      {/* 1. Cold open: the grain is tossed, lands, and the name settles. */}
      <Scene seconds={4} fadeIn={0}>
        <TitleCard tossAt={0.35} />
      </Scene>

      {/* 2–3. Home; New recording; the sidebar steps aside and the clock starts. */}
      <Scene seconds={12}>
        <AppShot
          clip="a-record"
          from={0}
          shots={[
            { at: 0, rect: "full" },
            { at: 5.6, rect: "full" },
            { at: 7.2, rect: R.status, ease: 1.4 },
          ]}
          caption={{ text: "Nine people. Thirty minutes. One laptop on the table.", from: 0.4, to: 3.6 }}
        />
        <CaptionOnly text="Press record. Then look up." from={5.4} to={11.2} />
      </Scene>

      {/* 4. The first eleven minutes as a time-lapse. */}
      <Scene seconds={12}>
        <AppShot
          clip="b-timelapse"
          rate={9.4}
          cursor={false}
          shots={[{ at: 0, rect: R.live }]}
          caption={{ text: "No transcript racing past. Just the shape of the room.", from: 0.6, to: 10.8 }}
        />
        <SpeedChip label="56×" />
      </Scene>

      {/* 5. The room returns to the launch date and Auto draws the graph. */}
      <Scene seconds={10}>
        <AppShot
          clip="c-graph"
          from={14}
          cursor={false}
          shots={[{ at: 0, rect: R.live }, { at: 2.2, rect: R.flow, ease: 1.6 }]}
          caption={{ text: "When the room circles back, Oats draws the loop.", from: 1.2, to: 9.0 }}
        />
      </Scene>

      {/* 6. Words, and two questions settle: answered, then unknown. */}
      <Scene seconds={4}>
        <AppShot
          clip="d-questions"
          from={(capture) => cueAt(capture, "words") - 1.6}
          shots={[{ at: 0, rect: R.status }]}
          caption={{ text: "Every question asked, and whether anyone answered.", from: 0.5, to: 12 }}
        />
      </Scene>
      <Scene seconds={8} fadeIn={0}>
        <AppShot
          clip="d-questions"
          from={(capture) => cueAt(capture, "words") + 12.5}
          rate={5}
          cursor={false}
          shots={[{ at: 0, rect: R.questions }]}
          caption={{ text: "Every question asked, and whether anyone answered.", from: -1, to: 7.4, at: "top" }}
        />
        <SpeedChip label="5×" />
      </Scene>

      {/* 7. Stop, with its key; the sidebar comes back; the conversation gets its
          title and summary a few seconds later (Stop + 5.4 s in the capture). */}
      <Scene seconds={8}>
        <AppShot
          clip="e-stop"
          from={(capture) => cueAt(capture, "stopped") - 1.6}
          shots={[
            { at: 0, rect: R.stop },
            { at: 1.6, rect: R.stop },
            { at: 3.0, rect: "full", ease: 1.1 },
            { at: 4.2, rect: "full" },
            { at: 5.6, rect: R.recent, ease: 1.2 },
          ]}
          caption={{ text: "Stop. It's already written up.", from: 3.4, to: 7.8 }}
        />
      </Scene>

      {/* 8. The finished review, read top to bottom. */}
      <Scene seconds={10}>
        <AppShot
          clip="f-reading"
          from={(capture) => cueAt(capture, "opened") - 0.6}
          rate={1.8}
          shots={[{ at: 0, rect: "full" }]}
          caption={{ text: "Summary, threads, who spoke, and what's still open.", from: 1.4, to: 9.3 }}
        />
      </Scene>

      {/* 9. Search: every conversation, in a fraction of a millisecond. */}
      <Scene seconds={8}>
        <AppShot
          clip="g-search"
          from={(capture) => cueAt(capture, "search") - 1.2}
          shots={[{ at: 0, rect: "full" }, { at: 3.6, rect: R.search, ease: 1.2 }]}
          caption={{ text: "Find anything anyone said, in milliseconds.", from: 0.8, to: 7.4 }}
        />
      </Scene>

      {/* 10. List / Map. */}
      <Scene seconds={6}>
        <AppShot
          clip="h-map"
          from={(capture) => cueAt(capture, "map") - 1.4}
          shots={[{ at: 0, rect: "full" }]}
          caption={{ text: "See what keeps coming back.", from: 1.4, to: 5.6 }}
        />
      </Scene>

      {/* 11. On this Mac. */}
      <Scene seconds={4}>
        <AppShot
          clip="h-map"
          from={(capture) => cueAt(capture, "footer") - 0.2}
          shots={[{ at: 0, rect: "full" }, { at: 1.2, rect: R.footer, ease: 1.1 }]}
          caption={{ text: "Audio and transcripts never leave your Mac.", from: 0.6, to: 3.8 }}
        />
      </Scene>

      {/* 12. End card. */}
      <Scene seconds={4} fadeOut={0}>
        <TitleCard line="github.com/alexgaoth/oats" tossAt={0.1} />
      </Scene>
  </>
);

export const OatsDemo: React.FC = () => {
  let from = 0;
  const scenes = React.Children.toArray((SCENES as React.ReactElement<{ children: React.ReactNode }>).props.children);
  return (
    <AbsoluteFill style={{ background: "#fafaf9" }}>
      {scenes.map((scene, index) => {
        const { seconds, fadeIn = 8, fadeOut = 8, children } = (scene as React.ReactElement<SceneProps>).props;
        const start = from;
        from += s(seconds);
        return (
          <Sequence key={index} from={start} durationInFrames={s(seconds)}>
            <Fade inFrames={fadeIn} outFrames={fadeOut}>
              {children}
            </Fade>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const DURATION = s(4 + 12 + 12 + 10 + 4 + 8 + 8 + 10 + 8 + 6 + 4 + 4);
