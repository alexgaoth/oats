import React from "react";

/**
 * The app as a macOS window: rounded corners, a hairline edge, a soft shadow,
 * and the traffic lights where Electron places them for Oats (18, 18). The
 * renderer is captured without window chrome, so the film draws it.
 */
export const AppWindow: React.FC<{
  width: number;
  height: number;
  /** CSS pixels of the captured viewport, so the lights scale with the app. */
  viewportWidth: number;
  dark?: boolean;
  children: React.ReactNode;
}> = ({ width, height, viewportWidth, dark, children }) => {
  const k = width / viewportWidth;
  const light = (color: string, index: number) => (
    <div
      key={color}
      style={{
        position: "absolute",
        left: (18 + index * 20) * k,
        top: 18 * k,
        width: 12 * k,
        height: 12 * k,
        borderRadius: "50%",
        background: color,
        boxShadow: `inset 0 0 0 ${0.5 * k}px rgba(0,0,0,0.12)`,
      }}
    />
  );
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 12 * k,
        overflow: "hidden",
        boxShadow: dark
          ? `0 0 0 ${k}px rgba(255,255,255,0.10), 0 ${30 * k}px ${80 * k}px rgba(0,0,0,0.55)`
          : `0 0 0 ${k}px rgba(24,24,27,0.10), 0 ${24 * k}px ${70 * k}px rgba(107,66,16,0.22), 0 ${4 * k}px ${14 * k}px rgba(24,24,27,0.08)`,
      }}
    >
      {children}
      {["#ff5f57", "#febc2e", "#28c840"].map(light)}
    </div>
  );
};
