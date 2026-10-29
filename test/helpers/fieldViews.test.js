const test = require("node:test");
const assert = require("node:assert/strict");

const views = () => import("../../src/components/field/fieldViews.ts");
const model = () => import("../../src/components/conversation/field/fieldModel.ts");

// Rooms as the backdrop measures them in the demo harness (CSS px).
const SIDEBAR = 232;
const room = ({ width = 1200, height = 800, sidebar = SIDEBAR, content }) => ({
  width,
  height,
  pane: { left: sidebar, top: 52, right: width, bottom: height },
  content,
});
// Home with five recent conversations: content ends above the pane's bottom.
const home = room({ content: { left: 364, right: 1068, bottom: 680 } });
// Home with nothing recorded yet: one card and a line under it.
const homeEmpty = room({ content: { left: 364, right: 1068, bottom: 302 } });
// A record: the column scrolls, so it runs to the pane's bottom.
const record = room({ content: { left: 354, right: 1068, bottom: 800 } });
// The recording view: the sidebar has stepped aside, two cards at the top.
const recording = room({ sidebar: 0, content: { left: 132, right: 1068, bottom: 556 } });
// A wide window.
const wide = room({ width: 1440, height: 900, content: { left: 484, right: 1188, bottom: 900 } });
// The smallest window Oats allows, where the column fills the pane.
const narrow = room({ width: 880, height: 680, content: { left: 264, right: 848, bottom: 680 } });

const corners = (box) => [
  [box.left, box.top ?? 60],
  [box.right, box.top ?? 60],
  [box.left, box.bottom],
  [box.right, box.bottom],
];

test("every screen the backdrop tells apart has a composition in range", async () => {
  const { FIELD_VIEWS, VIEW_KNOBS } = await views();
  assert.deepEqual([...FIELD_VIEWS].sort(), Object.keys(VIEW_KNOBS).sort());
  for (const view of FIELD_VIEWS) {
    const knobs = VIEW_KNOBS[view];
    assert.ok(knobs.horizon > 0.5 && knobs.horizon < 0.9, `${view}: horizon ${knobs.horizon}`);
    for (const key of ["sky", "wheat", "warmth", "sun"]) {
      assert.ok(knobs[key] >= 0 && knobs[key] <= 1, `${view}: ${key} ${knobs[key]}`);
    }
  }
});

test("the Home screens get more of the field than the reading screens", async () => {
  const { VIEW_KNOBS } = await views();
  for (const hero of ["home", "recording"]) {
    for (const reading of ["conversations", "record", "settings", "global"]) {
      const a = VIEW_KNOBS[hero];
      const b = VIEW_KNOBS[reading];
      assert.ok(a.horizon < b.horizon, `${hero}'s horizon stands higher than ${reading}'s`);
      assert.ok(a.wheat > b.wheat && a.sky > b.sky, `${hero} is fuller than ${reading}`);
    }
  }
});

test("the content is calm at every corner, and the grain is back past the feather", async () => {
  const { composeField, CLEAR_PAD, CLEAR_FEATHER } = await views();
  const { calmAt } = await model();
  for (const [name, measured] of Object.entries({ home, homeEmpty, record, recording, wide })) {
    const picture = composeField("home", measured);
    for (const [x, y] of corners(measured.content)) {
      assert.equal(calmAt(picture, x, Math.min(y, measured.height - 1)), 1, `${name} at ${x},${y}`);
    }
    const outside = measured.content.right + CLEAR_PAD + CLEAR_FEATHER + 1;
    if (outside < measured.width) {
      assert.equal(calmAt(picture, outside, 400), 0, `${name}: the margin has its grain`);
    }
  }
});

