const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let SegmentActivityReporter, SegmentActivityState, ACTIVITY_LIMITS;
let SpeechSegmenter, SAMPLE_RATE, ConversationAideSession;

test.before(async () => {
  ({ SegmentActivityReporter, SegmentActivityState, ACTIVITY_LIMITS } =
    await import("../../src/helpers/segmentActivity.mjs"));
  ({ SpeechSegmenter, SAMPLE_RATE } = await import("../../src/helpers/speechSegmenter.mjs"));
  ({ ConversationAideSession } = await import("../../src/helpers/conversationAide.mjs"));
});

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");

// ---------------------------------------------------------------------------
// Main: the reporter

test("a segment that opens, closes and is read gives open, closed, settled", () => {
  const reporter = new SegmentActivityReporter(7);
  assert.deepEqual(reporter.take([], { startSample: 100 }), [
    { session: 7, segment: 1, state: "open" },
  ]);
  assert.deepEqual(reporter.take([], { startSample: 100 }), [], "no news while it stays open");
  const segment = { startSample: 100, endSample: 900 };
  assert.deepEqual(reporter.take([segment], null), [{ session: 7, segment: 1, state: "closed" }]);
  assert.equal(segment.activitySegment, 1);
  assert.deepEqual(reporter.settled(segment, "final"), [
    { session: 7, segment: 1, state: "settled", outcome: "final" },
  ]);
});

test("a cough the segmenter drops is dropped, and no final is waited on", () => {
  const reporter = new SegmentActivityReporter(1);
  reporter.take([], { startSample: 50 });
  assert.deepEqual(reporter.take([], null), [{ session: 1, segment: 1, state: "dropped" }]);
  assert.deepEqual(reporter.take([], { startSample: 400 }), [
    { session: 1, segment: 2, state: "open" },
  ]);
});

test("a turn cut at the cap closes one segment and opens the next at once", () => {
  const reporter = new SegmentActivityReporter(1);
  reporter.take([], { startSample: 0 });
  const first = { startSample: 0, endSample: 320_000 };
  assert.deepEqual(reporter.take([first], { startSample: 320_000 }), [
    { session: 1, segment: 1, state: "closed" },
    { session: 1, segment: 2, state: "open" },
  ]);
});

test("the flush at Stop can open and close a segment in one call", () => {
  const reporter = new SegmentActivityReporter(3);
  const segment = { startSample: 10, endSample: 20 };
  assert.deepEqual(reporter.take([segment], null), [
    { session: 3, segment: 1, state: "open" },
    { session: 3, segment: 1, state: "closed" },
  ]);
});

test("an ended session reports nothing more, and ends once", () => {
  const reporter = new SegmentActivityReporter(2);
  reporter.take([], { startSample: 0 });
  assert.deepEqual(reporter.end("cancelled"), [
    { session: 2, state: "ended", reason: "cancelled" },
  ]);
  assert.deepEqual(reporter.end("stop"), []);
  assert.deepEqual(reporter.take([{ startSample: 0, endSample: 5 }], null), []);
  assert.deepEqual(reporter.settled({ activitySegment: 1 }, "final"), []);
});

// ---------------------------------------------------------------------------
// Renderer: the state

test("open, then a final on its way, then nothing: busy until it settles", () => {
  const state = new SegmentActivityState();
  state.reset(4);
  assert.equal(state.isBusy(0), false);
  state.apply({ session: 4, segment: 1, state: "open" }, 0);
  assert.equal(state.isOpen(10), true);
  state.apply({ session: 4, segment: 1, state: "closed" }, 100);
  assert.equal(state.isOpen(110), false);
  assert.equal(state.pendingCount(110), 1);
  assert.equal(state.isBusy(110), true);
  state.apply({ session: 4, segment: 1, state: "settled", outcome: "empty" }, 200);
  assert.equal(state.isBusy(210), false);
});

