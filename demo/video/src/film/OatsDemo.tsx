import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AppShot, cueAt, rectAt } from "../edit/AppShot";
import type { Shot } from "../edit/Camera";
import { Fade } from "../edit/Fade";
import { TitleCard } from "../scenes/TitleCard";
import type { Capture, Rect } from "../edit/types";

/**
 * The demo film: about 75 seconds, no captions. The camera tells it.
 *
 * The rules the cut follows:
 * - Every move goes to one thing, the thing that changes next, and arrives
 *   before it changes. Otherwise the camera holds the whole window.
 * - Zooms are 1, 1.5 or 2 only. At 1 and 2 the app's pixels land on the film's
 *   exactly, so its dithered fills stay still; 1.5 frames only what has no
 *   dither (lines, words).
 * - The camera never drifts: a held shot is the same pixels frame to frame.
 * - Clips play at whole-number speeds (1, 3, 6, 10), so each film frame moves
 *   the clip on by the same number of frames. A speed change is a ramp.
 * - A scene ends soon after its moment.
 *
 * To fine-tune: `npm run studio` in demo/video, then edit a scene below. Each
 * scene says where its clip starts (`FROM`, seconds into the capture, from its
 * cues), how fast it plays (`RATE`, or a `ramp`), how long it lasts
 * (`seconds`), and where the camera goes (`shots`: `at` seconds into the
 * scene, `ease` how long the move takes, `zoom` and `focus` an app point in
 * CSS px, or `full`).
 */

export const FPS = 60;
const s = (seconds: number) => Math.round(seconds * FPS);

/** Each scene dissolves in over the one before it; they share one backdrop. */
const OVERLAP = 8;

type Point = { x: number; y: number };

const full = (at: number, ease?: number): Shot => ({ at, ease, full: true });
const zoomTo = (at: number, zoom: number, focus: Point, ease?: number): Shot => ({ at, ease, zoom, focus });

/** The centre of a measured rect, nudged by (dx, dy). */
const centre = (rect: Rect | "full", dx = 0, dy = 0): Point =>
  rect === "full" ? { x: 720 + dx, y: 450 + dy } : { x: rect.x + rect.w / 2 + dx, y: rect.y + rect.h / 2 + dy };

/** Scene time for a moment in the clip, given where the scene starts in the clip and how fast it plays. */
const at = (capture: Capture, start: number, rate: number) => (cue: string, offset = 0) =>
  Math.max(0, (cueAt(capture, cue) + offset - start) / rate);

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
 * b-timelapse is the replay at six times from 0:20; 0.6 s in, the clock is
 * at about 0:24, where the record scene left it. It starts at the record
 * scene's 18x (3) and speeds up to 60x (10).
 */
const LAPSE_FROM = 0.6;
const LAPSE_RAMP = ramp(3, 10, 0, 0.6);
/**
 * c-return: the recording starts at 10:04. The line climbs back to the launch
 * date 38.8 s in: the room returns at 10:33, and the tracker is sure of it a
 * few turns later (read off the capture's frames).
 */
const RETURN_FROM = 32;
const RETURN_RATE = 3;
const WORDS_FROM = (c: Capture) => cueAt(c, "words") - 1.4;
const SETTLE_FROM = (c: Capture) => cueAt(c, "words") + 16;
const SETTLE_RATE = 6;
const STOP_FROM = (c: Capture) => cueAt(c, "stopped") - 1.4;
const READ_FROM = (c: Capture) => cueAt(c, "opened") - 0.8;
const LINK_FROM = (c: Capture) => cueAt(c, "connections") - 1.2;
const SEARCH_FROM = (c: Capture) => cueAt(c, "search") - 0.8;
const GLOBAL_FROM = (c: Capture) => cueAt(c, "hover-arcs") - 1.5;
const FOOT_FROM = (c: Capture) => cueAt(c, "footer") - 1.0;

