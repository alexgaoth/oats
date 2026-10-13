const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Talk time as a list of bars (DESIGN.md §6): a row per voice with its name, a
// bar of the chart fill and its share. The component needs a DOM, so its rules
// are pinned at source level, like the contour's.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const WORKSPACE = code(read("src/components/OatsWorkspace.tsx"));
const BAR = code(read("src/components/charts/DitherBar.tsx"));

const start = WORKSPACE.indexOf("function TalkTime(");
const TALK = WORKSPACE.slice(start, WORKSPACE.indexOf("\nfunction ", start + 1));

test("each voice is a row: its name, a bar, and its share", () => {
  assert.ok(start > 0, "TalkTime is in OatsWorkspace.tsx");
  assert.match(TALK, /text-\[13px\] text-foreground/);
  assert.match(TALK, /"max-w-40 truncate", pressed && "font-medium"/);
  assert.match(TALK, /"h-1\.5 min-w-1\.5 overflow-hidden rounded-\[3px\]"/);
  assert.match(TALK, /text-right font-medium tabular-nums/);
});

test("a bar is as long as its share against the longest", () => {
  assert.match(TALK, /const longest = Math\.max\(\.\.\.rows\.map\(\(entry\) => entry\.ms\)\);/);
  assert.match(TALK, /width: `\$\{\(entry\.ms \/ longest\) \* 100\}%`/);
});

test("bars are the chart fill: the dither, honey when shown, rule grey when unattributed", () => {
  assert.match(TALK, /entry\.key !== null && !pressed && <DitherBar \/>/);
  assert.match(TALK, /pressed && "bg-primary"/);
  assert.match(TALK, /entry\.key === null && "bg-border"/);
  // No tones by rank and no dimming: one fill, one accent (rules 2 and 3).
  assert.doesNotMatch(WORKSPACE, /TALK_TONES/);
  assert.doesNotMatch(TALK, /opacity-/);
});

test("two columns from 420px, filled down the first column, one column below", () => {
  assert.match(TALK, /className=\{cn\("@container", className\)\}/);
  assert.match(
    TALK,
    /grid-cols-\[minmax\(0,max-content\)_minmax\(0,1fr\)_auto\] gap-x-3[^"]*@min-\[420px\]:grid-cols-\[minmax\(0,max-content\)_minmax\(0,1fr\)_auto_0\.25rem_minmax\(0,max-content\)_minmax\(0,1fr\)_auto\]/
  );
  assert.match(TALK, /grid-flow-row-dense/);
  assert.match(TALK, /const firstColumn = Math\.ceil\(rows\.length \/ 2\);/);
  assert.match(
    TALK,
    /index < firstColumn \? "@min-\[420px\]:col-start-1" : "@min-\[420px\]:col-start-5"/
  );
  assert.match(TALK, /col-span-3 grid grid-cols-subgrid/);
});

test("a voice is still the transcript's filter, with the same names for assistive tech", () => {
  assert.match(TALK, /role="group"\s+aria-label=\{t\("oats\.intelligence\.talkTime\.label"\)\}/);
  assert.match(TALK, /aria-pressed=\{pressed\}/);
  assert.match(TALK, /t\("oats\.intelligence\.talkTime\.everyone"\)/);
  assert.match(TALK, /t\("oats\.intelligence\.talkTime\.show", \{ speaker: entry\.label \}\)/);
  assert.match(TALK, /onClick=\{\(\) => onSelect\(key\)\}/);
  assert.match(TALK, /focus-visible:ring-\[3px\] focus-visible:ring-ring\/50/);
  // Unattributed speech is the last row and is not a button.
  assert.match(TALK, /if \(entry\.key === null\) \{\s*return \(\s*<li key="unattributed"/);
});

test("the dithered bar draws through the chart style at half density", () => {
  assert.match(BAR, /const BAR_DENSITY = 0\.5;/);
  assert.match(BAR, /subscribeChartPalette\(canvas, setPalette\)/);
  assert.match(BAR, /return observeCanvas\(canvas,/);
  assert.match(BAR, /ditherFill\(\s*ctx,[\s\S]*palette\.quiet,\s*BAR_DENSITY\s*\)/);
  assert.match(BAR, /aria-hidden="true"/);
});
