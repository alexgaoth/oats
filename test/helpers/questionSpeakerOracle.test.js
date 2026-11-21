const assert = require("node:assert/strict");
const test = require("node:test");

let speakerVotes, overlappingWords, replaySpeakerReplies, assessResponseLocally;
test.before(async () => {
  ({ speakerVotes, overlappingWords, replaySpeakerReplies } =
    await import("../../scripts/lib/question-speaker-oracle.mjs"));
  ({ assessResponseLocally } = await import("../../src/helpers/conversationAide.mjs"));
});

test("oracle counts overlapping words without counting touching spans or breaking ties", () => {
  const words = [
    { speaker: "A", start: 0, end: 1 },
    { speaker: "B", start: 0.9, end: 1.2 },
    { speaker: "A", start: 1.2, end: 2 },
    { speaker: "B", start: 2, end: 3 },
    { speaker: "B", start: 3, end: 4 },
  ];
  assert.deepEqual(speakerVotes(overlappingWords(words, { start: 0, end: 2 })), {
    speaker: "A",
    mixed: true,
  });
  assert.deepEqual(speakerVotes(overlappingWords(words, { start: 1, end: 2 })), {
    speaker: null,
    mixed: true,
  });
  assert.deepEqual(speakerVotes(overlappingWords(words, { start: 4, end: 5 })), {
    speaker: null,
    mixed: false,
  });
});

const turn = (id, at, speaker, text, quote = null) => ({ id, at, speaker, text, quote });
const ask = (id, at, speaker) => turn(id, at, speaker, "What did you find?", "What did you find?");
const answer = (id, at, speaker) => turn(id, at, speaker, "We found the blue notebook.");
const replay = (turns, skipQuestions = false, isSpeaking = () => false) =>
  replaySpeakerReplies(turns, { skipQuestions, isSpeaking, assess: assessResponseLocally });

test("rules b and c skip the asker and differ on a question from another speaker", () => {
  const turns = [
    ask("first", 0, "A"),
    answer("same", 1000, "A"),
    ask("second", 2000, "B"),
    answer("unknown", 3000, null),
    answer("different", 4000, "C"),
  ];
  assert.equal(replay(turns).get("first").replyId, "second");
  const c = replay(turns, true);
  assert.deepEqual(c.get("first"), { state: "answered", verdictAt: 4000, replyId: "different" });
  assert.equal(c.get("second").replyId, "different");
});

test("the timer starts at eight seconds and holds at most thirty seconds", () => {
  const question = ask("q", 100, "A");
  assert.deepEqual(replay([question, answer("late", 8100, "B")]).get("q"), {
    state: "silence",
    verdictAt: 8100,
    replyId: null,
  });
  assert.equal(replay([question, answer("r", 29900, "B")], true, () => true).get("q").replyId, "r");
  assert.equal(replay([question], true, () => true).get("q").verdictAt, 30100);
});
