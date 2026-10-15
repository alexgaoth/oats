import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { FilmClock } from "../brand/filmClock";
import { AppShot, cueAt } from "../edit/AppShot";
import { Fade } from "../edit/Fade";
import { TitleCard } from "../scenes/TitleCard";
import type { Capture } from "../edit/types";

/**
 * The demo film: about 62 seconds, no captions, no zooms. The whole window is
 * always in view and the pointer says where to look.
 *
 * The rules the cut follows:
 * - The camera holds the whole window. Zooms, even ones aimed at the thing
 *   that changes next, read as the film deciding for the viewer (cuts 3-5).
 * - Clips play at whole-number speeds (1, 6, 12), so each film frame moves the
 *   clip on by the same number of frames. A speed change is a ramp, and the
 *   film never slows down inside a stretch of fast time.
 * - A scene ends soon after its moment.
 *
 * To fine-tune: `npm run studio` in demo/video, then edit a scene below. Each
 * scene says where its clip starts (`FROM`, seconds into the capture, from its
 * cues), how fast it plays (`RATE`, or a `ramp`), and how long it lasts
 * (`seconds`).
 */

export const FPS = 60;
const s = (seconds: number) => Math.round(seconds * FPS);

/** Each scene dissolves in over the one before it; they share one backdrop. */
const OVERLAP = 8;

/**
 * A speed ramp, as a time map for AppShot: the clip plays at `from` times
 * until `start` seconds into the scene, then speeds up to `to` times over
 * `over` seconds (an S-curve), and holds there. Returns clip seconds past the
 * scene's `from`. The clip time is the integral of the speed, so it never jumps.
 */
const ramp = (from: number, to: number, start: number, over: number) => (t: number) => {
  const gain = to - from;
  if (t <= start) return from * t;
  const u = Math.min(1, (t - start) / over);
  // The integral of the smoothstep 3u² - 2u³ is u³ - u⁴/2.
  const during = over * (u * u * u - (u * u * u * u) / 2);
  const after = Math.max(0, t - start - over);
  return from * t + gain * (during + after);
};

type SceneProps = { seconds: number; children: React.ReactNode };
/** One scene of the film; OatsDemo places each after the one before it. */
const Scene: React.FC<SceneProps> = ({ children }) => <>{children}</>;

// Where each scene starts in its clip (seconds), and its playback rate.
const RECORD_FROM = (c: Capture) => cueAt(c, "recording") - 1.8;
/**
 * a-record: the replay itself speeds up from one to six times between the
 * cues "fast" and "fast-end", soon after Record. The film then triples that
 * (18x), and the scene ends with the clock at about 0:23.
 */
const RECORD_RAMP = (sceneSeconds: number, c: Capture) =>
  ramp(1, 3, cueAt(c, "fast-end") - RECORD_FROM(c), 0.5)(sceneSeconds);
/**
 * The time-lapse is baked into a clip of its own by director/bake-lapse.mjs:
 * from 0:22, where the record scene leaves the clock, at the same 18x, up to
 * 216x, through every topic and every return to an earlier one (the launch
 * date at 10:43 among them), and down to 6x at 17:32, where Words is chosen.
 * No slow-down inside it, and no cut: it runs into the Words scene.
 */
const LAPSE_SECONDS = 320 / 60;
const WORDS_FROM = (c: Capture) => cueAt(c, "words") - 1.4;
const SETTLE_FROM = (c: Capture) => cueAt(c, "words") + 16;
const SETTLE_RATE = 6;
const STOP_FROM = (c: Capture) => cueAt(c, "stopped") - 1.4;
const READ_FROM = (c: Capture) => cueAt(c, "opened") - 0.8;
const LINK_FROM = (c: Capture) => cueAt(c, "connections") - 1.2;
const SEARCH_FROM = (c: Capture) => cueAt(c, "search") - 0.8;
const GLOBAL_FROM = (c: Capture) => cueAt(c, "hover-arcs") - 1.5;

const SCENES = (
  <>
    {/* The grain is tossed, lands, and the name settles. */}
    <Scene seconds={3.5}>
      <TitleCard tossAt={0.3} />
    </Scene>

    {/* Home; New recording is pressed; the sidebar steps aside, the clock
        starts, and time speeds up. */}
    <Scene seconds={4.6}>
      <AppShot clip="a-record" from={RECORD_FROM} timeMap={RECORD_RAMP} />
    </Scene>

    {/* Seventeen minutes, fast: the line fills, the lanes grow a row per
        topic, and the room comes back to earlier topics. */}
    <Scene seconds={LAPSE_SECONDS}>
      <AppShot clip="b-lapse" cursor={false} />
    </Scene>

    {/* Words is chosen. */}
    <Scene seconds={3}>
      <AppShot clip="d-questions" from={WORDS_FROM} />
    </Scene>

    {/* The question card settles: answered, then unknown. */}
    <Scene seconds={5.5}>
      <AppShot clip="d-questions" from={SETTLE_FROM} rate={SETTLE_RATE} cursor={false} />
    </Scene>

    {/* Stop; the sidebar comes back; the conversation's title and summary land
        at the top of Recent. */}
    <Scene seconds={8}>
      <AppShot clip="e-stop" from={STOP_FROM} />
    </Scene>

    {/* The finished review: its shape (questions on the line, who talked),
        then it scrolls to the summary. */}
    <Scene seconds={7.4}>
      <AppShot clip="f-reading" from={READ_FROM} />
    </Scene>

    {/* Connections: the lanes with each question on its topic; SOC audit is
        chosen and its questions are listed. */}
    <Scene seconds={6.2}>
      <AppShot clip="f-connections" from={LINK_FROM} />
    </Scene>

    {/* Search: "import bug" across every conversation. */}
    <Scene seconds={5}>
      <AppShot clip="g-search" from={SEARCH_FROM} />
    </Scene>

    {/* Global conversations: one conversation lights in both maps, then the
        conversations of one subject, then the Work tab. */}
    <Scene seconds={11.2}>
      <AppShot clip="h-global" from={GLOBAL_FROM} />
    </Scene>

    {/* End card. */}
    <Scene seconds={4}>
      <TitleCard line="github.com/alexgaoth/oats" tossAt={0.1} />
    </Scene>
  </>
);

const scenes = React.Children.toArray((SCENES as React.ReactElement<{ children: React.ReactNode }>).props.children).map(
  (scene) => (scene as React.ReactElement<SceneProps>).props
);

/** Where each scene starts, in frames: right after the one before, less the dissolve. */
const starts = scenes.reduce<number[]>((list, scene, index) => {
  list.push(index === 0 ? 0 : list[index - 1] + s(scenes[index - 1].seconds) - OVERLAP);
  return list;
}, []);

export const OatsDemo: React.FC = () => {
  // The film's frame, for the backdrop's fluid (brand/filmClock.ts).
  const frame = useCurrentFrame();
  return (
    <FilmClock.Provider value={frame}>
      <AbsoluteFill style={{ background: "#f3f3f3" }}>
        {scenes.map((scene, index) => (
          <Sequence key={index} from={starts[index]} durationInFrames={s(scene.seconds)}>
            <Fade inFrames={index === 0 ? 0 : OVERLAP} outFrames={0}>
              {scene.children}
            </Fade>
          </Sequence>
        ))}
      </AbsoluteFill>
    </FilmClock.Provider>
  );
};

export const DURATION = starts[starts.length - 1] + s(scenes[scenes.length - 1].seconds);
