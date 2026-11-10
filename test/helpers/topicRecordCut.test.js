const test = require("node:test");
const assert = require("node:assert/strict");

let cutRecord;
let recordLines;
let smoothRuns;
let readSegments;

test.before(async () => {
  ({ cutRecord, recordLines, smoothRuns, readSegments } =
    await import("../../src/helpers/topicRecordCut.mjs"));
});

// Turns of 14 words, so each numbered line is one turn: line n is utterance n-1.
function said(subject, count) {
  return Array.from(
    { length: count },
    (_, index) =>
      `${subject} item ${index}, we talk about the ${subject} plan and what it needs next.`
  );
}

function utterancesOf(lines) {
  return lines.map((text, index) => ({ id: `u${index}`, text, at: index * 6000 }));
}

// A model that knows a line's subject from its first word. `late` puts each
// cut that many lines after the change; `extra` adds a cut at that line. As a
// checker it calls a cut new when the subject changes within 3 lines of it.
function subjectModel({ late = 0, extra = null, fail = () => false } = {}) {
  const keys = new Map();
  const requests = [];
  const keyOf = (subject) => {
    if (!keys.has(subject)) keys.set(subject, `T${keys.size + 1}`);
    return keys.get(subject);
  };
  const ask = async (request) => {
    requests.push(request);
    if (fail(request, requests.length)) return { ok: false };
    const lines = [...request.user.matchAll(/^(\d+)\. (\S+)/gm)].map((match) => match[2]);
    const changes = lines.flatMap((subject, index) =>
      index && subject !== lines[index - 1] ? [index] : []
    );
    if (request.kind === "verify") {
      const proposed = Number(/start at line (\d+)/.exec(request.user)[1]) - 1;
      const near = changes.find((index) => Math.abs(index - proposed) <= 3);
      return near === undefined
        ? { ok: true, json: { decision: "same", first: proposed + 1 } }
        : { ok: true, json: { decision: "new", first: near + 1 } };
    }
    const segments = [{ from: 1, topic: keyOf(lines[0]) }];
    for (const index of changes)
      segments.push({ from: index + 1 + late, topic: keyOf(lines[index]) });
    if (extra) segments.push({ from: extra, topic: "T9" });
    const topics = [...new Set(segments.map((segment) => segment.topic))].map((key) => ({
      key,
      name: `${[...keys].find(([, value]) => value === key)?.[0] ?? "aside"} plan`,
      gist: "what the plan needs",
    }));
    return { ok: true, json: { segments, topics } };
  };
  return { ask, requests };
}

// ------------------------------------------------------------------ cuts

test("topics start at the turns where the model says the subject changes", async () => {
  const model = subjectModel();
  const result = await cutRecord({
    ask: model.ask,
    utterances: utterancesOf([...said("pricing", 10), ...said("hiring", 10), ...said("demo", 10)]),
  });
  assert.deepEqual(result.starts, ["u10", "u20"]);
  assert.equal(result.labels.length, 30);
  assert.deepEqual(
    [...result.topics.values()].map((topic) => topic.name),
    ["pricing plan", "hiring plan", "demo plan"]
  );
  assert.deepEqual(result.calls, [{ kind: "record", ok: true, usable: true }]);
  assert.match(model.requests[0].user, /^LINES \(3 min of conversation\):$/m);
});

test("a return to an earlier subject keeps that topic's key", async () => {
  const model = subjectModel();
  const result = await cutRecord({
    ask: model.ask,
    utterances: utterancesOf([...said("pricing", 8), ...said("hiring", 8), ...said("pricing", 8)]),
  });
  assert.deepEqual(result.starts, ["u8", "u16"]);
  assert.equal(result.labels[20], result.labels[0]);
  assert.equal(result.topics.size, 2);
});

test("a topic of fewer than minRunWords words joins the one around it", async () => {
  const utterances = utterancesOf([
    ...said("pricing", 10),
    ...said("coffee", 2),
    ...said("pricing", 10),
  ]);
  const smoothed = await cutRecord({ ask: subjectModel().ask, utterances });
  assert.deepEqual(smoothed.starts, []);
  const raw = await cutRecord({ ask: subjectModel().ask, utterances, minRunWords: 0 });
  assert.deepEqual(raw.starts, ["u10", "u12"]);
});

test("a turn with no words does not start a topic", async () => {
  const utterances = utterancesOf([...said("pricing", 10), "  ", ...said("hiring", 10)]);
  const result = await cutRecord({ ask: subjectModel().ask, utterances });
  assert.deepEqual(result.starts, ["u11"]);
  assert.equal(result.labels.length, 20);
});

// ------------------------------------------------------------------ chunks

test("a long conversation goes in chunks, each told the topics found before", async () => {
  const model = subjectModel();
  const result = await cutRecord({
    ask: model.ask,
    utterances: utterancesOf([...said("pricing", 10), ...said("hiring", 10), ...said("demo", 10)]),
    chunkWords: 200,
  });
  assert.equal(model.requests.length, 3);
  assert.doesNotMatch(model.requests[0].user, /TOPICS FOUND BEFORE/);
  assert.match(model.requests[1].user, /^T2 \| hiring plan \| what the plan needs$/m);
  assert.deepEqual(result.starts, ["u10", "u20"]);
});

