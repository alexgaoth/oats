// The conversations owed a summary, and the rules for writing one by itself.
//
// A summary used to start in one place only: Finish, once. A conversation that
// finished while no writing model was ready (none chosen yet, or the one on
// this Mac still downloading) or whose summary a quit cut off stayed without
// one until somebody found it and pressed Summarize. Now Finish writes the
// conversation down as owed, and it is summarized by itself once the model is
// ready: one at a time, newest first. Opening a conversation that has no
// summary starts one at once, and a failed summary is tried once more before
// the record says it failed.
//
// Pure and DOM-free, so the rules can be pinned
// (test/helpers/summaryQueue.test.js). `stores/summaryQueueStore.ts` keeps the
// list in localStorage, so it outlives a restart, and runs it.

/** Where the list is kept, in the window's localStorage. */
export const PENDING_SUMMARIES_KEY = "oatsPendingSummaries";

/**
 * The most conversations kept owed. Past it the oldest are dropped: they are
 * still summarized when opened, and a list read on every launch stays small.
 */
export const PENDING_SUMMARIES_MAX = 200;

/** How many times one summary is asked for before the record says it failed. */
export const SUMMARY_ATTEMPTS = 2;

/**
 * The pause before the second try. Long enough for a model on this Mac that
 * was still loading, a dropped connection or a provider's brief limit to pass,
 * and short enough that somebody reading the record is still there.
 */
export const SUMMARY_RETRY_DELAY_MS = 10_000;

/**
 * A failed try is followed by another only if it failed within this long. A
 * slower failure is a timeout that the request code has already tried again
 * three times (#139, each attempt billed by a cloud provider), or a long run
 * on this Mac that would most likely fail the same way, so the record says so
 * at once and offers it again.
 */
export const SUMMARY_RETRY_WITHIN_MS = 120_000;

/**
 * How long a download may say nothing and still be shown as running. The
 * progress event has no "failed" or "cancelled", and a download that stalls is
 * retried after 30 s of silence plus a few seconds' backoff
 * (helpers/downloadUtils.js), so past this it is not running any more.
 */
export const DOWNLOAD_QUIET_MS = 45_000;

/**
 * @typedef {object} PendingSummary
 * @property {number} id The conversation's note id.
 * @property {number} at When it finished (ms), which orders the list.
 * @property {string} route The writing route then (`summaryRouteKey`): who it
 *   may be sent to without asking.
 */

const isId = (value) => Number.isInteger(value) && value > 0;

/**
 * The stored list, cleaned: one entry per conversation, newest first, at most
 * PENDING_SUMMARIES_MAX. Anything unreadable is dropped rather than thrown on,
 * so a damaged value costs the list, never the app.
 *
 * @param {string | null | undefined} raw
 * @returns {PendingSummary[]}
 */
