import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "./theme";

/**
 * The stage behind the app window: honey light falling across warm paper.
 * Plain on purpose: the app's sidebar no longer scatters oat grains, so the
 * film does not either. Still: the backdrop never moves.
 */
export const Backdrop: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(120% 90% at 18% 10%, #3a2508 0%, ${theme.night} 62%)`
        : `radial-gradient(120% 90% at 18% 8%, #ffe2a6 0%, ${theme.honeyWash} 38%, ${theme.paper} 78%)`,
    }}
  >
    {children}
  </AbsoluteFill>
);