test("another session's events change nothing", () => {
  const state = new SegmentActivityState();
  state.reset(5);
  assert.equal(state.apply({ session: 4, segment: 9, state: "open" }, 0), false);
  assert.equal(state.apply({ session: 4, state: "ended", reason: "replaced" }, 0), false);
  assert.equal(state.isBusy(1), false);
  state.apply({ session: 5, segment: 1, state: "open" }, 0);
  assert.equal(state.apply({ session: 4, segment: 1, state: "settled" }, 1), false);
  assert.equal(state.isOpen(2), true);
});

test("with no session from main, the first session heard is followed, not an end", () => {
  const state = new SegmentActivityState();
  assert.equal(state.apply({ session: 3, state: "ended", reason: "replaced" }, 0), false);
  assert.equal(state.session, null);
  assert.equal(state.apply({ session: 4, segment: 1, state: "open" }, 0), true);
  assert.equal(state.session, 4);
});

test("ended clears everything, and nothing of that session counts after it", () => {
  const state = new SegmentActivityState();
  state.reset(1);
  state.apply({ session: 1, segment: 1, state: "closed" }, 0);
  state.apply({ session: 1, segment: 2, state: "open" }, 0);
  state.apply({ session: 1, state: "ended", reason: "stop" }, 10);
  assert.equal(state.isBusy(11), false);
  assert.equal(state.apply({ session: 1, segment: 3, state: "open" }, 12), false);
  assert.equal(state.isBusy(13), false);
});

test("a stuck open segment and a final that never settles both age out", () => {
  const state = new SegmentActivityState();
  state.reset(1);
  state.apply({ session: 1, segment: 1, state: "open" }, 0);
  assert.equal(state.nextExpiry(0), ACTIVITY_LIMITS.openMs);
  assert.equal(state.isOpen(ACTIVITY_LIMITS.openMs - 1), true);
  assert.equal(state.isOpen(ACTIVITY_LIMITS.openMs), false);
  state.apply({ session: 1, segment: 1, state: "closed" }, 1000);
  assert.equal(state.nextExpiry(1000), 1000 + ACTIVITY_LIMITS.pendingMs);
  assert.equal(state.isBusy(1000 + ACTIVITY_LIMITS.pendingMs - 1), true);
  assert.equal(state.isBusy(1000 + ACTIVITY_LIMITS.pendingMs), false);
  assert.equal(state.nextExpiry(1000 + ACTIVITY_LIMITS.pendingMs), null);
});

// ---------------------------------------------------------------------------
// The callers: segmenter → main's in-room session → IPC → the store's state →
// the aide's wait on a reply. `room()` follows ipcHandlers.js's in-room path
// step for step (feedInRoomAudio, enqueueInRoomSegment, transcribeInRoomSegment,
// finishInRoomSegmenting, abandonInRoomSession), and the store side follows
// meetingRecordingStore.ts; the source checks at the end pin that both still
// do what this models. The segmenter, reporter, state and aide are the real ones.

const settle = () => new Promise((resolve) => setImmediate(resolve));

function fakeClock(start = 1_000_000) {
  let now = start;
  let ids = 0;
  const timers = new Map();
  const clock = {
    now: () => now,
    setTimer: (callback, ms) => {
      ids += 1;
      timers.set(ids, { at: now + ms, callback });
      return ids;
    },
    clearTimer: (id) => timers.delete(id),
    after: (ms) => new Promise((resolve) => clock.setTimer(resolve, ms)),
    async advanceTo(target) {
      for (;;) {
        let next = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (!next || timer.at < next[1].at)) next = [id, timer];
        }
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
        await settle();
        await settle();
      }
      now = target;
      await settle();
      await settle();
    },
  };
  return clock;
}

