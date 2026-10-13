// The wheat field at the sidebar's foot (DESIGN.md §1): how tall it is.
//
// The rules, pinned by test/helpers/sidebarField.test.js:
//
// - It takes the room the sidebar has left under Settings and the on-device
//   footer, so it grows on a tall window and shrinks on a short one, and it
//   never takes room from the recent conversations above it.
// - It stops growing at `maxHeight`. Room beyond that stays empty sidebar
//   above Settings, so Settings and the footer stay at the foot.
// - Under `minHeight` it is not drawn at all: there is no field that looks
//   right in less, and the footer goes back to the bottom edge.
// - The ground keeps one scale (`sceneHeight`) at every height: a taller field
//   is more sky over the same wheat, never bigger wheat.
//
// Pure and DOM-free. SidebarField.tsx measures the room and draws the field.

export const SIDEBAR_FIELD = Object.freeze({
  /** Less room than this and the field is not drawn. */
  minHeight: 120,
  /** The field grows with the room up to here. */
  maxHeight: 240,
  /** The scene's height in CSS px: the ground's scale, the same at every height. */
  sceneHeight: 120,
});

/**
 * The field's height for `room` CSS px left at the sidebar's foot, or 0 when
 * it is not drawn.
 *
 * @param {number} room
 */
export function sidebarFieldHeight(room) {
  if (!(room >= SIDEBAR_FIELD.minHeight)) return 0;
  return Math.min(room, SIDEBAR_FIELD.maxHeight);
}
