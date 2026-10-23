const test = require("node:test");
const assert = require("node:assert/strict");

// The house convention for testing an `.mjs` helper from a CommonJS test file
// (see conversationGraph.test.js): the module stays pure ESM so it needs no
// build step, and the test reaches it through a dynamic import.
let CONTOUR_RESOLUTION;
let OUTCOME_FILL;
let LIVE_WINDOW_MS;
let buildLiveContour;
let QUIET_THRESHOLD;
let buildContour;
let contourStrip;
let speechWeight;

test.before(async () => {
  ({
    CONTOUR_RESOLUTION,
    OUTCOME_FILL,
    LIVE_WINDOW_MS,
    buildLiveContour,
    QUIET_THRESHOLD,
    buildContour,
    contourStrip,
    speechWeight,
  } = await import("../../src/helpers/conversationContour.mjs"));
});

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

/** A conversation: `[minutesIn, text]` pairs. */
function talk(pairs) {
  return pairs.map(([minutes, text], index) => ({
    id: `u${index}`,
    text,
    timestamp: T0 + minutes * MINUTE,
  }));
}

const SENTENCE = "we should decide whether the migration lands before the board meeting";

test("an empty conversation produces no geometry rather than a faked one", () => {
  const contour = buildContour({ utterances: [] });
  assert.equal(contour.empty, true);
  assert.deepEqual(contour.points, []);
  assert.deepEqual(contour.marks, []);
  assert.equal(contour.span, 0);
});

test("a single utterance spans the time it took to say", () => {
  const measured = buildContour({
    utterances: [{ id: "u0", text: SENTENCE, timestamp: T0, durationMs: 4_000 }],
  });
  assert.equal(measured.empty, false);
  assert.equal(measured.span, 4_000);
  // With no measured length, as long as its words take to say.
  const sentence = buildContour({ utterances: talk([[0, SENTENCE]]) });
  const twoSentences = buildContour({ utterances: talk([[0, `${SENTENCE} ${SENTENCE}`]]) });
  assert.equal(sentence.empty, false);
  assert.ok(Math.abs(twoSentences.span / sentence.span - 2) < 1e-6);
  // Nothing said is still nothing to draw.
  assert.equal(buildContour({ utterances: talk([[0, ""]]) }).empty, true);
});

test("the window ends where the last turn ends, not where it began", () => {
  const measured = buildContour({
    utterances: [
      { id: "u0", text: SENTENCE, timestamp: T0, durationMs: 4_000 },
      { id: "u1", text: SENTENCE, timestamp: T0 + 10 * MINUTE, durationMs: 6_000 },
    ],
  });
  assert.equal(measured.span, 10 * MINUTE + 6_000);
  // The final turn is on the trace, not cut off at its first word.
  assert.equal(measured.points[measured.points.length - 1].quiet, false);

  // With no measured length, the last turn lasts as long as its words take.
  const sentenceMs = buildContour({ utterances: talk([[0, SENTENCE]]) }).span;
  const estimated = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [10, SENTENCE],
    ]),
  });
  assert.ok(Math.abs(estimated.span - (10 * MINUTE + sentenceMs)) < 1);
  assert.equal(estimated.points[estimated.points.length - 1].quiet, false);
});

// A question is stamped when its turn has been transcribed (conversationAide.mjs
// stamps the card when the finalized segment arrives), which is after the
// speech ended. Mark can be pressed in the quiet after the last turn.
test("a question asked in the final turn keeps its pin, and a late mark its place", () => {
  const lastTurn = T0 + 10 * MINUTE;
  const contour = buildContour({
    utterances: [
      { id: "u0", text: SENTENCE, timestamp: T0, durationMs: 4_000 },
      { id: "u1", text: "so who owns the migration?", timestamp: lastTurn, durationMs: 2_000 },
    ],
    questions: [{ id: "q", state: "silence", createdAt: lastTurn + 3_200 }],
    moments: [{ id: "m", at: lastTurn + 2_500 }],
  });
  assert.equal(contour.span, 10 * MINUTE + 3_200);
  assert.deepEqual(
    contour.marks.map((mark) => [mark.id, mark.x]),
    [["q", 1]]
  );
  assert.deepEqual(
    contour.moments.map((moment) => moment.id),
    ["m"]
  );
});