let noiseSeed = 1;
const noise = () => ((noiseSeed = (noiseSeed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/** `[kind, seconds]`: "speech" a voiced tone in syllables, "quiet" the room. */
function signal(pieces) {
  const total = pieces.reduce((n, [, s]) => n + Math.round(s * SAMPLE_RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const [kind, seconds] of pieces) {
    const n = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < n; i += 1) {
      const syllable = Math.abs(Math.sin((Math.PI * 4 * i) / SAMPLE_RATE));
      const voice =
        kind === "speech"
          ? syllable * (0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) + 0.02 * noise())
          : 0;
      out[at + i] = Math.round(voice * 32767);
    }
    at += n;
  }
  return out;
}

/** The renderer: the store's activity state, its segment handler and the aide. */
function renderer(clock, { activity = true, session = null } = {}) {
  const state = new SegmentActivityState();
  state.reset(session);
  const trace = [];
  const segments = [];
  const stale = [];
  const responses = [];
  const cards = new Map();
  let partial = "";
  let events = 0;
  const aide = new ConversationAideSession({
    noteId: 1,
    classify: null,
    silenceDelayMs: 8000,
    isSpeaking: () => !!partial || (activity && state.isBusy(clock.now())),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    insertEvent: async (event) => {
      events += 1;
      if (event.kind === "response") responses.push({ at: clock.now(), ...event.metadata });
      return { id: events };
    },
    updateEvent: async () => null,
    onCard: (card) => {
      cards.set(card.id, card);
      trace.push({ at: clock.now(), card: card.id, state: card.state });
    },
  });
  let listening = true;
  return {
    state,
    aide,
    trace,
    segments,
    stale,
    responses,
    cards,
    setPartial: (text) => {
      partial = text;
    },
    detach: () => {
      listening = false;
    },
    deliver(channel, data) {
      if (!listening) {
        trace.push({ at: clock.now(), channel, lost: true, ...data });
        return;
      }
      trace.push({ at: clock.now(), channel, ...data });
      if (channel === "activity") {
        state.apply(data, clock.now());
        return;
      }
      if (channel === "segment" && data.type === "final") {
        if (data.session != null && state.session !== null && data.session !== state.session) {
          stale.push(data);
          return;
        }
        const segment = {
          id: `seg-${segments.length + 1}`,
          text: data.text,
          session: data.session,
        };
        segments.push(segment);
        aide.onFinalized(segment);
      }
    },
  };
}

/** Main's in-room session, as ipcHandlers.js runs it. */
function room(id, { deliver, readSegment }) {
  const session = {
    id,
    segmenter: new SpeechSegmenter(),
    activity: new SegmentActivityReporter(id),
    queue: [],
    draining: null,
    abandoned: false,
    failedSegments: 0,
    transcript: [],
    queued: 0,
  };
  const send = (events) => {
    if (session.abandoned) return;
    for (const event of events) deliver("activity", event);
  };
  const transcribe = async (segment) => {
    let outcome = "empty";
    try {
      const result = await readSegment(segment);
      if (!result?.success) {
        outcome = "failed";
        session.failedSegments += 1;
      }
      const text = result?.success ? result.text?.trim() : "";
      if (!text) return;
      if (session.abandoned) {
        outcome = "failed";
        return;
      }
      session.transcript.push(text);
      deliver("segment", { type: "final", text, session: id, startMs: segment.startMs });
      outcome = "final";
    } catch (error) {
      outcome = "failed";
      session.failedSegments += 1;
      deliver("error", { message: error.message });
    } finally {
      send(session.activity.settled(segment, outcome));
    }
  };
  const enqueue = (segment) => {
    session.queued += 1;
    session.queue.push(segment);
    if (session.draining) return;
    session.draining = (async () => {
      while (session.queue.length) await transcribe(session.queue.shift());
    })().finally(() => {
      session.draining = null;
    });
  };
  return {
    session,
    feed(samples) {
      if (session.abandoned) return;
      const closed = session.segmenter.push(samples);
      const activity = session.activity.take(closed, session.segmenter.open);
      for (const segment of closed) enqueue(segment);
      send(activity);
    },
    async finish() {
      const flushed = session.segmenter.flush();
      const activity = session.activity.take(flushed, null);
      for (const segment of flushed) enqueue(segment);
      send(activity);
      while (session.draining) await session.draining;
      send(session.activity.end("stop"));
      return { failedSegments: session.failedSegments };
    },
    abandon(reason) {
      send(session.activity.end(reason));
      session.abandoned = true;
      session.queue.length = 0;
    },
  };
}

/** Plays audio into a room in 100 ms chunks, the way capture sends it. */
async function play(clock, target, samples) {
  const step = SAMPLE_RATE / 10;
  for (let i = 0; i < samples.length; i += step) {
    target.feed(samples.subarray(i, i + step));
    await clock.advanceTo(clock.now() + 100);
  }
}

/** Reads each segment after `delayMs`, with the words of the turn it starts in. */
function engine(clock, turns, { delayMs = 300, fail = () => false } = {}) {
  const reads = [];
  return {
    reads,
    readSegment: async (segment) => {
      const turn = turns.find((t) => segment.startMs >= t.fromMs && segment.startMs < t.toMs);
      reads.push({ startMs: segment.startMs, at: clock.now() });
      await clock.after(delayMs);
      if (fail(segment)) throw new Error("macos-parakeet-ane exited (9)");
      return { success: true, text: turn ? turn.text : "" };
    },
  };
}

const QUESTION = "Do you know who wrote the original paper on this?";
const REPLY = "I have no idea, sorry.";
// 1 s of room, the question (2 s), a short pause, then a 12 s reply: longer than
// the aide's 8 s wait.
const DIALOGUE = [
  ["quiet", 1],
  ["speech", 2],
  ["quiet", 1],
  ["speech", 12],
  ["quiet", 2],
];
const TURNS = [
  { fromMs: 0, toMs: 3500, text: QUESTION },
  { fromMs: 3500, toMs: 17_000, text: REPLY },
];

async function dialogue({ activity, delayMs = 600, partials = null }) {
  const clock = fakeClock();
  const ui = renderer(clock, { activity, session: 1 });
  const words = engine(clock, TURNS, { delayMs });
  const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
  const samples = signal(DIALOGUE);
  const step = SAMPLE_RATE / 10;
  for (let i = 0; i < samples.length; i += step) {
    main.feed(samples.subarray(i, i + step));
    if (partials) partials(clock.now(), ui);
    await clock.advanceTo(clock.now() + 100);
  }
  await clock.advanceTo(clock.now() + 1000);
  await main.finish();
  await ui.aide.shutdown();
  return { clock, ui, main, words };
}

test("Parakeet: an open reply past the wait holds the card, and its final resolves it", async () => {
  const { ui } = await dialogue({ activity: true });
  assert.equal(ui.segments.length, 2, "the question and the reply, one segment each");
  assert.equal(ui.cards.size, 1, "one card");
  const [response] = ui.responses;
  assert.equal(ui.responses.length, 1);
  assert.equal(response.trigger, "next_utterance", "resolved by the reply, not by silence");
  assert.notEqual(response.outcome, "silence");
  const card = [...ui.cards.values()][0];
  assert.equal(card.id, "seg-1", "the same card, updated in place");
  assert.equal(card.state, response.outcome);
  // The wait passed while the reply was still open, and was held.
  const asked = ui.trace.find((t) => t.card && t.state === "asked").at;
  const resolved = ui.trace.find((t) => t.card && t.state !== "asked").at;
  assert.ok(resolved - asked > 8000, `held ${resolved - asked} ms past the 8 s wait`);
  assert.ok(resolved - asked < 30_000, "inside the 30 s limit");
});

test("a reply's final still being read holds the card too, past a recheck", async () => {
  // 2.5 s to read: longer than the aide's 1 s recheck, so a closed segment alone
  // would let the recheck call it silence before the words arrive.
  const { ui } = await dialogue({ activity: true, delayMs: 2500 });
  assert.equal(ui.responses[0].trigger, "next_utterance");
});

test("without activity, the same reply was read as silence: what this fixes", async () => {
  const { ui } = await dialogue({ activity: false });
  assert.equal(ui.responses[0].trigger, "silence");
});

test("Whisper with its partials late or missing: activity holds it all the same", async () => {
  // A partial only while the server is idle, and here only once, early in the reply.
  const { ui } = await dialogue({
    activity: true,
    delayMs: 900,
    partials: (now, view) => view.setPartial(now > 1_005_000 && now < 1_005_300 ? "I have" : ""),
  });
  assert.equal(ui.responses[0].trigger, "next_utterance");
});

test("case 1, Stop: the open reply is flushed, its final lands before the end, once", async () => {
  const clock = fakeClock();
  const ui = renderer(clock, { session: 1 });
  const words = engine(clock, TURNS, { delayMs: 1500 });
  const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
  // Stop pressed 6 s into the reply.
  await play(clock, main, signal(DIALOGUE.slice(0, 3).concat([["speech", 6]])));
  assert.equal(ui.state.isOpen(clock.now()), true);
  // finishRecording: capture released, then main's stop awaited with listeners on.
  const stopped = main.finish();
  await clock.advanceTo(clock.now() + 1600);
  await stopped;
  ui.detach();
  await ui.aide.shutdown();
  const finals = ui.trace.filter((t) => t.channel === "segment");
  assert.deepEqual(
    finals.map((t) => t.text),
    [QUESTION, REPLY],
    "each final exactly once"
  );
  assert.equal(ui.trace.filter((t) => t.lost).length, 0, "nothing arrived after teardown");
  const order = ui.trace.filter((t) => t.channel).map((t) => t.state ?? t.type);
  assert.deepEqual(order.slice(-3), ["final", "settled", "ended"]);
  assert.equal(ui.state.isBusy(clock.now()), false);
  assert.equal(main.session.queued, 2);
  assert.deepEqual(main.session.transcript, [QUESTION, REPLY]);
});

test("case 2, a pause: the close never cancels the final already queued", async () => {
  const clock = fakeClock();
  const ui = renderer(clock, { session: 1 });
  const words = engine(clock, TURNS, { delayMs: 2000 });
  const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
  await play(
    clock,
    main,
    signal([
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 1],
    ])
  );
  const closedAt = ui.trace.find((t) => t.state === "closed").at;
  assert.equal(ui.state.isOpen(clock.now()), false);
  assert.equal(ui.state.pendingCount(clock.now()), 1, "closed, its final on the way");
  // A cough opens and is dropped while the final is read.
  await play(
    clock,
    main,
    signal([
      ["speech", 0.1],
      ["quiet", 1],
    ])
  );
  await clock.advanceTo(closedAt + 2100);
  assert.deepEqual(
    ui.segments.map((s) => s.text),
    [QUESTION]
  );
  assert.equal(ui.state.isBusy(clock.now()), false);
  await main.finish();
});

test("case 3, the helper fails: delivered finals stay, the failure is counted, nothing holds", async () => {
  const clock = fakeClock();
  const ui = renderer(clock, { session: 1 });
  const words = engine(clock, TURNS, { delayMs: 300, fail: (s) => s.startMs > 3500 });
  const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
  await play(clock, main, signal(DIALOGUE));
  await clock.advanceTo(clock.now() + 9000);
  const result = await main.finish();
  await ui.aide.shutdown();
  assert.deepEqual(
    ui.segments.map((s) => s.text),
    [QUESTION],
    "the question's final survives"
  );
  assert.equal(result.failedSegments, 1, "the reply is reported as not read");
  assert.equal(ui.trace.filter((t) => t.channel === "error").length, 1);
  const settled = ui.trace.filter((t) => t.state === "settled").map((t) => t.outcome);
  assert.deepEqual(settled, ["final", "failed"]);
  assert.equal(ui.state.isBusy(clock.now()), false);
  // With nothing coming, the card resolves at its wait, as silence.
  assert.equal(ui.responses[0].trigger, "silence");
});

test("case 4, a cancel: activity clears, and a final read after it goes nowhere", async () => {
  const clock = fakeClock();
  const ui = renderer(clock, { session: 1 });
  const words = engine(clock, TURNS, { delayMs: 2000 });
  const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
  await play(
    clock,
    main,
    signal([
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 0.6],
      ["speech", 1],
    ])
  );
  assert.equal(ui.state.isBusy(clock.now()), true);
  main.abandon("cancelled");
  assert.equal(ui.state.isBusy(clock.now()), false, "cleared at once");
  await clock.advanceTo(clock.now() + 3000);
  assert.equal(ui.segments.length, 0, "the late final is not delivered");
  assert.deepEqual(main.session.transcript, []);
  assert.equal(ui.trace.filter((t) => t.state === "settled").length, 0);
  assert.deepEqual(
    ui.trace.filter((t) => t.state === "ended").map((t) => t.reason),
    ["cancelled"]
  );
});

