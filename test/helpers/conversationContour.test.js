const test = require("node:test");
const assert = require("node:assert/strict");

// The house convention for testing an `.mjs` helper from a CommonJS test file
// (see conversationGraph.test.js): the module stays pure ESM so it needs no
// build step, and the test reaches it through a dynamic import.
let CONTOUR_RESOLUTION;
let OUTCOME_DITHER;
let QUIET_THRESHOLD;
let buildContour;
let contourStrip;
let speechWeight;

test.before(async () => {
  ({
    CONTOUR_RESOLUTION,
    OUTCOME_DITHER,
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

test("a single utterance has no span, so there is nothing to draw yet", () => {
  const contour = buildContour({ utterances: talk([[0, SENTENCE]]) });
  assert.equal(contour.empty, true);
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

// Dither is the accessibility story as much as the aesthetic one: state has to
// survive grayscale and colour-blindness, so density must track certainty.
test("dither density encodes how settled a question is, monotonically", () => {
  assert.equal(OUTCOME_DITHER.answered, 0);
  assert.ok(OUTCOME_DITHER.answered < OUTCOME_DITHER.denied);
  assert.ok(OUTCOME_DITHER.denied < OUTCOME_DITHER.uncertain);
  assert.ok(OUTCOME_DITHER.uncertain < OUTCOME_DITHER.asked);
  assert.equal(OUTCOME_DITHER.asked, OUTCOME_DITHER.silence);

  const contour = buildContour({
    utterances: talk([
      [0, SENTENCE],
      [20, SENTENCE],
    ]),
    questions: [
      { id: "a", state: "answered", createdAt: T0 + 5 * MINUTE },
      { id: "b", state: "asked", createdAt: T0 + 15 * MINUTE },
    ],
  });
  const [answered, asked] = contour.marks;
  assert.ok(answered.dither < asked.dither);
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
  assert.equal(strip.marks[0].dither, OUTCOME_DITHER.denied);
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
      { id: "b", text: "the hiring loop is broken", timestamp: T0 + 60_000 },
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
