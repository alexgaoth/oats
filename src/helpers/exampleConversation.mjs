// The example conversation in the app: when it is offered, how a note says it
// is one, and putting it in the database.
//
// Somebody who has recorded nothing yet can open the bundled sample
// (`sampleConversations/launch-readiness-review.json`, a nine-person launch
// review) from Home or from the empty Conversations page, and explore a
// finished conversation before their first recording. It is an ordinary
// conversation marked by `notes.sample_id`, so the normal Delete removes it,
// and the offer comes back once nothing is left.
//
// The two rules are pure, for the renderer. `insertExampleConversation` runs in
// the main process, behind `db-insert-example-conversation` (ipcHandlers.js).

import { insertSampleConversations } from "./sampleConversations.mjs";

/**
 * Whether a note is a bundled example rather than a conversation somebody
 * recorded.
 *
 * @param {{ sample_id?: string | null } | null | undefined} note
 */
export function isExampleNote(note) {
  return typeof note?.sample_id === "string" && note.sample_id.trim().length > 0;
}

/**
 * Whether to offer the example: only when there are no conversations at all,
 * and only once the list has been read. Before the read, an empty list means
 * "not known yet", and an offer then would flash on every launch for everybody
 * who has conversations.
 *
 * @param {{ loaded: boolean, notes: Array<{ note_type?: string } | null> | null | undefined }} state
 */
export function offersExample({ loaded, notes }) {
  return Boolean(loaded) && !(notes ?? []).some((note) => note?.note_type === "meeting");
}

/**
 * Put the example in the database, or find the copy that is already there.
 *
 * A new copy is announced with `announce(note)`, which does what `db-save-note`
 * does for a saved note: every window, the vector index and the note files
 * hear of it. A copy that is already there (and not deleted) is returned as it
 * is and is not announced again, so asking twice never makes two.
 *
 * @param {object} databaseManager A `DatabaseManager` (helpers/database.js).
 * @param {object} fixture The bundled sample fixture.
 * @param {{ now?: number, announce?: (note: object) => void }} [options]
 * @returns {{ noteId: number, inserted: boolean, note: object }}
 */
export function insertExampleConversation(
  databaseManager,
  fixture,
  { now = Date.now(), announce = () => {} } = {}
) {
  const [result] = insertSampleConversations(databaseManager, [fixture], { now });
  if (!result?.note) throw new Error("The example conversation could not be read back");
  if (result.inserted) announce(result.note);
  return { noteId: result.noteId, inserted: result.inserted, note: result.note };
}
