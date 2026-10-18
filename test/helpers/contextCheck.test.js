const test = require("node:test");
const assert = require("node:assert/strict");

let check;

test.before(async () => {
  check = await import("../../src/helpers/contextCheck.mjs");
});

const passages = [
  {
    label: "launch-plan.md",
    text: "Pellwood goes live on **October 30**, after the second load test.",
  },
  { label: "Standup, Tue", text: "We moved the launch review to Thursday at ten." },
];

const reply = (verdict, extra = {}) =>
  JSON.stringify({
    verdict,
    answer: "October 30",
    note: 1,
    quote: "goes live on October 30",
    ...extra,
  });

test("only replies somebody was not sure of are checked", () => {
  assert.equal(check.shouldCheck("uncertain"), true);
  assert.equal(check.shouldCheck("denied"), true);
  assert.equal(check.shouldCheck("answered"), false);
  assert.equal(check.shouldCheck("silence"), false);
  assert.equal(check.shouldCheck("asked"), false);
});

test("the prompt carries the question, the reply and numbered notes", () => {
  const prompt = check.buildCheckPrompt({
    question: "When does Pellwood go live?",
    reply: "I think the 23rd?",
    outcome: "uncertain",
    passages,
  });
  assert.match(prompt, /"When does Pellwood go live\?"/);
  assert.match(prompt, /"I think the 23rd\?"/);
  assert.match(prompt, /\[1\] launch-plan\.md: Pellwood goes live/);
  assert.match(prompt, /\[2\] Standup, Tue: We moved/);
});

test("a denial is described, not quoted, so the judge answers instead of grading", () => {
  const prompt = check.buildCheckPrompt({
    question: "When does Pellwood go live?",
    reply: "No idea.",
    outcome: "denied",
    passages,
  });
  assert.match(prompt, /Nobody in the room knew\./);
  assert.doesNotMatch(prompt, /No idea/);
});

test("the judge reads at most four passages, each clipped", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    label: `doc${i}`,
    text: "word ".repeat(400),
  }));
  const prompt = check.buildCheckPrompt({
    question: "q?",
    reply: "maybe",
    outcome: "uncertain",
    passages: many,
  });
  assert.match(prompt, /\[4\] doc3/);
  assert.doesNotMatch(prompt, /\[5\]/);
  const line = prompt.split("\n").find((l) => l.startsWith("[1]"));
  assert.ok(line.length < check.MAX_PASSAGE_CHARS + 20);
});

test("a verdict with a quote from the cited note is kept", () => {
  const verdict = check.parseCheckVerdict(reply("wrong"), { passages, outcome: "uncertain" });
  assert.deepEqual(verdict, {
    verdict: "wrong",
    answer: "October 30",
    quote: "goes live on October 30",
    passage: 0,
  });
});

test("the quote matches across markdown, case and curly quotes", () => {
  assert.equal(check.quoteAppears("Goes live on October 30.", passages[0].text), true);
  assert.equal(check.quoteAppears("We’ve moved", "we've moved the review"), true);
});

test("a quote that is not in the notes means no card", () => {
  const madeUp = reply("wrong", { quote: "goes live on October 23" });
  assert.equal(check.parseCheckVerdict(madeUp, { passages, outcome: "uncertain" }), null);
});

test("a one-word quote proves nothing", () => {
  assert.equal(check.quoteAppears("Pellwood", passages[0].text), false);
});

test("a wrong note number is corrected by where the quote is", () => {
  const verdict = check.parseCheckVerdict(
    reply("right", { note: 2, quote: "launch review to Thursday" }),
    { passages, outcome: "uncertain" }
  );
  assert.equal(verdict.passage, 1);
  const shuffled = check.parseCheckVerdict(reply("right", { note: 2 }), {
    passages,
    outcome: "uncertain",
  });
  assert.equal(shuffled.passage, 0);
});

test("unclear, unknown verdicts and broken JSON show nothing", () => {
  assert.equal(check.parseCheckVerdict(reply("unclear"), { passages, outcome: "uncertain" }), null);
  assert.equal(check.parseCheckVerdict(reply("maybe"), { passages, outcome: "uncertain" }), null);
  assert.equal(
    check.parseCheckVerdict("{verdict: right", { passages, outcome: "uncertain" }),
    null
  );
  assert.equal(check.parseCheckVerdict("", { passages, outcome: "uncertain" }), null);
  assert.equal(check.parseCheckVerdict("[1,2]", { passages, outcome: "uncertain" }), null);
});

test("the JSON is found inside thinking and chatter", () => {
  const raw = `<think>the note says the 30th</think>Sure. ${reply("wrong")} Hope that helps.`;
  assert.equal(check.parseCheckVerdict(raw, { passages, outcome: "uncertain" }).verdict, "wrong");
});

test("after a denial every supported verdict is an answer", () => {
  for (const verdict of ["right", "wrong", "answer"]) {
    assert.equal(
      check.parseCheckVerdict(reply(verdict), { passages, outcome: "denied" }).verdict,
      "answer"
    );
  }
});

test("a missing answer falls back to the quote", () => {
  const verdict = check.parseCheckVerdict(reply("right", { answer: "" }), {
    passages,
    outcome: "uncertain",
  });
  assert.equal(verdict.answer, "goes live on October 30");
});
