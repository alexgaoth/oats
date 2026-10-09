const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatTxt,
  formatSrt,
  formatJson,
  formatMd,
  formatTranscript,
  saveFormat,
  speakerLabelKind: savedSpeakerKind,
  storedDate,
} = require("../../src/helpers/transcriptFormatter");
const { i18nMain } = require("../../src/helpers/i18nMain");

// The rule the screen labels speakers by, from the module the reading view uses.
let screenSpeakerKind;

test.before(async () => {
  ({ speakerLabelKind: screenSpeakerKind } = await import("../../src/helpers/speakerTurns.mjs"));
});

// What a recording stores. `timestamp` is the epoch millisecond a turn was said
// (`session.startedAt + startMs`), and `created_at` is SQLite's UTC, no zone.
const T0 = Date.UTC(2026, 9, 8, 21, 30);
const NOTE = { title: "Pricing", created_at: "2026-10-08 21:30:00", participants: null };

/** A turn of a room, after the speaker pass told its voices apart. */
const turn = (offsetMs, speaker, text, extra = {}) => ({
  source: "mic",
  speaker,
  speakerIsPlaceholder: true,
  timestamp: T0 + offsetMs,
  text,
  ...extra,
});

/** A turn of a room whose voices were never told apart, as the recorder stores it. */
const roomTurn = (offsetMs, text) => ({
  source: "mic",
  speaker: "room",
  speakerName: "Conversation",
  speakerIsPlaceholder: true,
  timestamp: T0 + offsetMs,
  text,
});

const RULE = "──────────────────────────────────";

/** The lines of a saved .txt after its title, date and rule. */
function body(txt) {
  const lines = txt.split("\n");
  return lines.slice(lines.indexOf(RULE) + 2);
}

const DATE_PARTS = { year: "numeric", month: "long", day: "numeric" };
const TIME_PARTS = { hour: "2-digit", minute: "2-digit" };
const longDate = (date) =>
  `${date.toLocaleDateString(undefined, DATE_PARTS)} ${date.toLocaleTimeString(undefined, TIME_PARTS)}`;

// Node re-reads `process.env.TZ` on every assignment, so one process can pin
// both directions of a zone bug: west of Greenwich a UTC string read as local
// lands hours late, east of it hours early.
function inZone(zone, fn) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

// --- When each turn was said ------------------------------------------------

