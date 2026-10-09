// Moments: the instants somebody pressed "Mark" during a conversation.
//
// The one thing in a record that is neither heard nor inferred. Everything else
// Oats keeps is a measurement of the room — what was said, what was asked, how
// it came out — and a mark is the person in the room saying *this*: the
// counter-example worth remembering, the number somebody quoted, the idea to
// come back to. One press, nothing to type while the conversation is going on;
// a note can be added afterwards, in the record, where there is time.
//
// Stored on the note as JSON (`notes.conversation_marks`), beside the topic
// snapshot and for the same reason: `conversation_events` is per-question and
// CHECK-constrained to three kinds.
//
// Pure and DOM-free so the parsing and the resolution to an utterance can be
// pinned.

/** A note is a line, not a document. */
export const MOMENT_NOTE_MAX = 280;

/**
 * Moments from their stored form. Anything malformed is dropped rather than
 * thrown on: a record must open even if one entry in it does not parse.
 *
 * @param {unknown} raw JSON string, array, or nothing.
 * @returns {Array<{ id: string, at: number, note: string }>} oldest first.
 */
export function parseMoments(raw) {
  let list = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && Number.isFinite(item.at))
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : `m-${item.at}`,
      at: item.at,
      note: typeof item.note === "string" ? item.note.slice(0, MOMENT_NOTE_MAX) : "",
    }))
    .sort((a, b) => a.at - b.at);
}

/**
 * A new moment at `at`. Two presses inside a second are one mark — a double
 * click, or a key held a beat too long, is not two things worth remembering.
 *
 * @returns {{ moments: Array<{ id: string, at: number, note: string }>, added: boolean }}
 */
export function addMoment(moments, at) {
  const list = parseMoments(moments);
  if (!Number.isFinite(at)) return { moments: list, added: false };
  if (list.some((moment) => Math.abs(moment.at - at) < 1000)) {
    return { moments: list, added: false };
  }
  return { moments: parseMoments([...list, { id: `m-${at}`, at, note: "" }]), added: true };
}

/** The same moments with one note replaced; whitespace-only clears it. */
export function setMomentNote(moments, id, note) {
  const text = String(note ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MOMENT_NOTE_MAX);
  return parseMoments(moments).map((moment) =>
    moment.id === id ? { ...moment, note: text } : moment
  );
}

/** The same moments without one. */
export function removeMoment(moments, id) {
  return parseMoments(moments).filter((moment) => moment.id !== id);
}

/**
 * The utterance a moment belongs to: the one nearest it in time.
 *
 * A mark is pressed while something is being said, and that utterance is
 * finalised a few seconds later in ~5s chunks, so the nearest timed segment is
 * at most a chunk away from the words that prompted the press. Nearest rather
 * than "the one before", which would quote the previous speaker every time the
 * press landed on the first words of a new turn.
 *
 * @returns {object | null} the segment, or null when none carries a time.
 */
export function momentSegment(moment, segments) {
  if (!moment || !Number.isFinite(moment.at) || !Array.isArray(segments)) return null;
  let best = null;
  let distance = Infinity;
  for (const segment of segments) {
    if (!segment || !Number.isFinite(segment.timestamp)) continue;
    const gap = Math.abs(segment.timestamp - moment.at);
    // Of two equidistant turns the earlier wins: a press is a reaction, and
    // what it reacts to has already been said.
    if (gap < distance || (gap === distance && segment.timestamp < best.timestamp)) {
      best = segment;
      distance = gap;
    }
  }
  return best;
}
