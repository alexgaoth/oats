const test = require("node:test");
const assert = require("node:assert/strict");

// A pure `.mjs` helper reached through a dynamic import, like
// conversationContour.test.js.
let PartialScheduler, PARTIAL_DEFAULTS;

test.before(async () => {
  ({ PartialScheduler, PARTIAL_DEFAULTS } = await import("../../src/helpers/partialScheduler.mjs"));
});

/** The segmenter's open segment: `startSample` names it. */
const seg = (startSample, speechMs) => ({ startSample, speechMs });
const A = 16000;
const B = 160000;

/** Start one partial for `open` at `now`, or fail the test. */
function start(scheduler, now, open, state = {}) {
  const decision = scheduler.tick({ now, open, ...state });
  assert.equal(decision.start, true, `expected a partial at ${now}: ${decision.reason}`);
  return decision.id;
}

test("the defaults: a second of speech first, then one partial per 1.2 s", () => {
  assert.equal(PARTIAL_DEFAULTS.minSpeechMs, 1000);
  assert.equal(PARTIAL_DEFAULTS.intervalMs, 1200);
});

test("no partial until the open segment holds a second of speech", () => {
  const scheduler = new PartialScheduler();
  assert.deepEqual(scheduler.tick({ now: 0, open: null }), {
    start: false,
    reason: "too-little-speech",
  });
  assert.equal(scheduler.tick({ now: 900, open: seg(A, 980) }).start, false);
  // The moment it has enough, not a beat later.
  assert.equal(scheduler.tick({ now: 933, open: seg(A, 1000) }).start, true);
});

test("then one per beat, on a fixed beat from the first", () => {
  const scheduler = new PartialScheduler();
  const first = start(scheduler, 1000, seg(A, 1000));
  scheduler.settle(first, "so the question", seg(A, 1100));
  assert.equal(scheduler.tick({ now: 1500, open: seg(A, 1400) }).reason, "not-due");
  assert.equal(scheduler.tick({ now: 2199, open: seg(A, 1900) }).reason, "not-due");
  const second = start(scheduler, 2200, seg(A, 2000));
  scheduler.settle(second, "so the question is whether", seg(A, 2100));
  // Late audio does not move the beat: the next is still 1000 + 2 × 1200.
  assert.equal(scheduler.tick({ now: 3399, open: seg(A, 3000) }).start, false);
  start(scheduler, 3433, seg(A, 3100));
});

test("finals come first: none starts while a final is queued or running", () => {
  const scheduler = new PartialScheduler();
  assert.deepEqual(scheduler.tick({ now: 1000, open: seg(B, 1200), finalsPending: 1 }), {
    start: false,
    reason: "final-pending",
  });
  assert.equal(scheduler.tick({ now: 1100, open: seg(B, 1300), finalsPending: 2 }).start, false);
  // A first partial waits for the final rather than losing a beat to it: the
  // final is about to land, and these are the words this exists for.
  start(scheduler, 1133, seg(B, 1330), { finalsPending: 0 });
});

test("a final ahead of a later beat skips that beat", () => {
  // Not reachable from the in-room queue — only the open segment can close,
  // and then it is no longer open — but a final must still win if it is.
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "one", seg(A, 1000));
  assert.equal(
    scheduler.tick({ now: 1200, open: seg(A, 2000), finalsPending: 1 }).reason,
    "final-pending"
  );
  assert.equal(scheduler.tick({ now: 1300, open: seg(A, 2100) }).reason, "not-due");
  start(scheduler, 2400, seg(A, 3000));
});

test("one at a time: a beat that finds the last partial running is skipped, not queued", () => {
  const scheduler = new PartialScheduler();
  const slow = start(scheduler, 0, seg(A, 1000));
  assert.deepEqual(scheduler.tick({ now: 1200, open: seg(A, 2000) }), {
    start: false,
    reason: "partial-in-flight",
  });
  // It comes back 1.5 s after it started. The skipped beat is gone: nothing
  // starts the moment it lands, and the next one is on the beat.
  assert.equal(scheduler.settle(slow, "a long answer", seg(A, 2300)), "a long answer");
  assert.equal(scheduler.tick({ now: 1533, open: seg(A, 2333) }).reason, "not-due");
  assert.equal(scheduler.tick({ now: 2399, open: seg(A, 3100) }).reason, "not-due");
  start(scheduler, 2400, seg(A, 3100));
});

test("beats missed entirely are skipped together", () => {
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "one", seg(A, 1000));
  // No audio for 5 s (a stalled capture): one partial now, not four, and the
  // next beat is back on the grid at 5 × 1200.
  start(scheduler, 5000, seg(A, 2000));
  assert.equal(scheduler.tick({ now: 5100, open: seg(A, 2100) }).reason, "not-due");
  assert.equal(scheduler.tick({ now: 5999, open: seg(A, 2100) }).reason, "not-due");
  assert.equal(scheduler.tick({ now: 6000, open: seg(A, 2100) }).reason, "partial-in-flight");
});

test("a busy server — a dictation — skips the beat", () => {
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "one", seg(A, 1000));
  assert.deepEqual(scheduler.tick({ now: 1200, open: seg(A, 2000), serverBusy: true }), {
    start: false,
    reason: "server-busy",
  });
  assert.equal(scheduler.tick({ now: 1300, open: seg(A, 2100) }).reason, "not-due");
  start(scheduler, 2400, seg(A, 3000));
});

