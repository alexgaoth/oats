/**
 * Where things sit in the 1920×1080 frame. The app window sits low, and the
 * band above it holds the captions and the speed chip, so nothing the film
 * adds is ever drawn over the app.
 */
export const WINDOW_WIDTH = 1360;
/** The captured viewport's shape (1440×900), so the window keeps the app's proportions. */
export const WINDOW_HEIGHT = Math.round((WINDOW_WIDTH * 900) / 1440);
/** The band above the window. The window starts where it ends. */
export const BAND_HEIGHT = 184;
/** The window's left and right edges, for anything that lines up with them. */
export const WINDOW_LEFT = (1920 - WINDOW_WIDTH) / 2;