test("case 5, a replacement: the old session's late final and activity never touch the new", async () => {
  const clock = fakeClock();
  const ui = renderer(clock, { session: 1 });
  const slow = engine(clock, TURNS, { delayMs: 3000 });
  const old = room(1, { deliver: ui.deliver, readSegment: slow.readSegment });
  await play(
    clock,
    old,
    signal([
      ["quiet", 1],
      ["speech", 2],
      ["quiet", 0.6],
    ])
  );
  assert.equal(ui.state.pendingCount(clock.now()), 1);
  // meeting-transcription-start over a session never stopped.
  old.abandon("replaced");
  ui.state.reset(2);
  const fresh = room(2, {
    deliver: ui.deliver,
    readSegment: engine(clock, [{ fromMs: 0, toMs: 99_000, text: "New room." }]).readSegment,
  });
  await play(
    clock,
    fresh,
    signal([
      ["quiet", 1],
      ["speech", 1.5],
      ["quiet", 1],
    ])
  );
  await clock.advanceTo(clock.now() + 4000);
  // Even if an old event or final reached the renderer, it is not this session's.
  ui.deliver("activity", { session: 1, segment: 1, state: "open" });
  ui.deliver("segment", { type: "final", text: "Old words.", session: 1 });
  assert.equal(ui.state.isBusy(clock.now()), false);
  assert.deepEqual(
    ui.segments.map((s) => [s.session, s.text]),
    [[2, "New room."]]
  );
  assert.equal(ui.stale.length, 1);
  assert.deepEqual(old.session.transcript, [], "nor into main's transcript of the new one");
  assert.deepEqual(fresh.session.transcript, ["New room."]);
  await fresh.finish();
});

