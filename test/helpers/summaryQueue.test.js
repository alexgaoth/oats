const test = require("node:test");
const assert = require("node:assert/strict");

// The summaries that start by themselves (src/helpers/summaryQueue.mjs): the
// list of conversations owed one, who it may be sent to, the second try, the
// download it waits for, and what the record says meanwhile.

let queue;

test.before(async () => {
  queue = await import("../../src/helpers/summaryQueue.mjs");
});

const LOCAL = "local:";
const OPENAI = "providers:openai";

test("the stored list is read newest first, one entry per conversation", () => {
  const raw = JSON.stringify([
    { id: 3, at: 3000, route: LOCAL },
    { id: 7, at: 9000, route: LOCAL },
    { id: 3, at: 5000, route: OPENAI },
    { id: 4, at: 4000, route: LOCAL },
  ]);
  assert.deepEqual(queue.readPendingSummaries(raw), [
    { id: 7, at: 9000, route: LOCAL },
    { id: 3, at: 5000, route: OPENAI },
    { id: 4, at: 4000, route: LOCAL },
  ]);
});

test("a damaged list costs the list, never an exception", () => {
  for (const raw of [null, undefined, "", "{", "null", "42", '{"id":1}']) {
    assert.deepEqual(queue.readPendingSummaries(raw), []);
  }
  const mixed = JSON.stringify([
    null,
    { id: "5", at: 1 },
    { id: 0, at: 1 },
    { id: 2.5, at: 1 },
    { id: 6 },
    { id: 8, at: 10 },
  ]);
  assert.deepEqual(queue.readPendingSummaries(mixed), [{ id: 8, at: 10, route: "" }]);
});

test("finishing a conversation again makes it the newest again", () => {
  let list = [];
  list = queue.withPendingSummary(list, { id: 1, at: 100, route: LOCAL });
  list = queue.withPendingSummary(list, { id: 2, at: 200, route: LOCAL });
  list = queue.withPendingSummary(list, { id: 1, at: 300, route: LOCAL });
  assert.deepEqual(
    list.map((item) => item.id),
    [1, 2]
  );
  assert.equal(list.length, 2);
});

test("the list keeps the newest conversations up to its limit", () => {
  let list = [];
  for (let id = 1; id <= queue.PENDING_SUMMARIES_MAX + 5; id += 1) {
    list = queue.withPendingSummary(list, { id, at: id * 10, route: LOCAL });
  }
  assert.equal(list.length, queue.PENDING_SUMMARIES_MAX);
  assert.equal(list[0].id, queue.PENDING_SUMMARIES_MAX + 5);
  assert.equal(list.at(-1).id, 6);
});

test("a summarized conversation leaves the list, and an unknown one changes nothing", () => {
  const list = [
    { id: 2, at: 200, route: LOCAL },
    { id: 1, at: 100, route: LOCAL },
  ];
  assert.deepEqual(queue.withoutPendingSummary(list, 2), [{ id: 1, at: 100, route: LOCAL }]);
  assert.equal(queue.withoutPendingSummary(list, 9), list);
});

test("the next conversation is the newest one nothing holds back", () => {
  const list = [
    { id: 9, at: 900, route: LOCAL },
    { id: 5, at: 500, route: LOCAL },
    { id: 1, at: 100, route: LOCAL },
  ];
  assert.equal(queue.nextPendingSummary(list, { route: LOCAL }), 9);
  // Being recorded, being summarized, or refused this session: the next one.
  assert.equal(queue.nextPendingSummary(list, { route: LOCAL, skip: (id) => id === 9 }), 5);
  assert.equal(queue.nextPendingSummary(list, { route: LOCAL, skip: () => true }), null);
  assert.equal(queue.nextPendingSummary([], { route: LOCAL }), null);
});

test("a model on this Mac or the person's own server may summarize any owed conversation", () => {
  for (const owed of [LOCAL, OPENAI, "self-hosted:", ""]) {
    assert.equal(queue.queueMaySend(owed, LOCAL), true);
    assert.equal(queue.queueMaySend(owed, "self-hosted:"), true);
  }
});

test("a cloud provider gets only what finished while it was the writing model", () => {
  // Chosen when the conversation finished, with its model not ready yet.
  assert.equal(queue.queueMaySend(OPENAI, OPENAI), true);
  // Chosen since: not sent unasked. Opening the conversation summarizes it.
  assert.equal(queue.queueMaySend(LOCAL, OPENAI), false);
  assert.equal(queue.queueMaySend("providers:anthropic", OPENAI), false);
  assert.equal(queue.queueMaySend("", "providers:custom"), false);
  assert.equal(queue.queueMaySend("", ""), false);
  const list = [
    { id: 4, at: 400, route: LOCAL },
    { id: 3, at: 300, route: OPENAI },
  ];
  assert.equal(queue.nextPendingSummary(list, { route: OPENAI }), 3);
  assert.equal(queue.nextPendingSummary(list, { route: LOCAL }), 4);
});

test("a failed summary is tried once more, and only once", () => {
  assert.equal(queue.SUMMARY_ATTEMPTS, 2);
  assert.equal(queue.shouldRetrySummary(1), true);
  assert.equal(queue.shouldRetrySummary(2), false);
  assert.equal(queue.shouldRetrySummary(3), false);
  assert.equal(queue.shouldRetrySummary(0), false);
  assert.equal(queue.shouldRetrySummary(Number.NaN), false);
  // "After a short delay": long enough to pass a blip, short enough to wait for.
  assert.ok(queue.SUMMARY_RETRY_DELAY_MS >= 5_000 && queue.SUMMARY_RETRY_DELAY_MS <= 30_000);
});

