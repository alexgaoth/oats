const test = require("node:test");
const assert = require("node:assert/strict");

let parseMoments, addMoment, setMomentNote, removeMoment, momentSegment, MOMENT_NOTE_MAX;

test.before(async () => {
  ({ parseMoments, addMoment, setMomentNote, removeMoment, momentSegment, MOMENT_NOTE_MAX } =
    await import("../../src/helpers/conversationMoments.mjs"));
});

// A record must open even when one stored entry does not parse.
test("stored moments parse leniently, oldest first, and nothing malformed survives", () => {
  assert.deepEqual(parseMoments(null), []);
  assert.deepEqual(parseMoments(""), []);
  assert.deepEqual(parseMoments("{not json"), []);
  assert.deepEqual(parseMoments('{"at": 5}'), []);
  const parsed = parseMoments(
    JSON.stringify([
      { id: "b", at: 20, note: "late" },
      { at: 10 },
      { id: "x" },
      null,
      { at: "soon" },
    ])
  );
  assert.deepEqual(parsed, [
    { id: "m-10", at: 10, note: "" },
    { id: "b", at: 20, note: "late" },
  ]);
});

test("a mark is added once — a double press inside a second is one moment", () => {
  const first = addMoment([], 10_000);
  assert.equal(first.added, true);
  const again = addMoment(first.moments, 10_400);
  assert.equal(again.added, false);
  assert.equal(again.moments.length, 1);
  const later = addMoment(first.moments, 12_000);
  assert.equal(later.added, true);
  assert.deepEqual(
    later.moments.map((moment) => moment.at),
    [10_000, 12_000]
  );
  assert.equal(addMoment([], Number.NaN).added, false);
});

test("a note is one tidy line, capped, and blank clears it", () => {
  const { moments } = addMoment([], 1000);
  const id = moments[0].id;
  assert.equal(
    setMomentNote(moments, id, "  the   counter-example \n about churn ")[0].note,
    "the counter-example about churn"
  );
  assert.equal(setMomentNote(moments, id, "x".repeat(1000))[0].note.length, MOMENT_NOTE_MAX);
  assert.equal(setMomentNote(setMomentNote(moments, id, "kept"), id, "   ")[0].note, "");
  assert.deepEqual(removeMoment(moments, id), []);
});

test("a moment belongs to the utterance nearest it, the earlier one on a tie", () => {
  const segments = [
    { id: "a", timestamp: 10_000 },
    { id: "b", timestamp: 15_000 },
    { id: "c", timestamp: 20_000 },
    { id: "untimed" },
  ];
  assert.equal(momentSegment({ at: 14_000 }, segments).id, "b");
  assert.equal(
    momentSegment({ at: 12_500 }, segments).id,
    "a",
    "equidistant: what was already said"
  );
  assert.equal(momentSegment({ at: 90_000 }, segments).id, "c");
  assert.equal(momentSegment({ at: 1 }, [{ id: "x" }]), null);
  assert.equal(momentSegment(null, segments), null);
});