test("case 6, the maximum hold: a stuck open segment or an endless turn stops at 30 s", async () => {
  // Capture dies mid-reply: the segment never closes and no event comes again.
  {
    const clock = fakeClock();
    const ui = renderer(clock, { session: 1 });
    const words = engine(clock, TURNS);
    const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
    await play(
      clock,
      main,
      signal([
        ["quiet", 1],
        ["speech", 2],
        ["quiet", 1],
        ["speech", 3],
      ])
    );
    const openedAt = ui.trace.filter((t) => t.state === "open").at(-1).at;
    await clock.advanceTo(clock.now() + 40_000);
    const asked = ui.trace.find((t) => t.card && t.state === "asked").at;
    const resolved = ui.responses[0].at;
    assert.equal(ui.responses[0].trigger, "silence");
    assert.ok(resolved >= openedAt + ACTIVITY_LIMITS.openMs, "held while it could be open");
    assert.ok(resolved <= asked + 30_000, `resolved ${resolved - asked} ms after the card`);
    assert.equal(ui.state.isOpen(clock.now()), false);
    main.abandon("cancelled");
  }
  // Somebody talks for 45 s: the cap cuts it, the activity stays fresh, the aide's
  // own limit ends the wait.
  {
    const clock = fakeClock();
    const ui = renderer(clock, { session: 1 });
    const words = engine(clock, [
      { fromMs: 0, toMs: 3500, text: QUESTION },
      { fromMs: 3500, toMs: 99_000, text: "" },
    ]);
    const main = room(1, { deliver: ui.deliver, readSegment: words.readSegment });
    await play(
      clock,
      main,
      signal([
        ["quiet", 1],
        ["speech", 2],
        ["quiet", 1],
        ["speech", 45],
      ])
    );
    const asked = ui.trace.find((t) => t.card && t.state === "asked").at;
    assert.ok(ui.trace.filter((t) => t.state === "open").length >= 3, "cut at the cap");
    assert.equal(ui.responses[0].trigger, "silence");
    const held = ui.responses[0].at - asked;
    assert.ok(held >= 30_000 && held <= 31_000, `held ${held} ms`);
    const stopped = main.finish();
    await clock.advanceTo(clock.now() + 1000);
    await stopped;
  }
});

