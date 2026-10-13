const test = require("node:test");
const assert = require("node:assert/strict");

// The contour's line (DESIGN.md §6): a monotone cubic through the measured
// points. A question's dot sits on it, so `monotoneAt` must be the drawn curve.

let monotoneTangents;
let monotoneAt;

test.before(async () => {
  ({ monotoneTangents, monotoneAt } = await import("../../src/helpers/chartCurve.mjs"));
});

const line = (values, step = 10) => values.map((y, index) => ({ x: index * step, y }));

/** The drawn piece as the canvas draws it: one Bézier, sampled at t. */
function bezier(a, b, ta, tb, t) {
  const h = b.x - a.x;
  const p = [
    { x: a.x, y: a.y },
    { x: a.x + h / 3, y: a.y + (ta * h) / 3 },
    { x: b.x - h / 3, y: b.y - (tb * h) / 3 },
    { x: b.x, y: b.y },
  ];
  const u = 1 - t;
  const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: weights.reduce((sum, w, index) => sum + w * p[index].x, 0),
    y: weights.reduce((sum, w, index) => sum + w * p[index].y, 0),
  };
}

test("it passes through every point", () => {
  const points = line([40, 12, 70, 70, 3, 55]);
  const tangents = monotoneTangents(points);
  for (const point of points) assert.equal(monotoneAt(points, tangents, point.x), point.y);
});

test("it never overshoots: between two points it stays between them", () => {
  const points = line([40, 12, 70, 69, 3, 55, 55, 80, 0]);
  const tangents = monotoneTangents(points);
  for (let index = 0; index < points.length - 1; index += 1) {
    const low = Math.min(points[index].y, points[index + 1].y);
    const high = Math.max(points[index].y, points[index + 1].y);
    for (let k = 1; k < 20; k += 1) {
      const x = points[index].x + (k / 20) * (points[index + 1].x - points[index].x);
      const y = monotoneAt(points, tangents, x);
      assert.ok(y >= low - 1e-9 && y <= high + 1e-9, `${y} outside ${low}..${high} at x=${x}`);
    }
  }
});

test("a peak and a trough are flat, so the line keeps every rise and fall", () => {
  const tangents = monotoneTangents(line([0, 10, 0, -5, 3]));
  assert.equal(tangents[1], 0);
  assert.equal(tangents[3], 0);
});

test("monotoneAt is the curve the canvas draws, so a dot sits on the line", () => {
  const points = line([60, 20, 75, 74, 8, 50], 7.5);
  const tangents = monotoneTangents(points);
  for (let index = 0; index < points.length - 1; index += 1) {
    for (let k = 0; k <= 10; k += 1) {
      const drawn = bezier(points[index], points[index + 1], tangents[index], tangents[index + 1], k / 10);
      assert.ok(Math.abs(monotoneAt(points, tangents, drawn.x) - drawn.y) < 1e-9);
    }
  }
});

test("outside the points it holds the ends, and degenerate input does not throw", () => {
  const points = line([5, 9]);
  const tangents = monotoneTangents(points);
  assert.equal(monotoneAt(points, tangents, -100), 5);
  assert.equal(monotoneAt(points, tangents, 1000), 9);
  assert.equal(monotoneAt(points, tangents, 5), 7);
  assert.deepEqual(monotoneTangents([]), []);
  assert.deepEqual(monotoneTangents([{ x: 0, y: 1 }]), [0]);
  assert.equal(monotoneAt([], [], 3), 0);
  assert.equal(monotoneAt([{ x: 0, y: 4 }], [0], 3), 4);
});
