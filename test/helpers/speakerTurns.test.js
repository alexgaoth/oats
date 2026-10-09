const test = require("node:test");
const assert = require("node:assert/strict");

let assignSpeakers, speakerNumber;

test.before(async () => {
  ({ assignSpeakers, speakerNumber } = await import("../../src/helpers/speakerTurns.mjs"));
});

const seg = (id, startMs, endMs) => ({ id, startMs, endMs });
const turn = (start, end, speaker) => ({ start, end, speaker });

test("each segment takes the speaker it overlaps most, numbered by who spoke first", () => {
  const { assignments, speakers } = assignSpeakers(
    [seg("a", 0, 4000), seg("b", 4500, 9000), seg("c", 9500, 12000)],
    // The diarizer's labels are cluster ids: speaker_00 here spoke second.
    [turn(0, 4.2, "speaker_01"), turn(4.4, 9.2, "speaker_00"), turn(9.3, 12, "speaker_01")]
  );
  assert.deepEqual(Object.fromEntries(assignments), {
    a: "speaker_1",
    b: "speaker_2",
    c: "speaker_1",
  });
  assert.deepEqual(speakers, ["speaker_1", "speaker_2"]);
});

test("a segment straddling a change goes to whoever said most of it", () => {
  const { assignments } = assignSpeakers(
    [seg("x", 0, 2000), seg("mixed", 3000, 8000), seg("y", 9000, 10000)],
    [turn(0, 4, "A"), turn(4, 10, "B")]
  );
  assert.equal(assignments.get("mixed"), "speaker_2", "1 s of A against 4 s of B");
});

test("speech between turns goes to the nearest turn, but only when it is near", () => {
  const { assignments } = assignSpeakers(
    [seg("a", 0, 1000), seg("gap", 2000, 2400), seg("b", 3000, 4000), seg("far", 30_000, 31_000)],
    [turn(0, 1.5, "A"), turn(2.9, 4, "B")]
  );
  assert.equal(assignments.get("gap"), "speaker_1");
  assert.equal(assignments.has("far"), false, "not guessed at from 26 s away");
});

// "Speaker 1" on every line says less than no label.
test("one voice is labelled nothing at all", () => {
  const { assignments, speakers } = assignSpeakers(
    [seg("a", 0, 1000), seg("b", 2000, 3000)],
    [turn(0, 3, "speaker_00")]
  );
  assert.equal(assignments.size, 0);
  assert.deepEqual(speakers, []);
});

test("untimed segments and malformed turns are skipped, not thrown on", () => {
  const { assignments } = assignSpeakers(
    [{ id: "untimed" }, seg("a", 0, 1000), seg("b", 2000, 3000)],
    [null, turn(0, 1, "A"), turn(2, 3, "B"), turn(5, 4, "C"), { start: "x" }]
  );
  assert.equal(assignments.has("untimed"), false);
  assert.equal(assignments.size, 2);
  assert.deepEqual(assignSpeakers(null, null).speakers, []);
});

// Upstream's rules from real calls (diarizationPolicy.js): a cluster holding a
// sliver of the speech in short pieces is a backchannel, not a person.
test("a phantom voice made of short slivers is dropped, a quiet person is not", () => {
  const long = [turn(0, 20, "A"), turn(20.5, 40, "B"), turn(41, 60, "A"), turn(61, 80, "B")];
  const phantom = [turn(40.2, 40.9, "P"), turn(60.1, 60.9, "P")];
  const { speakers } = assignSpeakers(
    [seg("a", 0, 20000), seg("b", 21000, 40000), seg("blip", 40200, 40900)],
    [...long, ...phantom]
  );
  assert.deepEqual(speakers, ["speaker_1", "speaker_2"], "P held 1.5 s in two pieces");

  // Under 10% of the speech, but in turns of four seconds: somebody asking.
  const asker = [turn(81, 85, "C"), turn(86, 90, "C")];
  const withAsker = assignSpeakers(
    [seg("a", 0, 20000), seg("b", 21000, 40000), seg("c", 81000, 85000)],
    [...long, ...asker]
  );
  assert.deepEqual(withAsker.speakers, ["speaker_1", "speaker_2", "speaker_3"]);
});

test("two people merged into one cluster are labelled nothing, not mislabelled", () => {
  const { assignments } = assignSpeakers(
    [seg("a", 0, 60000), seg("b", 61000, 62000)],
    // One cluster holds 98% of the speech; the others are 1-2 s pieces.
    [turn(0, 60, "A"), turn(60.2, 61.5, "B"), turn(61.6, 62.8, "B"), turn(63, 64, "C")]
  );
  assert.equal(assignments.size, 0);
});

test("a speaker label reads back as its number", () => {
  assert.equal(speakerNumber("speaker_3"), 3);
  assert.equal(speakerNumber("room"), null);
  assert.equal(speakerNumber(undefined), null);
});

test("a segment's speaker is a name, a number, a side of a call, or nothing", async () => {
  const { speakerLabelKind } = await import("../../src/helpers/speakerTurns.mjs");
  assert.deepEqual(
    speakerLabelKind({ speaker: "speaker_2", speakerName: "Priya", speakerIsPlaceholder: false }),
    {
      kind: "name",
      name: "Priya",
    }
  );
  assert.deepEqual(speakerLabelKind({ speaker: "speaker_2", speakerIsPlaceholder: true }), {
    kind: "number",
    n: 2,
  });
  // An in-room conversation before (or without) the speaker pass: no label.
  assert.equal(
    speakerLabelKind({
      source: "mic",
      speaker: "room",
      speakerName: "Conversation",
      speakerIsPlaceholder: true,
    }),
    null
  );
  assert.deepEqual(speakerLabelKind({ source: "mic" }), { kind: "you" });
  assert.deepEqual(speakerLabelKind({ source: "system" }), { kind: "room" });
});
