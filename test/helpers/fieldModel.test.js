const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/components/conversation/field/fieldModel.ts");

test("the field is deterministic across builds", async () => {
  const { createField } = await load();
  const a = createField(400);
  const b = createField(400);
  assert.deepEqual(a.blades, b.blades);
});

test("a different seed gives a different field", async () => {
  const { createField } = await load();
  const a = createField(400);
  const b = createField(400, 99);
  assert.notDeepEqual(a.blades, b.blades);
});

test("every blade is accounted for exactly once by the band ranges", async () => {
  const { createField, BANDS } = await load();
  const field = createField(1000);

  assert.equal(field.bands.length, BANDS);
  assert.equal(field.blades.length, 1000);

  let cursor = 0;
  for (const band of field.bands) {
    assert.equal(band.start, cursor, "band ranges must be contiguous");
    cursor += band.count;
  }
  assert.equal(cursor, field.blades.length, "ranges must cover every blade");
});

test("blades are grouped by band so bands can be drawn far to near", async () => {
  const { createField } = await load();
  const field = createField(1000);

  field.bands.forEach((range, band) => {
    for (let i = range.start; i < range.start + range.count; i += 1) {
      assert.equal(field.blades[i].band, band);
    }
  });
});

test("nearer bands are less populated than far ones", async () => {
  const { createField, BANDS } = await load();
  const field = createField(2000);
  assert.ok(
    field.bands[0].count > field.bands[BANDS - 1].count,
    "crowding the foreground makes a field read as a hedge"
  );
});

// Adaptive density draws a prefix of each band's range. That is only safe if a
// prefix is spread across the field rather than clustered in one region.
test("a prefix of a band is spread across the full width", async () => {
  const { createField } = await load();
  const field = createField(3000);
  const range = field.bands[0];
  const prefix = field.blades.slice(range.start, range.start + Math.floor(range.count * 0.35));

  assert.ok(prefix.length > 40, "need a meaningful sample to assert on");
  const min = Math.min(...prefix.map((b) => b.x));
  const max = Math.max(...prefix.map((b) => b.x));
  assert.ok(min < 0.1, `prefix should reach the left edge, got ${min}`);
  assert.ok(max > 0.9, `prefix should reach the right edge, got ${max}`);

  // And roughly balanced between halves, rather than all in one.
  const left = prefix.filter((b) => b.x < 0.5).length;
  const ratio = left / prefix.length;
  assert.ok(ratio > 0.35 && ratio < 0.65, `prefix should be balanced, got ${ratio}`);
});

test("growth is clamped, monotonic, and finishes inside the intro window", async () => {
  const { createField, growthAt } = await load();
  const field = createField(500);

  for (const blade of field.blades) {
    assert.equal(growthAt(blade, 0), 0, "nothing has grown at t=0");
    assert.equal(growthAt(blade, 1), 1, "everything is fully grown by t=1");

    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const g = growthAt(blade, t);
      assert.ok(g >= 0 && g <= 1, `growth out of range: ${g}`);
      assert.ok(g >= previous - 1e-9, "growth must never go backwards");
      previous = g;
    }
  }
});

test("the field builds from the horizon toward the viewer", async () => {
  const { createField, growthAt, BANDS } = await load();
  const field = createField(3000);

  const meanGrowth = (band, t) => {
    const range = field.bands[band];
    let total = 0;
    for (let i = range.start; i < range.start + range.count; i += 1) {
      total += growthAt(field.blades[i], t);
    }
    return total / range.count;
  };

  // Sampled midway through the intro, the far band must be visibly ahead.
  const far = meanGrowth(0, 0.5);
  const near = meanGrowth(BANDS - 1, 0.5);
  assert.ok(far > near + 0.15, `far band should lead: far=${far} near=${near}`);
});

test("a young blade is stiff and does not catch the wind", async () => {
  const { createField, windAt } = await load();
  const [blade] = createField(50).blades;

  assert.equal(windAt(blade, 12, 0), 0, "an ungrown blade cannot bend");
  const half = Math.abs(windAt(blade, 12, 0.5));
  const full = Math.abs(windAt(blade, 12, 1));
  assert.ok(full > half, "wind response grows with the blade");
});

test("gusts travel across the field and stay bounded", async () => {
  const { gustCenter, WIND } = await load();

  const early = gustCenter(0, WIND.gustSpeedA);
  const later = gustCenter(4, WIND.gustSpeedA);
  assert.ok(later > early, "a gust must move");

  for (let t = 0; t < 400; t += 0.37) {
    const c = gustCenter(t, WIND.gustSpeedA);
    assert.ok(c >= -0.3 && c <= 1.3, `gust centre escaped its track: ${c}`);
  }
});

test("the two gust generators do not stay in step", async () => {
  const { gustCenter, WIND } = await load();
  let coincident = 0;
  for (let t = 0; t < 600; t += 1) {
    const a = gustCenter(t, WIND.gustSpeedA);
    const b = gustCenter(t, WIND.gustSpeedB, WIND.gustOffsetB);
    if (Math.abs(a - b) < 0.05) coincident += 1;
  }
  assert.ok(coincident < 60, `gusts should rarely align, aligned ${coincident}/600 samples`);
});

