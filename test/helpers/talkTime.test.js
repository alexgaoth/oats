const test = require("node:test");
const assert = require("node:assert/strict");

let talkTime, speakerKey;

test.before(async () => {
  ({ talkTime, speakerKey } = await import("../../src/helpers/talkTime.mjs"));
});

// A segment where the speaker pass put a numbered voice, as stored after Finish.
const said = (speaker, startMs, endMs, extra = {}) => ({
  id: `${speaker}-${startMs}`,
  text: "words",
  source: "mic",
  startMs,
  endMs,
  speaker,
  speakerIsPlaceholder: true,
  ...extra,
});

test("each voice's talk time is the sum of its segments, most talk first", () => {
  const result = talkTime([
    said("speaker_1", 0, 4000),
    said("speaker_2", 4500, 13_500),
    said("speaker_1", 14_000, 17_000),
  ]);
  assert.equal(result.totalMs, 16_000);
  assert.deepEqual(
    result.speakers.map(({ key, ms, percent }) => [key, ms, percent]),
    [
      ["number:2", 9000, 56],
      ["number:1", 7000, 44],
    ]
  );
  assert.equal(result.unattributedMs, 0);
  // The voice's first segment comes along, so the screen labels it the way the
  // transcript does.
  assert.equal(result.speakers[1].segment.startMs, 0);
});

test("a name the reader gave is that person, and one name is one person", () => {
  const sam = { speakerName: "Sam", speakerIsPlaceholder: false };
  const result = talkTime([
    said("speaker_1", 0, 1000),
    said("speaker_2", 1000, 3000, sam),
    // A later sitting's voice, named the same by the reader.
    said("speaker_3", 3000, 4000, sam),
  ]);
  assert.deepEqual(
    result.speakers.map(({ key, ms }) => [key, ms]),
    [
      ["name:Sam", 3000],
      ["number:1", 1000],
    ]
  );
});

test("speech no voice was put on is counted apart, never given to anybody", () => {
  const result = talkTime([
    said("speaker_1", 0, 6000),
    said("speaker_2", 6000, 9000),
    // A room whose voices were not told apart: no label.
    said("room", 9000, 10_000),
  ]);
  assert.equal(result.unattributedMs, 1000);
  assert.deepEqual(
    result.speakers.map(({ percent }) => percent),
    [60, 30]
  );
  assert.equal(result.unattributedPercent, 10);
});

test("percentages are whole and add up to 100", () => {
  const result = talkTime([
    said("speaker_1", 0, 1000),
    said("speaker_2", 1000, 2000),
    said("speaker_3", 2000, 3000),
  ]);
  const percents = result.speakers.map(({ percent }) => percent);
  assert.equal(
    percents.reduce((sum, value) => sum + value, 0),
    100
  );
  // A tie goes to who spoke first.
  assert.deepEqual(percents, [34, 33, 33]);
  assert.deepEqual(
    result.speakers.map(({ key }) => key),
    ["number:1", "number:2", "number:3"]
  );
});

test("a segment with no place in the recording has no length and is left out", () => {
  const result = talkTime([
    said("speaker_1", 0, 2000),
    { ...said("speaker_2", 0, 0), startMs: undefined, endMs: undefined },
    said("speaker_2", 5000, 5000),
    said("speaker_2", 6000, 5000),
    null,
  ]);
  assert.equal(result.totalMs, 2000);
  assert.deepEqual(
    result.speakers.map(({ key }) => key),
    ["number:1"]
  );
  assert.deepEqual(talkTime(null), {
    totalMs: 0,
    speakers: [],
    unattributedMs: 0,
    unattributedPercent: 0,
  });
});

test("an online call's two sides are two voices", () => {
  assert.equal(speakerKey({ source: "mic" }), "you");
  assert.equal(speakerKey({ source: "system" }), "room");
  assert.equal(speakerKey({ source: "mic", speaker: "room" }), null);
  assert.equal(speakerKey({ speaker: "speaker_4", speakerIsPlaceholder: true }), "number:4");
  assert.equal(
    speakerKey({ speaker: "speaker_4", speakerName: " Priya ", speakerIsPlaceholder: false }),
    "name:Priya"
  );
});
