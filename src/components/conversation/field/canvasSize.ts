// How big a field canvas's backing store is (DESIGN.md §7: the dither is
// locked to device pixels). Pure, so it can be pinned
// (test/helpers/fieldCanvasSize.test.js); FieldGL and FieldCanvas both size
// their canvas with it.

/**
 * The backing store for a canvas `width` x `height` CSS px that covers
 * `deviceWidth` x `deviceHeight` device pixels (0 while not measured) at a
 * device pixel ratio of `dpr`.
 *
 * The grain stays crisp only while the backing store is exactly the pixels the
 * canvas covers: one pixel off and the compositor resamples the canvas, and the
 * dither blurs. CSS size times the ratio is not that size once the CSS size is
 * fractional, because the edges snap to device pixels, so the pixels are
 * measured (`observeDevicePixels`). A measurement is trusted only while it
 * agrees with the ratio to within that one pixel of snapping: under DevTools
 * device emulation the two disagree, and the ratio is the one the page is
 * drawn at. Above 2x the store stays capped at 2x, for the cost of the fill,
 * as it always was.
 */
export function backingSize(
  width: number,
  height: number,
  deviceWidth: number,
  deviceHeight: number,
  dpr: number
): { w: number; h: number } {
  const scale = Math.min(dpr, 2);
  const fromRatio = { w: Math.round(width * scale), h: Math.round(height * scale) };
  if (dpr > 2 || !(deviceWidth > 0 && deviceHeight > 0)) return fromRatio;
  if (Math.abs(deviceWidth - width * dpr) > 1 || Math.abs(deviceHeight - height * dpr) > 1) {
    return fromRatio;
  }
  return { w: deviceWidth, h: deviceHeight };
}

/**
 * Observe a canvas's device pixels, not only its CSS size. Moving the window to
 * a display with another scale changes the pixels a still canvas covers and not
 * its CSS size, and a backing store left at the old scale is resampled into a
 * blur until something else redraws it.
 */
export function observeDevicePixels(observer: ResizeObserver, canvas: HTMLCanvasElement): void {
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas);
  }
}

/**
 * Call `onChange` whenever the device pixel ratio changes, until the returned
 * function is called. The observer above sees a new display through the
 * canvas's device pixels; this sees the ratio itself, which is all DevTools
 * device emulation changes, so a still canvas is drawn again at the new ratio
 * either way.
 */
export function watchPixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  const changed = () => {
    listen();
    onChange();
  };
  const listen = () => {
    query?.removeEventListener("change", changed);
    query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
    query?.addEventListener("change", changed);
  };
  listen();
  return () => query?.removeEventListener("change", changed);
}
