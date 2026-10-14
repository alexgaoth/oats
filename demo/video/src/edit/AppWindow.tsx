import React from "react";

/**
 * The app as a macOS window: rounded corners, a hairline edge and a soft
 * shadow. The renderer is captured without window chrome, so the film draws
 * it. A film shot draws the traffic lights inside its camera (`WindowLights`,
 * `lights={false}` here): they are part of the picture, so they zoom with it
 * instead of floating over a close-up. A still keeps them on the frame.
 */
/** The three traffic lights where Electron places them for Oats (18, 18), at `k` frame px per CSS px. */
export const WindowLights: React.FC<{ k: number }> = ({ k }) => (
  <>
    {["#ff5f57", "#febc2e", "#28c840"].map((color, index) => (
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
    ))}
  </>
);

export const AppWindow: React.FC<{
  width: number;
  height: number;
  /** CSS pixels of the captured viewport, so the lights scale with the app. */
  viewportWidth: number;
  dark?: boolean;
  /** Draw the traffic lights on the window frame (a still), or leave them to the camera (a film shot). */
  lights?: boolean;
  children: React.ReactNode;
}> = ({ width, height, viewportWidth, dark, lights = true, children }) => {
  const k = width / viewportWidth;
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
          : `0 0 0 ${k}px rgba(9,9,11,0.09), 0 ${22 * k}px ${64 * k}px rgba(9,9,11,0.10), 0 ${3 * k}px ${12 * k}px rgba(9,9,11,0.06)`,
      }}
    >
      {children}
      {lights && <WindowLights k={k} />}
    </div>
  );
};
