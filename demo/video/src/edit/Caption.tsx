import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../brand/theme";

/** A line that arrives word by word, holds, and leaves: the film's only voice. */
export const Caption: React.FC<{
  text: string;
  /** Seconds into the scene when it starts arriving, and when it leaves. */
  from: number;
  to: number;
  dark?: boolean;
}> = ({ text, from, to, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < from - 0.05 || t > to + 0.6) return null;
  const words = text.split(" ");
  const leave = interpolate(t, [to, to + 0.45], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 0.28em",
        padding: "18px 30px",
        borderRadius: 18,
        background: dark ? "rgba(24,24,27,0.72)" : "rgba(255,255,255,0.82)",
        backdropFilter: "blur(14px)",
        boxShadow: dark ? "0 10px 40px rgba(0,0,0,0.4)" : "0 10px 36px rgba(107,66,16,0.16)",
        fontFamily: theme.font,
        fontSize: 46,
        fontWeight: 600,
        letterSpacing: "-0.018em",
        color: dark ? "#fafaf9" : theme.ink,
        opacity: leave,
        maxWidth: 1500,
      }}
    >
      {words.map((word, index) => {
        const enter = spring({ frame: frame - Math.round((from + index * 0.06) * fps), fps, config: { damping: 200, mass: 0.6 } });
        return (
          <span
            key={index}
            style={{ display: "inline-block", opacity: enter, transform: `translateY(${(1 - enter) * 14}px)` }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
