const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// DESIGN.md §2, "Character for the choices that matter": the few choices that
// change what you see get a honey indicator that slides and a drawing that
// arrives once; every other choice stays a plain SegmentedControl. It must
// behave exactly like one. Source-level: it needs a browser to render.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const SWITCH = read("src/components/ui/view-switch.tsx");
const FLOW = read("src/components/conversation/ConversationFlow.tsx");
const CSS = read("src/index.css");

test("it is a radio group with one tab stop and the arrow keys, like SegmentedControl", () => {
  assert.match(SWITCH, /role="radiogroup"/);
  assert.match(SWITCH, /role="radio"/);
  assert.match(SWITCH, /aria-checked=\{selected\}/);
  assert.match(SWITCH, /tabIndex=\{selected \? 0 : -1\}/);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
    assert.ok(SWITCH.includes(`"${key}"`), key);
  }
});

test("the drawing moves only for a choice the person made, never on first paint", () => {
  assert.match(SWITCH, /selected && chosen === option\.value && "oats-view-glyph"/);
  assert.match(SWITCH, /!placed && "\[transition:none\]"/, "the indicator starts in place");
});

test("nothing moves under reduced motion", () => {
  const reduced = CSS.slice(CSS.indexOf(".oats-view-indicator {"));
  assert.match(
    reduced,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.oats-view-indicator \{\s*transition: none;\s*\}\s*\.oats-view-glyph > \* \{\s*animation: none;/
  );
});

test("how topics are drawn is one of the choices with character", () => {
  assert.match(FLOW, /<ViewSwitch<ConversationFlowView>/);
  for (const icon of ["Wand", "Rows3", "Network"]) {
    assert.ok(FLOW.includes(`icon: ${icon}`), icon);
  }
  assert.doesNotMatch(FLOW, /SegmentedControl/);
});