test("the title band is calm across the whole width, not only over the column", async () => {
  const { composeField } = await views();
  const { calmAt } = await model();
  const picture = composeField("conversations", wide);
  // The header title sits at the pane's left, outside the column.
  assert.equal(calmAt(picture, SIDEBAR + 24, 26), 1);
  assert.equal(calmAt(picture, wide.width - 10, 26), 1);
  assert.equal(calmAt(picture, wide.width - 10, 300), 0);
});

test("a column that scrolls is calm to the bottom of the window, with no feather showing", async () => {
  const { composeField } = await views();
  const { calmAt } = await model();
  const picture = composeField("record", record);
  assert.ok(picture.clear.bottom > record.height + picture.clear.feather);
  assert.equal(calmAt(picture, 700, record.height - 1), 1);
});

test("short content leaves the field under it", async () => {
  const { composeField } = await views();
  const { calmAt } = await model();
  const picture = composeField("home", homeEmpty);
  assert.equal(calmAt(picture, 700, 290), 1, "the content itself is calm");
  assert.equal(calmAt(picture, 700, 600), 0, "the ground under it is not");
});

test("the sun stands whole: clear of the content, inside the window, over the horizon", async () => {
  const { composeField, FIELD_VIEWS } = await views();
  const { calmAt } = await model();
  for (const [name, measured] of Object.entries({ home, homeEmpty, record, recording, wide })) {
    for (const view of FIELD_VIEWS) {
      const picture = composeField(view, measured);
      for (const disc of [picture.sun, picture.moon]) {
        if (disc.r === 0) continue;
        // The shader draws a disc in front of the dissolve only where calm < 0.5.
        for (let a = 0; a < 16; a += 1) {
          const x = disc.x + Math.cos((a / 16) * Math.PI * 2) * disc.r;
          const y = disc.y + Math.sin((a / 16) * Math.PI * 2) * disc.r;
          assert.ok(calmAt(picture, x, y) < 0.5, `${name}/${view}: a card would cut it`);
          assert.ok(
            x >= measured.pane.left && x <= measured.width,
            `${name}/${view}: off the pane`
          );
        }
        assert.ok(disc.y + disc.r <= picture.horizon * measured.height + 0.5, `${name}/${view}`);
      }
    }
  }
});

test("on open ground the sun stands under the content, and a moon above where it would", async () => {
  const { composeField } = await views();
  const picture = composeField("home", homeEmpty);
  assert.ok(picture.sun.r > 30, "a large sun");
  assert.ok(picture.sun.x > homeEmpty.content.left && picture.sun.x < homeEmpty.content.right);
  assert.ok(picture.sun.y > homeEmpty.content.bottom);
  assert.ok(picture.moon.r > 0 && picture.moon.r < picture.sun.r);
  assert.ok(picture.moon.y < picture.sun.y);
  assert.equal(picture.lightX, picture.sun.x / homeEmpty.width, "the light comes from the sun");
});

test("a reading screen keeps its sun in a margin, even over open ground", async () => {
  const { composeField } = await views();
  for (const view of ["record", "settings"]) {
    const sun = composeField(view, homeEmpty).sun;
    assert.ok(sun.r > 0, view);
    assert.ok(sun.x > homeEmpty.content.right, `${view}: in the right-hand margin`);
  }
});

test("with no room for a whole sun none is drawn, and its light stays on the horizon", async () => {
  const { composeField } = await views();
  const picture = composeField("home", narrow);
  assert.equal(picture.sun.r, 0);
  assert.equal(picture.moon.r, 0);
  assert.ok(picture.lightX > 0 && picture.lightX < 1);
});

test("Global conversations has no sun: the board has its own grain", async () => {
  const { composeField } = await views();
  assert.equal(composeField("global", wide).sun.r, 0);
});

test("the reading screens carry a smaller sun than Home in the same room", async () => {
  const { composeField } = await views();
  const big = composeField("home", wide).sun.r;
  for (const view of ["conversations", "record", "settings"]) {
    const r = composeField(view, wide).sun.r;
    assert.ok(r > 0 && r < big, `${view}: ${r} against ${big}`);
  }
});