test("a chunk with no answer stays in the topic before it", async () => {
  const model = subjectModel({ fail: (_, count) => count === 2 });
  const result = await cutRecord({
    ask: model.ask,
    utterances: utterancesOf([...said("pricing", 10), ...said("hiring", 10), ...said("demo", 14)]),
    chunkWords: 200,
  });
  assert.deepEqual(result.starts, ["u10", "u28"]);
  assert.deepEqual(
    result.calls.map((call) => call.usable),
    [true, false, true]
  );
});

test("no usable answer gives null, so the caller keeps the cuts it had", async () => {
  const utterances = utterancesOf(said("pricing", 4));
  assert.equal(await cutRecord({ ask: async () => ({ ok: false }), utterances }), null);
  assert.equal(await cutRecord({ ask: async () => null, utterances }), null);
  assert.equal(
    await cutRecord({
      ask: async () => {
        throw new Error("model gone");
      },
      utterances,
    }),
    null
  );
  assert.equal(
    await cutRecord({ ask: async () => ({ ok: true, json: { segments: [] } }), utterances }),
    null
  );
  let asked = false;
  const none = await cutRecord({
    ask: async () => {
      asked = true;
      return null;
    },
    utterances: [{ id: "u0", text: "" }],
  });
  assert.equal(none, null);
  assert.equal(asked, false, "nothing to cut, nothing asked");
});

// ------------------------------------------------------------------ checks

test("the check removes a cut on the same subject and moves a late one", async () => {
  const utterances = utterancesOf([
    ...said("pricing", 10),
    ...said("hiring", 10),
    ...said("demo", 10),
  ]);
  const plain = await cutRecord({ ask: subjectModel({ late: 2, extra: 6 }).ask, utterances });
  assert.deepEqual(plain.starts, ["u5", "u12", "u22"]);
  const checked = await cutRecord({
    ask: subjectModel({ late: 2, extra: 6 }).ask,
    utterances,
    verify: true,
  });
  assert.deepEqual(checked.starts, ["u10", "u20"]);
  assert.deepEqual(
    checked.calls.map((call) => call.kind),
    ["record", "verify", "verify", "verify"]
  );
});

test("the checks stop at the deadline and the cuts not checked stay", async () => {
  const utterances = utterancesOf([
    ...said("pricing", 10),
    ...said("hiring", 10),
    ...said("demo", 10),
  ]);
  const result = await cutRecord({
    ask: subjectModel({ late: 2, extra: 6 }).ask,
    utterances,
    verify: true,
    now: () => 100,
    deadline: 50,
  });
  assert.deepEqual(result.starts, ["u5", "u12", "u22"]);
  assert.equal(result.calls.length, 1);
});

// ------------------------------------------------------------------ parts

test("short turns are joined into numbered lines of at least 14 words", () => {
  const five = { text: "one two three four five" };
  const lines = recordLines(Array.from({ length: 6 }, (_, index) => ({ ...five, id: index })));
  assert.deepEqual(
    lines.map((line) => line.ids),
    [
      ["0", "1", "2"],
      ["3", "4", "5"],
    ]
  );
  const long = recordLines([
    { id: "a", text: said("x", 1)[0].split(" ").slice(0, 10).join(" ") },
    { id: "b", text: Array.from({ length: 40 }, () => "word").join(" ") },
  ]);
  assert.equal(long.length, 2, "a line holds at most 45 words");
});

test("a short run joins the run before it, or after it when it is first", () => {
  assert.deepEqual(smoothRuns(["A", "A", "B", "A", "A"], [50, 50, 10, 50, 50], 60), [
    "A",
    "A",
    "A",
    "A",
    "A",
  ]);
  assert.deepEqual(smoothRuns(["B", "A", "A"], [10, 50, 50], 60), ["A", "A", "A"]);
  assert.deepEqual(smoothRuns(["B", "A", "A"], [10, 50, 50], 60, { before: "C" }), ["C", "A", "A"]);
  assert.deepEqual(smoothRuns(["A", "A", "B"], [50, 50, 10], 60, { keepLast: true }), [
    "A",
    "A",
    "B",
  ]);
});

test("segments are checked: in range, with a topic, sorted, the first at line 1", () => {
  const json = {
    segments: [
      { from: 5, topic: "T2" },
      { from: 0, topic: "T0" },
      { from: 2, topic: " T1 " },
      { from: 99, topic: "T3" },
      { from: 3, topic: "" },
      { from: "4", topic: "T4" },
    ],
  };
  assert.deepEqual(readSegments(json, 10), [
    { from: 1, topic: "T1" },
    { from: 4, topic: "T4" },
    { from: 5, topic: "T2" },
  ]);
  assert.equal(readSegments({}, 10), null);
  assert.equal(readSegments({ segments: [{ from: 0, topic: "T1" }] }, 10), null);
});
