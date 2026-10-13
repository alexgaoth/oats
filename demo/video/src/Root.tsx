import React from "react";
import { Composition } from "remotion";
import { loadInter } from "./brand/fonts";
import { TitleCard } from "./scenes/TitleCard";
import { AppShot } from "./edit/AppShot";

loadInter();

export const RemotionRoot: React.FC = () => (
  <>
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
        caption: { text: "When the room circles back, Oats draws the loop.", from: 0.4, to: 3.8 },
      }}
    />
  </>
);
