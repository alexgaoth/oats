const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The question band keeps its newest card whole while a context check grows it,
// unless the person scrolled the band away (src/helpers/questionBand.mjs). The
// geometry is pure and pinned here; the wiring is source-level, because the
// band needs a browser to render.

let newestCardHold, holdingNewest, HOLD_SLACK_PX;

test.before(async () => {
  ({ newestCardHold, holdingNewest, HOLD_SLACK_PX } =
    await import("../../src/helpers/questionBand.mjs"));
});

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const BAND = read("src/components/conversation/QuestionBand.tsx");
const RAIL = read("src/components/conversation/ConversationSignalRail.tsx");
const FADE = read("src/components/conversation/useScrollFade.tsx");
const WORKSPACE = read("src/components/OatsWorkspace.tsx");

// The fades as ScrollFade draws them: `h-3` over the top edge, `h-6` under the bottom.
const FADES = { top: 12, bottom: 24 };

// Measured in the demo harness at 1440x900, 24:03, once "Found it" and its
// source line had landed: the band 134px tall, and the newest card's content
// from 60px (under the "10 earlier" control) to 166px.
const BETA = { top: 60, bottom: 166, viewHeight: 134, scrollHeight: 385, fade: FADES };

test("a card that fits where the band rests leaves the band there", () => {
  // The first check of the demo, at 1440x900: the band 164px, the card 24 to 131.
  const hold = newestCardHold({
    top: 24,
    bottom: 131,
    viewHeight: 164,
    scrollHeight: 203,
    fade: FADES,
  });
  assert.deepEqual(hold, { scrollTop: 0, bottomFade: true });
});

test("a check line that lands under the bottom fade lifts the band just far enough", () => {
  const hold = newestCardHold({ ...BETA, viewHeight: 160 });
  // The card's last line meets the fade's top edge, and the question stays.
  assert.equal(hold.scrollTop, 166 + 24 - 160);
  assert.equal(hold.bottomFade, true);
});

test("a card taller than the room between the fades keeps its question, and the fade steps aside", () => {
  const hold = newestCardHold(BETA);
  // Never past the question: its first line sits just under the top fade.
  assert.equal(hold.scrollTop, 60 - 12);
  // The source line ends inside the band (at 118 of 134), where the fade would
  // erase it.
  assert.equal(hold.bottomFade, false);
});

test("a card cut by the band's edge keeps its fade, which says it continues", () => {
  const hold = newestCardHold({ ...BETA, viewHeight: 80 });
  assert.equal(hold.scrollTop, 48);
  assert.equal(hold.bottomFade, true);
});

test("the band never scrolls past either end of its content", () => {
  assert.equal(newestCardHold({ ...BETA, scrollHeight: 160 }).scrollTop, 160 - 134);
  const tall = { top: 0, bottom: 300, viewHeight: 100, scrollHeight: 400, fade: FADES };
  assert.equal(newestCardHold(tall).scrollTop, 0);
  // No fades, no cards above: the plain "nearest".
  assert.equal(
    newestCardHold({ top: 0, bottom: 150, viewHeight: 100, scrollHeight: 400 }).scrollTop,
    0
  );
  assert.equal(
    newestCardHold({ top: 40, bottom: 120, viewHeight: 100, scrollHeight: 400 }).scrollTop,
    20
  );
});

test("a person who scrolled away keeps their place, and a nudge is not leaving", () => {
  const hold = newestCardHold(BETA);
  assert.equal(HOLD_SLACK_PX, 8);
  assert.equal(holdingNewest(hold.scrollTop, hold), true);
  assert.equal(holdingNewest(hold.scrollTop + HOLD_SLACK_PX, hold), true);
  // Up to the controls above the card.
  assert.equal(holdingNewest(0, hold), false);
  // Down to the older questions.
  assert.equal(holdingNewest(200, hold), false);
});

test("the band scrolls itself and nothing else, gliding only when motion is allowed", () => {
  assert.match(
    BAND,
    /scroller\.scrollTo\(\{ top: hold\.scrollTop, behavior: reduced \? "auto" : "smooth" \}\)/
  );
  assert.match(BAND, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.doesNotMatch(BAND, /scrollIntoView\(/);
});

test("it holds only until the person scrolls away, and its own glide is not their scroll", () => {
  assert.match(BAND, /if \(!scroller \|\| !hold \|\| !holding\.current\) return;/);
  assert.match(BAND, /holding\.current = holdingNewest\(scroller\.scrollTop, hold\);/);
  assert.match(BAND, /if \(steering\.current\) return;/);
  assert.match(BAND, /onScrollEnd=\{hold\.onScrollEnd\}/);
});

test("it measures where cards will land, and re-measures when anything in the band moves", () => {
  // Layout offsets: a card that has just arrived is still rising 8px into place.
  assert.match(BAND, /top: card\.offsetTop \+ parseFloat\(style\.paddingTop\)/);
  assert.doesNotMatch(BAND, /getBoundingClientRect/);
  // ...from the band, which is the cards' offset parent.
  assert.match(BAND, /cn\("relative min-h-0", detailed \? "overflow-y-auto" : "overflow-hidden"\)/);
  assert.match(BAND, /const observer = new ResizeObserver\(place\);/);
  assert.match(BAND, /observer\.observe\(scroller\.firstElementChild\)/);
});

test("the rail hands the band its newest card, and the surface mounts the band", () => {
  assert.match(RAIL, /itemRef=\{index === 0 \? newestRef : undefined\}/);
  assert.match(RAIL, /<li\s+ref=\{itemRef\}/);
  assert.match(BAND, /newestRef=\{newest\}/);
  assert.match(WORKSPACE, /<QuestionBand detailed=\{detailed\} onFocus=\{setFocusedGroup\} \/>/);
  // The band's fade is measured by the band, which mounts with it: measured
  // from the surface, its observer found no band and never attached.
  assert.doesNotMatch(WORKSPACE, /useScrollFade/);
  assert.match(BAND, /useScrollFade\(band, cardCount\)/);
});

test("the fades the hold steers around are the fades drawn", () => {
  assert.match(FADE, /export const SCROLL_FADE_TOP_PX = 12;/);
  assert.match(FADE, /export const SCROLL_FADE_BOTTOM_PX = 24;/);
  assert.match(FADE, /absolute inset-x-0 top-0 h-3 /);
  assert.match(FADE, /absolute inset-x-0 bottom-0 h-6 /);
  assert.match(BAND, /const FADES = \{ top: SCROLL_FADE_TOP_PX, bottom: SCROLL_FADE_BOTTOM_PX \};/);
  assert.match(BAND, /fade: FADES,/);
  assert.match(BAND, /bottom: faded\.bottom && hold\.bottomFade/);
});
