// The second demo set: a house meeting at a San Francisco hacker house and the
// eight conversations around it (`demo/script-ideas/`, recorded into
// `demo/fixtures-ideas/` by `node demo/build-fixtures.mjs --set ideas`). These
// pin what its film needs: fresh fixtures, every conversation filed, one search
// term in exactly three conversations, the room coming back to its first topic,
// and the one question nobody in the room could answer.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..", "..");
const dir = path.join(root, "demo", "fixtures-ideas");
const fixtures = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
const main = fixtures.find((fixture) => fixture.meta.main);
const others = fixtures.filter((fixture) => !fixture.meta.main);

const NOW = Date.UTC(2027, 2, 15, 18, 0, 0);
const SEARCH_TERM = "p(doom)";

let samples;
let review;
let lanes;
let recall;
let fold;
let lifetime;
let groupSort;

test.before(async () => {
  samples = await import("../../src/helpers/sampleConversations.mjs");
  review = await import("../../src/helpers/conversationReview.mjs");
  lanes = await import("../../src/helpers/topicLanes.mjs");
  recall = await import("../../src/helpers/conversationRecall.mjs");
  fold = await import("../../src/helpers/searchFold.mjs");
  lifetime = await import("../../src/helpers/lifetimeGraph.mjs");
  groupSort = await import("../../src/helpers/conversationGroupSort.mjs");
});

/** Seconds from the start of the main conversation to a segment's first words. */
const secondsIn = (segment) => segment.startMs / 1000;

