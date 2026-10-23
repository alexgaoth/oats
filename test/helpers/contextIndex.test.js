const test = require("node:test");
const assert = require("node:assert/strict");

let ctx;

test.before(async () => {
  ctx = await import("../../src/helpers/contextIndex.mjs");
});

const plan = `# Pellwood launch

Owner: Dana. Status: on track.

## Dates

Pellwood goes live on October 30, after the second load test.
The billing cutover follows a week later.

## Risks

The ledger export still times out on large tenants.`;

const standup = `# Standup

We moved the launch review to Thursday at ten. Hiring: two offers out.`;

function indexOf(docs) {
  const index = ctx.createContextIndex();
  for (const [docId, text] of Object.entries(docs)) {
    index.setDoc(docId, ctx.chunkDocument(text, { docId, title: docId }));
  }
  return index;
}

test("words that carry a subject, lower case, without stopwords", () => {
  assert.deepEqual(ctx.tokenize("When does Pellwood go live?"), ["pellwo", "go", "live"]);
  assert.deepEqual(ctx.tokenize("Dana's plan, Q4 2026"), ["dana", "plan", "q4", "2026"]);
  assert.deepEqual(ctx.tokenize("the 30th"), ["30th"]);
});

test("forms of one word meet at one stem, and a hyphenated word is its parts", () => {
  const stems = (text) => ctx.tokenize(text);
  assert.deepEqual(stems("migrate migrated migrating migration migrations"), [
    "migrat",
    "migrat",
    "migrat",
    "migrat",
    "migrat",
  ]);
  assert.deepEqual(stems("accounts account batches dates"), ["accoun", "accoun", "batch", "date"]);
  assert.deepEqual(stems("production-sized data"), ["produc", "sized", "data"]);
  // Words that only look plural keep their s.
  assert.deepEqual(stems("status analysis"), ["status", "analys"]);
});

test("Chinese and Japanese runs become overlapping pairs", () => {
  assert.deepEqual(ctx.tokenize("上线时间"), ["上线", "线时", "时间"]);
});

test("headings start and name passages", () => {
  const passages = ctx.chunkDocument(plan, { docId: "plan.md", title: "plan.md" });
  assert.deepEqual(
    passages.map((p) => p.heading),
    ["Pellwood launch", "Dates", "Risks"]
  );
  assert.match(passages[1].text, /^Pellwood goes live on October 30/);
  assert.equal(passages[1].id, "plan.md#1");
});

test("a long paragraph is cut at sentence ends", () => {
  const sentence = "The export retries each tenant three times before it gives up. ";
  const passages = ctx.chunkDocument(sentence.repeat(30), { docId: "d", title: "d" });
  assert.ok(passages.length > 1);
  for (const passage of passages) {
    assert.ok(passage.text.length <= ctx.PASSAGE_CHARS + sentence.length);
    assert.match(passage.text, /\.$/);
  }
});

test("a question finds the passage that answers it in other words", () => {
  const runbook =
    "## Timing\n\nThe last dry run took six hours end to end on production-sized data.";
  const index = indexOf({ "migration/runbook.md": runbook, "standup.md": standup });
  const [best] = index.search("How long does the full migration take on production?");
  assert.equal(best.passage.docId, "migration/runbook.md");
  assert.equal(ctx.isStrongMatch(best), true);
});

test("the passage that settles a question ranks first", () => {
  const index = indexOf({ "plan.md": plan, "standup.md": standup });
  const [best] = index.search("When does Pellwood go live?");
  assert.equal(best.passage.docId, "plan.md");
  assert.equal(best.passage.heading, "Dates");
  assert.equal(ctx.isStrongMatch(best), true);
});

test("a question about nothing written down is not a strong match", () => {
  const index = indexOf({ "plan.md": plan, "standup.md": standup });
  const results = index.search("How was your weekend?");
  assert.equal(results.length === 0 || !ctx.isStrongMatch(results[0]), true);
  const oneWord = index.search("Is the launch party catered with tacos?");
  assert.equal(ctx.isStrongMatch(oneWord[0]), false);
});

test("a changed file replaces its passages, and a removed file leaves none", () => {
  const index = indexOf({ "plan.md": plan, "standup.md": standup });
  index.setDoc(
    "plan.md",
    ctx.chunkDocument("# Pellwood\n\nPellwood goes live on November 6.", {
      docId: "plan.md",
      title: "plan.md",
    })
  );
  const [best] = index.search("When does Pellwood go live?");
  assert.match(best.passage.text, /November 6/);
  index.removeDoc("plan.md");
  assert.equal(index.documents, 1);
  assert.equal(index.search("Pellwood live").length, 0);
});

test("an empty query or index finds nothing", () => {
  assert.deepEqual(ctx.createContextIndex().search("Pellwood"), []);
  assert.deepEqual(indexOf({ "plan.md": plan }).search("the and of"), []);
});
