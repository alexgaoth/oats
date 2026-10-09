const test = require("node:test");
const assert = require("node:assert/strict");

// CommonJS with a dynamic import, matching the other helper suites: the file is
// linted as a script, and the helper it exercises is a native ES module.
let buildVaultNote,
  humanDuration,
  isoDate,
  linkableTopics,
  openQuestions,
  safeFilename,
  shouldMirrorNote,
  topicLink,
  transcriptSpanSeconds;

test.before(async () => {
  ({
    buildVaultNote,
    humanDuration,
    isoDate,
    linkableTopics,
    openQuestions,
    safeFilename,
    shouldMirrorNote,
    topicLink,
    transcriptSpanSeconds,
  } = await import("../../src/helpers/obsidianNote.mjs"));
});

const STRINGS = {
  untitled: "Untitled conversation",
  summary: "Summary",
  openQuestions: "Open questions",
  topics: "Topics",
  transcript: "Transcript",
  you: "You",
  room: "Room",
  speaker: (n) => `Speaker ${n}`,
};

// A fixed local-time instant, so the date assertions do not depend on the clock.
const AT = new Date(2026, 7, 25, 14, 30).getTime();

/**
 * A question and its reply, exactly as the aide stores them.
 *
 * This is the whole point of the fixture: the verdict lives on the *response*
 * event as `metadata.reason`, the question carries only `metadata.state`, and
 * `metadata.outcome` is on neither. Every pin below is built through this, so a
 * filter written against the wrong key fails here instead of shipping.
 */
let nextEventId = 1;
const asked = (text, reason, groupKey = text) => {
  const id = nextEventId++;
  const events = [
    {
      id,
      kind: "question",
      text,
      parentEventId: null,
      createdAt: id,
      metadata: { state: reason ?? "asked", groupKey, occurrence: 1 },
    },
  ];
  // `null` means nobody ever replied — the card that stayed at "asked".
  if (reason) {
    const replyId = nextEventId++;
    events.push({
      id: replyId,
      kind: "response",
      text: "whatever was said next",
      parentEventId: id,
      createdAt: replyId,
      metadata: { reason, outcome: reason, trigger: "silence", source: "local" },
    });
  }
  return events;
};

test("the date is the reader's local date, not UTC's", () => {
  // 00:30 local on the 25th is still the 24th in UTC; the file should say the
  // day the conversation happened to the person who had it.
  const local = new Date(2026, 7, 25, 0, 30).getTime();
  assert.equal(isoDate(local), "2026-08-25");
});

test("a filename leads with the date so a vault folder sorts without a plugin", () => {
  assert.equal(safeFilename("Pricing and onboarding", AT), "2026-08-25 Pricing and onboarding.md");
});

test("filenames drop the characters a filesystem or Obsidian would choke on", () => {
  const name = safeFilename('Q3: pricing / "the #1 ask" | notes', AT);
  assert.match(name, /^2026-08-25 /);
  for (const ch of ["/", "\\", ":", "|", '"', "#", "[", "]", "*", "?", "<", ">"]) {
    assert.ok(!name.includes(ch), `${ch} survived into ${name}`);
  }
});

test("a title that is only unsafe characters still yields a usable filename", () => {
  assert.equal(safeFilename("///", AT), "2026-08-25 ---.md");
  assert.equal(safeFilename("", AT), "2026-08-25 Untitled conversation.md");
});

test("a pipe in a topic would make Obsidian read an alias, so links strip it", () => {
  assert.equal(topicLink("pricing | EU VAT"), "[[pricing  EU VAT]]".replace("  ", " "));
  assert.equal(topicLink("  onboarding flow  "), "[[onboarding flow]]");
  assert.equal(topicLink("[[nested]]"), "[[nested]]");
  assert.equal(topicLink("   "), null);
});

test("durations read in minutes, and a short conversation is never 0m", () => {
  assert.equal(humanDuration(30), "1m");
  assert.equal(humanDuration(47 * 60), "47m");
  assert.equal(humanDuration(3 * 3600 + 5 * 60), "3h05");
  assert.equal(humanDuration(0), null);
  assert.equal(humanDuration(undefined), null);
});

