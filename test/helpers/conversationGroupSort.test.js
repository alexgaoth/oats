const test = require("node:test");
const assert = require("node:assert/strict");

// Sorting a conversation into a group with the writing model
// (src/helpers/conversationGroupSort.mjs): the prompt it reads, how its answer
// is read, and the background run, driven here by a stub model.

let sort;

test.before(async () => {
  sort = await import("../../src/helpers/conversationGroupSort.mjs");
});

const SUMMARY = `
Theo, Maya and Priya reviewed the senior backend search: two finalists remain, and the take-home is losing candidates.

## Threads
- **Finalists.** Of 31 applicants, two reached the final round. Only one has run a large data migration.
- **Interview loop.** Three of six candidates dropped at the four-hour take-home.

## Action items
- [ ] Priya: tell both finalists about the new loop today.
`;

test("the summary is read as prose: headings dropped whole, markup unwrapped", () => {
  const excerpt = sort.summaryExcerpt(SUMMARY);
  assert.equal(
    excerpt,
    "Theo, Maya and Priya reviewed the senior backend search: two finalists remain, and the take-home is losing candidates. " +
      "Finalists. Of 31 applicants, two reached the final round. Only one has run a large data migration. " +
      "Interview loop. Three of six candidates dropped at the four-hour take-home. " +
      "Priya: tell both finalists about the new loop today."
  );
  assert.doesNotMatch(excerpt, /Threads|Action items|\*|#|\[ \]/);
  assert.equal(sort.summaryExcerpt(null), "");
  assert.equal(sort.summaryExcerpt("   "), "");
  // A link keeps its words, and snake_case keeps its underscores.
  assert.equal(
    sort.summaryExcerpt("See [the plan](https://x.test) for rate_limit."),
    "See the plan for rate_limit."
  );
});

test("a long summary is cut at a sentence end, or at a word with an ellipsis", () => {
  const long = `${"The launch moves to Thursday. ".repeat(30)}`;
  const excerpt = sort.summaryExcerpt(long);
  assert.ok(excerpt.length <= sort.SUMMARY_EXCERPT_CHARS);
  assert.match(excerpt, /Thursday\.$/);
  const words = sort.summaryExcerpt("word ".repeat(200), 50);
  assert.ok(words.endsWith("…"));
  assert.ok(words.length <= 51);
  // Chinese and Japanese end sentences without a space.
  const cjk = sort.summaryExcerpt("周四发布。".repeat(40), 30);
  assert.ok(cjk.endsWith("。"));
  assert.ok(cjk.length <= 30);
});

test("topic labels come longest-held first, without repeats or blanks", () => {
  const snapshot = JSON.stringify({
    nodes: [
      { label: "sso", durationMs: 60_000 },
      { label: "pricing", durationMs: 240_000 },
      { label: "  ", durationMs: 500_000 },
      { label: "SSO", durationMs: 30_000 },
      { label: "launch date", durationMs: 120_000 },
    ],
  });
  assert.deepEqual(sort.topicLabels(snapshot), ["pricing", "launch date", "sso"]);
  assert.deepEqual(sort.topicLabels(snapshot, 1), ["pricing"]);
  assert.deepEqual(sort.topicLabels("not json"), []);
  assert.deepEqual(sort.topicLabels(null), []);
  assert.deepEqual(sort.topicLabels({ nodes: [{ label: "budget", durationMs: 1 }] }), ["budget"]);
});

test("the prompt lists the groups, then what the conversation was about", () => {
  const prompt = sort.buildGroupSortPrompt({
    title: "Backend hiring: finalists and the migration gap",
    summary: "Two finalists remain.",
    topics: ["hiring", "interview loop"],
    groups: ["Work", "Personal", "Side project"],
  });
  assert.equal(prompt.systemPrompt, sort.GROUP_SORT_SYSTEM_PROMPT);
  assert.equal(
    prompt.text,
    [
      "Groups:",
      "- Work",
      "- Personal",
      "- Side project",
      "",
      "Title: Backend hiring: finalists and the migration gap",
      "Topics: hiring, interview loop",
      "Summary: Two finalists remain.",
      "",
      "Which group? Answer with one name from the list, or none.",
    ].join("\n")
  );
  // A placeholder title and no topics are left out rather than sent empty.
  const bare = sort.buildGroupSortPrompt({ title: null, summary: "S.", groups: ["Work"] });
  assert.doesNotMatch(bare.text, /Title:|Topics:/);
});

test("the prompt stays small: no transcript, a capped summary", () => {
  const prompt = sort.buildGroupSortPrompt({
    title: "T",
    summary: sort.summaryExcerpt("A sentence that goes on. ".repeat(400)),
    topics: sort.topicLabels({
      nodes: Array.from({ length: 20 }, (_, i) => ({ label: `topic ${i}`, durationMs: i })),
    }),
    groups: ["Work", "Personal"],
  });
  // About four characters a token: well under 300 tokens.
  assert.ok(prompt.text.length + prompt.systemPrompt.length < 1100, `${prompt.text.length}`);
  assert.equal((prompt.text.match(/topic \d+/g) ?? []).length, sort.MAX_TOPIC_LABELS);
});

test("an answer is one of the names, ignoring case and punctuation", () => {
  const groups = ["Work", "Personal", "Side project"];
  const read = (answer) => sort.parseGroupSortAnswer(answer, groups);
  for (const answer of [
    "Work",
    "work",
    " WORK ",
    "Work.",
    '"Work"',
    "**Work**",
    "`work`",
    "<Work>",
  ]) {
    assert.deepEqual(read(answer), { kind: "group", index: 0 }, answer);
  }
  assert.deepEqual(read("side project"), { kind: "group", index: 2 });
  assert.deepEqual(read("Side-project!"), { kind: "group", index: 2 });
  assert.deepEqual(read("<think>It mentions hiring.</think>\nWork"), { kind: "group", index: 0 });
  for (const answer of ["none", "None.", "NONE", "'none'"]) {
    assert.deepEqual(read(answer), { kind: "none" }, answer);
  }
});

test("anything else is unreadable, and leaves the conversation in no group", () => {
  const groups = ["Work", "Personal"];
  const read = (answer) => sort.parseGroupSortAnswer(answer, groups);
  for (const answer of [
    "Group: Work",
    "Work, probably",
    "The answer is Work",
    "Work\nIt is about hiring.",
    "Family",
    "Work or Personal",
  ]) {
    assert.deepEqual(read(answer), { kind: "unreadable" }, answer);
  }
  // A model that said nothing failed: that is not an answer.
  for (const answer of ["", "   ", null, "<think>hmm", "...", "<think>x</think>"]) {
    assert.deepEqual(read(answer), { kind: "empty" }, String(answer));
  }
  // Two groups that read the same cannot be told apart.
  assert.deepEqual(sort.parseGroupSortAnswer("work", ["Work", "work!"]), { kind: "unreadable" });
  // Names in other scripts compare as written.
  assert.deepEqual(sort.parseGroupSortAnswer("仕事", ["仕事", "プライベート"]), {
    kind: "group",
    index: 0,
  });
  assert.deepEqual(sort.parseGroupSortAnswer("ＷＯＲＫ", ["Work"]), { kind: "group", index: 0 });
});

// --- The background run, with a stub model.

function harness({ ids = [1, 2, 3], answers = {}, busyFor = 0, readyUntil = Infinity } = {}) {
  const log = [];
  const progress = [];
  let busyLeft = busyFor;
  let readyChecks = 0;
  let stop = false;
  const deps = {
    ids,
    ready: async () => (++readyChecks <= readyUntil ? true : "no-model"),
    busy: () => busyLeft > 0,
    stopped: () => stop,
    waitForModel: async () => {
      log.push("wait");
      busyLeft -= 1;
    },
    sortOne: async (id) => {
      log.push(`sort ${id}`);
      const answer = answers[id];
      if (answer instanceof Error) throw answer;
      if (typeof answer === "function") return answer();
      return { kind: "sorted" };
    },
    progress: (state) => progress.push(state),
  };
  return { deps, log, progress, stopNow: () => (stop = true) };
}

test("the background run sorts one conversation at a time and says how far it is", async () => {
  const { deps, log, progress } = harness();
  const result = await sort.runGroupSortBackfill(deps);
  assert.deepEqual(result, { state: "done", done: 3, total: 3 });
  assert.deepEqual(log, ["sort 1", "sort 2", "sort 3"]);
  assert.deepEqual(progress, [
    { state: "running", current: 1, total: 3 },
    { state: "running", current: 2, total: 3 },
    { state: "running", current: 3, total: 3 },
    { state: "done", done: 3, total: 3 },
  ]);
  const t = (key, options) => `${key} ${options.current}/${options.total}`;
  assert.equal(sort.sortProgressLabel(progress[1], t), "oats.groups.sorting 2/3");
  assert.equal(sort.sortProgressLabel(progress[3], t), null);
});

test("it waits while a recording or a summary needs the model", async () => {
  const { deps, log } = harness({ ids: [7], busyFor: 2 });
  await sort.runGroupSortBackfill(deps);
  assert.deepEqual(log, ["wait", "wait", "sort 7"]);
});

test("it stops when the model goes away, and on the first failure", async () => {
  const gone = harness({ readyUntil: 1 });
  assert.deepEqual(await sort.runGroupSortBackfill(gone.deps), {
    state: "stopped",
    reason: "no-model",
    done: 1,
    total: 3,
  });
  assert.deepEqual(gone.log, ["sort 1"]);

  const failing = harness({ answers: { 2: new Error("server down") } });
  assert.deepEqual(await sort.runGroupSortBackfill(failing.deps), {
    state: "stopped",
    reason: "model-failed",
    done: 1,
    total: 3,
  });
  assert.deepEqual(failing.log, ["sort 1", "sort 2"], "it does not try the rest");
  assert.equal(failing.progress.at(-1).state, "stopped");
});

test("it stops before the next conversation when the app quits", async () => {
  const run = harness();
  run.deps.sortOne = async (id) => {
    run.log.push(`sort ${id}`);
    if (id === 1) run.stopNow();
    return { kind: "sorted" };
  };
  assert.deepEqual(await sort.runGroupSortBackfill(run.deps), {
    state: "stopped",
    reason: "stopped",
    done: 1,
    total: 3,
  });
  assert.deepEqual(run.log, ["sort 1"]);
});

test("a conversation it gave way on is tried again, not counted", async () => {
  let first = true;
  const run = harness({
    ids: [4, 5],
    answers: {
      4: () => {
        if (!first) return { kind: "sorted" };
        first = false;
        return { kind: "skipped", reason: "yielded" };
      },
    },
  });
  const result = await sort.runGroupSortBackfill(run.deps);
  assert.deepEqual(run.log, ["sort 4", "sort 4", "sort 5"]);
  assert.deepEqual(result, { state: "done", done: 2, total: 2 });
});

test("nothing to sort is done at once", async () => {
  const run = harness({ ids: [] });
  assert.deepEqual(await sort.runGroupSortBackfill(run.deps), { state: "done", done: 0, total: 0 });
  assert.deepEqual(run.log, []);
});
