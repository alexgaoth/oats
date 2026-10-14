/**
 * Where the app window sits in the 1920×1080 frame: large and centred. The
 * film has no captions, so nothing else needs room; the camera tells it.
 */
export const WINDOW_WIDTH = 1600;
/** The captured viewport's shape (1440×900), so the window keeps the app's proportions. */
export const WINDOW_HEIGHT = Math.round((WINDOW_WIDTH * 900) / 1440);
/** The window's left and right edges, for anything that lines up with them. */
export const WINDOW_LEFT = (1920 - WINDOW_WIDTH) / 2;
/** The window's top edge. */
export const WINDOW_TOP = (1080 - WINDOW_HEIGHT) / 2;
