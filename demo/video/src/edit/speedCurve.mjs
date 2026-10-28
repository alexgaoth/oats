// A speed curve over a clip, for the film's fast stretches.
//
// Each point names a moment of the clip (`at`, seconds) and how fast the film
// plays it there (`speed`, clip seconds per film second). Between two points
// the speed changes on an S-curve over the clip's position, so a stretch can
// be fast through what does not matter and slow, but never stopped, around
// what does: the time-lapse lingers where the room comes back to the launch
// date, and the question scene where the card turns Unknown.
//
// Shared by director/bake-lapse.mjs (which bakes the time-lapse's frames) and
// the film (which plays a scene on it and places a moment by the clip).

/**
 * @param {{ at: number, speed: number }[]} points in clip order
 * @returns {{ start: number, end: number, seconds: number,
 *   clipAt: (filmSeconds: number) => number, filmAt: (clipSeconds: number) => number }}
 */
export function speedCurve(points, step = 1 / 600) {
  const smooth = (u) => u * u * (3 - 2 * u);
  const speedAt = (x) => {
    if (x <= points[0].at) return points[0].speed;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (x <= b.at) return a.speed + (b.speed - a.speed) * smooth((x - a.at) / (b.at - a.at));
    }
    return points[points.length - 1].speed;
  };
  const start = points[0].at;
  const end = points[points.length - 1].at;
  // Film time along the clip, in small steps of film time.
  const clips = [start];
  const films = [0];
  let x = start;
  let t = 0;
  while (x < end) {
    x = Math.min(end, x + speedAt(x) * step);
    t += step;
    clips.push(x);
    films.push(t);
  }
  const seconds = t;
  const lastSpeed = points[points.length - 1].speed;
  const lerp = (xs, ys, value) => {
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= value) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo] || 1;
    return ys[lo] + ((ys[hi] - ys[lo]) * (value - xs[lo])) / span;
  };
  return {
    start,
    end,
    seconds,
    clipAt: (filmSeconds) =>
      filmSeconds <= 0 ? start : filmSeconds >= seconds ? end + (filmSeconds - seconds) * lastSpeed : lerp(films, clips, filmSeconds),
    filmAt: (clipSeconds) =>
      clipSeconds <= start ? 0 : clipSeconds >= end ? seconds + (clipSeconds - end) / lastSpeed : lerp(clips, films, clipSeconds),
  };
}
