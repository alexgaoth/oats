// Focus on record: while a conversation is being recorded, the sidebar steps
// aside and the conversation takes the window.
//
// The rules, pinned by test/helpers/recordingFocus.test.js:
//
// - A recording starting hides the sidebar, and a recording stopping brings it
//   back.
// - In between, the sidebar button in the header (or ⌘\, Ctrl+\ off macOS)
//   brings it back, and it stays until the same button or key hides it again
//   or the recording ends.
// - Nothing carries over: the next recording starts focused again. Focus
//   belongs to one recording; it is not a setting.
// - Focus applies to the Conversation surface only. Intelligence and Settings
//   keep their sidebar while a recording runs, because from there the sidebar
//   is the way back to the conversation.
//
// Pure and DOM-free. The shell (OatsWorkspace.tsx) keeps the state and draws
// it.

/** Nothing is recording, so there is nothing to focus on. */
export const FOCUS_AT_REST = Object.freeze({ recording: false, revealed: false });

/**
 * Where focus applies: a recording is running and the conversation is on
 * screen. This is also where the sidebar button and the key are offered.
 *
 * @param {{ recording: boolean, revealed: boolean }} state
 * @param {string} surface
 */
export function focusApplies(state, surface) {
  return Boolean(state.recording) && surface === "conversation";
}

/**
 * Whether the sidebar is out of the way.
 *
 * @param {{ recording: boolean, revealed: boolean }} state
 * @param {string} surface
 */
export function sidebarHidden(state, surface) {
  return focusApplies(state, surface) && !state.revealed;
}

/**
 * One step of the rules, as a reducer.
 *
 * - `{ type: "recording", recording }`: the store's `isRecording`, sent on
 *   every change. Both edges forget a request to see the sidebar.
 * - `{ type: "toggle", surface }`: the sidebar button or the key. It does
 *   nothing where focus does not apply.
 *
 * @param {{ recording: boolean, revealed: boolean }} state
 * @param {{ type: "recording", recording: boolean } | { type: "toggle", surface: string }} event
 * @returns {{ recording: boolean, revealed: boolean }}
 */
export function focusStep(state, event) {
  if (event?.type === "recording") {
    const recording = Boolean(event.recording);
    if (recording === state.recording) return state;
    return { recording, revealed: false };
  }
  if (event?.type === "toggle") {
    if (!focusApplies(state, event.surface)) return state;
    return { ...state, revealed: !state.revealed };
  }
  return state;
}

/**
 * Whether a key press is the sidebar key: ⌘\ on macOS, Ctrl+\ on Windows and
 * Linux. A held key repeats, and a repeat must not make the sidebar flap.
 *
 * The typed character is matched, so any layout that types a backslash works,
 * even one that needs Option or Shift for it. The physical key is matched too,
 * without Option, so a layout that has no unmodified backslash still has a
 * chord.
 *
 * @param {{ key: string, code?: string, metaKey: boolean, ctrlKey: boolean, altKey: boolean, repeat?: boolean }} event
 * @param {string} platform `process.platform` of the renderer's host.
 */
export function isSidebarKey(event, platform) {
  const mac = platform === "darwin";
  const command = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  if (!command || other || event.repeat) return false;
  return event.key === "\\" || (event.code === "Backslash" && !event.altKey);
}