test("the trace is normalized 0..1 in both axes and starts and ends on the window", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [5, SENTENCE],
      [10, SENTENCE],
    ]),
  });
  assert.equal(contour.empty, false);
  assert.equal(contour.points.length, CONTOUR_RESOLUTION);
  assert.equal(contour.points[0].x, 0);
  assert.equal(contour.points[contour.points.length - 1].x, 1);
  for (const point of contour.points) {
    assert.ok(point.y >= 0 && point.y <= 1, `y out of range: ${point.y}`);
    assert.ok(point.x >= 0 && point.x <= 1, `x out of range: ${point.x}`);
  }
});

// The whole claim of the art direction is that the mark is a measurement. If
// two different conversations could draw the same line, it is wallpaper.
test("different conversations produce different traces", () => {
  const even = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [5, SENTENCE],
      [10, SENTENCE],
      [15, SENTENCE],
      [20, SENTENCE],
    ]),
  });
  const frontLoaded = buildContour({
    utterances: talk([
      [0, `${SENTENCE} ${SENTENCE} ${SENTENCE}`],
      [1, `${SENTENCE} ${SENTENCE}`],
      [2, SENTENCE],
      [20, SENTENCE],
    ]),
  });
  const evenShape = even.points.map((p) => p.y).join(",");
  const frontShape = frontLoaded.points.map((p) => p.y).join(",");
  assert.notEqual(evenShape, frontShape);
  // And the front-loaded one is actually front-loaded.
  const firstQuarter = frontLoaded.points.slice(0, CONTOUR_RESOLUTION / 4);
  const lastQuarter = frontLoaded.points.slice(-CONTOUR_RESOLUTION / 4);
  const mean = (points) => points.reduce((total, p) => total + p.y, 0) / points.length;
  assert.ok(mean(firstQuarter) > mean(lastQuarter));
});

test("a long silence reads as quiet rather than as a gap in the line", () => {
  const contour = buildContour({
    utterances: talk([
      [0, `${SENTENCE} ${SENTENCE}`],
      [1, `${SENTENCE} ${SENTENCE}`],
      [30, `${SENTENCE} ${SENTENCE}`],
    ]),
  });
  const middle = contour.points.slice(CONTOUR_RESOLUTION / 3, (CONTOUR_RESOLUTION * 2) / 3);
  assert.ok(middle.every((point) => point.quiet));
  // Still points, still on the line — the trace thins, it does not break.
  assert.equal(contour.points.length, CONTOUR_RESOLUTION);
  assert.ok(middle.every((point) => point.y <= QUIET_THRESHOLD));
});

test("more speech in a bucket raises the trace there", () => {
  const quiet = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [10, "yes"],
      [20, SENTENCE],
    ]),
  });
  const loud = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [10, `${SENTENCE} ${SENTENCE} ${SENTENCE} ${SENTENCE}`],
      [20, SENTENCE],
    ]),
  });
  const middleOf = (contour) => contour.points[Math.floor(CONTOUR_RESOLUTION / 2)].y;
  assert.ok(middleOf(loud) > middleOf(quiet));
});

test("CJK speech is weighed per character, so it is not drawn as a flat line", () => {
  assert.ok(speechWeight("移行は取締役会の前に着地すべきです") > 5);
  assert.equal(speechWeight("two words"), 2);
  assert.equal(speechWeight(""), 0);
  assert.equal(speechWeight(undefined), 0);
});

test("questions become marks that sit on the trace at the moment they were asked", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [10, SENTENCE],
      [20, SENTENCE],
    ]),
    questions: [
      {
        id: "q1",
        question: "what is the median seat price?",
        state: "denied",
        createdAt: T0 + 10 * MINUTE,
      },
    ],
  });
  assert.equal(contour.marks.length, 1);
  assert.equal(contour.marks[0].id, "q1");
  assert.ok(Math.abs(contour.marks[0].x - 0.5) < 0.02);
  // On the line, not floating above it.
  const bucket = Math.floor(contour.marks[0].x * CONTOUR_RESOLUTION);
  assert.equal(contour.marks[0].y, contour.points[bucket].y);
});

