import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  bootstrap,
  difference,
  goldQuestions,
  overlap,
  prf,
  quoteSpan,
  reachedRecognition,
  recognizedTurns,
  roomTurns,
  scoreCards,
  spoken,
  summarize,
  turnTokens,
} from "../../scripts/lib/question-truth.mjs";

const word = (index, text, start, end, act = null, punct = "", speaker = "A") => ({
  index,
  text,
  start,
  end,
  act,
  punct,
  speaker,
});

describe("scoreCards", () => {
  const question = (id, words, end = 10) => ({ id, words, end });

  test("a card that holds the whole question is right and catches it", () => {
    const score = scoreCards([{ at: 11000, words: [1, 2, 3] }], [question("q", [1, 2, 3])]);
    assert.equal(score.right, 1);
    assert.equal(score.caught, 1);
    assert.deepEqual(score.delays, [1000]);
    assert.equal(score.quote[0].f1, 1);
    assert.equal(score.quote[0].whole, true);
  });

  test("a long quote that holds a short question still counts, and does not read whole", () => {
    const words = Array.from({ length: 20 }, (_, index) => index);
    const score = scoreCards([{ at: 0, words }], [question("q", [4, 5, 6])]);
    assert.equal(score.right, 1);
    assert.equal(score.quote[0].whole, false);
  });

  test("half of a question split over two turns counts", () => {
    const score = scoreCards([{ at: 0, words: [5, 6] }], [question("q", [1, 2, 3, 4, 5, 6])]);
    assert.equal(score.right, 1);
    assert.equal(score.caught, 1);
  });

  test("touching a question with under half of the shorter side is not a hit", () => {
    const score = scoreCards([{ at: 0, words: [1, 8, 9, 10] }], [question("q", [1, 2, 3, 4])]);
    assert.equal(score.right, 0);
    assert.equal(score.caught, 0);
  });

  test("a card with no question is wrong, and a question with no card is missed", () => {
    const score = scoreCards([{ at: 0, words: [9] }], [question("q", [1])]);
    assert.equal(score.cards, 1);
    assert.equal(score.right, 0);
    assert.equal(score.gold, 1);
    assert.equal(score.caught, 0);
    assert.deepEqual(score.verdicts, [null]);
  });

  test("the delay is from the end of the question to its first card", () => {
    const score = scoreCards(
      [
        { at: 30000, words: [1] },
        { at: 12000, words: [2] },
      ],
      [question("q", [1, 2], 10)]
    );
    assert.deepEqual(score.delays, [2000]);
    assert.equal(score.right, 2);
    assert.equal(score.caught, 1);
  });

  test("one card over two questions catches both", () => {
    const score = scoreCards(
      [{ at: 0, words: [1, 2, 3, 4] }],
      [question("a", [1, 2]), question("b", [3, 4])]
    );
    assert.equal(score.right, 1);
    assert.equal(score.caught, 2);
  });
});

describe("prf and the bootstrap", () => {
  test("P, R and F1 come from pooled counts", () => {
    const { precision, recall, f1 } = prf({ cards: 4, right: 2, gold: 8, caught: 2 });
    assert.equal(precision, 0.5);
    assert.equal(recall, 0.25);
    assert.ok(Math.abs(f1 - 1 / 3) < 1e-12);
  });

  test("no cards and no gold are zeros, not NaN", () => {
    assert.deepEqual(prf({ cards: 0, right: 0, gold: 0, caught: 0 }), {
      precision: 0,
      recall: 0,
      f1: 0,
    });
  });

  test("the interval repeats from its seed and holds the point", () => {
    const rows = [
      { cards: 10, right: 5, gold: 10, caught: 5 },
      { cards: 20, right: 15, gold: 20, caught: 12 },
      { cards: 5, right: 1, gold: 8, caught: 2 },
      { cards: 30, right: 20, gold: 25, caught: 20 },
    ];
    const one = summarize(rows, { samples: 300, seed: 5 });
    const two = summarize(rows, { samples: 300, seed: 5 });
    assert.deepEqual(one, two);
    assert.ok(one.f1CI[0] <= one.f1 && one.f1 <= one.f1CI[1]);
  });

  test("a method against itself differs by exactly zero in every resample", () => {
    const rows = [
      { cards: 10, right: 5, gold: 10, caught: 5 },
      { cards: 20, right: 15, gold: 20, caught: 12 },
    ];
    assert.deepEqual(difference(rows, rows, "f1", { samples: 100 }), { value: 0, ci: [0, 0] });
  });

  test("resampling is by meeting: a statistic sees whole rows", () => {
    const [low, high] = bootstrap([[1, 2, 3]], (rows) => rows.length, { samples: 20 });
    assert.equal(low, 3);
    assert.equal(high, 3);
  });
});

