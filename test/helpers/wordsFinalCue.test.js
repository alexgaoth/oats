const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The Words view's cue for a room segment still being said, with no partial to
// show (Parakeet; Whisper between partials). Source-level: what it looks like and
// when it shows are measured in a browser (the reliability speech report). These
// pin the rules that a later edit could quietly break.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const DIALOGUE = read("src/components/conversation/ConversationDialogue.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");

const cue = () => {
  const start = DIALOGUE.indexOf("{hearing && (");
  assert.ok(start > 0, "the cue is drawn from `hearing`");
  return DIALOGUE.slice(start, DIALOGUE.indexOf("</li>", start));
};

test("the cue follows the segmenter's activity, not a partial's words", () => {
  assert.match(
    DIALOGUE,
    /const hearing = useMeetingRecordingStore\(\(state\) => inRoom && state\.segmentOpen\) && !partial;/
  );
});

test("the cue holds no words: no text, no transcript, hidden from assistive output", () => {
  const block = cue();
  assert.match(block, /aria-hidden="true"/);
  assert.match(block, /data-state="hearing"/);
  assert.doesNotMatch(block, /\{partial\}|turn\.text|newestVisible|t\("/);
});

test("the cue does not move: no animation and no transition", () => {
  assert.doesNotMatch(cue(), /animate-|transition|oats-roll|@keyframes/);
});

test("a final is shown as delivered once revealed, and whole under reduced motion", () => {
  assert.match(
    DIALOGUE,
    /newestVisible && !newestVisible\.done\s*\?\s*newestVisible\.text\s*:\s*turn\.text/
  );
  assert.match(DIALOGUE, /\(prefers-reduced-motion: reduce\)"\)\.matches === true/);
  assert.match(DIALOGUE, /document\.visibilityState === "hidden"/);
  assert.match(DIALOGUE, /from: total, at: now, rate: 0, total/);
});

test("Clean gains nothing: the dialogue and cue need the optional transcript detail", () => {
  assert.match(
    WORKSPACE,
    /\{detailed && \(classicRecordingControls \|\| detailTab === "transcript"\) && \(\s*<TabsContent[\s\S]*?<ConversationDialogue/
  );
});