test("the farmhouse stands clear of the content and away from the sun", async () => {
  const { composeField } = await views();
  const { calmAt, MINKA } = await model();
  for (const [name, measured] of Object.entries({ homeEmpty, wide, recording })) {
    const picture = composeField("home", measured);
    if (picture.minkaX < 0) continue;
    const x = picture.minkaX * measured.width;
    const half = MINKA.hipEaveHalf * measured.height;
    const y = picture.horizon * measured.height - 2;
    assert.equal(calmAt(picture, x - half, y), 0, name);
    assert.equal(calmAt(picture, x + half, y), 0, name);
    if (picture.sun.r > 0) assert.ok(Math.abs(x - picture.sun.x) > 2 * half, name);
  }
});

test("nothing measured: a column the width of the content, centred in the pane", async () => {
  const { clearingFor } = await views();
  const clear = clearingFor(room({ content: null }));
  const centre = (SIDEBAR + 1200) / 2;
  assert.ok(Math.abs((clear.left + clear.right) / 2 - centre) < 1);
  assert.ok(clear.bottom > 800, "and calm to the bottom, as a scrolling page is");
});

test("a surface with no column of its own falls back to its screen", async () => {
  const { fallbackView } = await views();
  assert.equal(fallbackView("conversation", false), "home");
  assert.equal(fallbackView("conversation", true), "recording");
  assert.equal(fallbackView("intelligence", false), "conversations");
  assert.equal(fallbackView("settings", true), "settings");
});

test("the default composition is the field as it was: nothing calm, the bands where they were", async () => {
  const { defaultComposition, calmAt, bandPlacement, bandStyle, bandSpread, HORIZON, BANDS } =
    await model();
  const picture = defaultComposition(0.75);
  assert.equal(picture.horizon, HORIZON);
  assert.equal(picture.sun.r, 0);
  assert.equal(picture.moon.r, 0);
  assert.equal(picture.skyTone, 1);
  for (const [x, y] of [
    [0, 0],
    [600, 30],
    [600, 500],
  ]) {
    assert.equal(calmAt(picture, x, y), 0);
  }
  for (let band = 0; band < BANDS; band += 1) {
    const place = bandPlacement(band, HORIZON);
    assert.ok(Math.abs(place.baseY - bandStyle(band).baseY) < 1e-12);
    assert.ok(Math.abs(place.height - bandStyle(band).height) < 1e-12);
    assert.ok(Math.abs(place.spread - bandSpread(band)) < 1e-12);
  }
});

test("a lower horizon is the same field further away, never wheat cut off at the bottom", async () => {
  const { bandPlacement, HORIZON, BANDS } = await model();
  for (let band = 0; band < BANDS; band += 1) {
    const here = bandPlacement(band, HORIZON);
    const far = bandPlacement(band, 0.8);
    assert.ok(far.height < here.height, "shorter wheat");
    assert.ok(far.baseY >= 0.8, "rooted under its horizon");
    // The far band's tips stay above the window's bottom edge.
    if (band === 0) assert.ok(far.baseY - far.height < 1);
  }
});

test("a move between pictures ends exactly on each, and eases what it can", async () => {
  const { composeField } = await views();
  const { mixComposition, sameComposition } = await model();
  const a = composeField("home", home);
  const b = composeField("record", record);
  assert.ok(sameComposition(mixComposition(a, b, 0), a));
  assert.ok(sameComposition(mixComposition(a, b, 1), b));
  const half = mixComposition(a, b, 0.5);
  assert.ok(half.horizon > a.horizon && half.horizon < b.horizon);
  assert.ok(half.clear.bottom > a.clear.bottom && half.clear.bottom < b.clear.bottom);
});

