const test = require("node:test");
const assert = require("node:assert/strict");

let BANDS, BLADES, HORIZON, blade, buildField, noise;
let DEFAULT_UI_MODE, resolveUiMode, toggleUiMode, isFieldMode;

test.before(async () => {
  ({ BANDS, BLADES, HORIZON, blade, buildField, noise } = await import(
    "../../src/helpers/fieldScene.mjs"
  ));
  ({ DEFAULT_UI_MODE, resolveUiMode, toggleUiMode, isFieldMode } = await import(
    "../../src/helpers/uiMode.mjs"
  ));
});

test("the field is a place: the same one every launch", () => {
  const a = JSON.stringify(buildField());
  const b = JSON.stringify(buildField());
  assert.equal(a, b, "two builds must be identical — no Math.random");
});

test("noise is deterministic and stays in range", () => {
  for (let i = 0; i < 200; i += 1) {
    const n = noise(i);
    assert.ok(n >= 0 && n < 1, `noise(${i}) = ${n}`);
    assert.equal(n, noise(i));
  }
});

test("bands run far to near, which is also draw order", () => {
  const bands = buildField();
  assert.equal(bands.length, BANDS);
  for (let i = 1; i < bands.length; i += 1) {
    assert.ok(bands[i].rootTop > bands[i - 1].rootTop, "nearer bands root lower");
    assert.ok(bands[i].opacity > bands[i - 1].opacity, "nearer bands are higher contrast");
    assert.ok(bands[i].sway > bands[i - 1].sway, "nearer bands lean further — parallax");
    assert.ok(bands[i].swayMs > bands[i - 1].swayMs, "nearer bands are heavier, so slower");
  }
});

test("the far band breaks the horizon slightly, as distant stalks should", () => {
  const [far] = buildField();
  assert.ok(far.rootTop < HORIZON, "far band roots just above the horizon line");
  assert.ok(HORIZON - far.rootTop < 0.05, "but only just");
});

test("every band is fully planted", () => {
  for (const band of buildField()) {
    assert.equal(band.blades.length, BLADES);
  }
});

test("stalks are not planted in a grid", () => {
  const xs = buildField()[2].blades.map((b) => b.x);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const spread = Math.max(...gaps) - Math.min(...gaps);
  // An evenly planted row is the giveaway that it is not a field; the widest
  // gap must differ from the narrowest by a good fraction of the mean.
  assert.ok(spread > mean * 0.5, `gaps too regular: spread ${spread}, mean ${mean}`);
});

test("stalks overhang both edges, so the field has no visible end", () => {
  const xs = buildField()[2].blades.map((b) => b.x);
  assert.ok(Math.min(...xs) < 0, "a stalk must start left of the frame");
  assert.ok(Math.max(...xs) > 100, "and one right of it");
});

test("nearer stalks are bigger, and every stalk has a stem and three ears", () => {
  const far = blade(3, 0);
  const near = blade(3, BANDS - 1);
  assert.ok(near.height > far.height);
  assert.ok(near.width > far.width);
  for (const b of [far, near]) {
    assert.match(b.stem, /^M 10 100 Q /);
    assert.equal(b.ears.length, 3);
    // Ears alternate sides, which is what makes it oats and not a twig.
    assert.ok(b.ears[0].rot < 0 && b.ears[1].rot > 0);
  }
});

test("an unknown stored mode resolves to the ledger, not to nothing", () => {
  for (const bad of [null, undefined, "", "beauty", "FIELD", 7]) {
    assert.equal(resolveUiMode(bad), DEFAULT_UI_MODE);
  }
  assert.equal(DEFAULT_UI_MODE, "work");
});

test("the two modes toggle into each other and nowhere else", () => {
  assert.equal(toggleUiMode("work"), "field");
  assert.equal(toggleUiMode("field"), "work");
  assert.equal(toggleUiMode("nonsense"), "field", "a corrupt value toggles off the default");
  assert.equal(isFieldMode("field"), true);
  assert.equal(isFieldMode("work"), false);
  assert.equal(isFieldMode(null), false);
});
