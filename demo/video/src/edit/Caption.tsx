import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../brand/theme";
import { BAND_HEIGHT } from "./layout";

/** One line of the film's voice, in seconds on the clock of whatever renders the track. */
export type Cue = { text: string; from: number; to: number };

/** A gap shorter than this between two lines is not a pause: the first line holds until the next arrives. */
const HOLD_GAP = 2.4;
/** How long a line takes to leave: just before the next line when one follows, after its end when none does. */
const SWAP = 0.22;
const LEAVE = 0.45;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * The captions, as one track in the band above the window.
 *
 * A caption used to belong to its scene, so every cut took it away: the line
 * faded with its scene and the next scene's line arrived half a second later.
 * Over 90 seconds that read as flashing. This track outlives the cuts. The
 * same line in two scenes in a row is one line, a short gap holds a line until
 * the next replaces it, and only a real pause empties the band.
 */
export const CaptionTrack: React.FC<{ cues: Cue[]; dark?: boolean }> = ({ cues, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lines: Cue[] = [];
  for (const cue of [...cues].sort((a, b) => a.from - b.from)) {
    const last = lines[lines.length - 1];
    if (last && last.text === cue.text && cue.from - last.to < HOLD_GAP) last.to = Math.max(last.to, cue.to);
    else lines.push({ ...cue });
  }
  return (
    <AbsoluteFill style={{ height: BAND_HEIGHT, alignItems: "center", justifyContent: "center" }}>
      {lines.map((line, index) => {
        const next = lines[index + 1];
        const replaced = Boolean(next) && next.from - line.to < HOLD_GAP;
        const end = replaced ? next.from : line.to + LEAVE;
        if (t < line.from - 0.05 || t > end) return null;
        const opacity = replaced
          ? interpolate(t, [next.from - SWAP, next.from], [1, 0], clamp)
          : interpolate(t, [line.to, line.to + LEAVE], [1, 0], clamp);
        return <Line key={index} text={line.text} from={line.from} opacity={opacity} dark={dark} />;
      })}
    </AbsoluteFill>
  );
};

/** Its words arrive one by one, rising a little, then it holds. No plate: it sits on the backdrop. */
const Line: React.FC<{ text: string; from: number; opacity: number; dark?: boolean }> = ({ text, from, opacity, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        // Balanced, so a line that needs two rows never leaves one word alone.
        maxWidth: 1080,
        textAlign: "center",
        textWrap: "balance",
        fontFamily: theme.font,
        fontSize: 46,
        lineHeight: 1.18,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        color: dark ? "#fafaf9" : theme.ink,
        opacity,
      }}
    >
      {text.split(" ").map((word, index) => {
        const enter = spring({
          frame: frame - Math.round((from + index * 0.05) * fps),
          fps,
          config: { damping: 200, mass: 0.6 },
        });
        return (
          <React.Fragment key={index}>
            {index > 0 && " "}
            <span style={{ display: "inline-block", opacity: enter, transform: `translateY(${(1 - enter) * 12}px)` }}>{word}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
};