const SCENES = (
  <>
    {/* The grain is tossed, lands, and the name settles. */}
    <Scene seconds={3.5}>
      <TitleCard tossAt={0.3} />
    </Scene>

    {/* Home; New recording is pressed; the sidebar steps aside, the clock
        starts, and time speeds up. The whole window: the glide is the moment. */}
    <Scene seconds={4.6}>
      <AppShot clip="a-record" from={RECORD_FROM} timeMap={RECORD_RAMP} shots={[full(0)]} />
    </Scene>

    {/* The first minutes, fast: the line fills, and the lanes grow a row per topic. */}
    <Scene seconds={7}>
      <AppShot clip="b-timelapse" from={LAPSE_FROM} timeMap={LAPSE_RAMP} cursor={false} shots={[full(0)]} />
    </Scene>

    {/* The room comes back to the launch date: the line climbs to the first row
        and the honey dot goes with it. The whole window. */}
    <Scene seconds={5}>
      <AppShot clip="c-return" from={RETURN_FROM} rate={RETURN_RATE} cursor={false} shots={[full(0)]} />
    </Scene>

    {/* Words is chosen. */}
    <Scene seconds={3}>
      <AppShot clip="d-questions" from={WORDS_FROM} shots={[full(0)]} />
    </Scene>

    {/* The question card settles: answered, then unknown. Framed without the
        dithered line, so 1.5 is safe. */}
    <Scene seconds={5.5}>
      <AppShot
        clip="d-questions"
        from={SETTLE_FROM}
        rate={SETTLE_RATE}
        cursor={false}
        shots={(c) => {
          const flow = rectAt(c, "flow");
          const card: Point = flow === "full" ? { x: 720, y: 640 } : { x: flow.x + flow.w / 2, y: flow.y + flow.h + 40 };
          return [zoomTo(0, 1.5, card)];
        }}
      />
    </Scene>

    {/* Stop, in close; the camera pulls out with the view; the conversation's
        title and summary land at the top of Recent, in close. */}
    <Scene seconds={9.5}>
      <AppShot
        clip="e-stop"
        from={STOP_FROM}
        shots={(c) => {
          const t = at(c, STOP_FROM(c), 1);
          const stop = centre(rectAt(c, "stop"), -200, 110);
          const recent = centre(rectAt(c, "recent"), 0, 150);
          return [
            zoomTo(0, 2, stop),
            full(t("stopped", 0.9), 0.8),
            full(t("stopped", 4.2)),
            zoomTo(t("stopped", 5.0), 1.5, recent, 0.8),
          ];
        }}
      />
    </Scene>

    {/* The finished review: in close, its shape (questions on the line, who
        talked); then out, as it scrolls to the summary. */}
    <Scene seconds={8.6}>
      <AppShot
        clip="f-reading"
        from={READ_FROM}
        shots={(c) => {
          const t = at(c, READ_FROM(c), 1);
          const card = centre(rectAt(c, "shape"));
          return [full(0), full(t("opened", 0.6)), zoomTo(t("opened", 1.6), 2, card, 1.0), full(t("scroll", -0.1), 0.8)];
        }}
      />
    </Scene>

    {/* Connections: the lanes with each question on its topic; SOC audit is
        chosen and its questions are listed. */}
    <Scene seconds={6.2}>
      <AppShot
        clip="f-connections"
        from={LINK_FROM}
        shots={(c) => {
          const t = at(c, LINK_FROM(c), 1);
          const lanes = rectAt(c, "lanes");
          const top = centre(lanes, 0, lanes === "full" ? 0 : -lanes.h / 2 + 225);
          const lower = centre(lanes, 0, lanes === "full" ? 0 : -lanes.h / 2 + 300);
          return [full(0), full(t("connections", 0.5)), zoomTo(t("connections", 1.4), 2, top, 0.9), zoomTo(t("soc", 0.7), 2, lower, 0.7)];
        }}
      />
    </Scene>

    {/* Search: "import bug" across every conversation. */}
    <Scene seconds={5.5}>
      <AppShot
        clip="g-search"
        from={SEARCH_FROM}
        shots={(c) => {
          const t = at(c, SEARCH_FROM(c), 1);
          const field = rectAt(c, "field");
          const results: Point = field === "full" ? { x: 836, y: 300 } : { x: field.x + 368, y: field.y + 240 };
          return [full(0), full(t("typed", 0.2)), zoomTo(t("typed", 1.1), 1.5, results, 0.8)];
        }}
      />
    </Scene>

    {/* Global conversations: one conversation lights in both maps, then the
        conversations of one subject, then the Work tab. The whole board, so
        both maps are always in view; the pointer says where to look. */}
    <Scene seconds={11.2}>
      <AppShot clip="h-global" from={GLOBAL_FROM} shots={[full(0)]} />
    </Scene>

    {/* On this Mac: the sidebar's foot, over the field, in close. */}
    <Scene seconds={3.5}>
      <AppShot
        clip="h-global"
        from={FOOT_FROM}
        shots={(c) => {
          const t = at(c, FOOT_FROM(c), 1);
          return [full(0), zoomTo(t("footer", 0.3), 2, centre(rectAt(c, "footer"), 200, 60), 0.9)];
        }}
      />
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

export const OatsDemo: React.FC = () => (
  <AbsoluteFill style={{ background: "#ffffff" }}>
    {scenes.map((scene, index) => (
      <Sequence key={index} from={starts[index]} durationInFrames={s(scene.seconds)}>
        <Fade inFrames={index === 0 ? 0 : OVERLAP} outFrames={0}>
          {scene.children}
        </Fade>
      </Sequence>
    ))}
  </AbsoluteFill>
);

export const DURATION = starts[starts.length - 1] + s(scenes[scenes.length - 1].seconds);
