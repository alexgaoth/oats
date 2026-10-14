import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { Backdrop } from "../brand/Backdrop";
import { AppWindow, WindowLights } from "./AppWindow";
import { Camera, type Shot } from "./Camera";
import { Cursor } from "./Cursor";
import { WINDOW_WIDTH } from "./layout";
import { useCapture } from "./useCapture";
import type { Capture, Rect } from "./types";

/** The time of a named cue in a capture, in seconds (0 when it is missing). */
export const cueAt = (capture: Capture, name: string) =>
  (capture.cues.find((cue) => cue.name === name)?.t ?? 0) / 1000;

/**
 * Where the director measured an element (`d.rect(name, …)`), in the app's CSS
 * pixels, or the whole window when it was not measured.
 */
export const rectAt = (capture: Capture, name: string): Rect | "full" =>
  (capture.cues.find((cue) => cue.name === `rect:${name}`)?.rect as Rect | undefined) ?? "full";

/**
 * One scene of the film: the real app, captured by the director, framed as a
 * macOS window on the honey backdrop, with camera moves and the cursor.
 * `from` trims the clip (seconds); `rate` speeds it up (a time-lapse).
 * `shots` may be worked out from the capture's log, so the camera frames what
 * the director measured on screen.
 */
export const AppShot: React.FC<{
  clip: string;
  /** Seconds into the clip where the scene starts, or a function of its log. */
  from?: number | ((capture: Capture) => number);
  rate?: number;
  shots?: Shot[] | ((capture: Capture) => Shot[]);
  dark?: boolean;
  cursor?: boolean;
  children?: React.ReactNode;
}> = ({ clip, from = 0, rate = 1, shots = [{ at: 0, rect: "full" }], dark, cursor = true, children }) => {
  const capture = useCapture(clip);
  if (!capture) return null;
  const start = typeof from === "function" ? Math.max(0, from(capture)) : from;
  const viewport = capture.viewport;
  const width = WINDOW_WIDTH;
  const height = Math.round((width * viewport.height) / viewport.width);
  const scale = width / viewport.width;
  const framing = typeof shots === "function" ? shots(capture) : shots;
  return (
    <Backdrop dark={dark}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <AppWindow width={width} height={height} viewportWidth={viewport.width} dark={dark} lights={false}>
          <Camera shots={framing} width={width} height={height} viewport={viewport}>
            <OffthreadVideo
              src={staticFile(`clips/${clip}.mp4`)}
              startFrom={Math.round(start * 60)}
              playbackRate={rate}
              style={{ width, height, display: "block" }}
              muted
            />
            <WindowLights k={scale} />
            {cursor && <Cursor capture={capture} scale={scale} offsetMs={start * 1000} rate={rate} />}
            {children}
          </Camera>
        </AppWindow>
      </AbsoluteFill>
    </Backdrop>
  );
};