test("the ideas fixtures are what the scripts record today", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      path.join(root, "demo", "build-fixtures.mjs"),
      "--set",
      "ideas",
      "--check",
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("one main conversation of about 29 minutes, six work and two personal ones around it", () => {
  assert.equal(fixtures.filter((fixture) => fixture.meta.main).length, 1);
  assert.equal(main.meta.id, "hacker-house");
  for (const fixture of fixtures) {
    samples.assertSampleFixture(fixture);
    assert.match(fixture.meta.description, /[Ii]nvented people/, fixture.meta.id);
  }
  const minutes = (main.meta.endedAt - main.meta.startedAt) / 60000;
  assert.ok(minutes >= 28 && minutes <= 31, `${minutes} minutes`);
  assert.equal(main.meta.group, "work");
  const groups = others.map((fixture) => fixture.meta.group).sort();
  assert.deepEqual(groups, [
    "personal",
    "personal",
    "work",
    "work",
    "work",
    "work",
    "work",
    "work",
  ]);
  // The people in somebody's evenings are not the hacker house.
  const group = new Set(main.meta.participants.map((person) => person.name));
  for (const fixture of others.filter((item) => item.meta.group === "personal")) {
    for (const person of fixture.meta.participants) {
      assert.ok(!group.has(person.name), `${person.name} in ${fixture.meta.id}`);
    }
  }
});

test("the harness files every ideas conversation in its group", async () => {
  const { createFakeMain } = await import("../../demo/harness/fake-main.mjs");
  const fake = createFakeMain({ fixtures, example: main, now: NOW });
  const groups = await fake.api.getConversationGroups();
  const name = (id) => groups.find((group) => group.id === id)?.name ?? null;
  const filed = { Work: 0, Personal: 0 };
  for (const note of fake.db.notes) {
    const fixture = fixtures.find((item) => item.meta.id === note.demo_sample);
    const expected = { work: "Work", personal: "Personal" }[fixture.meta.group];
    assert.equal(name(note.group_id), expected, note.demo_sample);
    assert.equal(note.group_source, "model", note.demo_sample);
    filed[expected] += 1;
  }
  assert.deepEqual(filed, { Work: 7, Personal: 2 });
});

test("the sorting stub files the hacker house in Work when it is recorded live", async () => {
  const { PERSONAL_SORT_WORDS } = await import("../../demo/harness/fake-main.mjs");
  const { text } = groupSort.buildGroupSortPrompt({
    title: main.note.title,
    summary: groupSort.summaryExcerpt(main.note.enhanced_content),
    topics: groupSort.topicLabels(main.note.conversation_topics),
    groups: ["Work", "Personal"],
  });
  assert.equal(PERSONAL_SORT_WORDS.test(text), false, text);
});

test(`a search for "${SEARCH_TERM}" finds exactly three conversations, the hacker house among them`, () => {
  const needle = fold.foldText(SEARCH_TERM);
  const found = fixtures
    .filter((fixture) => {
      const placed = samples.placeSampleConversation(fixture, { now: NOW });
      return fold.foldText(recall.recallText(placed.note)).includes(needle);
    })
    .map((fixture) => fixture.meta.id)
    .sort();
  assert.deepEqual(found, ["call-with-mom", "hacker-house", "hayes-valley-coffee-line"]);
});

test("the hacker house comes back to its first topic near 10:40, and to another near the end", () => {
  const snapshot = main.note.conversation_topics;
  const drawn = lanes.topicLanes({ snapshot, segments: main.note.transcript });
  assert.ok(drawn.rows.length >= 5 && drawn.rows.length <= 8, `${drawn.rows.length} topics`);
  assert.deepEqual(
    drawn.rows.map((row) => row.label),
    [
      "agi timeline",
      "doom number",
      "vibe coding",
      "gpu poor",
      "founder mode",
      "demo day",
      "bitter lesson",
      "996 grind",
    ]
  );
  const at = (fraction) => (drawn.start - main.meta.startedAt + fraction * drawn.span) / 1000;
  // Three or four topics in the first ten minutes.
  const early = drawn.runs.filter((run) => at(run.from) < 600).map((run) => run.topic);
  assert.ok(new Set(early).size >= 3 && new Set(early).size <= 4, early.join(","));
  const first = drawn.rows[0].id;
  const back = drawn.returns.filter((item) => item.topic === first);
  assert.ok(back.length >= 1);
  assert.ok(at(back[0].at) >= 630 && at(back[0].at) <= 660, `${at(back[0].at)}s`);
  const later = drawn.returns.filter((item) => at(item.at) > 900);
  assert.ok(later.length >= 1, "a second return");
});

test("near 17:30 a question is answered, and about 40 seconds later the one Unknown is asked", () => {
  const moments = review.questionMoments(main.events, main.note.transcript);
  const asked = moments.map((moment) => {
    const event = main.events.find((item) => item.id === moment.id);
    const segment = main.note.transcript.find((item) => item.id === event.segmentIds[0]);
    return { outcome: moment.outcome, text: event.text, seconds: secondsIn(segment) };
  });
  const unknown = asked.filter((item) => item.outcome === "denied");
  assert.equal(unknown.length, 1, "the film searches for exactly one question");
  assert.equal(unknown[0].text, "When is AGI?");
  const answered = asked.filter(
    (item) =>
      item.outcome === "answered" && item.seconds < unknown[0].seconds && item.seconds > 1020
  );
  assert.ok(answered.length >= 1, "an answered question shortly before");
  const gap = unknown[0].seconds - answered[answered.length - 1].seconds;
  assert.ok(gap >= 25 && gap <= 60, `${gap}s between them`);
  assert.equal(asked.filter((item) => item.outcome === "silence").length, 1, "one Hmm.");
  assert.equal(asked[asked.length - 1].outcome, "open", "the last question gets no reply");
  assert.ok(asked[asked.length - 1].seconds > 1700, "asked as the meeting breaks up");
  const marks = main.note.conversation_marks;
  assert.equal(marks.length, 3);
  assert.equal(review.openQuestionCount(main.events), main.note.open_questions);
});

test("every ideas conversation's lanes show the returns its tracker counted", () => {
  for (const fixture of fixtures) {
    const snapshot = fixture.note.conversation_topics;
    const counted = snapshot.nodes.reduce((sum, node) => sum + (node.returns ?? 0), 0);
    const drawn = lanes.topicLanes({ snapshot, segments: fixture.note.transcript });
    assert.equal(drawn.returns.length, counted, fixture.meta.id);
  }
});

test("the board links every conversation to the hacker house, and five subjects to three or more", () => {
  const conversations = fixtures.map((fixture, index) => {
    const placed = samples.placeSampleConversation(fixture, { now: NOW });
    return {
      id: index + 1,
      title: placed.note.title,
      createdAt: placed.startedAt,
      snapshot: JSON.parse(placed.note.conversation_topics),
    };
  });
  const mainId = fixtures.indexOf(main) + 1;
  const { edges } = lifetime.buildLifetimeGraph(conversations);
  for (const conversation of conversations) {
    if (conversation.id === mainId) continue;
    const linked = edges.some(
      (edge) =>
        (edge.from === mainId && edge.to === conversation.id) ||
        (edge.to === mainId && edge.from === conversation.id)
    );
    assert.ok(linked, `${conversation.title} is not linked to the hacker house`);
  }
  const { subjects } = lifetime.subjectThreads(conversations);
  const wide = subjects
    .filter((subject) => subject.conversationIds.length >= 3)
    .map((subject) => subject.label)
    .sort();
  assert.deepEqual(wide, ["996 grind", "agi timeline", "demo day", "doom number", "vibe coding"]);
});
