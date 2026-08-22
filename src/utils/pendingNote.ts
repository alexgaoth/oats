// The conversation the Conversation surface asked Intelligence to open, parked
// until Intelligence is mounted and asks for it.
//
// This is the pull half of the house's push-plus-pull hand-off (CLAUDE.md; see
// also `consume-pending-focus-search` for the recall hotkey). The push alone is
// not enough: on a cold first visit the press is what mounts Intelligence, so
// the event is dispatched before any listener exists and the navigation stops
// at the list — the row whose whole job is answering "did that save?" appears
// to do nothing.
//
// A module here rather than a constant in the workspace because it is a single
// hand-off rather than state anything renders from, and because exporting a
// non-component from a component file breaks fast refresh.

let pending: number | null = null;

export function parkPendingNote(noteId: number): void {
  pending = noteId;
}

export function consumePendingNote(): number | null {
  const noteId = pending;
  pending = null;
  return noteId;
}
