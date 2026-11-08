// Whether somebody is saying something right now, in a room, told by the
// segmenter rather than by the words.
//
// A question card waits for its reply (conversationAide.mjs, `isSpeaking`). It
// used to read "still speaking" from the partial on screen. Parakeet sends no
// partials, and a Whisper partial comes only every 1.2 s and only when the
// server is idle, so a reply longer than the wait was read as silence and its
// card resolved before the reply's words arrived. The segmenter knows better:
// a segment is open while somebody talks, and once it closes its final is on
// its way. That does not depend on the engine or on the lag measurement.
//
// Two halves, one event shape on `meeting-transcription-activity`:
//
//   Main (`SegmentActivityReporter`): after the segmenter takes each chunk,
//   one event per change. `open` when a segment opens; `closed` when it closes
//   and its final is queued; `dropped` when what opened was not speech (a
//   cough, a click: no final comes); `settled` once its final was sent, came
//   back empty, or failed; `ended` when the recording's session ends (Stop,
//   after every final; a cancel; or a new recording that replaced it).
//   Every event carries the recording's session number and the segment's.
//
//   Renderer (`SegmentActivityState`): open, and the finals still to come.
//   It follows one session; events of another are stale and change nothing.
//   Nothing holds forever: an open segment closes within 20 s (the
//   segmenter's cap, which opens a new one), and a final is waited on for at
//   most 30 s, the aide's own limit.
//
// Pure: time comes in as arguments. Pinned by test/helpers/segmentActivity.test.js.

export const ACTIVITY_LIMITS = Object.freeze({
  /** An open segment with no news for this long is not trusted to be open. */
  openMs: 22_000,
  /** A final not settled after this long is not waited on any more. */
  pendingMs: 30_000,
});

/** Main side: the segmenter's segments, as activity events. */
export class SegmentActivityReporter {
  /** @param {number} session This recording's session number. */
  constructor(session) {
    this.session = session;
    this.nextSegment = 1;
    /** The open segment: its number and its first sample. */
    this.open = null;
    this.ended = false;
  }

  _event(segment, state, extra = {}) {
    return { session: this.session, segment, state, ...extra };
  }

  /**
   * After the segmenter took a chunk (or was flushed at Stop).
   * Each closed segment gets its number as `activitySegment`, for `settled`.
   * @param {Array<{ startSample: number, endSample: number }>} closed
   * @param {{ startSample: number } | null} open
   */
  take(closed, open) {
    if (this.ended) return [];
    const events = [];
    for (const segment of Array.isArray(closed) ? closed : []) {
      let number;
      if (this.open && this.open.startSample === segment.startSample) {
        number = this.open.segment;
        this.open = null;
      } else {
        // Opened and closed inside one chunk: only the flush at Stop can.
        number = this.nextSegment++;
        events.push(this._event(number, "open"));
      }
      segment.activitySegment = number;
      events.push(this._event(number, "closed"));
    }
    if (this.open && (!open || open.startSample !== this.open.startSample)) {
      events.push(this._event(this.open.segment, "dropped"));
      this.open = null;
    }
    if (open && !this.open) {
      this.open = { segment: this.nextSegment++, startSample: open.startSample };
      events.push(this._event(this.open.segment, "open"));
    }
    return events;
  }

  /**
   * A closed segment's final was sent, came back with no words, or failed.
   * @param {{ activitySegment?: number }} segment
   * @param {"final" | "empty" | "failed"} outcome
   */
  settled(segment, outcome) {
    if (this.ended || !Number.isInteger(segment?.activitySegment)) return [];
    return [this._event(segment.activitySegment, "settled", { outcome })];
  }

  /**
   * The session is over. On Stop this comes after every final settled; on a
   * cancel or a replacement, finals still queued are not waited on.
   * @param {"stop" | "cancelled" | "replaced"} reason
   */
  end(reason) {
    if (this.ended) return [];
    this.ended = true;
    this.open = null;
    return [{ session: this.session, state: "ended", reason }];
  }
}

/** Renderer side: is a segment open, and are finals still to come. */
export class SegmentActivityState {
  constructor(limits = ACTIVITY_LIMITS) {
    this.limits = limits;
    this.reset();
  }

