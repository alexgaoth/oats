import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { FilmClock } from "../brand/filmClock";
import { AppShot, cueAt } from "../edit/AppShot";
import { Fade } from "../edit/Fade";
import { TitleCard } from "../scenes/TitleCard";
import type { Capture } from "../edit/types";
import { speedCurve } from "../edit/speedCurve.mjs";
import { useCapture } from "../edit/useCapture";
import { WINDOW_LEFT, WINDOW_TOP } from "../edit/layout";
import { BrowserPopup } from "../scenes/BrowserPopup";

/**
 * The demo films: about 63 seconds, no captions, no zooms. The whole window is
 * always in view and the pointer says where to look. Two films share one cut:
 * `OatsDemo` (the Pellwood launch review, the app's own sample) and
 * `OatsIdeas` (a research discussion: RL, philosophy, the new labs, tech
 * news), each from its own takes (director/sets/).
 *
 * The rules the cut follows:
 * - The camera holds the whole window. Zooms, even ones aimed at the thing
 *   that changes next, read as the film deciding for the viewer (cuts 3-5).
 * - Fast stretches run on speed curves (edit/speedCurve.mjs): fast through
 *   what does not matter, slower, never stopped, around what does.
 * - A scene ends soon after its moment.
 *
 * To fine-tune: `npm run studio` in demo/video, then edit a scene below. Each
 * scene says where its clip starts (`*_FROM`, seconds into the capture, from
 * its cues), how fast it plays (a ramp or a speed curve), and how long it lasts
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
/** One scene of the film; a film places each after the one before it. */
const Scene: React.FC<SceneProps> = ({ children }) => <>{children}</>;

// Where each scene starts in its clip (seconds), from the take's cues.
const RECORD_FROM = (c: Capture) => cueAt(c, "recording") - 1.8;
/**
 * a-record: the replay itself speeds up from one to six times between the
 * cues "fast" and "fast-end", soon after Record. The film then triples that
 * (18x), and the scene ends with the clock at about 0:23.
 */
const RECORD_RAMP = (sceneSeconds: number, c: Capture) =>
  ramp(1, 3, cueAt(c, "fast-end") - RECORD_FROM(c), 0.5)(sceneSeconds);
const STOP_FROM = (c: Capture) => cueAt(c, "stopped") - 1.4;
const READ_FROM = (c: Capture) => cueAt(c, "opened") - 0.8;
const LINK_FROM = (c: Capture) => cueAt(c, "connections") - 1.2;
const SEARCH_FROM = (c: Capture) => cueAt(c, "search") - 0.8;
const GLOBAL_FROM = (c: Capture) => cueAt(c, "hover-arcs") - 1.5;
/** How long the browser stays forward with the search. */
const POPUP_HOLD = 1.6;

type FilmConfig = {
  /** The takes' clip names: "" for Pellwood, "ideas-" for the second film. */
  prefix: string;
  /**
   * The time-lapse, baked into its own frames by director/bake-lapse.mjs from
   * the set's speed curve (director/sets/): from where the record scene leaves
   * the clock, through every topic and return, down to 6x where Words is
   * chosen. Its length in seconds (the bake prints the frame count).
   */
  lapseSeconds: number;
  /**
   * d-questions, in one scene: Words is chosen, the stretch to the question
   * runs fast, and it slows as the question appears, meets "I don't know",
   * turns Unknown and is searched (auto-search). The speed curve over the take
   * (clip seconds), and when the search opened (the take's "searched" cue).
   */
  question: { at: number; speed: number }[];
  searched: number;
};

