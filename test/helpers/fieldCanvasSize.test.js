const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The field's grain is locked to device pixels (DESIGN.md §7). That holds only
// while a canvas's backing store is exactly the pixels it covers, at any CSS
// size, on any display, at rest as well as while the wind blows.

const read = (file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
const GL = read("src/components/conversation/field/FieldGL.tsx");
const CANVAS = read("src/components/conversation/field/FieldCanvas.tsx");
const SHADERS = read("src/components/conversation/field/shaders.ts");

const loadSize = () => import("../../src/components/conversation/field/canvasSize.ts");
const loadModel = () => import("../../src/components/conversation/field/fieldModel.ts");

test("the backing store is the device pixels the canvas covers", async () => {
  const { backingSize } = await loadSize();
  assert.deepEqual(backingSize(231, 240, 462, 480, 2), { w: 462, h: 480 });
  // A fractional CSS height: the edges snap, so the pixels are measured, not
  // multiplied out.
  assert.deepEqual(backingSize(231, 187.5, 231, 188, 1), { w: 231, h: 188 });
  assert.deepEqual(backingSize(231, 187.25, 462, 374, 2), { w: 462, h: 374 });
});

test("before the pixels are measured, or when they disagree with the ratio, the ratio decides", async () => {
  const { backingSize } = await loadSize();
  assert.deepEqual(backingSize(231, 96, 0, 0, 2), { w: 462, h: 192 });
  // DevTools device emulation reports 1x pixels for a page drawn at 2x.
  assert.deepEqual(backingSize(231, 96, 231, 96, 2), { w: 462, h: 192 });
});

test("above 2x the store stays capped at 2x", async () => {
  const { backingSize } = await loadSize();
  assert.deepEqual(backingSize(231, 96, 693, 288, 3), { w: 462, h: 192 });
});

test("both renderers watch the canvas's device pixels, so a new display redraws it", () => {
  for (const source of [GL, CANVAS]) {
    assert.match(source, /observeDevicePixels\(\w+, canvas\)/);
    assert.match(source, /devicePixelContentBoxSize/);
    assert.match(source, /backingSize\(/);
  }
  assert.match(
    read("src/components/conversation/field/canvasSize.ts"),
    /box: "device-pixel-content-box"/
  );
});

test("a still 2D field draws again when its canvas changes size", () => {
  // A still frame is drawn once; without this, a resize stretched it.
  assert.match(CANVAS, /redrawRef\.current = \(\) => draw\(INTRO_MS\);/);
  assert.match(CANVAS, /new ResizeObserver\([\s\S]*?redrawRef\.current\?\.\(\);/);
});

test("by default the scene is the canvas, as the full backdrop has always drawn it", async () => {
  const { sceneFrame } = await loadModel();
  for (const height of [96, 800, 1200]) {
    const frame = sceneFrame(height);
    assert.equal(frame.scale, height);
    for (const fraction of [0, 0.57, 1, 1.12]) {
      assert.ok(Math.abs(frame.y(fraction) - fraction * height) < 1e-9);
    }
  }
});

test("given its own height, the scene stands on the canvas's bottom edge", async () => {
  const { sceneFrame } = await loadModel();
  const frame = sceneFrame(240, 120);
  assert.equal(frame.scale, 120);
  assert.equal(frame.y(1), 240, "the scene's foot is the canvas's foot");
  assert.equal(frame.y(0), 120, "above the scene's top is more sky");
});

test("every pass places the scene by its own height, not the canvas's", () => {
  // Blades, chaff and the backdrop each read uSceneH, and the blades root up
  // from the canvas's bottom edge.
  assert.equal(SHADERS.split("uniform float uSceneH;").length - 1, 3);
  assert.match(SHADERS, /float baseY {2}= uResolution\.y - \(1\.0 - bandDepth\) \* uSceneH;/);
  // The horizon is the composition's (uHorizon), placed by the scene's height.
  assert.match(SHADERS, /float horizon = \(1\.0 - uHorizon\) \* k;/);
  for (const program of ["backdropU", "bladeU", "chaffU"]) {
    assert.match(GL, new RegExp(`gl\\.uniform1f\\(${program}\\.sceneH, sceneH\\);`));
  }
});
