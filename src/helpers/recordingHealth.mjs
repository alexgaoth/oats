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