test("wind stays within a sane displacement range", async () => {
  const { createField, windAt } = await load();
  const field = createField(600);
  for (const blade of field.blades) {
    for (let t = 0; t < 60; t += 2.3) {
      const w = windAt(blade, t, 1);
      assert.ok(Number.isFinite(w) && Math.abs(w) < 2, `wind displacement blew up: ${w}`);
    }
  }
});

test("band styling deepens monotonically toward the viewer", async () => {
  const { bandStyle, BANDS } = await load();
  const styles = Array.from({ length: BANDS }, (_, b) => bandStyle(b));

  for (let i = 1; i < styles.length; i += 1) {
    assert.ok(styles[i].baseY > styles[i - 1].baseY, "nearer bands sit lower");
    assert.ok(styles[i].height > styles[i - 1].height, "nearer blades are taller");
    assert.ok(styles[i].alpha > styles[i - 1].alpha, "nearer blades are higher contrast");
    assert.ok(styles[i].windScale > styles[i - 1].windScale, "nearer blades swing further");
    assert.ok(styles[i].solidity > styles[i - 1].solidity, "far blades dissolve into grain");
    assert.ok(styles[i].parallax > styles[i - 1].parallax, "nearer blades parallax more");
  }
});

test("the nearest band roots below the viewport, so we stand inside the field", async () => {
  const { bandStyle, BANDS } = await load();
  assert.ok(bandStyle(BANDS - 1).baseY > 1);
  assert.ok(bandStyle(0).baseY > 0.42, "the far band still sits below the horizon");
});

test("the field respects the ~50% alpha ceiling DESIGN.md §9.8 sets", async () => {
  const { bandStyle, BANDS } = await load();
  for (let b = 0; b < BANDS; b += 1) {
    assert.ok(bandStyle(b).alpha <= 0.5, "the field must never compete with text");
  }
});

test("hex colours parse, and anything else is rejected rather than rendered black", async () => {
  const { parseHexColor } = await load();

  assert.deepEqual(parseHexColor("#c67b27"), [198 / 255, 123 / 255, 39 / 255]);
  assert.deepEqual(parseHexColor("  #C67B27 "), [198 / 255, 123 / 255, 39 / 255]);
  assert.deepEqual(parseHexColor("#fff"), [1, 1, 1]);

  assert.equal(parseHexColor("oklch(0.7 0.1 60)"), null);
  assert.equal(parseHexColor(""), null);
  assert.equal(parseHexColor("#12345"), null);
  assert.equal(parseHexColor("#gggggg"), null);
});

test("colour mixing is clamped at both ends", async () => {
  const { mixRgb } = await load();
  const a = [0, 0, 0];
  const b = [1, 1, 1];
  assert.deepEqual(mixRgb(a, b, 0), [0, 0, 0]);
  assert.deepEqual(mixRgb(a, b, 1), [1, 1, 1]);
  assert.deepEqual(mixRgb(a, b, -5), [0, 0, 0]);
  assert.deepEqual(mixRgb(a, b, 5), [1, 1, 1]);
  assert.deepEqual(mixRgb(a, b, 0.5), [0.5, 0.5, 0.5]);
});

test("the farmhouse is grounded, concave-roofed, and capped", async () => {
  const { minkaHalfWidthAt, MINKA } = await load();

  assert.equal(minkaHalfWidthAt(-0.01), 0, "nothing below the horizon");
  assert.ok(minkaHalfWidthAt(0.001) > 0, "rooted on the horizon");
  assert.equal(minkaHalfWidthAt(0.5), 0, "nothing far above the roof");

  // Eaves overhang the walls, the hip sweep is concave and monotonic, and
  // the ridge cap juts past the gable top.
  const eaveTip = minkaHalfWidthAt(MINKA.bodyH + 1e-6);
  assert.ok(eaveTip > MINKA.bodyHalf, "eaves must overhang the body");
  let previous = eaveTip;
  let sawConcave = false;
  for (let t = 1 / 16; t <= 1; t += 1 / 16) {
    const v = minkaHalfWidthAt(MINKA.bodyH + t * MINKA.hipH);
    assert.ok(v <= previous + 1e-9, "hip sweep must taper monotonically");
    const straight = MINKA.gableHalf + (eaveTip - MINKA.gableHalf) * (1 - t);
    if (v < straight - 1e-4) sawConcave = true;
    previous = v;
  }
  assert.ok(sawConcave, "the hip sweep must be concave — straight edges read as a barn");
  const capY = MINKA.bodyH + MINKA.hipH + MINKA.gableH + MINKA.capH / 2;
  assert.ok(
    minkaHalfWidthAt(capY) > MINKA.ridgeHalf,
    "the raised ridge cap must jut past the ridge"
  );
});

test("scene ids cover every scene exactly once, with off = 0", async () => {
  const { SCENE_IDS } = await load();
  assert.equal(SCENE_IDS.off, 0, "off must be the shader's no-op");
  const ids = Object.values(SCENE_IDS);
  assert.equal(new Set(ids).size, ids.length, "ids must be distinct");
});