test("a sun with somewhere else to be sets and rises there instead of gliding", async () => {
  const { composeField } = await views();
  const { mixComposition } = await model();
  const a = composeField("home", homeEmpty); // on the open ground
  const b = composeField("conversations", home); // in the right-hand margin
  assert.ok(Math.hypot(a.sun.x - b.sun.x, a.sun.y - b.sun.y) > 2 * Math.max(a.sun.r, b.sun.r));
  for (const t of [0.1, 0.3, 0.49]) {
    const sun = mixComposition(a, b, t).sun;
    assert.equal(sun.x, a.sun.x, "it sets where it stood");
    assert.ok(sun.r < a.sun.r);
  }
  for (const t of [0.51, 0.7, 0.9]) {
    const sun = mixComposition(a, b, t).sun;
    assert.equal(sun.x, b.sun.x, "and rises where it is going");
    assert.ok(sun.r < b.sun.r);
  }
});

test("the first picture is drawn as it is, and reduced motion never moves", async () => {
  const { composeField } = await views();
  const { startPicture, aimPicture, pictureAt, sameComposition } = await model();
  const a = composeField("home", home);
  const b = composeField("record", record);
  const first = startPicture(a);
  aimPicture(first, b, 0, false);
  assert.ok(sameComposition(pictureAt(first, 10, 280, false), b), "nothing drawn yet: no move");

  const reduced = startPicture(a);
  pictureAt(reduced, 0, 280, false);
  aimPicture(reduced, b, 0, true);
  assert.equal(reduced.at, null);
  assert.ok(sameComposition(pictureAt(reduced, 1, 280, true), b));
});

test("another screen is moved to over the frame's time, from the picture as drawn", async () => {
  const { composeField } = await views();
  const { startPicture, aimPicture, pictureAt, sameComposition } = await model();
  const a = composeField("home", home);
  const b = composeField("conversations", home);
  const move = startPicture(a);
  pictureAt(move, 0, 280, false);
  aimPicture(move, b, 1000, false);
  const early = pictureAt(move, 1050, 280, false);
  assert.ok(early.horizon > a.horizon && early.horizon < b.horizon);
  assert.ok(sameComposition(pictureAt(move, 1280, 280, false), b));
  assert.equal(move.at, null, "and then it is at rest");
});

test("when the layout moves, the clearing follows at once and only the screen's character eases", async () => {
  const { composeField, VIEW_KNOBS } = await views();
  const { startPicture, aimPicture, pictureAt } = await model();
  // A recording starts: the screen changes, then the sidebar glides away.
  const homePicture = composeField(
    "home",
    room({ content: { left: 364, right: 1068, bottom: 680 } })
  );
  const recordingAtStart = composeField(
    "recording",
    room({ content: { left: 364, right: 1068, bottom: 556 } })
  );
  const midGlide = composeField(
    "recording",
    room({ sidebar: 116, content: { left: 248, right: 1068, bottom: 556 } })
  );
  const move = startPicture(homePicture);
  pictureAt(move, 0, 280, false);
  aimPicture(move, recordingAtStart, 1000, false);
  pictureAt(move, 1040, 280, false);
  aimPicture(move, midGlide, 1100, false);
  const drawn = pictureAt(move, 1100, 280, false);
  assert.deepEqual(drawn.clear, midGlide.clear, "the clearing is where the column is");
  assert.ok(
    drawn.horizon > VIEW_KNOBS.home.horizon && drawn.horizon < VIEW_KNOBS.recording.horizon
  );
  assert.equal(move.at, 1000, "the move keeps its own time");

  // A window resized at rest: everything follows at once, nothing moves.
  const resized = composeField(
    "recording",
    room({ width: 1300, sidebar: 0, content: { left: 182, right: 1118, bottom: 556 } })
  );
  pictureAt(move, 2000, 280, false);
  aimPicture(move, resized, 2000, false);
  assert.equal(move.at, null);
  assert.deepEqual(pictureAt(move, 2001, 280, false).sun, resized.sun);
});
