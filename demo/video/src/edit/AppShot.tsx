import React from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
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
 * macOS window on the white stage, with camera moves and the cursor.
 * `from` trims the clip (seconds); `rate` or `timeMap` sets its speed.
 * `shots` may be worked out from the capture's log, so the camera frames what
 * the director measured on screen.
 */
export const AppShot: React.FC<{
  clip: string;
  /** Seconds into the clip where the scene starts, or a function of its log. */
  from?: number | ((capture: Capture) => number);
  /**
   * How many clip seconds pass per film second. A whole number: at 1.5 the
   * film showed the clip's frames in steps of one and two, and motion juddered.
   */
  rate?: number;
  /**
   * Instead of `rate`, where the clip is (seconds past `from`) at each moment
   * of the scene (seconds): for a speed ramp.
   */
  timeMap?: (sceneSeconds: number, capture: Capture) => number;
  shots?: Shot[] | ((capture: Capture) => Shot[]);
  dark?: boolean;
  cursor?: boolean;
  children?: React.ReactNode;
}> = ({ clip, from = 0, rate = 1, timeMap, shots = [{ at: 0, rect: "full" }], dark, cursor = true, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const capture = useCapture(clip);
  if (!capture) return null;
  const start = typeof from === "function" ? Math.max(0, from(capture)) : from;
  // Where the clip is at this frame. The clip is shown frozen on its own frame
  // for that moment, so a speed ramp is as exact as a constant speed.
  const sceneSeconds = frame / fps;
  const clipSeconds = start + (timeMap ? timeMap(sceneSeconds, capture) : sceneSeconds * rate);
  const clipFrame = Math.max(0, Math.round(clipSeconds * 60));
  const startFrame = Math.round(start * 60);
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
            {/* The video starts at the scene's first clip frame and is frozen
                at the frames since. A frozen frame is clamped to the film's
                length, so it counts from the scene, not from the clip's
                start; and the start stays put within a scene, because moving
                it every frame made Remotion hand back a scaled frame now and
                then (a mosaic of small windows). The time-lapse is baked into
                a clip of its own (director/bake-lapse.mjs). */}
            <Freeze frame={Math.max(0, clipFrame - startFrame)}>
              <OffthreadVideo
                src={staticFile(`clips/${clip}.mp4`)}
                startFrom={startFrame}
                style={{ width, height, display: "block" }}
                muted
              />
            </Freeze>
            <WindowLights k={scale} />
            {cursor && <Cursor capture={capture} scale={scale} atMs={(clipFrame / 60) * 1000} />}
            {children}
          </Camera>
        </AppWindow>
      </AbsoluteFill>
    </Backdrop>
  );
};
