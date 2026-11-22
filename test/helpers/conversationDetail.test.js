const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let DEFAULT_CONVERSATION_DETAIL;
let resolveConversationDetail;
let selectCleanQuestions;

test.before(async () => {
  ({ DEFAULT_CONVERSATION_DETAIL, resolveConversationDetail, selectCleanQuestions } =
    await import("../../src/helpers/conversationDetail.mjs"));
});

test("Clean shows unresolved questions, then the three newest answers in asking order", () => {
  const cards = [
    { id: "a", state: "answered", track: true },
    { id: "b", state: "denied", track: true },
    { id: "c", state: "answered", track: true },
    { id: "d", state: "uncertain", track: true },
    { id: "e", state: "answered", track: true },
    { id: "f", state: "answered", track: true },
    { id: "g", state: "silence", track: true },
    { id: "h", state: "asked", track: true },
    { id: "i", state: "asked", track: false },
    { id: "j", state: "answered", track: false },
  ];
  assert.deepEqual(
    selectCleanQuestions(cards).map((card) => card.id),
    ["b", "d", "g", "h", "c", "e", "f"]
  );
  assert.deepEqual(
    cards.map((card) => card.id),
    [..."abcdefghij"]
  );

  // A late answer changes the same card, not when it was asked.
  cards[1].state = "answered";
  assert.deepEqual(
    selectCleanQuestions(cards).map((card) => card.id),
    ["d", "g", "h", "c", "e", "f"]
  );
});

test("Clean shows a quiet empty state until an eligible question arrives", () => {
  assert.deepEqual(selectCleanQuestions([]), []);
  assert.deepEqual(selectCleanQuestions([{ track: false, state: "asked" }]), []);
  assert.deepEqual(selectCleanQuestions([{ state: "asked" }]), []);
  assert.match(
    read("CleanQuestionList.tsx"),
    /shown\.length === 0[\s\S]+\{t\("questionCard\.empty"\)\}/
  );
});

const read = (file) =>
  fs.readFileSync(path.join(__dirname, "../../src/components/conversation", file), "utf8");

test("Words receives unfiltered cards and Clean rows cannot take focus", () => {
  const rail = read("LiveSignalRail.tsx");
  assert.match(rail, /const cards = useMeetingRecordingStore\(\(state\) => state\.questionCards\)/);
  assert.match(rail, /<ConversationSignalRail\s+cards=\{cards\}/);
  assert.doesNotMatch(rail, /selectCleanQuestions|\.track\b/);

  const clean = read("CleanQuestionList.tsx");
  assert.match(clean, /<li key=\{card\.id\}/);
  assert.match(clean, /if \(atEnd\.current\) node\.scrollTop = node\.scrollHeight/);
  assert.doesNotMatch(clean, /\.focus\(|autoFocus|scrollIntoView|<button/);
});

// The default is the whole point of the setting: it is what a first
// conversation opens on. Since 2026-11-22 that is the details (Alex's
// decision), and Hide details goes to the plain view.
test("nothing stored means the details", () => {
  assert.equal(DEFAULT_CONVERSATION_DETAIL, "detailed");
  assert.equal(resolveConversationDetail(null), "detailed");
  assert.equal(resolveConversationDetail(undefined), "detailed");
  assert.equal(resolveConversationDetail(""), "detailed");
});

// An install that predates the setting, or where nobody changed the view, has
// no stored value, so it takes the same path as a fresh one: deliberately, not
// by accident. A stored choice still wins, the plain view included.
test("a stored value is honoured, and only the two real ones are", () => {
  assert.equal(resolveConversationDetail("clean"), "clean");
  assert.equal(resolveConversationDetail("detailed"), "detailed");
  assert.equal(resolveConversationDetail("verbose"), "detailed");
  assert.equal(resolveConversationDetail("CLEAN"), "detailed");
  assert.equal(resolveConversationDetail(0), "detailed");
  assert.equal(resolveConversationDetail({}), "detailed");
});