test("the duration comes from the transcript, because the column is never filled", () => {
  // `audio_duration_seconds` is set only by the INSERT in `saveNote`, and a
  // conversation's note is created before its recording starts.
  const segments = [
    { text: "one", source: "mic", timestamp: AT },
    { text: "two", source: "system", timestamp: AT + 12 * 60_000 },
  ];
  assert.equal(transcriptSpanSeconds(segments), 720);
  assert.equal(transcriptSpanSeconds([{ text: "only one", timestamp: AT }]), null);
  assert.equal(transcriptSpanSeconds([]), null);
  assert.equal(transcriptSpanSeconds(null), null);

  const { markdown } = buildVaultNote({
    note: { title: "T", createdAtMs: AT, audio_duration_seconds: null },
    snapshot: null,
    segments,
    strings: STRINGS,
  });
  assert.match(markdown, /duration: 12m/);
});

test("only substantial topics are linked, heaviest first", () => {
  const snapshot = {
    nodes: [
      { label: "brushed past", durationMs: 4000 },
      { label: "pricing", durationMs: 400000 },
      { label: "onboarding", durationMs: 90000 },
    ],
  };
  assert.deepEqual(linkableTopics(snapshot), ["pricing", "onboarding"]);
});

test("a missing or malformed snapshot yields no links rather than throwing", () => {
  assert.deepEqual(linkableTopics(null), []);
  assert.deepEqual(linkableTopics({}), []);
  assert.deepEqual(linkableTopics({ nodes: "nope" }), []);
});

test("an answered question is not an open one, and the verdict is the reply", () => {
  const events = [
    ...asked("What is the EU VAT rule?", "denied", "g1"),
    ...asked("Answered one", "answered", "g2"),
    ...asked("Nobody replied", "silence", "g3"),
    ...asked("Still waiting on a verdict", null, "g4"),
  ];
  assert.deepEqual(openQuestions(events), [
    "What is the EU VAT rule?",
    "Nobody replied",
    "Still waiting on a verdict",
  ]);
});

test("the vault agrees with the panel: both read the question's response event", async () => {
  // Two lists of what a conversation left open must not be able to disagree.
  const { buildReview } = await import("../../src/helpers/conversationReview.mjs");
  const events = [
    ...asked("Open one", "denied", "g1"),
    ...asked("Closed one", "answered", "g2"),
    ...asked("Never replied to", null, "g3"),
  ];
  assert.deepEqual(
    openQuestions(events),
    buildReview({ events }).unresolved.map((item) => item.question)
  );
});

test("a question asked three times is one line, and an answer anywhere closes it", () => {
  // Repeats are never suppressed upstream; each asking is its own event under a
  // shared `groupKey`, and the last asking is often the one that gets answered.
  const twice = [
    ...asked("Where did the churn number come from?", "silence", "g1"),
    ...asked("Where did the churn number come from?", "uncertain_response", "g1"),
  ];
  assert.deepEqual(openQuestions(twice), ["Where did the churn number come from?"]);
  assert.deepEqual(openQuestions([...twice, ...asked("And again?", "answered", "g1")]), []);
});

test("malformed events never throw", () => {
  assert.deepEqual(openQuestions(null), []);
  assert.deepEqual(
    openQuestions(
      [null, {}, { kind: "question" }, { kind: "question", text: " " }].filter(Boolean)
    ),
    []
  );
});

test("nothing is mirrored until the conversation has a name of its own", () => {
  const placeholder = "Untitled conversation";
  assert.equal(
    shouldMirrorNote({ note_type: "meeting", title: "Untitled conversation" }, placeholder),
    false
  );
  assert.equal(shouldMirrorNote({ note_type: "meeting", title: "   " }, placeholder), false);
  assert.equal(shouldMirrorNote({ note_type: "meeting", title: null }, placeholder), false);
  assert.equal(shouldMirrorNote({ note_type: "meeting", title: "Pricing" }, placeholder), true);
  // Dictation is a note too, and mirroring those fills a vault with fragments.
  assert.equal(shouldMirrorNote({ note_type: "note", title: "Pricing" }, placeholder), false);
  assert.equal(shouldMirrorNote(null, placeholder), false);
});

