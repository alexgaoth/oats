import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Backdrop } from "../brand/Backdrop";
import { AppWindow } from "./AppWindow";
import type { Rect } from "./types";

/** The captured viewport, in CSS pixels (demo/capture.mjs). */
export const VIEWPORT = { width: 1440, height: 900 };

/**
 * A screenshot for the README: the whole app as a macOS window on the honey
 * backdrop, or one card of it (`rect`, in the app's CSS pixels) lifted onto the
 * backdrop, large enough to read at README width.
 */
export const AppStill: React.FC<{ image: string; dark?: boolean; rect?: Rect; width: number }> = ({
  image,
  dark,
  rect,
  width,
}) => {
  const src = staticFile(`stills/${image}-${dark ? "dark" : "light"}.png`);
  if (!rect) {
    const windowWidth = Math.round(width * 0.875);
    const windowHeight = Math.round((windowWidth * VIEWPORT.height) / VIEWPORT.width);
    return (
      <Backdrop dark={dark}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <AppWindow width={windowWidth} height={windowHeight} viewportWidth={VIEWPORT.width} dark={dark}>
            <Img src={src} style={{ width: windowWidth, height: windowHeight, display: "block" }} />
          </AppWindow>
        </AbsoluteFill>
      </Backdrop>
    );
  }
  const cardWidth = Math.round(width * 0.86);
  const k = cardWidth / rect.w;
  const cardHeight = Math.round(rect.h * k);
  return (
    <Backdrop dark={dark}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: cardWidth,
            height: cardHeight,
            borderRadius: 18 * (k / 1.6),
            overflow: "hidden",
            position: "relative",
            boxShadow: dark
              ? "0 0 0 1px rgba(255,255,255,0.10), 0 30px 80px rgba(0,0,0,0.55)"
              : "0 0 0 1px rgba(24,24,27,0.08), 0 26px 70px rgba(107,66,16,0.20), 0 4px 14px rgba(24,24,27,0.06)",
          }}
        >
          <Img
            src={src}
            style={{
              position: "absolute",
              width: VIEWPORT.width * k,
              height: VIEWPORT.height * k,
              left: -rect.x * k,
              top: -rect.y * k,
              maxWidth: "none",
            }}
          />
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
};

/** The frame size a still needs: the window's 16:10, or the card's own shape plus a margin. */
export function stillSize(rect: Rect | undefined, width: number) {
  if (!rect) return { width, height: Math.round(width * 0.625) };
  const cardWidth = Math.round(width * 0.86);
  const cardHeight = Math.round((rect.h * cardWidth) / rect.w);
  return { width, height: cardHeight + Math.round(width * 0.14) };
}
