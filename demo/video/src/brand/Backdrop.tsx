import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "./theme";

/**
 * The stage behind the app window: plain white. A warm gradient read as
 * decoration rather than as the app's; the window's edge and shadow are
 * enough to set it apart. Still: the backdrop never moves.
 */
export const Backdrop: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) => (
  <AbsoluteFill style={{ background: dark ? theme.night : "#ffffff" }}>{children}</AbsoluteFill>
);