test("a first partial held by a busy server goes as soon as the server is free", () => {
  const scheduler = new PartialScheduler();
  assert.equal(scheduler.tick({ now: 0, open: seg(A, 1000), serverBusy: true }).start, false);
  assert.equal(scheduler.tick({ now: 33, open: seg(A, 1030), serverBusy: true }).start, false);
  start(scheduler, 66, seg(A, 1060));
});

test("a result whose segment closed while it was read is dropped", () => {
  const scheduler = new PartialScheduler();
  const id = start(scheduler, 0, seg(A, 1000));
  // A pause closed A (its final is queued) and nobody is speaking.
  assert.equal(scheduler.settle(id, "words the final will carry", null), null);
  // Or B has opened since.
  const again = start(scheduler, 5000, seg(B, 1000));
  assert.equal(scheduler.settle(again, "words of a closed segment", seg(B + 320000, 200)), null);
  // Nothing was shown, so the final owes the line nothing.
  assert.equal(scheduler.finalSettled(false), false);
});

test("a dropped result still frees the one slot", () => {
  const scheduler = new PartialScheduler();
  const id = start(scheduler, 0, seg(A, 1000));
  scheduler.settle(id, "late", null);
  start(scheduler, 2000, seg(B, 1000));
});

test("each segment starts its own beat and needs its own second of speech", () => {
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "first turn", seg(A, 1000));
  assert.equal(scheduler.tick({ now: 1500, open: null }).start, false);
  assert.equal(scheduler.tick({ now: 1600, open: seg(B, 400) }).start, false);
  // B is ready at 2100, between A's beats: it does not wait for A's 2400.
  start(scheduler, 2100, seg(B, 1000));
});

test("a monologue's carry-over after the 20 s cut is a new segment", () => {
  const scheduler = new PartialScheduler();
  const id = start(scheduler, 18000, seg(A, 15000));
  // The cut closes A and leaves 4 s already spoken open as the next segment.
  const carry = seg(A + 15 * 16000, 4000);
  assert.equal(scheduler.settle(id, "the first fifteen seconds", carry), null);
  assert.equal(scheduler.tick({ now: 20000, open: carry, finalsPending: 1 }).start, false);
  start(scheduler, 20250, carry);
});

test("empty and unchanged results are not sent", () => {
  const scheduler = new PartialScheduler();
  const first = start(scheduler, 0, seg(A, 1000));
  assert.equal(scheduler.settle(first, "  ", seg(A, 1000)), null);
  const second = start(scheduler, 1200, seg(A, 2000));
  assert.equal(scheduler.settle(second, " so we ", seg(A, 2000)), "so we");
  const third = start(scheduler, 2400, seg(A, 3000));
  assert.equal(scheduler.settle(third, "so we", seg(A, 3000)), null);
});

test("a result for a partial that is not the one running is ignored", () => {
  const scheduler = new PartialScheduler();
  const id = start(scheduler, 0, seg(A, 1000));
  assert.equal(scheduler.settle(id + 1, "nobody asked", seg(A, 1000)), null);
  assert.equal(scheduler.tick({ now: 1200, open: seg(A, 2000) }).reason, "partial-in-flight");
  assert.equal(scheduler.settle(id, "the real one", seg(A, 2000)), "the real one");
});

test("a final with words clears the line itself; one without leaves it to us", () => {
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "so the question", seg(A, 1000));
  // The renderer empties micPartial on a final, so nothing more is sent.
  assert.equal(scheduler.finalSettled(true), false);

  scheduler.settle(start(scheduler, 5000, seg(B, 1000)), "mm hmm", seg(B, 1000));
  // B came back with no words, or failed: its partial would stay up for good.
  assert.equal(scheduler.finalSettled(false), true);
  // Once cleared, a later empty final owes nothing.
  assert.equal(scheduler.finalSettled(false), false);
});

test("the same words are sent again for a new segment after a final", () => {
  const scheduler = new PartialScheduler();
  scheduler.settle(start(scheduler, 0, seg(A, 1000)), "yes", seg(A, 1000));
  scheduler.finalSettled(true);
  assert.equal(scheduler.settle(start(scheduler, 4000, seg(B, 1000)), "yes", seg(B, 1000)), "yes");
});

test("two turns, end to end: partials on the beat, none during a final", () => {
  // Audio every 33 ms; a partial takes 100 ms. Turn A speaks from 0.2 s, so it
  // holds a second of speech at 1.2 s; a pause closes it at 6.4 s and its
  // final runs until 6.55 s. Turn B speaks from 7.7 s.
  const scheduler = new PartialScheduler();
  const openAt = (now) => {
    if (now < 6400) return seg(A, Math.max(0, now - 200));
    if (now >= 7500) return seg(B, Math.max(0, now - 7700));
    return null;
  };
  const starts = [];
  let running = null;
  for (let now = 0; now <= 10000; now += 33) {
    if (running && now >= running.until) {
      scheduler.settle(running.id, `words ${running.id}`, openAt(now));
      running = null;
    }
    const finalsPending = now >= 6400 && now < 6550 ? 1 : 0;
    const decision = scheduler.tick({
      now,
      open: openAt(now),
      finalsPending,
      serverBusy: running !== null,
    });
    if (decision.start) {
      starts.push(now);
      running = { id: decision.id, until: now + 100 };
    }
  }
  // A: the first chunk with a second of speech, then the first chunk after
  // each beat of 1221 + k × 1200. B: afresh from its own second of speech.
  assert.deepEqual(starts, [1221, 2442, 3630, 4851, 6039, 8712, 9933]);
});