// The shape is the accessibility story: state has to survive greyscale and
// colour blindness, so how filled a mark is must track how settled it is.
test("a mark is filled when settled, soft when hedged, a ring when open", () => {
  assert.equal(OUTCOME_FILL.answered, "solid");
  assert.equal(OUTCOME_FILL.denied, "solid");
  assert.equal(OUTCOME_FILL.uncertain, "soft");
  assert.equal(OUTCOME_FILL.asked, "ring");
  assert.equal(OUTCOME_FILL.silence, "ring");

  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [20, SENTENCE],
    ]),
    questions: [
      { id: "a", state: "answered", createdAt: T0 + 5 * MINUTE },
      { id: "b", state: "asked", createdAt: T0 + 15 * MINUTE },
      { id: "c", state: "mystery", createdAt: T0 + 16 * MINUTE },
    ],
  });
  const [answered, asked, unknown] = contour.marks;
  assert.equal(answered.fill, "solid");
  assert.equal(asked.fill, "ring");
  // An outcome this build does not know is drawn as open, never as settled.
  assert.equal(unknown.fill, "ring");
});

test("repeats each get their own mark and keep their group", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [20, SENTENCE],
    ]),
    questions: [
      { id: "q1", state: "silence", createdAt: T0 + 4 * MINUTE, groupKey: "g", occurrence: 1 },
      { id: "q2", state: "denied", createdAt: T0 + 12 * MINUTE, groupKey: "g", occurrence: 2 },
    ],
  });
  assert.equal(contour.marks.length, 2);
  assert.equal(contour.marks[0].groupKey, contour.marks[1].groupKey);
  assert.deepEqual(
    contour.marks.map((mark) => mark.occurrence),
    [1, 2]
  );
});

// With no explicit end the window reaches the last question, so this is about
// an explicit window: the resume case, where a sitting starts at the press.
test("questions outside the window are dropped rather than clamped onto the ends", () => {
  const contour = buildContour({
    utterances: talk([
      [10, SENTENCE],
      [20, SENTENCE],
    ]),
    questions: [
      { id: "before", state: "asked", createdAt: T0 },
      { id: "inside", state: "asked", createdAt: T0 + 15 * MINUTE },
      { id: "after", state: "asked", createdAt: T0 + 90 * MINUTE },
    ],
    startedAt: T0 + 10 * MINUTE,
    now: T0 + 20 * MINUTE,
  });
  assert.deepEqual(
    contour.marks.map((mark) => mark.id),
    ["inside"]
  );
});

test("a topic starting mid-conversation notches the baseline; the opening one does not", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [20, SENTENCE],
    ]),
    topics: [
      { id: "t0", label: "pricing", startedAt: T0 },
      { id: "t1", label: "hiring", startedAt: T0 + 10 * MINUTE },
    ],
  });
  assert.deepEqual(
    contour.shifts.map((shift) => shift.id),
    ["t1"]
  );
  assert.ok(Math.abs(contour.shifts[0].x - 0.5) < 0.02);
});

test("a thread picked up again later becomes a return arc", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [40, SENTENCE],
    ]),
    topics: [
      { id: "t1", label: "pricing", startedAt: T0 + 4 * MINUTE, lastTouchedAt: T0 + 32 * MINUTE },
    ],
  });
  assert.equal(contour.returns.length, 1);
  assert.ok(contour.returns[0].from < contour.returns[0].to);
  assert.ok(Math.abs(contour.returns[0].from - 0.1) < 0.02);
  assert.ok(Math.abs(contour.returns[0].to - 0.8) < 0.02);
});

test("a thread only ever touched in one stretch is not a return", () => {
  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [60, SENTENCE],
    ]),
    topics: [
      {
        id: "t1",
        label: "pricing",
        startedAt: T0 + 10 * MINUTE,
        lastTouchedAt: T0 + 10 * MINUTE + 500,
      },
    ],
  });
  assert.deepEqual(contour.returns, []);
});