export function readPendingSummaries(raw) {
  if (typeof raw !== "string" || !raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  let queue = [];
  for (const item of parsed) {
    if (!item || !isId(item.id) || !Number.isFinite(item.at)) continue;
    queue = withPendingSummary(queue, {
      id: item.id,
      at: item.at,
      route: typeof item.route === "string" ? item.route : "",
    });
  }
  return queue;
}

/**
 * A conversation added, or its entry replaced: a conversation resumed and
 * finished again is the newest again. Newest first, at most
 * PENDING_SUMMARIES_MAX.
 *
 * @param {PendingSummary[]} queue
 * @param {PendingSummary} entry
 * @returns {PendingSummary[]}
 */
export function withPendingSummary(queue, entry) {
  if (!entry || !isId(entry.id) || !Number.isFinite(entry.at)) return queue;
  const next = queue.filter((item) => item.id !== entry.id);
  next.push({ id: entry.id, at: entry.at, route: String(entry.route ?? "") });
  next.sort((a, b) => b.at - a.at || b.id - a.id);
  return next.slice(0, PENDING_SUMMARIES_MAX);
}

/**
 * @param {PendingSummary[]} queue
 * @param {number} id
 * @returns {PendingSummary[]}
 */
export function withoutPendingSummary(queue, id) {
  return queue.some((item) => item.id === id) ? queue.filter((item) => item.id !== id) : queue;
}

/**
 * Whether the writing route keeps everything on this Mac or the person's own
 * server ("local:", "self-hosted:"), rather than a cloud provider.
 *
 * @param {string | null | undefined} route
 */
export function routeStaysHome(route) {
  const key = String(route ?? "");
  return key.startsWith("local:") || key.startsWith("self-hosted:");
}

/**
 * Whether the queue may send an owed conversation to the writing model chosen
 * now, without anybody asking.
 *
 * A model on this Mac or the person's own server, always. A cloud provider only
 * if it was already the writing model when the conversation finished: a
 * provider chosen since does not get earlier conversations unasked, the rule
 * the group sort and the link check keep (docs/network-allowlist.md). Such a
 * conversation is summarized when somebody opens it.
 *
 * @param {string} owedRoute The route when the conversation finished.
 * @param {string} currentRoute The route now.
 */
export function queueMaySend(owedRoute, currentRoute) {
  const now = String(currentRoute ?? "");
  if (routeStaysHome(now)) return true;
  return now !== "" && String(owedRoute ?? "") === now;
}

/**
 * The next conversation to summarize: the newest the route may be sent and
 * that `skip` does not hold back (one being summarized, recorded or finished
 * now, or refused this session), or null.
 *
 * @param {PendingSummary[]} queue
 * @param {{ route: string, skip?: (id: number) => boolean }} options
 * @returns {number | null}
 */
export function nextPendingSummary(queue, { route, skip = () => false }) {
  for (const item of queue) {
    if (skip(item.id)) continue;
    if (!queueMaySend(item.route, route)) continue;
    return item.id;
  }
  return null;
}

/**
 * What a summary records of the transcript it was written from
 * (`enhanced_at_content_hash`): its length and its opening.
 *
 * @param {string | null | undefined} transcript The stored transcript.
 */
export function summaryContentHash(transcript) {
  const text = String(transcript ?? "");
  return `${text.length}-${text.slice(0, 50)}`;
}

/**
 * Whether an owed conversation still needs its summary: it has a transcript,
 * and no summary written from that transcript. A conversation resumed and
 * finished again while no model was ready keeps its first sitting's summary,
 * and needs a new one.
 *
 * @param {{ transcript?: string | null, enhanced_content?: string | null, enhanced_at_content_hash?: string | null }} note
 */
export function needsSummary(note) {
  if (!String(note?.transcript ?? "").trim()) return false;
  if (!String(note?.enhanced_content ?? "").trim()) return true;
  return note.enhanced_at_content_hash !== summaryContentHash(note.transcript);
}

/**
 * Whether a failed try is followed by another: only the first, and only if it
 * failed within SUMMARY_RETRY_WITHIN_MS of starting.
 *
 * @param {number} attempt Which try failed, counting from 1.
 * @param {number} elapsedMs How long that try took before it failed.
 */
export function shouldRetrySummary(attempt, elapsedMs) {
  return (
    Number.isInteger(attempt) &&
    attempt >= 1 &&
    attempt < SUMMARY_ATTEMPTS &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs <= SUMMARY_RETRY_WITHIN_MS
  );
}

/**
 * How many owed conversations in a row may fail (each after its second try)
 * before the queue stops until its next start. One is that conversation, and
 * the next one is tried; two in a row is more likely the model, and each of
 * the rest would only fail in turn.
 */
export const QUEUE_FAILURES_IN_A_ROW = 2;

/**
 * @param {number} failedInARow
 */
export function queueStopsAfter(failedInARow) {
  return failedInARow >= QUEUE_FAILURES_IN_A_ROW;
}

/**
 * How far a download is, as the whole percent to show, or null when it is not
 * running: never heard of, finished, or quiet for longer than `quietMs`.
 *
 * @param {{ percent: number, at: number } | null | undefined} download
 * @param {{ now: number, quietMs?: number }} options
 * @returns {number | null}
 */
export function downloadShown(download, { now, quietMs = DOWNLOAD_QUIET_MS }) {
  if (!download || !Number.isFinite(download.percent) || !Number.isFinite(download.at)) {
    return null;
  }
  if (download.percent >= 100) return null;
  if (now - download.at > quietMs) return null;
  // Floored, so it never says 100% before the file is in place.
  return Math.min(99, Math.max(0, Math.floor(download.percent)));
}

/**
 * @typedef {"summary" | "preparing" | "failed" | "recording" | "after-recording"
 *   | "downloading" | "needs-model" | "checking" | "starting" | "not-summarized"}
 *   RecordSummaryState
 */

/**
 * What a conversation's record says where its summary goes.
 *
 * - "summary": there is one.
 * - "preparing": it is being written, including the pause before a second
 *   try, or Finish is about to write it.
 * - "failed": the second try failed too; the record offers it again.
 * - "recording": the conversation is being recorded; Finish writes it.
 * - "after-recording": another conversation is being recorded or finished,
 *   and the writing model runs on this Mac or the person's own server, where
 *   it would compete with the live transcription for the GPU and memory. It is
 *   owed, and the queue writes it when the recording ends.
 * - "downloading": the writing model is downloading; the record says how far.
 * - "needs-model": no writing model is ready, and none is coming.
 * - "checking": whether the model on this Mac is there has not been answered
 *   yet; nothing is said for that moment.
 * - "starting": nothing stands in the way, so the record starts it at once and
 *   shows it as being written.
 * - "not-summarized": there is nothing to summarize, or this session could not
 *   start one.
 *
 * @param {object} facts
 * @param {boolean} facts.hasSummary
 * @param {boolean} facts.processing A summary of it is being written.
 * @param {boolean} facts.failed Its last summary failed, this session.
 * @param {boolean} facts.recording It is being recorded.
 * @param {boolean} facts.finishing Finish has it and has not asked for the summary yet.
 * @param {boolean} facts.hasTranscript
 * @param {string | null} facts.readiness `summaryReadiness`: "ready", why not, or null when unknown.
 * @param {boolean} facts.settled Whether the readiness check has answered.
 * @param {boolean} facts.downloading The writing model is downloading now.
 * @param {boolean} [facts.unavailable] A summary was refused this session.
 * @param {boolean} [facts.recordingElsewhere] A conversation (another one) is
 *   being recorded or finished now.
 * @param {boolean} [facts.routeAtHome] The writing route runs on this Mac or
 *   the person's own server (`routeStaysHome`).
 * @returns {RecordSummaryState}
 */
export function recordSummaryState(facts) {
  if (facts.hasSummary) return "summary";
  if (facts.processing) return "preparing";
  if (facts.failed) return "failed";
  if (facts.recording) return "recording";
  if (!facts.hasTranscript) return "not-summarized";
  if (facts.readiness && facts.readiness !== "ready") {
    return facts.downloading ? "downloading" : "needs-model";
  }
  if (facts.finishing) return "preparing";
  if (!facts.settled) return "checking";
  if (facts.unavailable) return "not-summarized";
  if (facts.recordingElsewhere && facts.routeAtHome) return "after-recording";
  return "starting";
}
