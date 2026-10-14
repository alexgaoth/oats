import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AppShot, cueAt, rectAt } from "../edit/AppShot";
import { Fade } from "../edit/Fade";
import { TitleCard } from "../scenes/TitleCard";
import type { Capture, Rect } from "../edit/types";

/**
 * The demo film: about 90 seconds, no captions. The camera tells it: it starts
 * on the whole window, moves in on what changes, and drifts while it holds.
 * Every app shot is the real renderer, captured by director/capture.mjs from
 * the demo kit's sample launch review. The director measures the cards it
 * frames (`d.rect`), so the camera follows the app's real layout.
 */

export const FPS = 60;
const s = (seconds: number) => Math.round(seconds * FPS);

/**
 * Each scene dissolves in over the one before it. The scenes share one
 * backdrop, so only the app changes.
 */
const OVERLAP = 8;

type Region = Rect | "full";

/** A region grown by `by` CSS px on every side. */
const pad = (region: Region, by: number): Region =>
  region === "full" ? region : { x: region.x - by, y: region.y - by, w: region.w + by * 2, h: region.h + by * 2 };

/** The smallest region holding both. */
const union = (a: Region, b: Region): Region => {
  if (a === "full" || b === "full") return "full";
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** The same region, closer: shrunk around its centre, for a slow push while the camera holds. */
const closer = (region: Region, factor: number): Region => {
  if (region === "full") return { x: 1440 * (1 - factor) / 2, y: 900 * (1 - factor) / 2, w: 1440 * factor, h: 900 * factor };
  const w = region.w * factor;
  const h = region.h * factor;
  return { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h };
};

/** The Recent conversations list, from its heading down. */
const recentList = (heading: Region): Region =>
  heading === "full" ? heading : { x: heading.x - 16, y: heading.y - 12, w: heading.w + 32, h: 360 };

/** The strip of the window under a card, for what appears below it. */
const below = (region: Region): Region =>
  region === "full" ? region : { x: region.x, y: region.y + region.h - 12, w: region.w, h: 900 - (region.y + region.h) + 12 };

/**
 * Scene time for a cue in the clip: where the scene starts in the clip
 * (`start`, seconds) and how fast it plays (`rate`) turn the clip's clock into
 * the scene's.
 */
const at = (capture: Capture, start: number, rate: number) => (cue: string, offset = 0) =>
  Math.max(0, (cueAt(capture, cue) + offset - start) / rate);

type SceneProps = { seconds: number; children: React.ReactNode };
/** One scene of the film; OatsDemo places each after the one before it. */
const Scene: React.FC<SceneProps> = ({ children }) => <>{children}</>;

// Where each clip's scene starts, by its cues.
const RECORD_FROM = (c: Capture) => cueAt(c, "recording") - 2.6;
const RETURN_FROM = 16;
const RETURN_RATE = 3;
const WORDS_FROM = (c: Capture) => cueAt(c, "words") - 1.4;
const SETTLE_FROM = (c: Capture) => cueAt(c, "words") + 12.5;
const STOP_FROM = (c: Capture) => cueAt(c, "stopped") - 1.4;
const READ_FROM = (c: Capture) => cueAt(c, "opened") - 0.6;
const READ_RATE = 1.6;
const LINK_FROM = (c: Capture) => cueAt(c, "connections") - 0.8;
const SEARCH_FROM = (c: Capture) => cueAt(c, "search") - 0.8;
const GLOBAL_FROM = (c: Capture) => cueAt(c, "global") - 0.6;
const GLOBAL_RATE = 1.35;
const FOOT_FROM = (c: Capture) => cueAt(c, "footer") - 1.2;

const SCENES = (
  <>
    {/* The grain is tossed, lands, and the name settles. */}
    <Scene seconds={4}>
      <TitleCard tossAt={0.35} />
    </Scene>

    {/* Home; New recording; the sidebar steps aside and the clock starts. */}
    <Scene seconds={9}>
      <AppShot
        clip="a-record"
        from={RECORD_FROM}
        shots={(c) => {
          const t = at(c, RECORD_FROM(c), 1);
          const status = pad(rectAt(c, "status"), 36);
          return [
            { at: 0, rect: "full" },
            { at: t("recording", 0.7), rect: "full" },
            { at: t("recording", 2.6), rect: status, ease: 1.6 },
            { at: t("recording", 6.2), rect: closer(status, 0.93), ease: 3.4 },
          ];
        }}
      />
    </Scene>

    {/* The first eleven minutes: the line fills and the lanes grow, row by row. */}
    <Scene seconds={12}>
      <AppShot
        clip="b-timelapse"
        rate={9.4}
        cursor={false}
        shots={(c) => {
          // The flow card grows a row for every new topic (five by 11:40), so
          // the camera holds the clock card and the room the lanes grow into.
          const status = rectAt(c, "status");
          const column: Region =
            status === "full" ? status : { x: status.x - 32, y: status.y - 20, w: status.w + 64, h: 560 };
          return [
            { at: 0, rect: column },
            { at: 11.8, rect: closer(column, 0.95), ease: 11 },
          ];
        }}
      />
    </Scene>

    {/* The room comes back to the launch date: the line climbs to the first row. */}
    <Scene seconds={7}>
      <AppShot
        clip="c-return"
        from={RETURN_FROM}
        rate={RETURN_RATE}
        cursor={false}
        shots={(c) => {
          // The whole card, labels and all: the climb is the line going back
          // up to the first row.
          const flow = pad(rectAt(c, "flow"), 40);
          return [
            { at: 0, rect: pad(flow, 60) },
            { at: 2.2, rect: flow, ease: 1.8 },
            { at: 6.8, rect: closer(flow, 0.95), ease: 4.4 },
          ];
        }}
      />
    </Scene>

    {/* Words, and two questions settle: answered, then unknown. */}
    <Scene seconds={3.6}>
      <AppShot
        clip="d-questions"
        from={WORDS_FROM}
        shots={(c) => [{ at: 0, rect: pad(rectAt(c, "status"), 30) }, { at: 3.5, rect: closer(pad(rectAt(c, "status"), 30), 0.96), ease: 3.4 }]}
      />
    </Scene>
    <Scene seconds={7}>
      <AppShot
        clip="d-questions"
        from={SETTLE_FROM}
        rate={5}
        cursor={false}
        shots={(c) => {
          const questions = pad(below(rectAt(c, "flow")), 36);
          return [
            { at: 0, rect: questions },
            { at: 6.8, rect: closer(questions, 0.96), ease: 6.4 },
          ];
        }}
      />
    </Scene>

    {/* Stop, with its key; the sidebar comes back; the conversation is written up:
        its title and summary land in Recent 5.4 s after Stop, and stay in shot. */}
    <Scene seconds={9.5}>
      <AppShot
        clip="e-stop"
        from={STOP_FROM}
        shots={(c) => {
          const t = at(c, STOP_FROM(c), 1);
          return [
            { at: 0, rect: pad(rectAt(c, "stop"), 150) },
            { at: t("stopped", 0), rect: pad(rectAt(c, "stop"), 120), ease: 1.4 },
            // Stop takes the recording view away at once: pull out with it.
            { at: t("stopped", 0.9), rect: "full", ease: 0.8 },
            { at: t("stopped", 3.2), rect: "full" },
            { at: t("stopped", 4.8), rect: recentList(rectAt(c, "recent")), ease: 1.3 },
          ];
        }}
      />
    </Scene>

    {/* The finished review: its shape, who talked, then the summary. */}
    <Scene seconds={8.5}>
      <AppShot
        clip="f-reading"
        from={READ_FROM}
        rate={READ_RATE}
        shots={(c) => {
          const t = at(c, READ_FROM(c), READ_RATE);
          // The card with the contour and talk time, and the title above it.
          const card = rectAt(c, "shape");
          const shape: Region =
            card === "full" ? card : { x: card.x - 16, y: card.y - 150, w: card.w + 32, h: card.h + 170 };
          return [
            { at: 0, rect: "full" },
            { at: t("opened", 1.4), rect: shape, ease: 1.2 },
            { at: t("opened", 2.8), rect: closer(shape, 0.95), ease: 1.2 },
            { at: t("opened", 4.6), rect: "full", ease: 1.4 },
          ];
        }}
      />
    </Scene>

    {/* Connections: each question on the topic it was asked in; SOC audit chosen. */}
    <Scene seconds={7}>
      <AppShot
        clip="f-connections"
        from={LINK_FROM}
        shots={(c) => {
          const t = at(c, LINK_FROM(c), 1);
          const lanes = pad(rectAt(c, "lanes"), 16);
          return [
            { at: 0, rect: "full" },
            { at: t("connections", 1.5), rect: lanes, ease: 1.3 },
            { at: t("soc", 3.6), rect: closer(lanes, 0.95), ease: 3.2 },
          ];
        }}
      />
    </Scene>

    {/* Search: every conversation, in a fraction of a millisecond. */}
    <Scene seconds={6.5}>
      <AppShot
        clip="g-search"
        from={SEARCH_FROM}
        shots={(c) => {
          const t = at(c, SEARCH_FROM(c), 1);
          const field = rectAt(c, "field");
          const results: Region = field === "full" ? field : { x: field.x - 8, y: field.y - 8, w: 740, h: 470 };
          return [
            { at: 0, rect: "full" },
            { at: t("typed", 0.6), rect: "full" },
            { at: t("typed", 1.9), rect: results, ease: 1.2 },
          ];
        }}
      />
    </Scene>

    {/* Global conversations: one conversation lights in both maps, then a subject,
        then the Work tab. */}
    <Scene seconds={12}>
      <AppShot
        clip="h-global"
        from={GLOBAL_FROM}
        rate={GLOBAL_RATE}
        shots={(c) => {
          const t = at(c, GLOBAL_FROM(c), GLOBAL_RATE);
          const board = pad(union(rectAt(c, "force"), rectAt(c, "arcs")), 12);
          return [
            { at: 0, rect: "full" },
            { at: t("hover-arcs", -0.6), rect: board, ease: 1.2 },
            { at: t("hover-subject", 0), rect: closer(board, 0.95), ease: 5 },
            { at: t("work", 0.4), rect: "full", ease: 1.1 },
          ];
        }}
      />
    </Scene>

    {/* On this Mac: the footer over the field. */}
    <Scene seconds={4.5}>
      <AppShot
        clip="h-global"
        from={FOOT_FROM}
        shots={(c) => {
          const t = at(c, FOOT_FROM(c), 1);
          return [
            { at: 0, rect: "full" },
            { at: t("footer", 0.6), rect: pad(rectAt(c, "footer"), 150), ease: 1.3 },
          ];
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
  <AbsoluteFill style={{ background: "#fafaf9" }}>
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