// ---------------------------------------------------------------------------
// The real callers still do what the model above does.

test("main sends activity for every engine, in the order the model above assumes", () => {
  const source = read("src/helpers/ipcHandlers.js");
  const feed = source.slice(
    source.indexOf("const feedInRoomAudio"),
    source.indexOf("const sendInRoomSpeech")
  );
  assert.ok(
    feed.indexOf("session.activity.take(closed") < feed.indexOf("enqueueInRoomSegment(session"),
    "segments are numbered before their finals are queued"
  );
  assert.ok(feed.includes("sendInRoomActivity(session, activity)"));
  assert.ok(!/if \(session\.lag\)[^}]*sendInRoomActivity/.test(feed), "not behind the lag");
  const finish = source.slice(
    source.indexOf("const finishInRoomSegmenting"),
    source.indexOf("const runInRoomSpeakerPass")
  );
  assert.ok(
    finish.indexOf("while (session.draining) await session.draining") <
      finish.indexOf('session.activity.end("stop")'),
    "Stop ends the session after its last final"
  );
  const transcribe = source.slice(
    source.indexOf("const transcribeInRoomSegment"),
    source.indexOf("const finishInRoomSegmenting")
  );
  assert.ok(transcribe.includes("session: session.id"), "a final names its session");
  assert.ok(transcribe.includes("if (session.abandoned)"));
  assert.ok(
    transcribe.indexOf("finally") <
      transcribe.indexOf("session.activity.settled(segment, outcome)"),
    "every read settles, whatever happened"
  );
  assert.match(source, /if \(meetingInRoom\) abandonInRoomSession\("replaced"\)/);
  const reset = source.slice(source.indexOf("const resetMeetingLocalState"));
  assert.ok(reset.slice(0, 1200).includes('abandonInRoomSession("cancelled")'));
  assert.match(source, /webContents\.send\("meeting-transcription-activity", event\)/);
  assert.match(source, /inRoomSession: meetingInRoom\?\.id \?\? null/);
});

test("preload carries the channel, and the store listens, holds on it and lets go", () => {
  const preload = read("preload.js");
  assert.match(
    preload,
    /onMeetingTranscriptionActivity: registerListener\(\s*"meeting-transcription-activity"/
  );
  const store = read("src/stores/meetingRecordingStore.ts");
  assert.match(store, /segmentActivity\.isBusy\(Date\.now\(\)\)/, "isSpeaking reads it");
  assert.match(store, /onMeetingTranscriptionActivity\?\.\(/);
  assert.match(store, /if \(activityCleanup\) ipcCleanups\.push\(activityCleanup\)/);
  assert.match(store, /resetSegmentActivity\(startResult\.inRoomSession\)/);
  const cleanup = store.slice(store.indexOf("async function cleanup()"));
  assert.ok(cleanup.slice(0, 300).includes("resetSegmentActivity()"));
  const finish = store.slice(store.indexOf("async function finishRecording()"));
  assert.ok(
    finish.indexOf("meetingTranscriptionStop") < finish.indexOf("await cleanup()"),
    "listeners stay until main's stop has returned"
  );
  assert.match(store, /data\.session !== segmentActivity\.session/, "stale finals are refused");
});