test("speech from before an explicit window is dropped, not piled onto its edge", () => {
  // The resume case: half an hour of a previous sitting is seeded into the
  // store, and the window starts at the press. Clamping those onto x=0 made
  // each one smear across the whole trace and drew a solid slab.
  const resumed = buildContour({
    utterances: talk([
      [0, `${SENTENCE} ${SENTENCE}`],
      [5, `${SENTENCE} ${SENTENCE}`],
      [10, `${SENTENCE} ${SENTENCE}`],
      [46, SENTENCE],
      [48, SENTENCE],
    ]),
    startedAt: T0 + 45 * MINUTE,
    now: T0 + 50 * MINUTE,
  });
  assert.equal(resumed.empty, false);
  // The window opens before anything new was said, so it opens quiet — which is
  // only true if the stale utterances were dropped rather than piled on x=0.
  assert.equal(resumed.points[0].quiet, true);
  // It is a trace, not a slab: most of this window is silence.
  const quiet = resumed.points.filter((point) => point.quiet).length;
  assert.ok(quiet > CONTOUR_RESOLUTION / 2, `expected mostly quiet, got ${quiet}`);
  // Clamping instead of dropping produced exactly this: nothing quiet at all.
  assert.ok(resumed.points.some((point) => !point.quiet));
});

test("an explicit window overrides the utterances' own extent", () => {
  const utterances = talk([
    [10, SENTENCE],
    [20, SENTENCE],
  ]);
  const contour = buildContour({
    utterances,
    startedAt: T0,
    now: T0 + 40 * MINUTE,
  });
  const loud = contour.points.filter((point) => !point.quiet);
  // The talking happened in the first half of the window, so the second half is
  // quiet — which is only true if the explicit window was honoured.
  assert.ok(loud.every((point) => point.x < 0.6));
});

test("the list strip keeps the shape and the marks at a scannable size", () => {
  const contour = buildContour({
    utterances: talk([
      [0, `${SENTENCE} ${SENTENCE}`],
      [10, "mm"],
      [20, `${SENTENCE} ${SENTENCE}`],
    ]),
    questions: [{ id: "q", state: "denied", createdAt: T0 + 18 * MINUTE }],
  });
  const strip = contourStrip(contour, 24);
  assert.equal(strip.empty, false);
  assert.equal(strip.points.length, 24);
  assert.equal(strip.points[0].x, 0);
  assert.equal(strip.points[23].x, 1);
  assert.equal(strip.marks.length, 1);
  assert.equal(strip.marks[0].state, "denied");
  assert.equal(strip.marks[0].fill, OUTCOME_FILL.denied);
});

test("an empty contour makes an empty strip rather than throwing", () => {
  assert.equal(contourStrip(buildContour({ utterances: [] })).empty, true);
  assert.equal(contourStrip(null).empty, true);
});

// A mark is the one element not measured from the room, so the trace must place
// it exactly where it was pressed and say where its window starts — a reader
// clicking the trace is turned back into that moment.
test("marked moments sit at their instant, and the window can be inverted", () => {
  const contour = buildContour({
    utterances: [
      { id: "a", text: "we should cut the take home", timestamp: T0 },
      // Ends a minute in, so the window is a minute long.
      { id: "b", text: "the hiring loop is broken", timestamp: T0 + 58_000, durationMs: 2_000 },
    ],
    moments: [
      { id: "m1", at: T0 + 15_000, note: "the counter-example" },
      { id: "before", at: T0 - 5_000 },
      { id: "nan", at: Number.NaN },
    ],
  });
  assert.deepEqual(
    contour.moments.map((moment) => [moment.id, moment.x, moment.note]),
    [["m1", 0.25, "the counter-example"]]
  );
  assert.equal(contour.start, T0);
  const back = contour.start + contour.moments[0].x * contour.span;
  assert.equal(back, T0 + 15_000);
  assert.deepEqual(buildContour({}).moments, []);
});

// The live contour rolls: the last four minutes, one bucket per second, with
// now at the right-hand edge.
const LIVE_NOW = Date.UTC(2026, 9, 10, 12, 0, 0, 400);
const SECOND = 1000;

test("the live contour is the last four minutes, one bucket per second", () => {
  const contour = buildLiveContour({ now: LIVE_NOW, startedAt: LIVE_NOW - 10 * MINUTE });
  assert.equal(LIVE_WINDOW_MS, 4 * MINUTE);
  assert.equal(contour.points.length, 240);
  assert.equal(contour.span, 4 * MINUTE);
  // The window ends with the current second.
  assert.equal(contour.start + contour.span, Math.floor(LIVE_NOW / SECOND) * SECOND + SECOND);
  assert.equal(contour.live, true);
});

