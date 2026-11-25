// Who spoke each line of a conversation recorded in one room, from one voice
// embedding per line.
//
// The app's lines are cut where people pause (speechSegmenter.mjs), so most
// hold one person. Each line long enough to carry a voice gets one embedding
// (a 3D-Speaker model over kaldiFbank.mjs features), and the lines are
// grouped into people by spectral clustering, the count of people guessed
// from the eigengap (NME-SC: Park et al., 2020). The diarizer this replaces
// cut the room into pieces too short to carry a voice and found 21 to 58
// "voices" in a two-person conversation; over twelve recorded two-person
// conversations it did not tune on, this puts 92% of the lines on the right
// person and shows two people in eleven (docs/room-speakers.md).
//
// The rest of the rule:
//  - Lines from MIN_CLUSTER_MS are grouped. Shorter lines with an embedding
//    (from MIN_EMBED_MS) join the group whose centre is nearest; lines with
//    none get no turn, and the reader's nearest-turn rule places them
//    (speakerTurns.mjs).
//  - At least two people are looked for: the eigengap of one group is the
//    largest for most conversations, people or not. A group with under
//    SMALL_SHARE of the grouped speech then joins the nearest bigger one, so a
//    talk by one person ends as one group (three of four single-speaker
//    recordings; the fourth kept a 7% group, which the reader's phantom rule
//    drops).
//  - Two groups whose centres are SAME_VOICE_SIM alike or more are one voice:
//    spectral clustering splits one person's lines in two when it must find
//    two. Two people's centres were at most 0.72 alike in twenty two-person
//    conversations.
//  - Over MAX_CLUSTER_LINES, the longest lines are grouped and the others
//    join the nearest group: the eigendecomposition grows with the cube of
//    the lines.
//
// Pure and DOM-free; pinned by test/helpers/roomVoices.test.js.

export const ROOM_VOICES = Object.freeze({
  MIN_CLUSTER_MS: 1000,
  MIN_EMBED_MS: 500,
  MIN_LINES: 4,
  MAX_CLUSTER_LINES: 600,
  MAX_PEOPLE: 8,
  SMALL_SHARE: 0.05,
  SAME_VOICE_SIM: 0.8,
  P_VALUES: [0.05, 0.1, 0.15, 0.2],
  RESTARTS: 10,
});

function normalize(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float64Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** A small seeded generator (mulberry32), so a conversation always groups the same way. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Eigenvalues (ascending) and eigenvectors (columns of `vectors`) of a
 * symmetric matrix: Householder tridiagonalisation and the QL method with
 * implicit shifts, as in JAMA's tred2 and tql2 (public domain).
 * @param {Float64Array[]} matrix n rows of n
 */
export function symmetricEigen(matrix) {
  const n = matrix.length;
  const V = matrix.map((row) => Float64Array.from(row));
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0;
    let h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) {
      e[i] = d[i - 1];
      for (let j = 0; j < i; j++) {
        d[j] = V[i - 1][j];
        V[i][j] = 0;
        V[j][i] = 0;
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] /= scale;
        h += d[k] * d[k];
      }
      let f = d[i - 1];
      let g = Math.sqrt(h);
      if (f > 0) g = -g;
      e[i] = scale * g;
      h -= f * g;
      d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) {
        f = d[j];
        V[j][i] = f;
        g = e[j] + V[j][j] * f;
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k][j] * d[k];
          e[k] += V[k][j] * f;
        }
        e[j] = g;
      }
      f = 0;
      for (let j = 0; j < i; j++) {
        e[j] /= h;
        f += e[j] * d[j];
      }
      const hh = f / (h + h);
      for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) {
        f = d[j];
        g = e[j];
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
        d[j] = V[i - 1][j];
        V[i][j] = 0;
      }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i];
    V[i][i] = 1;
    const h = d[i + 1];
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
      for (let j = 0; j <= i; j++) {
        let g = 0;
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[n - 1][j];
    V[n - 1][j] = 0;
  }
  V[n - 1][n - 1] = 1;
  e[0] = 0;

  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0;
  let tst1 = 0;
  const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l;
    while (m < n && Math.abs(e[m]) > eps * tst1) m++;
    if (m > l) {
      let iterations = 0;
      do {
        iterations++;
        let g = d[l];
        let p = (d[l + 1] - g) / (2 * e[l]);
        let r = Math.hypot(p, 1);
        if (p < 0) r = -r;
        d[l] = e[l] / (p + r);
        d[l + 1] = e[l] * (p + r);
        const dl1 = d[l + 1];
        let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h;
        p = d[m];
        let c = 1;
        let c2 = c;
        let c3 = c;
        const el1 = e[l + 1];
        let s = 0;
        let s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2;
          c2 = c;
          s2 = s;
          g = c * e[i];
          h = c * p;
          r = Math.hypot(p, e[i]);
          e[i + 1] = s * r;
          s = e[i] / r;
          c = p / r;
          p = c * d[i] - s * g;
          d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1];
            V[k][i + 1] = s * V[k][i] + c * h;
            V[k][i] = c * V[k][i] - s * h;
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1;
        e[l] = s * p;
        d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1 && iterations < 60);
    }
    d[l] += f;
    e[l] = 0;
  }

  const order = [...d.keys()].sort((a, b) => d[a] - d[b]);
  const values = Float64Array.from(order, (i) => d[i]);
  const vectors = V.map((row) => Float64Array.from(order, (i) => row[i]));
  return { values, vectors };
}

