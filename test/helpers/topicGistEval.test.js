const test = require("node:test");
const assert = require("node:assert/strict");

// The request and the answer check of scripts/topic-gist-eval.mjs.

let buildGistPrompt;
let parseTopicGist;

test.before(async () => {
  ({ buildGistPrompt, parseTopicGist } = await import("../../scripts/lib/topic-gist.mjs"));
});

test("a gist's answer is one clean paragraph", () => {
  assert.equal(
    parseTopicGist('  "They chose the\nsmaller battery."  '),
    "They chose the smaller battery."
  );
  assert.equal(parseTopicGist("Gist: They chose it."), "They chose it.");
  assert.equal(parseTopicGist("<think>hm</think>They chose it."), "They chose it.");
  assert.equal(parseTopicGist("   "), null);
  const long = parseTopicGist(Array.from({ length: 80 }, () => "word").join(" "));
  assert.equal(long.split(" ").length, 60);
  assert.ok(long.endsWith("…"));
});

test("the request carries the topic's turns within the budget", () => {
  const turns = Array.from(
    { length: 200 },
    (_, index) => `turn number ${index} with some words in it`
  );
  const prompt = buildGistPrompt({ turns, budget: 500 });
  assert.ok(prompt.text.length <= 600);
  assert.ok(prompt.excerpt.length < turns.length);
  assert.match(prompt.system, /gist/);
  assert.notEqual(buildGistPrompt({ turns, variant: "v3" }).system, prompt.system);
});
