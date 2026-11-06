const test = require("node:test");
const assert = require("node:assert/strict");

// A summary in parts (scripts/lib/summary-parts.mjs, the eval's variants): how a transcript is cut,
// the check on each item, and the run with a fake model.

let parts;

test.before(async () => {
  parts = await import("../../scripts/lib/summary-parts.mjs");
});

const sentences = (count, prefix = "word") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i} says something plain here.`).join("\n\n");

test("a short transcript is one part", () => {
  assert.deepEqual(parts.splitTranscript("one\n\ntwo"), ["one\n\ntwo"]);
  assert.deepEqual(parts.splitTranscript("   "), []);
});

test("a long transcript is cut at its segments, within the limit, with an overlap", () => {
  const text = sentences(2000);
  const cut = parts.splitTranscript(text, { partChars: 2000, overlapChars: 100 });
  assert.ok(cut.length > 3);
  for (const part of cut) assert.ok(part.length <= 2000);
  // No segment is lost, and each part starts inside the one before it.
  for (const segment of text.split("\n\n")) {
    assert.ok(cut.some((part) => part.includes(segment)));
  }
  for (let i = 1; i < cut.length; i += 1) {
    const first = cut[i].split("\n\n")[0];
    assert.ok(cut[i - 1].includes(first), `part ${i} starts in the part before it`);
  }
});

test("a segment longer than a part is cut at a space", () => {
  const text = Array.from({ length: 900 }, (_, i) => `w${i}`).join(" ");
  const cut = parts.splitTranscript(text, { partChars: 1000, overlapChars: 0 });
  assert.ok(cut.length > 1);
  for (const part of cut) assert.ok(part.length <= 1000);
  assert.equal(cut.join(" ").split(" ").length, 900);
});

test("the cut always moves forward, however large the overlap", () => {
  const text = sentences(50);
  const cut = parts.splitTranscript(text, { partChars: 200, overlapChars: 10_000 });
  assert.ok(cut.length < 60);
});

test("words are compared without case, punctuation or filler sounds", () => {
  assert.deepEqual(parts.wordsOf("Um, we'll GO with -- uh -- the yellow one."), [
    "we'll",
    "go",
    "with",
    "the",
    "yellow",
    "one",
  ]);
  assert.deepEqual(parts.wordsOf("the ‘rubber’ case"), ["the", "rubber", "case"]);
});

test("a quote is found word for word, or with a small repair", () => {
  const words = parts.wordsOf("So we said, um, we'll go with the the yellow case and rubber buttons, okay?");
  assert.deepEqual(parts.findQuote("we'll go with the the yellow case", words), { at: 3, exact: true });
  // A repeated word left out still counts, unless no repair is allowed.
  assert.equal(parts.findQuote("we'll go with the yellow case and rubber", words)?.exact, false);
  assert.equal(
    parts.findQuote("we'll go with the yellow case and rubber", words, { tolerance: 0 }),
    null
  );
});

test("a quote that is not in the transcript, or too short, is no evidence", () => {
  const words = parts.wordsOf("We talked about the budget for an hour and nobody agreed on it.");
  assert.equal(parts.findQuote("schedule a follow-up meeting next week", words), null);
  assert.equal(parts.findQuote("the budget", words), null);
  assert.equal(parts.findQuote("", words), null);
});

test("numbers are read from digits and from speech", () => {
  const found = parts.numbersIn("twenty five Euro, 12.5 percent, 1,200 units, two hundred and fifty");
  for (const value of ["25", "12.5", "1200", "250"]) assert.ok(found.has(value), value);
  assert.ok(parts.numbersIn("twelve point five").has("12.5"));
  assert.ok(parts.numbersIn("two thousand").has("2000"));
  assert.ok(parts.numbersIn("two five").has("25"));
  assert.ok(parts.numbersIn("twelve fifty Euros").has("12.5"));
  assert.ok(!parts.numbersIn("twelve fifty Euros").has("1250"));
  assert.ok(parts.numbersIn("nineteen ninety").has("1990"));
});

test("an item with an invented quote or a new number is dropped", () => {
  const part = "We agreed the price stays at twenty five Euro.\n\nSomebody asked about the colour.";
  const raw = JSON.stringify({
    decisions: [
      { text: "The price stays at 25 Euro.", quote: "the price stays at twenty five Euro" },
      { text: "The price stays at 30 Euro.", quote: "the price stays at twenty five Euro" },
      { text: "A follow-up is set.", quote: "we will schedule a follow-up meeting" },
    ],
    actions: [],
    problems: [{ text: "The colour is open.", quote: "Somebody asked about the colour" }],
    points: [],
  });
  const { items, dropped, parsed } = parts.checkedItems(raw, part);
  assert.equal(parsed, true);
  assert.deepEqual(
    items.map((item) => item.text),
    ["The price stays at 25 Euro.", "The colour is open."]
  );
  assert.deepEqual(
    dropped.map((item) => item.why),
    ["number", "quote"]
  );
});

test("an answer cut at the output limit keeps the items that are whole", () => {
  const part = "We agreed the price stays at twenty five Euro and nothing else changes.";
  const raw =
    '{"decisions":[{"text":"The price stays.","quote":"the price stays at twenty five Euro"},{"text":"Noth';
  const { items, parsed } = parts.checkedItems(raw, part);
  assert.equal(parsed, true);
  assert.deepEqual(
    items.map((item) => item.text),
    ["The price stays."]
  );
});

test("an answer that is not JSON gives no items and says so", () => {
  assert.deepEqual(parts.checkedItems("Sorry, I cannot.", "text"), {
    items: [],
    dropped: [],
    parsed: false,
  });
});

test("items said twice are merged, and a decision outranks a plain point", () => {
  const merged = parts.mergeItems([
    { kind: "points", text: "The case will be yellow rubber.", quote: "a b c", position: 1 },
    { kind: "decisions", text: "The case will be yellow rubber.", quote: "d e f", position: 50 },
    { kind: "actions", text: "Mail the minutes to everyone.", quote: "g h i", position: 5 },
  ]);
  assert.deepEqual(
    merged.map((item) => item.kind),
    ["decisions", "actions"]
  );
});

test("the run reads each part, then writes from what survives", async () => {
  const transcript = `${sentences(30, "first")}\n\nWe will use a yellow case.\n\n${sentences(30, "second")}`;
  const calls = [];
  const chat = async (request) => {
    calls.push(request);
    if (request.step.startsWith("extract")) {
      return {
        text: JSON.stringify({
          decisions: request.user.includes("yellow case")
            ? [{ text: "The case is yellow.", quote: "We will use a yellow case" }]
            : [],
          actions: [{ text: "Invented.", quote: "this quote was never said aloud" }],
          problems: [],
          points: [],
        }),
      };
    }
    return { text: "The notes." };
  };
  const result = await parts.summarizeInParts({
    transcript,
    chat,
    options: { partChars: 900, overlapChars: 50 },
  });
  assert.equal(result.text, "The notes.");
  assert.ok(result.parts >= 2);
  assert.deepEqual(
    result.items.map((item) => item.text),
    ["The case is yellow."]
  );
  assert.equal(calls.at(-1).step, "write");
  assert.ok(calls.at(-1).user.includes("The case is yellow."));
  assert.ok(!calls.at(-1).user.includes("Invented."));
});

test("a cut answer from the writer fails the run, and nothing is saved", async () => {
  const chat = async (request) =>
    request.step === "write"
      ? { text: "half a sen", stop: "length" }
      : {
          text: JSON.stringify({
            decisions: [{ text: "Keep it.", quote: "we should keep it as it is" }],
            actions: [],
            problems: [],
            points: [],
          }),
        };
  await assert.rejects(
    parts.summarizeInParts({ transcript: "we should keep it as it is", chat }),
    /output limit/
  );
});

test("the code can render the items without a second request", async () => {
  const chat = async () => ({
    text: JSON.stringify({
      decisions: [{ text: "Keep it.", quote: "we should keep it as it is" }],
      actions: [{ text: "Send the file.", quote: "I will send the file" }],
      problems: [],
      points: [],
    }),
  });
  const result = await parts.summarizeInParts({
    transcript: "we should keep it as it is and I will send the file",
    chat,
    options: { writer: "code" },
  });
  assert.match(result.text, /## Decisions Made\n- Keep it\./);
  assert.match(result.text, /## Action Items\n- \[ \] Send the file\./);
});