/** Spherical k-means (unit vectors, cosine), k-means++ starts, the best of several. */
function sphericalKMeans(points, k, rand, restarts) {
  const n = points.length;
  const dim = points[0].length;
  let best = null;
  let bestScore = -Infinity;
  for (let run = 0; run < restarts; run++) {
    const centres = [points[Math.floor(rand() * n)]];
    while (centres.length < k) {
      const far = points.map((p) => Math.max(0, 1 - Math.max(...centres.map((c) => dot(p, c)))));
      const total = far.reduce((a, b) => a + b, 0);
      let pick = Math.floor(rand() * n);
      if (total > 0) {
        let target = rand() * total;
        for (let i = 0; i < n; i++) {
          target -= far[i];
          if (target <= 0) {
            pick = i;
            break;
          }
        }
      }
      centres.push(points[pick]);
    }
    let labels = new Int32Array(n);
    for (let iteration = 0; iteration < 50; iteration++) {
      const next = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        let top = -Infinity;
        for (let c = 0; c < k; c++) {
          const sim = dot(points[i], centres[c]);
          if (sim > top) [top, next[i]] = [sim, c];
        }
      }
      let changed = iteration === 0;
      for (let i = 0; i < n && !changed; i++) changed = next[i] !== labels[i];
      labels = next;
      for (let c = 0; c < k; c++) {
        const sum = new Float64Array(dim);
        let count = 0;
        for (let i = 0; i < n; i++) {
          if (labels[i] !== c) continue;
          count++;
          for (let j = 0; j < dim; j++) sum[j] += points[i][j];
        }
        if (count) centres[c] = normalize(sum);
      }
      if (!changed) break;
    }
    let score = 0;
    for (let i = 0; i < n; i++) score += dot(points[i], centres[labels[i]]);
    if (score > bestScore) [best, bestScore] = [labels, score];
  }
  return best;
}

/**
 * Spectral clustering with the count from the normalised maximum eigengap
 * (NME-SC): for each pruning p, keep each line's top p of similarities, take
 * the Laplacian's eigenvalues, and choose the p whose largest gap (from
 * `minPeople` on) is the most decisive.
 */
function spectralGroups(points, { minPeople, maxPeople, pValues, rand, restarts }) {
  const n = points.length;
  const sims = points.map((a) => Float64Array.from(points, (b) => dot(a, b)));
  const kMax = Math.min(maxPeople, n - 1);
  let best = null;
  for (const p of pValues) {
    const keep = Math.max(2, Math.ceil(p * n));
    const A = sims.map((row) => {
      const kept = new Float64Array(n);
      const order = [...row.keys()].sort((a, b) => row[b] - row[a]).slice(0, keep);
      for (const j of order) kept[j] = row[j];
      return kept;
    });
    const L = A.map((row, i) =>
      Float64Array.from(row, (_, j) => -Math.max(0, (A[i][j] + A[j][i]) / 2))
    );
    for (let i = 0; i < n; i++) {
      let degree = 0;
      for (let j = 0; j < n; j++) if (j !== i) degree -= L[i][j];
      L[i][i] = degree;
    }
    const { values, vectors } = symmetricEigen(L);
    let k = minPeople;
    let gap = -Infinity;
    for (let j = minPeople; j <= kMax; j++) {
      const g = values[j] - values[j - 1];
      if (g > gap) [gap, k] = [g, j];
    }
    const score = p / Math.max(1e-9, gap);
    if (!best || score < best.score) best = { score, k, vectors };
  }
  const rows = best.vectors.map((row) => normalize(row.subarray(0, best.k)));
  return sphericalKMeans(rows, best.k, rand, restarts);
}