test("a summary records the transcript it was written from, as Finish always has", () => {
  const transcript = JSON.stringify([{ id: "s1", text: "We hold the date." }]);
  assert.equal(
    queue.summaryContentHash(transcript),
    `${transcript.length}-${transcript.slice(0, 50)}`
  );
  assert.equal(queue.summaryContentHash(null), "0-");
});

test("an owed conversation needs a summary until one is written from its transcript", () => {
  const transcript = JSON.stringify([{ id: "s1", text: "We hold the date." }]);
  const hash = queue.summaryContentHash(transcript);
  assert.equal(queue.needsSummary({ transcript, enhanced_content: null }), true);
  assert.equal(
    queue.needsSummary({
      transcript,
      enhanced_content: "## Threads",
      enhanced_at_content_hash: hash,
    }),
    false
  );
  // Resumed and finished again with no model ready: the first sitting's
  // summary is not this transcript's.
  const longer = JSON.stringify([
    { id: "s1", text: "We hold the date." },
    { id: "s2", text: "And the webinar moves." },
  ]);
  assert.equal(
    queue.needsSummary({
      transcript: longer,
      enhanced_content: "## Threads",
      enhanced_at_content_hash: hash,
    }),
    true
  );
  // Nothing was said: nothing to summarize.
  assert.equal(queue.needsSummary({ transcript: "  ", enhanced_content: null }), false);
  assert.equal(queue.needsSummary({}), false);
});

test("the queue goes on past one failed conversation, and stops at two in a row", () => {
  assert.equal(queue.queueStopsAfter(0), false);
  assert.equal(queue.queueStopsAfter(1), false);
  assert.equal(queue.queueStopsAfter(2), true);
  assert.equal(queue.queueStopsAfter(5), true);
});

test("a download shows its whole percent while it is heard from", () => {
  const now = 1_000_000;
  assert.equal(queue.downloadShown({ percent: 40.7, at: now - 1000 }, { now }), 40);
  assert.equal(queue.downloadShown({ percent: 0, at: now }, { now }), 0);
  // Never 100% before the file is in place, and nothing once it is.
  assert.equal(queue.downloadShown({ percent: 99.99, at: now }, { now }), 99);
  assert.equal(queue.downloadShown({ percent: 100, at: now }, { now }), null);
  // Quiet for longer than a stalled download's retry: not running any more.
  assert.equal(
    queue.downloadShown({ percent: 40, at: now - queue.DOWNLOAD_QUIET_MS - 1 }, { now }),
    null
  );
  assert.equal(queue.downloadShown({ percent: 40, at: now - 10 }, { now, quietMs: 5 }), null);
  assert.equal(queue.downloadShown(null, { now }), null);
  assert.equal(queue.downloadShown({ percent: Number.NaN, at: now }, { now }), null);
});

const FACTS = {
  hasSummary: false,
  processing: false,
  failed: false,
  recording: false,
  finishing: false,
  hasTranscript: true,
  readiness: "ready",
  settled: true,
  downloading: false,
  unavailable: false,
};
const state = (facts) => queue.recordSummaryState({ ...FACTS, ...facts });

test("opened with a model ready, a conversation without a summary starts one at once", () => {
  assert.equal(state({}), "starting");
  // Unknown is let through once the check has answered: the call itself says.
  assert.equal(state({ readiness: null }), "starting");
  // Until it answers, nothing is said and nothing starts.
  assert.equal(state({ readiness: null, settled: false }), "checking");
});

test("a summary that exists, or is being written, is what the record shows", () => {
  assert.equal(state({ hasSummary: true, processing: true, failed: true }), "summary");
  assert.equal(state({ processing: true, failed: true }), "preparing");
  assert.equal(state({ processing: true, readiness: "model-missing" }), "preparing");
});

test("only a second failure is shown, and then nothing starts again by itself", () => {
  assert.equal(state({ failed: true }), "failed");
  assert.equal(state({ failed: true, readiness: "model-missing" }), "failed");
});

test("a conversation being recorded is summarized by its Finish, never before", () => {
  assert.equal(state({ recording: true }), "recording");
  assert.equal(state({ recording: true, readiness: "no-model" }), "recording");
  // Stopped, and Finish has not asked yet: it is about to be written.
  assert.equal(state({ finishing: true }), "preparing");
  assert.equal(state({ finishing: true, settled: false }), "preparing");
});

test("without a model ready, the record says why, and how far a download is", () => {
  assert.equal(state({ readiness: "model-missing", downloading: true }), "downloading");
  assert.equal(state({ readiness: "model-missing" }), "needs-model");
  assert.equal(state({ readiness: "no-model" }), "needs-model");
  assert.equal(state({ readiness: "no-endpoint" }), "needs-model");
  // Finish waits for the model too: it does not claim to be writing.
  assert.equal(
    state({ readiness: "model-missing", downloading: true, finishing: true }),
    "downloading"
  );
});

test("nothing to summarize, or refused this session: nothing starts", () => {
  assert.equal(state({ hasTranscript: false }), "not-summarized");
  assert.equal(state({ hasTranscript: false, readiness: "no-model" }), "not-summarized");
  assert.equal(state({ unavailable: true }), "not-summarized");
});
