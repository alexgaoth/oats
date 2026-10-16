/**
 * Where the app window sits in the 1920×1080 frame: centred, one film pixel
 * per CSS pixel of the 1440×900 app. The app is captured at 2x, so a full shot
 * shows each film pixel from a 2×2 block and a 2x close-up shows the capture
 * pixel for pixel: no fractional scale for the app's dither to shimmer under.
 */
export const WINDOW_WIDTH = 1440;
/** The captured viewport's shape (1440×900), so the window keeps the app's proportions. */
export const WINDOW_HEIGHT = Math.round((WINDOW_WIDTH * 900) / 1440);
/** The window's left and right edges, for anything that lines up with them. */
export const WINDOW_LEFT = (1920 - WINDOW_WIDTH) / 2;
/** The window's top edge. */
export const WINDOW_TOP = (1080 - WINDOW_HEIGHT) / 2;
