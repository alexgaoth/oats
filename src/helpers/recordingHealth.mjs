// Whether a recording is quietly failing to save itself.
//
// The product's reliability promise is that it "never loses a conversation, and
// fails loudly at the start rather than quietly at the end". Checkpointing
// already keeps that first half — every finalized utterance schedules a debounced
// write, so a crash costs seconds rather than an hour. But the write was fired
// with `void` and its result thrown away, so the *other* failure — the database
// refusing, the disk full, the file locked — was completely silent. You would
// record for an hour, press stop, and find out then. That is the exact shape of
// failure the standard forbids, and it was the one case nothing watched.
//
// A health signal only earns its place if it is silent when healthy (§1, and the
// pencil standard: nothing to read when nothing is wrong). So this reports
// nothing at all until a write has failed *and* stayed failed long enough that a
// retry has already had its chance — one refused write during a database
// checkpoint is not news, and a warning that cries wolf is a warning people
// learn to ignore before the real one arrives.
//
// Pure and DOM-free so the thresholds can be pinned rather than tuned by feel.

/** A single failure is not news. Two debounce cycles is. */
export const FAILING_GRACE_MS = 20_000;

/**
 * @param {object} input
 * @param {number|null} input.failingSince When writes started failing, or null.
 * @param {number} input.unsavedTurns Finalized turns not in the last good write.
 * @param {number|null} input.lastSavedAt When a write last succeeded, or null.
 * @param {number} input.now
 * @returns {{ atRisk: boolean, unsavedTurns: number, unsavedMs: number }}
 */
export function checkpointRisk({ failingSince, unsavedTurns, lastSavedAt, now } = {}) {
  const failing = Number.isFinite(failingSince) && failingSince !== null;
  const stale = failing && now - failingSince >= FAILING_GRACE_MS;
  // Nothing has been said yet, so nothing is at risk however the write went.
  const turns = Number.isFinite(unsavedTurns) ? Math.max(0, unsavedTurns) : 0;
  return {
    atRisk: stale && turns > 0,
    unsavedTurns: turns,
    unsavedMs:
      Number.isFinite(lastSavedAt) && lastSavedAt !== null ? Math.max(0, now - lastSavedAt) : 0,
  };
}

/**
 * How long the room may be audibly busy with nothing transcribed before that is
 * a fault rather than a lull.
 *
 * Deliberately far beyond the ~5s local chunk interval. The false positive here
 * is expensive in a specific way: a fan, an air-conditioner or a laptop on a
 * hard desk sits above the silence floor all meeting, and telling somebody
 * mid-conversation that their recording is broken when it is not is worse than
 * telling them nothing — they stop the recording to check.
 */
export const STALLED_GRACE_MS = 90_000;

/**
 * Whether transcription has stopped while the room kept talking.
 *
 * This is the failure the dead-microphone warning cannot see. That one watches
 * the *audio level*: muted, unplugged, or taken by another app all read as a
 * flat floor. But a Whisper server that died, a model that failed to load, or a
 * sidecar that was reaped leaves the level perfectly healthy and produces
 * nothing — the pulse breathes, the clock runs, and the transcript stays empty
 * until you press stop. Loud at the start, not quiet at the end, is the whole
 * promise, and this was the gap in it.
 *
 * @param {object} input
 * @param {number|null} input.lastSoundAt When the mic last read above the floor.
 * @param {number|null} input.lastSegmentAt When a turn was last finalized.
 * @param {number|null} input.startedAt When this recording began.
 * @param {boolean} input.micSilent Whether the dead-microphone warning is up.
 * @param {number} input.now
 * @returns {{ stalled: boolean, quietMs: number }}
 */
export function transcriptionStalled({
  lastSoundAt,
  lastSegmentAt,
  startedAt,
  micSilent,
  now,
} = {}) {
  // One problem, one warning. A silent microphone explains the missing turns
  // perfectly well and already says so.
  if (micSilent) return { stalled: false, quietMs: 0 };
  if (!Number.isFinite(lastSoundAt) || lastSoundAt === null) return { stalled: false, quietMs: 0 };
  // Sound has to be recent, or the room simply stopped talking.
  if (now - lastSoundAt > 5_000) return { stalled: false, quietMs: 0 };

  // Before the first turn, the recording's own start is the baseline: a backend
  // that never came up should be caught on the first conversation, not the last.
  const since =
    Number.isFinite(lastSegmentAt) && lastSegmentAt !== null ? lastSegmentAt : startedAt;
  if (!Number.isFinite(since) || since === null) return { stalled: false, quietMs: 0 };

  const quietMs = Math.max(0, now - since);
  return { stalled: quietMs >= STALLED_GRACE_MS, quietMs };
}
