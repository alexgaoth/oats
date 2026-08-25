const test = require("node:test");
const assert = require("node:assert/strict");

// CommonJS with a dynamic import, matching the other helper suites: the file is
// linted as a script, and the helper it exercises is a native ES module.
let buildVaultNote, humanDuration, isoDate, linkableTopics, safeFilename, topicLink;

test.before(async () => {
  ({ buildVaultNote, humanDuration, isoDate, linkableTopics, safeFilename, topicLink } =
    await import("../../src/helpers/obsidianNote.mjs"));
});

const STRINGS = {
  untitled: "Untitled conversation",
  summary: "Summary",
  openQuestions: "Open questions",
  topics: "Topics",
  transcript: "Transcript",
};

// A fixed local-time instant, so the date assertions do not depend on the clock.
const AT = new Date(2026, 7, 25, 14, 30).getTime();

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

test("the note carries frontmatter, summary, open questions, links and transcript", () => {
  const { filename, markdown } = buildVaultNote({
    note: {
      title: "Pricing",
      content: "We agreed to hold the price.",
      audio_duration_seconds: 47 * 60,
      createdAtMs: AT,
    },
    snapshot: { nodes: [{ label: "pricing", durationMs: 400000 }] },
    events: [
      { kind: "question", text: "What is the EU VAT rule?", metadata: { outcome: "denied" } },
      { kind: "question", text: "Answered one", metadata: { outcome: "answered" } },
      { kind: "response", text: "not a question", metadata: {} },
    ],
    transcript: "**You:** hello",
    strings: STRINGS,
  });

  assert.equal(filename, "2026-08-25 Pricing.md");
  assert.match(markdown, /^---\ndate: 2026-08-25\n/);
  assert.match(markdown, /duration: 47m/);
  assert.match(markdown, /topics: \["pricing"\]/);
  assert.match(markdown, /## Summary\n\nWe agreed to hold the price\./);
  assert.match(markdown, /## Open questions\n\n- What is the EU VAT rule\?/);
  assert.match(markdown, /\[\[pricing\]\]/);
  assert.match(markdown, /## Transcript\n\n\*\*You:\*\* hello/);
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
    transcript: "",
    strings: STRINGS,
  });
  for (const heading of ["## Summary", "## Open questions", "## Topics", "## Transcript"]) {
    assert.ok(!markdown.includes(heading), `${heading} should not appear`);
  }
  assert.match(markdown, /# Nothing yet/);
});

test("a quote in a title cannot break the YAML frontmatter", () => {
  const { markdown } = buildVaultNote({
    note: { title: 'The "big" one', createdAtMs: AT },
    snapshot: { nodes: [{ label: 'say "hi"', durationMs: 400000 }] },
    strings: STRINGS,
  });
  assert.match(markdown, /topics: \["say \\"hi\\""\]/);
});

test("headings come from the caller, so a vault is not English in ten locales", () => {
  const { markdown } = buildVaultNote({
    note: { title: "T", content: "s", createdAtMs: AT },
    snapshot: null,
    transcript: "x",
    strings: { ...STRINGS, summary: "Zusammenfassung", transcript: "Transkript" },
  });
  assert.ok(markdown.includes("## Zusammenfassung"));
  assert.ok(markdown.includes("## Transkript"));
});