/**
 * Who said each line. Lines are `{ startMs, endMs, embedding }`, the
 * embedding a voice vector or null. Returns the diarizer's turn shape, one
 * turn a labelled line, `{ start, end, speaker }` in seconds and
 * `speaker_NN` by group; empty when there is no conversation to divide.
 * @param {Array<{ startMs: number, endMs: number, embedding?: ArrayLike<number> | null }>} lines
 * @param {Partial<typeof ROOM_VOICES> & { seed?: number }} [options]
 */
export function groupVoices(lines, options = {}) {
  const o = { ...ROOM_VOICES, ...options };
  const items = (Array.isArray(lines) ? lines : [])
    .filter(
      (l) => l && Number.isFinite(l.startMs) && Number.isFinite(l.endMs) && l.endMs > l.startMs
    )
    .filter((l) => l.embedding && l.embedding.length && l.endMs - l.startMs >= o.MIN_EMBED_MS)
    .map((l) => ({ ...l, ms: l.endMs - l.startMs, unit: normalize(l.embedding) }));
  const grouped = items
    .filter((l) => l.ms >= o.MIN_CLUSTER_MS)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, o.MAX_CLUSTER_LINES);
  if (grouped.length < o.MIN_LINES) return [];

  const rand = random(o.seed ?? 1);
  const labels = spectralGroups(
    grouped.map((l) => l.unit),
    { minPeople: 2, maxPeople: o.MAX_PEOPLE, pValues: o.P_VALUES, rand, restarts: o.RESTARTS }
  );

  const centre = (group) => {
    const sum = new Float64Array(grouped[0].unit.length);
    grouped.forEach((l, i) => {
      if (labels[i] === group) for (let j = 0; j < sum.length; j++) sum[j] += l.unit[j];
    });
    return normalize(sum);
  };
  // A group under SMALL_SHARE of the grouped speech joins the nearest bigger one.
  const total = grouped.reduce((sum, l) => sum + l.ms, 0);
  const share = new Map();
  grouped.forEach((l, i) => share.set(labels[i], (share.get(labels[i]) ?? 0) + l.ms / total));
  const groups = [...share.keys()];
  let big = groups.filter((g) => share.get(g) >= o.SMALL_SHARE);
  if (!big.length) big = [groups.reduce((a, b) => (share.get(a) >= share.get(b) ? a : b))];
  const centres = new Map(groups.map((g) => [g, centre(g)]));
  for (const g of groups) {
    if (big.includes(g)) continue;
    const into = big.reduce((a, b) =>
      dot(centres.get(g), centres.get(a)) >= dot(centres.get(g), centres.get(b)) ? a : b
    );
    for (let i = 0; i < labels.length; i++) if (labels[i] === g) labels[i] = into;
  }
  // Groups this alike are one voice.
  for (;;) {
    let pair = null;
    let top = o.SAME_VOICE_SIM;
    const now = big.map((g) => [g, centre(g)]);
    for (let a = 0; a < now.length; a++) {
      for (let b = a + 1; b < now.length; b++) {
        const sim = dot(now[a][1], now[b][1]);
        if (sim >= top) [top, pair] = [sim, [now[a][0], now[b][0]]];
      }
    }
    if (!pair) break;
    for (let i = 0; i < labels.length; i++) if (labels[i] === pair[1]) labels[i] = pair[0];
    big = big.filter((g) => g !== pair[1]);
  }
  const finalCentres = new Map(big.map((g) => [g, centre(g)]));
  const byLine = new Map(grouped.map((l, i) => [l, labels[i]]));

  const names = new Map();
  const turns = [];
  for (const l of [...items].sort((a, b) => a.startMs - b.startMs)) {
    let group = byLine.get(l);
    if (group === undefined) {
      group = big.reduce((a, b) =>
        dot(l.unit, finalCentres.get(a)) >= dot(l.unit, finalCentres.get(b)) ? a : b
      );
    }
    if (!names.has(group)) names.set(group, `speaker_${String(names.size).padStart(2, "0")}`);
    turns.push({ start: l.startMs / 1000, end: l.endMs / 1000, speaker: names.get(group) });
  }
  return turns;
}