describe("the gold questions", () => {
  const act = (id, type, words, speaker = "A") => ({
    id,
    speaker,
    type,
    words,
    start: words[0]?.start ?? null,
    end: words.at(-1)?.end ?? null,
    text: words.map((item) => item.text).join(" "),
    asked: false,
  });
  const meetingOf = (acts, pairs = []) => ({
    acts: new Map(acts.map((item) => [item.id, item])),
    pairs,
  });

  test("strict keeps three real words of el.inf, el.sug and el.ass, broad keeps any elicit act", () => {
    const three = [word(0, "um", 0, 1), word(1, "is", 1, 2), word(2, "it", 2, 3), word(3, "red", 3, 4)];
    const meeting = meetingOf([
      act("a", "el.inf", three),
      act("b", "el.ass", [word(4, "right", 5, 6)]),
      act("c", "el.und", [word(5, "you", 7, 8), word(6, "see", 8, 9), word(7, "that", 9, 9.5)]),
      act("d", "inf", [word(8, "a", 10, 11)]),
    ]);
    assert.deepEqual(
      goldQuestions(meeting, "strict").map((item) => item.id),
      ["a"]
    );
    assert.deepEqual(
      goldQuestions(meeting, "broad").map((item) => item.id),
      ["a", "b", "c"]
    );
  });

  test("two filler words and a real one are not three", () => {
    const meeting = meetingOf([
      act("a", "el.inf", [word(0, "uh", 0, 1), word(1, "um", 1, 2), word(2, "what", 2, 3)]),
    ]);
    assert.deepEqual(goldQuestions(meeting, "strict"), []);
  });

  test("the reply is read from the pair types", () => {
    const words = (from) => [
      word(from, "is", from, from + 0.1),
      word(from + 1, "it", from + 0.1, from + 0.2),
      word(from + 2, "red", from + 0.2, from + 0.3),
    ];
    const meeting = meetingOf(
      [
        act("a", "el.inf", words(0)),
        act("b", "el.inf", words(10)),
        act("c", "el.inf", words(20)),
        act("d", "el.inf", words(30)),
        act("reply", "inf", words(40), "B"),
      ],
      [
        { source: "a", target: "reply", type: "POS" },
        { source: "b", target: "reply", type: "UNC" },
        { source: "d", target: "reply", type: "UNC" },
        { source: "d", target: "reply", type: "NEG" },
      ]
    );
    assert.deepEqual(
      goldQuestions(meeting).map((item) => item.reply),
      ["answered", "unknown", "open", "answered"]
    );
  });
});

describe("turns and views", () => {
  const meeting = {
    id: "M",
    words: [
      word(0, "Is", 0, 0.2),
      word(1, "the", 0.2, 0.3),
      word(2, "L_C_D_", 0.3, 0.5, null, "?"),
      word(3, "Yes", 2, 2.2, null, ","),
      word(4, "I", 2.2, 2.3),
      word(5, "think", 2.3, 2.5, null, "."),
    ],
  };

  test("a turn ends at a pause of 400 ms and arrives half a second after its last word", () => {
    const turns = roomTurns(meeting);
    assert.equal(turns.length, 2);
    assert.equal(turns[0].words.length, 3);
    assert.equal(turns[0].at, 1000);
  });

  test("a turn is cut at 20 seconds with no pause", () => {
    const words = Array.from({ length: 50 }, (_, index) =>
      word(index, "a", index * 0.5, index * 0.5 + 0.5)
    );
    const turns = roomTurns({ id: "M", words });
    assert.ok(turns.length >= 2);
    assert.ok(turns.every((turn) => turn.end - turn.start <= 20));
  });

  test("the manual view keeps punctuation, the plain view has none", () => {
    const [first, second] = roomTurns(meeting);
    const text = (turn, view) =>
      turnTokens(turn, view)
        .map((token) => token.text)
        .join(" ");
    assert.equal(text(first, "manual"), "Is the LCD?");
    assert.equal(text(first, "plain"), "Is the LCD");
    assert.equal(text(second, "manual"), "Yes, I think.");
    assert.equal(text(second, "plain"), "Yes I think");
  });

  test("spelled-out letters read as recognition writes them", () => {
    assert.equal(spoken("L_C_D_"), "LCD");
    assert.equal(spoken("T_V_s"), "TVs");
  });

  test("a quote maps back to its tokens, the last match when it repeats", () => {
    const tokens = "what is it ok what is it".split(" ").map((text, word) => ({ text, word }));
    assert.deepEqual(quoteSpan(tokens, "what is it"), [4, 7]);
    assert.equal(quoteSpan(tokens, "not there"), null);
    assert.equal(quoteSpan(tokens, ""), null);
  });

  test("overlap is shared words over the shorter side", () => {
    assert.deepEqual(overlap([1, 2], [2, 3, 4, 5]), { shared: 1, value: 0.5 });
  });
});

describe("recognition against the manual words", () => {
  const meeting = {
    id: "M",
    words: [
      word(0, "Um", 10, 10.2),
      word(1, "is", 10.2, 10.4),
      word(2, "the", 10.4, 10.5),
      word(3, "L_C_D_", 10.5, 11),
      word(4, "too", 11, 11.2),
      word(5, "big", 11.2, 11.5, null, "?"),
      word(6, "Yes", 12, 12.2),
    ],
  };

  test("a token names its manual word, and a wrong word names none", () => {
    const [turn] = recognizedTurns(meeting, [
      { start: 10, end: 11.6, text: "Is the LCD too bad?", ms: 200 },
    ]);
    assert.deepEqual(
      turn.tokens.map((token) => token.word),
      [1, 2, 3, 4, null]
    );
  });

  test("a card appears when the segment closes and Whisper is done", () => {
    const [turn] = recognizedTurns(meeting, [{ start: 10, end: 11.6, text: "Yes.", ms: 200 }]);
    assert.equal(turn.at, 11600 + 300 + 200);
  });

  test("a segment with no text is no turn", () => {
    assert.deepEqual(recognizedTurns(meeting, [{ start: 0, end: 1, text: " ", ms: 9 }]), []);
  });

  test("a question is reached when over half of its real words were heard", () => {
    const question = { words: [0, 1, 2, 3] };
    assert.equal(reachedRecognition(question, meeting, new Set([1])), false);
    assert.equal(reachedRecognition(question, meeting, new Set([1, 2])), true);
    assert.equal(reachedRecognition({ words: [0] }, meeting, new Set()), false);
  });
});
