import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { Backdrop } from "../brand/Backdrop";
import { AppWindow } from "./AppWindow";
import { Camera, type Shot } from "./Camera";
import { Caption } from "./Caption";
import { Cursor } from "./Cursor";
import { useCapture } from "./useCapture";
import type { Capture } from "./types";

/** The time of a named cue in a capture, in seconds (0 when it is missing). */
export const cueAt = (capture: Capture, name: string) =>
  (capture.cues.find((cue) => cue.name === name)?.t ?? 0) / 1000;

/**
 * One scene of the film: the real app, captured by the director, framed as a
 * macOS window on the honey backdrop, with camera moves, the cursor, and a
 * caption. `from` trims the clip (seconds); `rate` speeds it up (a time-lapse).
 */
export const AppShot: React.FC<{
  clip: string;
  /** Seconds into the clip where the scene starts, or a function of its log. */
  from?: number | ((capture: Capture) => number);
  rate?: number;
  shots?: Shot[];
  caption?: { text: string; from: number; to: number; at?: "top" | "bottom" };
  dark?: boolean;
  cursor?: boolean;
  children?: React.ReactNode;
}> = ({ clip, from = 0, rate = 1, shots = [{ at: 0, rect: "full" }], caption, dark, cursor = true, children }) => {
  const capture = useCapture(clip);
  if (!capture) return null;
  const start = typeof from === "function" ? Math.max(0, from(capture)) : from;
  const viewport = capture.viewport;
  const width = 1680;
  const height = Math.round((width * viewport.height) / viewport.width);
  const scale = width / viewport.width;
  return (
    <Backdrop dark={dark}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <AppWindow width={width} height={height} viewportWidth={viewport.width} dark={dark}>
          <Camera shots={shots} width={width} height={height} viewport={viewport}>
            <OffthreadVideo
              src={staticFile(`clips/${clip}.mp4`)}
              startFrom={Math.round(start * 60)}
              playbackRate={rate}
              style={{ width, height, display: "block" }}
              muted
            />
            {cursor && <Cursor capture={capture} scale={scale} offsetMs={start * 1000} rate={rate} />}
            {children}
          </Camera>
        </AppWindow>
      </AbsoluteFill>
      {caption && (
        <AbsoluteFill
          style={{
            justifyContent: caption.at === "top" ? "flex-start" : "flex-end",
            alignItems: "center",
            paddingTop: 40,
            paddingBottom: 54,
          }}
        >
          <Caption {...caption} dark={dark} />
        </AbsoluteFill>
      )}
    </Backdrop>
  );
};