// The defect: the epoch millisecond read as seconds since the start printed
// `[497637500:00:00]` on the first line of every saved transcript.
test("a saved turn sits at its distance from the first turn, written as the gutter writes it", () => {
  const txt = formatTxt(NOTE, [
    turn(0, "speaker_1", "So where are we on pricing?"),
    turn(4_000, "speaker_2", "Not settled."),
    turn(65_000, "speaker_1", "Okay."),
    turn(3_723_000, "speaker_2", "An hour in."),
  ]);
  const stamps = [...txt.matchAll(/^\[([\d:]+)\]/gm)].map((match) => match[1]);
  assert.deepEqual(stamps, ["0:00", "0:04", "1:05", "1:02:03"]);
  assert.doesNotMatch(txt, /\[\d{3,}:/, "no epoch read as hours");
});

// The gutter's origin is the first turn that has a time; a turn without one
// shows no time there, and none here.
test("a turn without a time is saved without one, and does not move the origin", () => {
  const txt = formatTxt(NOTE, [
    { source: "mic", speaker: "speaker_1", text: "Untimed." },
    turn(10_000, "speaker_2", "First timed turn."),
    turn(15_000, "speaker_1", "Five seconds later."),
  ]);
  assert.deepEqual(body(txt), [
    "Speaker 1:",
    "Untimed.",
    "",
    "[0:00] Speaker 2:",
    "First timed turn.",
    "",
    "[0:05] Speaker 1:",
    "Five seconds later.",
    "",
  ]);
});

// --- Who said it -------------------------------------------------------------

// `assignSpeakers` numbers voices from one; the file added another one.
test("voices are numbered as the screen numbers them: speaker_1 is Speaker 1", () => {
  const txt = formatTxt(NOTE, [
    turn(0, "speaker_1", "First."),
    turn(5_000, "speaker_2", "Second."),
  ]);
  assert.deepEqual(body(txt), [
    "[0:00] Speaker 1:",
    "First.",
    "",
    "[0:05] Speaker 2:",
    "Second.",
    "",
  ]);
  assert.doesNotMatch(txt, /Speaker 3/);
});

test("a room whose voices were never told apart is saved with no speaker, not as You", () => {
  const txt = formatTxt(NOTE, [roomTurn(0, "Hello."), roomTurn(9_000, "Hi.")]);
  assert.deepEqual(body(txt), ["[0:00]", "Hello.", "", "[0:09]", "Hi.", ""]);
  assert.doesNotMatch(txt, /You|Conversation/);
});

// The other direction: "You" survives exactly where the screen shows it.
test("the microphone side of a call is still You, and the other side Room", () => {
  const txt = formatTxt(NOTE, [
    { source: "mic", timestamp: T0, text: "My side." },
    { source: "system", timestamp: T0 + 3_000, text: "Their side." },
  ]);
  assert.deepEqual(body(txt), ["[0:00] You:", "My side.", "", "[0:03] Room:", "Their side.", ""]);
});

test("a voice the reader named is saved by name; a placeholder name never is", () => {
  const txt = formatTxt(NOTE, [
    turn(0, "speaker_1", "Named.", { speakerName: " Priya ", speakerIsPlaceholder: false }),
    turn(3_000, "speaker_2", "Placeholder.", { speakerName: "Guest", speakerIsPlaceholder: true }),
  ]);
  assert.deepEqual(body(txt), [
    "[0:00] Priya:",
    "Named.",
    "",
    "[0:03] Speaker 2:",
    "Placeholder.",
    "",
  ]);
});

// The screen never reads the inherited speaker-mappings table, so neither does
// the file: a third argument from an old caller changes nothing.
test("a stored speaker mapping does not rename a voice the screen calls Speaker 1", () => {
  const txt = formatTxt(NOTE, [turn(0, "speaker_1", "First.")], { speaker_1: "Mapped" });
  assert.match(txt, /^\[0:00\] Speaker 1:$/m);
  assert.doesNotMatch(txt, /Mapped/);
});

// The formatter restates the screen's rule because it is CommonJS. This is what
// keeps them one rule: every combination of every field the rule reads.
test("the saved transcript decides every speaker exactly as the screen does", () => {
  const speakers = [
    undefined,
    "",
    "room",
    "you",
    "speaker_0",
    "speaker_1",
    "speaker_2",
    "speaker_12",
    "speaker_",
    "speaker_x",
    "SPEAKER_1",
    "guest",
  ];
  const sources = [undefined, "mic", "system"];
  const names = [undefined, "", "  ", "Priya", " Priya ", 7];
  const placeholders = [undefined, true, false];
  let checked = 0;
  for (const speaker of speakers) {
    for (const source of sources) {
      for (const speakerName of names) {
        for (const speakerIsPlaceholder of placeholders) {
          const segment = { speaker, source, speakerName, speakerIsPlaceholder };
          assert.deepEqual(
            savedSpeakerKind(segment),
            screenSpeakerKind(segment),
            JSON.stringify(segment)
          );
          checked += 1;
        }
      }
    }
  }
  assert.equal(checked, speakers.length * sources.length * names.length * placeholders.length);
  assert.equal(savedSpeakerKind(null), screenSpeakerKind(null));
});

// The labels are the screen's keys, so they follow the interface language.
test("speaker labels are written in the interface language", async () => {
  try {
    await i18nMain.changeLanguage("de");
    const txt = formatTxt(NOTE, [
      turn(0, "speaker_1", "Erste."),
      { source: "mic", timestamp: T0 + 2_000, text: "Ich." },
    ]);
    assert.deepEqual(body(txt), ["[0:00] Sprecher 1:", "Erste.", "", "[0:02] Du:", "Ich.", ""]);
  } finally {
    await i18nMain.changeLanguage("en");
  }
});

// --- When the conversation happened ----------------------------------------

test("the date at the head is the stored UTC moment, in every zone", () => {
  for (const zone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
    inZone(zone, () => {
      assert.equal(storedDate("2026-10-08 21:30:00").getTime(), T0, `space, ${zone}`);
      assert.equal(storedDate("2026-10-08T21:30").getTime(), T0, `T, minutes, ${zone}`);
      const head = formatTxt(NOTE, [turn(0, "speaker_1", "x")]).split("\n")[1];
      assert.equal(head, longDate(new Date(T0)), zone);
    });
  }
});

// The defect, measured where it shows: in California the head said 9:30 PM
// for a conversation held at 2:30 PM.
test("west of Greenwich the head no longer reads the UTC clock as local time", () => {
  inZone("America/Los_Angeles", () => {
    const head = formatTxt(NOTE, [turn(0, "speaker_1", "x")]).split("\n")[1];
    assert.notEqual(head, longDate(new Date("2026-10-08 21:30:00")));
  });
});

test("a stored time that names its own zone is trusted as written", () => {
  inZone("America/Los_Angeles", () => {
    assert.equal(storedDate("2026-10-08T21:30:00.000Z").getTime(), T0);
    assert.equal(storedDate("2026-10-08T23:30:00+02:00").getTime(), T0);
    assert.equal(storedDate(T0).getTime(), T0);
  });
});

// --- The save panel ----------------------------------------------------------

// The panel listed four formats while the content followed the caller alone,
// so SubRip or JSON picked there saved the text transcript under that name.
test("the save panel offers one format, and it is the one that is written", () => {
  for (const format of ["txt", "srt", "json", "md"]) {
    const { ext, filters } = saveFormat(format);
    assert.equal(ext, format);
    assert.equal(filters.length, 1, `${format}: one choice, not a menu`);
    assert.deepEqual(filters[0].extensions, [format]);
  }
  // What the transcript tab asks for, and what anything unknown becomes.
  assert.deepEqual(saveFormat("txt").filters, [{ name: "Text", extensions: ["txt"] }]);
  for (const odd of [undefined, "", "docx", "toString", "__proto__"]) {
    assert.equal(saveFormat(odd).ext, "txt", String(odd));
  }
});

test("a format asked for is the format written", () => {
  const segments = [turn(0, "speaker_1", "First."), turn(5_000, "speaker_2", "Second.")];
  assert.equal(formatTranscript("txt", NOTE, segments), formatTxt(NOTE, segments));
  assert.equal(formatTranscript("docx", NOTE, segments), formatTxt(NOTE, segments));
  assert.match(
    formatTranscript("srt", NOTE, segments),
    /^1\n00:00:00,000 --> 00:00:05,000\nSpeaker 1: First\.\n/
  );
  assert.deepEqual(
    JSON.parse(formatTranscript("json", NOTE, segments)).segments.map((s) => s.speaker),
    ["Speaker 1", "Speaker 2"]
  );
  assert.match(formatTranscript("md", NOTE, segments), /^# Pricing\n/);
});

// --- The other formats share the clock and the labels ------------------------

test("merged same-speaker SRT cues keep the first segment's start time", () => {
  const output = formatSrt([
    turn(0, "speaker_1", "Opening."),
    turn(1_000, "speaker_2", "Opening sentence."),
    turn(2_500, "speaker_2", "Continuation."),
    turn(6_000, "speaker_1", "Reply."),
  ]);
  assert.match(
    output,
    /\n2\n00:00:01,000 --> 00:00:06,000\nSpeaker 2: Opening sentence\. Continuation\.\n/
  );
});

test("same-speaker merging still uses the latest segment for the rolling gap", () => {
  const output = formatSrt([
    turn(0, "speaker_1", "One."),
    turn(1_500, "speaker_1", "Two."),
    turn(3_000, "speaker_1", "Three."),
    turn(6_000, "speaker_2", "Reply."),
  ]);
  assert.match(output, /^1\n00:00:00,000 --> 00:00:06,000\nSpeaker 1: One\. Two\. Three\./);
});

test("same-speaker segments at the merge threshold remain separate cues", () => {
  const output = formatSrt([turn(0, "speaker_1", "First."), turn(2_000, "speaker_1", "Second.")]);
  assert.match(output, /^1\n00:00:00,000 --> 00:00:02,000\nSpeaker 1: First\./);
  assert.match(output, /\n2\n00:00:02,000 --> 00:00:05,000\nSpeaker 1: Second\./);
});

// Read as seconds, the window was two milliseconds: nothing ever merged.
test("the merge window is two seconds, not two milliseconds", () => {
  const output = formatSrt([turn(0, "speaker_1", "First."), turn(1_999, "speaker_1", "Second.")]);
  assert.match(output, /^1\n00:00:00,000 --> 00:00:04,999\nSpeaker 1: First\. Second\.\n/);
});

test("the final merged SRT cue ends relative to its last segment, not its first", () => {
  const output = formatSrt([
    turn(0, "speaker_1", "One."),
    turn(1_500, "speaker_1", "Two."),
    turn(3_000, "speaker_1", "Three."),
  ]);
  assert.match(output, /^1\n00:00:00,000 --> 00:00:06,000\nSpeaker 1: One\. Two\. Three\./);
});

test("JSON times are seconds from the first turn, and the duration is the last of them", () => {
  const output = JSON.parse(
    formatJson(NOTE, [
      turn(0, "speaker_1", "One."),
      turn(1_500, "speaker_1", "Two."),
      roomTurn(65_000, "Untold."),
    ])
  );
  assert.equal(output.metadata.duration_seconds, 65);
  assert.deepEqual(
    output.segments.map((s) => [s.speaker, s.timestamp]),
    [
      ["Speaker 1", 0],
      [null, 65],
    ]
  );
  // A turn with no speaker is not a speaker.
  assert.deepEqual(output.speakers, ["Speaker 1"]);
  assert.equal(output.metadata.speaker_count, 1);
});

// The note-files mirror writes this one, so it carries the same fixes.
test("the markdown transcript uses the same labels and the same clock", () => {
  const md = formatMd(NOTE, [turn(0, "speaker_1", "First."), roomTurn(9_000, "Untold.")]);
  assert.match(md, /\n\*\*Speaker 1\*\* `0:00`\nFirst\.\n\n`0:09`\nUntold\.\n/);
});