  /** A new recording. With its session number when main gave one. */
  reset(session = null) {
    this.session = Number.isInteger(session) ? session : null;
    this.ended = false;
    this.openSegment = null;
    this.openedAt = null;
    this.pending = new Map();
  }

  /**
   * One event from main. Returns whether it was this session's and changed
   * anything to read.
   * @param {object} event
   * @param {number} now
   */
  apply(event, now) {
    if (!event || !Number.isInteger(event.session)) return false;
    if (this.session === null && event.state !== "ended") this.session = event.session;
    if (event.session !== this.session || this.ended) return false;
    const { segment, state } = event;
    switch (state) {
      case "open":
        this.openSegment = segment;
        this.openedAt = now;
        return true;
      case "closed":
        if (this.openSegment === segment) this.openSegment = null;
        this.pending.set(segment, now);
        return true;
      case "dropped":
        if (this.openSegment !== segment) return false;
        this.openSegment = null;
        return true;
      case "settled": {
        if (this.openSegment === segment) this.openSegment = null;
        return this.pending.delete(segment);
      }
      case "ended":
        this.ended = true;
        this.openSegment = null;
        this.pending.clear();
        return true;
      default:
        return false;
    }
  }

  /** Somebody is saying something the segmenter has not closed yet. */
  isOpen(now) {
    return this.openSegment !== null && now - this.openedAt < this.limits.openMs;
  }

  /** Finals on their way: segments closed and not settled, within the limit. */
  pendingCount(now) {
    let count = 0;
    for (const since of this.pending.values()) {
      if (now - since < this.limits.pendingMs) count += 1;
    }
    return count;
  }

  /** Words are still coming: a segment is open, or a final is on its way. */
  isBusy(now) {
    return this.isOpen(now) || this.pendingCount(now) > 0;
  }

  /**
   * When the reading changes by itself if no event arrives: an open segment or
   * a pending final aging out. Null when nothing will.
   */
  nextExpiry(now) {
    let next = null;
    const consider = (at) => {
      if (at > now && (next === null || at < next)) next = at;
    };
    if (this.openSegment !== null) consider(this.openedAt + this.limits.openMs);
    for (const since of this.pending.values()) consider(since + this.limits.pendingMs);
    return next;
  }
}

/**
 * A room recording replaced before anybody stopped it (its window reloaded or
 * crashed mid-recording, then a new recording started): main still reads the
 * segments it had closed, and nobody listens for their finals. Each is saved
 * into that recording's own conversation instead, as the segment the store
 * would have made of it (meetingRecordingStore.ts, in a room), in the order it
 * was said.
 *
 * Returns the new transcript JSON; the same string when the final is already
 * there; or null when the stored transcript is not a list of segments, which
 * is never overwritten.
 * @param {string | null | undefined} transcriptJson The note's stored transcript.
 * @param {{ session: number, segment?: number, text: string, timestamp: number,
 *   startMs?: number, endMs?: number }} final
 */
export function withLateRoomFinal(transcriptJson, final) {
  let segments = [];
  if (transcriptJson) {
    try {
      segments = JSON.parse(transcriptJson);
    } catch {
      return null;
    }
    if (!Array.isArray(segments)) return null;
  }
  const text = String(final?.text ?? "").trim();
  if (!text) return transcriptJson ?? "[]";
  const id = `late-${final.session}-${final.segment ?? final.startMs ?? final.timestamp}`;
  if (
    segments.some((s) => s?.id === id || (s?.text === text && s?.timestamp === final.timestamp))
  ) {
    return transcriptJson;
  }
  const segment = {
    id,
    text,
    source: "mic",
    timestamp: final.timestamp,
    ...(Number.isFinite(final.startMs) && Number.isFinite(final.endMs)
      ? { startMs: final.startMs, endMs: final.endMs }
      : {}),
    speaker: "room",
    speakerName: "Conversation",
    speakerIsPlaceholder: true,
    speakerStatus: "confirmed",
  };
  let at = segments.length;
  while (at > 0 && (segments[at - 1]?.timestamp ?? 0) > final.timestamp) at -= 1;
  return JSON.stringify([...segments.slice(0, at), segment, ...segments.slice(at)]);
}
