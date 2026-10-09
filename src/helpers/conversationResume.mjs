// Which conversation a press of Record continues, if any.
//
// "Stop and start again within half an hour" means half an hour after the
// conversation *ended* — after its last word — not after the row's last write.
// `updated_at` moves whenever anything touches the row: renaming last week's
// conversation, naming a speaker in it, or adding a note to one of its marks
// all bumped it, and the next press of Record then appended today's meeting to
// last week's. The moment somebody last spoke cannot be moved by an edit.
//
// Pure and DOM-free so the window and its edges can be pinned.

import { parseDbTimestamp } from "./dbTime.mjs";

// Offered as a continuation only if it ended recently enough that resuming is
// plausible. Longer than this and it is a new conversation that happens to be
// about the same thing — which the lifetime graph already links.
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

// A clock that steps backwards (NTP, waking a VM) can put the last word a
// moment in the future. Anything further ahead than this is bad data, not a
// conversation that just ended, and resuming into it would be a guess.
const FUTURE_TOLERANCE_MS = 60 * 1000;

function readSegments(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * When a conversation ended: the end of its last timed turn.
 *
 * A turn's `timestamp` is when its speech began, so its own length is added
 * when the segmenter recorded one. A transcript with no timed turn — an old or
 * imported one — falls back to when the conversation was created, the one
 * stored moment an edit cannot move. NaN when neither is known.
 *
 * @param {{ transcript?: string | unknown[] | null, created_at?: string | null }} note
 * @returns {number}
 */
export function conversationEndedAt(note) {
  let last = -Infinity;
  for (const segment of readSegments(note?.transcript)) {
    const at = segment?.timestamp;
    if (!Number.isFinite(at)) continue;
    const spoken =
      Number.isFinite(segment.startMs) &&
      Number.isFinite(segment.endMs) &&
      segment.endMs > segment.startMs
        ? segment.endMs - segment.startMs
        : 0;
    if (at + spoken > last) last = at + spoken;
  }
  if (Number.isFinite(last)) return last;
  return parseDbTimestamp(note?.created_at);
}

/**
 * The conversation that ended most recently, if it ended within the window.
 *
 * Every note is considered rather than trusting the list's order: the list is
 * sorted by `updated_at`, which is exactly the field an edit moves.
 *
 * @template {{ transcript?: string | unknown[] | null, created_at?: string | null }} T
 * @param {T[]} notes
 * @param {{ now?: number, windowMs?: number }} [options]
 * @returns {T | null}
 */
export function findResumableConversation(
  notes,
  { now = Date.now(), windowMs = RESUME_WINDOW_MS } = {}
) {
  let best = null;
  let bestEndedAt = -Infinity;
  for (const note of notes ?? []) {
    if (!note?.transcript) continue;
    const endedAt = conversationEndedAt(note);
    if (!Number.isFinite(endedAt)) continue;
    const age = now - endedAt;
    if (age < -FUTURE_TOLERANCE_MS || age > windowMs) continue;
    if (endedAt > bestEndedAt) {
      best = note;
      bestEndedAt = endedAt;
    }
  }
  return best;
}
