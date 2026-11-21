const assert = require("node:assert/strict");
const test = require("node:test");

let splitSentences;
let makeSentenceRecords;
let ConversationAideSession;

test.before(async () => {
  ({ splitSentences, makeSentenceRecords } = await import("../../src/helpers/sentenceSplit.mjs"));
  ({ ConversationAideSession } = await import("../../src/helpers/conversationAide.mjs"));
});

test("splitSentences preserves UTF-16 slices, closing marks, and the unpunctuated tail", () => {
  const text = "  🦉 said, “Yes!”\n次は何？当然。 no final mark  ";
  const result = splitSentences(text);
  assert.deepEqual(
    result.map(({ text: slice }) => slice),
    ["🦉 said, “Yes!”", "次は何？", "当然。", "no final mark"]
  );
  assert.equal(result[0].start, 2);
  assert.equal(result[0].end, text.indexOf("\n"));
  for (const part of result) assert.equal(text.slice(part.start, part.end), part.text);
  assert.deepEqual(splitSentences(" \n "), []);
  assert.deepEqual(
    splitSentences(" No end mark ").map(({ text: slice }) => slice),
    ["No end mark"]
  );
});

test("splitSentences keeps decimals, abbreviations and initials in all shipped scripts", () => {
  const examples = [
    ["Dr. A. Smith paid $3.14. Did he? Yes!", ["Dr. A. Smith paid $3.14.", "Did he?", "Yes!"]],
    ["Sr. López viene. ¿Y tú?", ["Sr. López viene.", "¿Y tú?"]],
    ["Mme. Curie arrive. Vraiment ?", ["Mme. Curie arrive.", "Vraiment ?"]],
    ["Das geht z. B. morgen. Oder heute?", ["Das geht z. B. morgen.", "Oder heute?"]],
    ["A Sra. Silva vem. Será?", ["A Sra. Silva vem.", "Será?"]],
    ["Il dott. Rossi arriva. Davvero?", ["Il dott. Rossi arriva.", "Davvero?"]],
    ["Это ул. Ленина. Далеко?", ["Это ул. Ленина.", "Далеко?"]],
    ["いいよ。次は？", ["いいよ。", "次は？"]],
    ["很好！下一步呢？", ["很好！", "下一步呢？"]],
    ["確定嗎？「確定。」", ["確定嗎？", "「確定。」"]],
  ];
  for (const [text, expected] of examples) {
    assert.deepEqual(
      splitSentences(text).map(({ text: slice }) => slice),
      expected
    );
  }
});

test("records keep distinct IDs, source, estimated times and independent checks", () => {
  const records = makeSentenceRecords({
    id: "part-7",
    text: "Yes. No?",
    source: "system",
    startMs: 1000,
    endMs: 1800,
  });
  assert.deepEqual(records, [
    {
      id: "part-7.1",
      segmentId: "part-7",
      start: 0,
      end: 4,
      text: "Yes.",
      source: "system",
      startMs: 1000,
      endMs: 1400,
      question: null,
      answered: null,
      topic: null,
      link: null,
    },
    {
      id: "part-7.2",
      segmentId: "part-7",
      start: 5,
      end: 8,
      text: "No?",
      source: "system",
      startMs: 1500,
      endMs: 1800,
      question: null,
      answered: null,
      topic: null,
      link: null,
    },
  ]);
  const untimed = makeSentenceRecords({ id: "part-8", text: "Yes.", source: "mic" }, 500)[0];
  assert.equal(untimed.startMs, 220);
  assert.equal(untimed.endMs, 500);
});

test("sentence records receive legacy checks without changing cards or transcript links", async () => {
  const cards = [];
  const events = [];
  const session = new ConversationAideSession({
    noteId: 1,
    onCard: (card) => cards.push(card),
    insertEvent: async (event) => events.push(event),
  });
  const question = { id: "q", text: "One more thing. What did you find?", source: "mic" };
  const reply = { id: "r", text: "We found the blue notebook.", source: "mic" };
  const records = makeSentenceRecords(question);
  session.onFinalizedSentences(question, records);
  assert.equal(cards.at(-1).id, "q");
  assert.equal(records[0].question, null);
  assert.deepEqual(records[1].question, { quote: "What did you find?" });
  session.onFinalized(reply);
  await session.evaluation;
  await session.shutdown();
  assert.equal(records[1].answered, "answered");
  assert.deepEqual(events[0].segmentIds, ["q"]);
  assert.equal(events[0].metadata.sentenceId, "q.2");
  assert.deepEqual(events[1].segmentIds, ["r"]);
});
