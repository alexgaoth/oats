import React from "react";
import { AbsoluteFill } from "remotion";
import { Fluid } from "./Fluid";
import { theme } from "./theme";

/**
 * The stage behind the app window: light grey in slow fluid motion
 * (`Fluid`). Plain white read as flat, and a warm gradient read as
 * decoration rather than as the app's. Every scene draws it at the film's
 * own frame, so a dissolve shows one backdrop, not two.
 */
export const Backdrop: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) =>
  dark ? (
    <AbsoluteFill style={{ background: theme.night }}>{children}</AbsoluteFill>
  ) : (
    <AbsoluteFill style={{ background: "#f3f3f3" }}>
      <Fluid />
      {children}
    </AbsoluteFill>
  );