test("the note carries frontmatter, summary, open questions, links and transcript", () => {
  const { filename, markdown } = buildVaultNote({
    note: {
      id: 12,
      title: "Pricing",
      content: "We agreed to hold the price.",
      createdAtMs: AT,
    },
    snapshot: { nodes: [{ label: "pricing", durationMs: 400000 }] },
    events: [
      ...asked("What is the EU VAT rule?", "denied", "g1"),
      ...asked("Answered one", "answered", "g2"),
      {
        id: 900,
        kind: "response",
        text: "not a question",
        parentEventId: null,
        createdAt: 900,
        metadata: {},
      },
    ],
    segments: [
      { text: "hello", source: "mic", timestamp: AT },
      { text: "hello back", source: "system", timestamp: AT + 47 * 60_000 },
    ],
    strings: STRINGS,
  });

  assert.equal(filename, "2026-08-25 Pricing.md");
  assert.match(markdown, /^---\ndate: 2026-08-25\n/);
  assert.match(markdown, /oats_id: 12/);
  assert.match(markdown, /duration: 47m/);
  assert.match(markdown, /topics: \["pricing"\]/);
  assert.match(markdown, /## Summary\n\nWe agreed to hold the price\./);
  assert.match(markdown, /## Open questions\n\n- What is the EU VAT rule\?/);
  assert.match(markdown, /\[\[pricing\]\]/);
  assert.match(markdown, /## Transcript\n\n\*\*You:\*\* hello\n\n\*\*Room:\*\* hello back/);
  // An answered question is not something to come back to.
  assert.ok(!markdown.includes("Answered one"));
  // A response is not a question.
  assert.ok(!markdown.includes("not a question"));
});

test("enhanced content wins over raw content, since it is what the reader sees", () => {
  const { markdown } = buildVaultNote({
    note: { title: "T", content: "raw", enhanced_content: "polished", createdAtMs: AT },
    snapshot: null,
    strings: STRINGS,
  });
  assert.ok(markdown.includes("polished"));
  assert.ok(!markdown.includes("raw"));
});

test("empty sections are omitted rather than left as bare headings", () => {
  const { markdown } = buildVaultNote({
    note: { title: "Nothing yet", createdAtMs: AT },
    snapshot: null,
    events: [],
    segments: [],
    strings: STRINGS,
  });
  for (const heading of ["## Summary", "## Open questions", "## Topics", "## Transcript"]) {
    assert.ok(!markdown.includes(heading), `${heading} should not appear`);
  }
  assert.match(markdown, /# Nothing yet/);
});

test("a quote or a line break in a title cannot break the YAML frontmatter", () => {
  const { markdown } = buildVaultNote({
    note: { title: 'The "big"\none', createdAtMs: AT },
    snapshot: { nodes: [{ label: 'say "hi"\n---\nevil: true', durationMs: 400000 }] },
    strings: STRINGS,
  });
  assert.match(markdown, /topics: \["say \\"hi\\"\\n---\\nevil: true"\]/);
  // The frontmatter is exactly one block: opened once, closed once.
  assert.equal(markdown.split("\n").filter((line) => line === "---").length, 2);
  assert.match(markdown, /# The "big" one\n/);
});

test("headings come from the caller, so a vault is not English in ten locales", () => {
  const { markdown } = buildVaultNote({
    note: { title: "T", content: "s", createdAtMs: AT },
    snapshot: null,
    segments: [{ text: "x", source: "mic", timestamp: AT }],
    strings: { ...STRINGS, summary: "Zusammenfassung", transcript: "Transkript", you: "Du" },
  });
  assert.ok(markdown.includes("## Zusammenfassung"));
  assert.ok(markdown.includes("## Transkript"));
  assert.ok(markdown.includes("**Du:** x"));
});

// What the reader marked leads the note's body, each line saying when, what
// was being said, and the note if there is one.
test("marked moments are listed with their time, their words and their note", async () => {
  const { markedLines } = await import("../../src/helpers/obsidianNote.mjs");
  const segments = [
    { id: "a", text: "So the pricing model", timestamp: 1000 },
    { id: "b", text: "No, I don't know.\nNobody does", timestamp: 46_000 },
  ];
  const marks = JSON.stringify([
    { id: "m2", at: 47_000, note: "the number nobody had" },
    { id: "m1", at: 2000 },
  ]);
  assert.deepEqual(markedLines(marks, segments), [
    "- `0:01` “So the pricing model”",
    "- `0:46` “No, I don't know. Nobody does” — the number nobody had",
  ]);
  assert.deepEqual(markedLines(null, segments), []);
  assert.deepEqual(markedLines("not json", segments), []);
});

// "Save" on the summary tab writes what the tab shows, in its order.
test("the reading export carries the marks and the open questions above the summary", async () => {
  const { buildReadingExport } = await import("../../src/helpers/obsidianNote.mjs");
  const markdown = buildReadingExport({
    note: {
      title: "Board prep",
      enhanced_content: "# Board prep\n\nThe deck leads with pricing.",
      conversation_marks: JSON.stringify([{ id: "m", at: 5000, note: "the gap" }]),
    },
    events: [
      {
        id: 1,
        kind: "question",
        parentEventId: null,
        segmentIds: ["s1"],
        text: "What is our NRR?",
        metadata: {},
        createdAt: 1,
      },
    ],
    segments: [{ id: "s1", text: "Nobody has computed it", timestamp: 4000 }],
    strings: { untitled: "Untitled", marked: "Marked", openQuestions: "Open questions" },
  });
  assert.equal(
    markdown,
    [
      "# Board prep",
      "",
      "## Marked",
      "",
      "- `0:01` “Nobody has computed it” — the gap",
      "",
      "## Open questions",
      "",
      "- What is our NRR?",
      "",
      "The deck leads with pricing.",
      "",
    ].join("\n")
  );
});

// One rule with the reading view (speakerLabelKind), so a vault cannot call a
// person something the transcript tab does not.
test("an in-room transcript is labelled by voice, by name once named, and not at all before", () => {
  const room = {
    source: "mic",
    speaker: "room",
    speakerName: "Conversation",
    speakerIsPlaceholder: true,
  };
  const { markdown } = buildVaultNote({
    note: { id: 3, title: "Lab", createdAtMs: AT },
    segments: [
      { ...room, text: "before the speaker pass" },
      { source: "mic", speaker: "speaker_1", speakerIsPlaceholder: true, text: "first voice" },
      {
        source: "mic",
        speaker: "speaker_2",
        speakerName: "Priya",
        speakerIsPlaceholder: false,
        text: "named",
      },
    ],
    strings: STRINGS,
  });
  assert.match(
    markdown,
    /## Transcript\n\nbefore the speaker pass\n\n\*\*Speaker 1:\*\* first voice\n\n\*\*Priya:\*\* named/
  );
});

// Copy on the summary tab took the summary prose alone, while Save from the same
// tab wrote the title, the marks and the open questions around it. Both now go
// through `readingExport`, with the same keys in the interface's language.
test("Copy and Save on the summary tab produce one document from the stored note", async () => {
  const { readingExport, buildReadingExport } = await import("../../src/helpers/obsidianNote.mjs");
  const { i18nMain } = require("../../src/helpers/i18nMain");
  const t = (key) => i18nMain.t(key);
  const note = {
    title: "Board prep",
    enhanced_content: "The deck leads with pricing.",
    conversation_marks: JSON.stringify([{ id: "m", at: 5000, note: "the gap" }]),
    transcript: JSON.stringify([{ id: "s1", text: "Nobody has computed it", timestamp: 4000 }]),
  };
  const events = [...asked("What is our NRR?", null), ...asked("Who owns pricing?", "answered")];

  const text = readingExport({ note, events, t });
  assert.equal(
    text,
    [
      "# Board prep",
      "",
      "## Marked",
      "",
      "- `0:01` “Nobody has computed it” — the gap",
      "",
      "## Open questions",
      "",
      "- What is our NRR?",
      "",
      "The deck leads with pricing.",
      "",
    ].join("\n")
  );
  // The defect, both ways round: the clipboard is no longer the prose alone,
  // and it is exactly what the export handler wrote before it shared this path.
  assert.notEqual(text.trim(), note.enhanced_content);
  assert.equal(
    text,
    buildReadingExport({
      note,
      events,
      segments: JSON.parse(note.transcript),
      strings: {
        untitled: t("oats.vault.untitled"),
        marked: t("oats.vault.marked"),
        openQuestions: t("oats.vault.openQuestions"),
      },
    })
  );
});

test("with nothing marked and nothing left open, the copied text adds only the title", async () => {
  const { readingExport } = await import("../../src/helpers/obsidianNote.mjs");
  const t = (key) => ({ "oats.vault.untitled": "Untitled conversation" })[key] ?? key;
  const note = { title: "Quick sync", enhanced_content: "We agreed.", transcript: "[]" };
  assert.equal(readingExport({ note, events: [], t }), "# Quick sync\n\nWe agreed.\n");
  assert.equal(
    readingExport({ note: { ...note, title: "" }, events: [], t }),
    "# Untitled conversation\n\nWe agreed.\n"
  );
});

test("a transcript that does not parse still leaves the marks and the summary", async () => {
  const { readingExport } = await import("../../src/helpers/obsidianNote.mjs");
  const t = (key) => ({ "oats.vault.marked": "Marked" })[key] ?? key;
  const note = {
    title: "T",
    content: "s",
    conversation_marks: JSON.stringify([{ id: "m", at: 9000, note: "here" }]),
    transcript: "{not json",
  };
  assert.equal(readingExport({ note, t }), "# T\n\n## Marked\n\n- `0:00` — here\n\ns\n");
});