test("a second later, every mark and every second of speech is one bucket to the left", () => {
  const input = {
    utterances: [
      { text: SENTENCE, timestamp: LIVE_NOW - 90 * SECOND, durationMs: 6 * SECOND },
      { text: "short answer here", timestamp: LIVE_NOW - 40 * SECOND, durationMs: 2 * SECOND },
    ],
    questions: [{ id: "q", state: "answered", createdAt: LIVE_NOW - 60 * SECOND }],
    startedAt: LIVE_NOW - 10 * MINUTE,
  };
  const first = buildLiveContour({ ...input, now: LIVE_NOW });
  const next = buildLiveContour({ ...input, now: LIVE_NOW + SECOND });
  assert.ok(Math.abs(first.marks[0].x - next.marks[0].x - 1 / 240) < 0.0002);
  // Away from the right edge, the trace is the same values moved left by one.
  for (let index = 0; index < 230; index += 1) {
    assert.equal(next.points[index].y, first.points[index + 1].y, `bucket ${index}`);
  }
});

test("nothing is drawn before the sitting started", () => {
  const contour = buildLiveContour({ now: LIVE_NOW, startedAt: LIVE_NOW - 30 * SECOND });
  const drawn = contour.points.filter((point) => !point.before);
  assert.equal(drawn.length, 31);
  assert.ok(contour.sessionX > 0.86 && contour.sessionX < 0.88);
  assert.ok(contour.points.filter((point) => point.before).every((point) => point.y === 0));
});

