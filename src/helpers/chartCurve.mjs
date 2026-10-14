// A monotone cubic through a chart's points (DESIGN.md §6): every rise and fall
// is kept, and the curve never overshoots a point, so a peak is never drawn
// higher than it was measured and a silence never dips below the baseline.
//
// Pure and DOM-free, pinned by `test/helpers/chartCurve.test.js`. The canvas
// side draws each piece as one Bézier (`traceMonotone` in
// `components/charts/chartStyle.ts`); `monotoneAt` is the same curve as a
// function of x, so a mark can sit exactly on the line it belongs to.

/**
 * The curve's slope at each point (Fritsch–Butland: a weighted harmonic mean
 * of the neighbouring secants, 0 at a peak or a trough).
 *
 * @param {{ x: number, y: number }[]} points Sorted by x, with distinct x.
 * @returns {number[]} dy/dx at each point.
 */
export function monotoneTangents(points) {
  const count = points.length;
  if (count < 2) return points.map(() => 0);
  const dx = [];
  const secant = [];
  for (let index = 0; index < count - 1; index += 1) {
    dx[index] = points[index + 1].x - points[index].x;
    secant[index] = dx[index] ? (points[index + 1].y - points[index].y) / dx[index] : 0;
  }
  const tangents = new Array(count);
  tangents[0] = secant[0];
  tangents[count - 1] = secant[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    const before = secant[index - 1];
    const after = secant[index];
    if (before * after <= 0) {
      tangents[index] = 0;
      continue;
    }
    const w1 = 2 * dx[index] + dx[index - 1];
    const w2 = dx[index] + 2 * dx[index - 1];
    tangents[index] = (w1 + w2) / (w1 / before + w2 / after);
  }
  return tangents;
}

/**
 * The curve's y at `x`: each piece is a cubic Hermite whose x moves evenly
 * with its parameter, so this is exact, not an estimate. Outside the points it
 * holds the end value.
 *
 * @param {{ x: number, y: number }[]} points Sorted by x.
 * @param {number[]} tangents From `monotoneTangents(points)`.
 * @param {number} x
 */
export function monotoneAt(points, tangents, x) {
  const count = points.length;
  if (!count) return 0;
  if (count === 1 || x <= points[0].x) return points[0].y;
  if (x >= points[count - 1].x) return points[count - 1].y;
  // The piece that holds x: a binary search, since a live window has 240.
  let low = 0;
  let high = count - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].x <= x) low = middle;
    else high = middle;
  }
  const a = points[low];
  const b = points[high];
  const h = b.x - a.x;
  if (!h) return a.y;
  const t = (x - a.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a.y +
    (t3 - 2 * t2 + t) * h * tangents[low] +
    (-2 * t3 + 3 * t2) * b.y +
    (t3 - t2) * h * tangents[high]
  );
}
