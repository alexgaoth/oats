import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../brand/Backdrop";
import { Grain } from "../brand/Grain";
import { WORDMARK_FONT } from "../brand/fonts";
import { theme } from "../brand/theme";

/** The cold open and the end card: the grain is tossed, lands, and the name settles beside it. */
export const TitleCard: React.FC<{ line?: string; tossAt?: number }> = ({ line, tossAt = 0.25 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tossFrames = Math.round(1.15 * fps); // SPIN_MS in the app
  const start = Math.round(tossAt * fps);
  const progress = Math.min(1, Math.max(0, (frame - start) / tossFrames));
  const settle = spring({ frame: frame - start - Math.round(tossFrames * 0.7), fps, config: { damping: 200 } });
  const lineIn = spring({ frame: frame - start - tossFrames, fps, config: { damping: 200 } });
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: theme.font }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Grain id="title-grain" size={220} progress={progress} />
          <div
            style={{
              // hillclimb.com's title: EB Garamond 400, tight, near-black.
              fontFamily: WORDMARK_FONT,
              fontSize: 200,
              fontWeight: 400,
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              color: "#1a1a1a",
              opacity: settle,
              transform: `translateX(${interpolate(settle, [0, 1], [-24, 0])}px)`,
            }}
          >
            Oats
          </div>
        </div>
        {line && (
          <div
            style={{
              position: "absolute",
              top: "68%",
              fontSize: 36,
              fontWeight: 500,
              color: theme.muted,
              letterSpacing: "-0.01em",
              opacity: lineIn,
              transform: `translateY(${interpolate(lineIn, [0, 1], [12, 0])}px)`,
            }}
          >
            {line}
          </div>
        )}
      </AbsoluteFill>
    </Backdrop>
  );
};
