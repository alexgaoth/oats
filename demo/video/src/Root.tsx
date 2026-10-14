import React from "react";
import { Composition, Still } from "remotion";
import { loadInter, loadWordmark } from "./brand/fonts";
import { TitleCard } from "./scenes/TitleCard";
import { AppShot } from "./edit/AppShot";
import { MarkStill } from "./scenes/MarkStill";
import { AppStill, stillSize } from "./edit/AppStill";
import { DURATION, FPS, OatsDemo } from "./film/OatsDemo";
import type { Rect } from "./edit/types";

// The README's pictures: name, the harness shot it is made from, and the card
// to lift out of it (app CSS pixels), or none for the whole window.
const README_STILLS: { name: string; image: string; rect?: Rect }[] = [
  { name: "hero", image: "live-calm-graph" },
  { name: "recording", image: "live-calm-stack", rect: { x: 240, y: 64, w: 960, h: 306 } },
  { name: "topics", image: "live-calm-graph", rect: { x: 240, y: 360, w: 960, h: 392 } },
  { name: "questions", image: "reading-outcomes", rect: { x: 470, y: 48, w: 732, h: 560 } },
  { name: "reading", image: "reading-summary" },
  { name: "search", image: "search", rect: { x: 470, y: 64, w: 732, h: 340 } },
  { name: "map", image: "map" },
];

loadInter();
loadWordmark();

export const RemotionRoot: React.FC = () => (
  <>
    <Still id="Mark" component={MarkStill} width={512} height={512} />
    <Composition id="OatsDemo" component={OatsDemo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    {README_STILLS.flatMap(({ name, image, rect }) =>
      (["light", "dark"] as const).map((theme) => {
        const size = stillSize(rect, rect ? 1760 : 1920);
        return (
          <Still
            key={`${name}-${theme}`}
            id={`readme-${name}-${theme}`}
            component={AppStill}
            width={size.width}
            height={size.height}
            defaultProps={{ image, rect, dark: theme === "dark", width: size.width }}
          />
        );
      })
    )}
    <Composition
      id="TitleCard"
      component={TitleCard}
      durationInFrames={150}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{ line: "github.com/alexgaoth/oats", tossAt: 0.25 }}
    />
    <Composition
      id="SelfTest"
      component={AppShot}
      durationInFrames={270}
      fps={60}
      width={1920}
      height={1080}
      defaultProps={{
        clip: "_selftest",
        shots: [
          { at: 0, rect: "full" as const },
          { at: 1.4, rect: { x: 440, y: 260, w: 420, h: 236 } },
          { at: 3.2, rect: "full" as const },
        ],
      }}
    />
  </>
);
