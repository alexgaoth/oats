import { useEffect, useState } from "react";
import { subscribeChartPalette } from "../charts/chartStyle";
import type { ChartPalette } from "../charts/chartStyle";

/** The charts' one palette, current with the theme (`charts/chartStyle.ts`). */
export function useChartPalette(): ChartPalette | null {
  const [palette, setPalette] = useState<ChartPalette | null>(null);
  useEffect(() => subscribeChartPalette(document.documentElement, setPalette), []);
  return palette;
}
