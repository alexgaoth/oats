import React from "react";
import { AbsoluteFill } from "remotion";
import { Grain } from "../brand/Grain";

/** The grain alone on a transparent ground, for the README and social cards. */
export const MarkStill: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    <Grain id="mark-still" size={460} shadow={false} />
  </AbsoluteFill>
);