function makeFilm(config: FilmConfig) {
  const clip = (name: string) => `${config.prefix}${name}`;
  const questionCurve = speedCurve(config.question);
  /** The browser opens a beat after the card says it searched. */
  const searchAt = questionCurve.filmAt(config.searched) + 0.15;
  const questionSeconds = Math.round((searchAt + POPUP_HOLD + 0.6) * 60) / 60;

  const QuestionScene: React.FC = () => {
    const capture = useCapture(clip("d-questions"));
    const searched = capture?.cues.find((cue) => cue.name === "searched");
    return (
      <>
        <AppShot
          clip={clip("d-questions")}
          from={questionCurve.start}
          timeMap={(t) => questionCurve.clipAt(t) - questionCurve.start}
        />
        {searched && (
          <BrowserPopup
            at={searchAt}
            hold={POPUP_HOLD}
            query={String(searched.query)}
            searchBaseUrl={String(searched.searchBaseUrl)}
            x={WINDOW_LEFT + 360}
            y={WINDOW_TOP + 120}
            width={1000}
            height={620}
          />
        )}
      </>
    );
  };

  const SCENES = (
    <>
      {/* The grain is tossed, lands, and the name settles. */}
      <Scene seconds={3.5}>
        <TitleCard tossAt={0.3} />
      </Scene>

      {/* Home; New recording is pressed; the sidebar steps aside, the clock
          starts, and time speeds up. */}
      <Scene seconds={4.6}>
        <AppShot clip={clip("a-record")} from={RECORD_FROM} timeMap={RECORD_RAMP} />
      </Scene>

      {/* Seventeen minutes, fast: the line fills, the lanes grow a row per
          topic, and the room comes back to the first topic, which the speed
          curve lingers on. */}
      <Scene seconds={config.lapseSeconds}>
        <AppShot clip={clip("b-lapse")} cursor={false} />
      </Scene>

      {/* Words is chosen; a question meets "I don't know", turns Unknown, and
          the browser opens on its search and closes. */}
      <Scene seconds={questionSeconds}>
        <QuestionScene />
      </Scene>

      {/* Stop; the sidebar comes back; the conversation's title and summary
          land at the top of Recent. */}
      <Scene seconds={8}>
        <AppShot clip={clip("e-stop")} from={STOP_FROM} />
      </Scene>

      {/* The finished conversation: its shape (questions on the line, who
          talked), then it scrolls to the summary. */}
      <Scene seconds={7.4}>
        <AppShot clip={clip("f-reading")} from={READ_FROM} />
      </Scene>

      {/* Connections: the lanes with each question on its topic; one topic is
          chosen and its questions are listed. */}
      <Scene seconds={6.2}>
        <AppShot clip={clip("f-connections")} from={LINK_FROM} />
      </Scene>

      {/* Search: one term across every conversation. */}
      <Scene seconds={5}>
        <AppShot clip={clip("g-search")} from={SEARCH_FROM} />
      </Scene>

      {/* Global conversations: one conversation lights in both maps, then the
          conversations of one subject, then the Work tab. */}
      <Scene seconds={11.2}>
        <AppShot clip={clip("h-global")} from={GLOBAL_FROM} />
      </Scene>

      {/* End card. */}
      <Scene seconds={4}>
        <TitleCard line="github.com/alexgaoth/oats" tossAt={0.1} />
      </Scene>
    </>
  );

  const scenes = React.Children.toArray(
    (SCENES as React.ReactElement<{ children: React.ReactNode }>).props.children
  ).map((scene) => (scene as React.ReactElement<SceneProps>).props);

  /** Where each scene starts, in frames: right after the one before, less the dissolve. */
  const starts = scenes.reduce<number[]>((list, scene, index) => {
    list.push(index === 0 ? 0 : list[index - 1] + s(scenes[index - 1].seconds) - OVERLAP);
    return list;
  }, []);

  const Film: React.FC = () => {
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
  return { Film, duration: starts[starts.length - 1] + s(scenes[scenes.length - 1].seconds) };
}

/**
 * Pellwood. d-questions: Words is chosen 2.0 s into the take; "How long does
 * the full migration take on production?" appears at 45.2 s and is searched at
 * 48.6 s. The time-lapse is 331 frames.
 */
const PELLWOOD: FilmConfig = {
  prefix: "",
  lapseSeconds: 331 / 60,
  question: [
    { at: 1.0, speed: 1 },
    { at: 2.6, speed: 1 },
    { at: 5.0, speed: 20 },
    { at: 41.5, speed: 20 },
    { at: 44.0, speed: 2 },
    { at: 48.6, speed: 2 },
    { at: 49.0, speed: 1 },
  ],
  searched: 48.6,
};

/** The second film's content (filled in from its takes). */
const IDEAS: FilmConfig = { ...PELLWOOD, prefix: "ideas-" };

const pellwood = makeFilm(PELLWOOD);
export const OatsDemo = pellwood.Film;
export const DURATION = pellwood.duration;

const ideas = makeFilm(IDEAS);
export const OatsIdeas = ideas.Film;
export const IDEAS_DURATION = ideas.duration;