test("speech still being transcribed fills the seconds up to now", () => {
  const contour = buildLiveContour({
    partials: ["so what we are saying right now is still being heard"],
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  const last = contour.points.slice(-3);
  assert.ok(last.every((point) => point.y > 0));
  assert.equal(contour.points[100].y, 0);
});

test("the microphone level moves the trace before anything is transcribed", () => {
  const levels = [];
  for (let second = 120; second > 0; second -= 1) {
    // Room tone, with the last five seconds of somebody talking.
    levels.push({ at: LIVE_NOW - second * SECOND, level: second <= 5 ? 0.08 : 0.004 });
  }
  const contour = buildLiveContour({ levels, now: LIVE_NOW, startedAt: LIVE_NOW - 5 * MINUTE });
  assert.ok(contour.points[236].y > 0.5);
  assert.equal(contour.points[200].y, 0);
});

// The live line's height is how loud each second was. Words spread evenly over
// a segment have no shape of their own: as the height they drew every turn as
// the same flat block, which read as a machine and not as a conversation.
const ROOM_TONE = 0.004;
function talking(loudness) {
  // Two minutes of room tone, then one level per second for the talk.
  const levels = [];
  for (let second = 120; second > loudness.length; second -= 1) {
    levels.push({ at: LIVE_NOW - second * SECOND, level: ROOM_TONE });
  }
  loudness.forEach((level, index) => {
    levels.push({ at: LIVE_NOW - (loudness.length - index) * SECOND, level });
  });
  return levels;
}
const STEADY_TALK = {
  // 26 words over 10 s: an even 2.6 words a second, the rate the old line drew flat.
  text: Array.from({ length: 26 }, () => "word").join(" "),
  timestamp: LIVE_NOW - 10 * SECOND,
  durationMs: 10 * SECOND,
};

test("with the microphone, loudness sets the height, so a turn is not a flat block", () => {
  // Two phrases: each rises, peaks and falls away, with a breath between.
  const loudness = [0.06, 0.12, 0.2, 0.15, 0.07, 0.03, 0.09, 0.18, 0.13, 0.06];
  const contour = buildLiveContour({
    utterances: [STEADY_TALK],
    levels: talking(loudness),
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  const turn = contour.points.slice(230, 239).map((point) => point.y);
  const mean = turn.reduce((a, b) => a + b, 0) / turn.length;
  const spread = Math.sqrt(turn.reduce((a, b) => a + (b - mean) ** 2, 0) / turn.length);
  assert.ok(spread > 0.08, `the turn should rise and fall, spread ${spread.toFixed(3)}`);
  assert.ok(Math.max(...turn) - Math.min(...turn) > 0.2);
});

test("a louder second draws higher than a softer one with the same words", () => {
  const soft = buildLiveContour({
    utterances: [STEADY_TALK],
    levels: talking(Array(10).fill(0.05)),
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  const loud = buildLiveContour({
    utterances: [STEADY_TALK],
    levels: talking([...Array(5).fill(0.05), ...Array(5).fill(0.2)]),
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  assert.ok(loud.points[237].y > loud.points[232].y + 0.2);
  // The scale is the room's own: the soft half is not the top of the range.
  assert.ok(loud.points[232].y < soft.points[232].y);
});

test("a spoken second never draws as a silence, however quiet the microphone", () => {
  const contour = buildLiveContour({
    utterances: [STEADY_TALK],
    levels: talking(Array(10).fill(ROOM_TONE)),
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  const inside = contour.points.slice(232, 238);
  assert.ok(inside.every((point) => point.y > QUIET_THRESHOLD && !point.quiet));
});

test("room tone with nobody talking draws flat", () => {
  const contour = buildLiveContour({
    levels: talking([]),
    now: LIVE_NOW,
    startedAt: LIVE_NOW - 5 * MINUTE,
  });
  assert.ok(contour.points.every((point) => point.y === 0));
});

test("the scale is fixed, so a loud moment leaving the window rescales nothing", () => {
  const steady = {
    text: "a steady sentence of moderate length",
    timestamp: LIVE_NOW - 30 * SECOND,
  };
  const burst = {
    text: `${SENTENCE} ${SENTENCE} ${SENTENCE}`,
    timestamp: LIVE_NOW - 235 * SECOND,
    durationMs: 3 * SECOND,
  };
  const startedAt = LIVE_NOW - 10 * MINUTE;
  const withBurst = buildLiveContour({ utterances: [steady, burst], now: LIVE_NOW, startedAt });
  const later = buildLiveContour({
    utterances: [steady, burst],
    now: LIVE_NOW + 10 * SECOND,
    startedAt,
  });
  const at = (contour) => contour.points.findIndex((point) => point.y > 0 && point.x > 0.8);
  assert.equal(later.points[at(later)].y, withBurst.points[at(withBurst)].y);
});

test("a mark leaves at the left edge when its question is four minutes old", () => {
  const questions = [
    { id: "old", state: "asked", createdAt: LIVE_NOW - 241 * SECOND },
    { id: "kept", state: "asked", createdAt: LIVE_NOW - 230 * SECOND },
  ];
  const contour = buildLiveContour({ questions, now: LIVE_NOW, startedAt: LIVE_NOW - 10 * MINUTE });
  assert.deepEqual(
    contour.marks.map((mark) => mark.id),
    ["kept"]
  );
  // The label still counts the whole sitting.
  assert.equal(contour.summary.questions, 2);
  assert.equal(contour.summary.unresolved, 2);
});

test("minute ticks fall on whole minutes since the start", () => {
  const startedAt = LIVE_NOW - 150 * SECOND;
  const contour = buildLiveContour({ now: LIVE_NOW, startedAt });
  assert.deepEqual(
    contour.ticks.map((tick) => tick.minute),
    [1, 2]
  );
  const second = contour.ticks[1];
  assert.ok(Math.abs(second.x - (startedAt + 2 * MINUTE - contour.start) / contour.span) < 0.0002);
});

// A finished conversation keeps how loud each second was (one value a second,
// conversationLoudness.mjs), so its contour is drawn the way the live line was:
// height from loudness above the room's floor, not from words spread evenly.
const T_FINISHED = Date.UTC(2026, 9, 10, 15, 0, 0);

/** Ten minutes of turns: 20 s of steady talk, then 10 s of room tone, repeated. */
function finishedTalk() {
  const utterances = [];
  for (let turn = 0; turn < 20; turn += 1) {
    utterances.push({
      id: `t${turn}`,
      // An even 2.6 words a second: what the words-only path draws flat.
      text: Array.from({ length: 52 }, () => "word").join(" "),
      timestamp: T_FINISHED + turn * 30 * SECOND,
      durationMs: 20 * SECOND,
    });
  }
  return utterances;
}

/** One level a second: each turn rises and falls, the pauses are room tone. */
function finishedLevels(loudness = (turn, second) => 0.04 + 0.16 * Math.sin((second / 20) * Math.PI)) {
  const levels = [];
  for (let second = 0; second < 600; second += 1) {
    const turn = Math.floor(second / 30);
    const into = second % 30;
    levels.push({
      at: T_FINISHED + second * SECOND,
      level: into < 20 ? loudness(turn, into) : 0.003,
    });
  }
  return levels;
}

function spreadOf(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

test("with the loudness kept, a finished conversation is not a flat block", () => {
  const utterances = finishedTalk();
  const words = buildContour({ utterances });
  const kept = buildContour({ utterances, levels: finishedLevels() });
  const louder = buildContour({
    utterances,
    // Every other turn spoken louder: the words are the same.
    levels: finishedLevels((turn, second) =>
      (turn % 2 ? 0.08 : 0.03) + 0.12 * Math.sin((second / 20) * Math.PI)
    ),
  });
  const ys = (contour) => contour.points.map((point) => point.y);
  assert.ok(
    spreadOf(ys(kept)) > spreadOf(ys(words)),
    `kept ${spreadOf(ys(kept)).toFixed(3)} against words ${spreadOf(ys(words)).toFixed(3)}`
  );
  // Same words, different loudness: different lines.
  assert.notDeepEqual(ys(kept), ys(louder));
  // Same window as the words-only contour, so marks and picks land alike.
  assert.equal(kept.start, words.start);
  assert.equal(kept.span, words.span);
  assert.equal(kept.points.length, CONTOUR_RESOLUTION);
});

/** Each bucket with the time its middle stands for, in seconds into the window. */
function bucketsOf(contour) {
  const bucketMs = contour.span / CONTOUR_RESOLUTION;
  return contour.points.map((point, index) => ({ point, second: ((index + 0.5) * bucketMs) / SECOND }));
}

test("a turn stands above the pause after it", () => {
  const contour = buildContour({ utterances: finishedTalk(), levels: finishedLevels() });
  const buckets = bucketsOf(contour);
  const pause = buckets.filter(({ second }) => second % 30 > 21 && second % 30 < 29);
  const turn = buckets.filter(({ second }) => second % 30 > 7 && second % 30 < 13);
  const mean = (list) => list.reduce((total, { point }) => total + point.y, 0) / list.length;
  assert.ok(mean(turn) > 0.6, `turn ${mean(turn).toFixed(2)}`);
  assert.ok(mean(pause) < 0.3, `pause ${mean(pause).toFixed(2)}`);
});

test("a spoken stretch never reads as a silence, however quiet the microphone", () => {
  const contour = buildContour({
    utterances: finishedTalk(),
    levels: finishedLevels(() => 0.003),
  });
  const turn = bucketsOf(contour).filter(({ second }) => second % 30 > 5 && second % 30 < 15);
  assert.ok(turn.length > 20);
  assert.ok(turn.every(({ point }) => !point.quiet));
});

test("a stretch with no level kept is drawn from its words", () => {
  const levels = finishedLevels().filter((sample) => sample.at < T_FINISHED + 300 * SECOND);
  const contour = buildContour({ utterances: finishedTalk(), levels });
  const late = contour.points.filter((point) => point.x > 0.6);
  // Words alone, at 2.6 words a second of a 3 w/s scale, inside a turn.
  assert.ok(late.some((point) => point.y > 0.6));
});

test("a conversation recorded before loudness was kept draws exactly as before", () => {
  const utterances = finishedTalk();
  const before = buildContour({ utterances });
  assert.deepEqual(buildContour({ utterances, levels: [] }), before);
  assert.deepEqual(buildContour({ utterances, levels: null }), before);
  // Levels from outside the window are not this conversation's.
  assert.deepEqual(
    buildContour({ utterances, levels: [{ at: T_FINISHED - 3_600_000, level: 0.2 }] }),
    before
  );
});

test("the list strip keeps the loudness shape", () => {
  const utterances = finishedTalk();
  // The same words throughout, the first half said loudly and the second
  // softly. A strip bucket is most of a turn long, so a shape it can keep is
  // one this slow: turn by turn, both strips are only aliasing.
  const levels = finishedLevels((turn, second) =>
    turn < 10
      ? 0.04 + 0.16 * Math.sin((second / 20) * Math.PI)
      : 0.01 + 0.04 * Math.sin((second / 20) * Math.PI)
  );
  const strip = contourStrip(buildContour({ utterances, levels }), 24);
  const flat = contourStrip(buildContour({ utterances }), 24);
  const ys = (contour) => contour.points.map((point) => point.y);
  const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  assert.equal(strip.points.length, 24);
  assert.ok(spreadOf(ys(strip)) > spreadOf(ys(flat)));
  assert.ok(mean(ys(strip).slice(0, 12)) > mean(ys(strip).slice(12)) + 0.2);
});
