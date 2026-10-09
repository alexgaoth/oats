// The conversation contour — Oats' signature mark (DESIGN.md §9.8).
//
// A conversation, drawn as the thing it actually was: a line of time, thick
// where people spoke and thin where they did not, notched where the subject
// changed, marked above wherever somebody asked something, and tied back to
// itself wherever the room returned to a thread it had left.
//
// It replaces the pastoral field that used to sit behind every surface. The
// difference that matters is not that one is prettier: the field was invented
// by a noise function and told you nothing, and every pixel of this is a
// measurement of your own conversation. Two conversations cannot produce the
// same contour, and a conversation that went badly looks like it.
//
// Pure and DOM-free on purpose — the same reason `conversationGraph.mjs` and
// `conversationAide.mjs` are: `node:test` imports it directly, with no
// TypeScript build and no renderer, so the geometry can be pinned rather than
// eyeballed. Both the live contour and the miniature in the Intelligence list
// read this one model, so they cannot drift apart.

/** Buckets along the trace. Enough to show shape; few enough to stay a line. */
export const CONTOUR_RESOLUTION = 96;

/**
 * Density is smoothed across neighbours before it is drawn.
 *
 * Without this a contour is a bar chart of who happened to be talking during
 * each 1/96th of an hour, which is noise rather than shape — the eye reads
 * "busy" and nothing else.
 */
const SMOOTHING = 2;

/**
 * Words per second of speech, used to give an utterance a duration.
 *
 * Utterances arrive as instants — one timestamp, no end — and treating them as
 * instants is what made an early version of this useless: a twenty-minute
 * conversation of thirty utterances put thirty spikes into ninety-six buckets
 * and left the rest at zero, so every conversation drew the same flat comb and
 * the miniature in the list averaged it into an identical smear.
 *
 * Speech occupies time. A sentence of twenty words took about six seconds to
 * say, and spreading its weight across those six seconds is both truer and the
 * thing that makes two conversations look different: steady talking becomes a
 * full band, and a gap in the line is a gap in the room.
 *
 * 2.6 w/s is unhurried conversational English. It is a constant rather than a
 * measurement because the exact figure changes the shape not at all — what
 * matters is that long utterances occupy proportionally more time than short
 * ones.
 */
const WORDS_PER_SECOND = 2.6;

/** A bucket at or under this share of the loudest bucket reads as a silence. */
export const QUIET_THRESHOLD = 0.18;

/**
 * How a question's mark is drawn, per outcome.
 *
 * The shape says how settled the question is: filled when the room settled it,
 * half filled when the answer was hedged, a ring when nobody gave a verdict.
 * The shape carries the meaning by itself, so it reads in greyscale and with
 * colour blindness. The status colour repeats it. This is the same idiom as a
 * Linear status icon, and it replaces the v1 dither grain (DESIGN.md §6).
 */
export const OUTCOME_FILL = {
  answered: "solid", // settled
  denied: "solid", // settled: somebody said they did not know
  uncertain: "half", // hedged
  asked: "ring", // no verdict yet
  silence: "ring", // nobody answered
};

/** Rounds to 4dp so pinned geometry does not depend on float noise. */
function round(value) {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Words in an utterance. Deliberately crude: the contour needs "how much was
 * said", and a word count is a better proxy for that than character length,
 * which would make one long URL look like a minute of speech.
 *
 * CJK has no spaces, so a run of ideographs is counted per character — without
 * this a Japanese conversation renders as an almost flat line.
 */
export function speechWeight(text) {
  if (!text) return 0;
  const cjk = (text.match(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g) || []).length;
  const words = text
    .replace(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return words + cjk;
}

/**
 * Build the contour.
 *
 * @param {object} input
 * @param {Array<{ id?: string, text?: string, timestamp?: number }>} input.utterances
 *   Finalized speech, in order.
 * @param {Array<{ id?: string, question?: string, state?: string, createdAt?: number,
 *   groupKey?: string, occurrence?: number }>} [input.questions]
 *   Question cards. Repeats keep their own entry — a re-asking is the signal.
 * @param {Array<{ id?: string, label?: string, state?: string, startedAt?: number,
 *   lastTouchedAt?: number }>} [input.topics]
 *   Topic nodes from the tracker. Their starts become the trace's notches.
 * @param {Array<{ id?: string, at?: number, note?: string }>} [input.moments]
 *   Instants somebody pressed "Mark" (`conversationMoments.mjs`). The one
 *   element not measured from the room: it is the person in it saying *this*.
 * @param {number} [input.now] End of the window. Defaults to the last event.
 * @param {number} [input.startedAt] Start of the window. Defaults to the first.
 * @returns {{ points: Array<{x: number, y: number, quiet: boolean}>,
 *   marks: Array<object>, shifts: Array<object>, returns: Array<object>,
 *   moments: Array<{ id: string, x: number, at: number, note: string }>,
 *   span: number, start: number, empty: boolean }}
 *   `start` and `span` are the window in epoch ms, so a position on the trace
 *   can be turned back into the moment it stands for.
 *   All coordinates are normalized 0..1: `x` is time, `y` is speech density.
 *   The renderer owns pixels; this owns meaning.
 */
export function buildContour({
  utterances = [],
  questions = [],
  topics = [],
  moments = [],
  now,
  startedAt,
}) {
  const timed = utterances
    .filter((u) => Number.isFinite(u?.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const firstAt = Number.isFinite(startedAt) ? startedAt : timed.length ? timed[0].timestamp : null;
  const lastAt = Number.isFinite(now)
    ? now
    : timed.length
      ? timed[timed.length - 1].timestamp
      : null;

  // A conversation with nothing in it yet is not an error and must not be
  // faked. The surface draws a resting baseline and waits.
  if (firstAt === null || lastAt === null || lastAt <= firstAt) {
    return {
      points: [],
      marks: [],
      shifts: [],
      returns: [],
      moments: [],
      span: 0,
      start: 0,
      empty: true,
    };
  }

  const span = lastAt - firstAt;
  const at = (timestamp) => clamp01((timestamp - firstAt) / span);

  // Speech from outside the window is dropped, not clamped onto its edge.
  //
  // Continuing a recent conversation seeds up to half an hour of the previous
  // sitting's utterances into the store. With an explicit window starting at
  // the press, clamping piled every one of them onto x=0 — and because each
  // utterance is spread across the time it took to say, the pile then smeared
  // across the whole trace and drew a solid slab. Questions were already
  // dropped this way; speech has to agree with them.
  const inWindow = timed.filter(
    (utterance) => utterance.timestamp >= firstAt && utterance.timestamp <= lastAt
  );

  // 1. Speech density — words per unit time, with each utterance occupying the
  //    time it plausibly took to say rather than a single instant.
  const raw = new Array(CONTOUR_RESOLUTION).fill(0);
  const bucketMs = span / CONTOUR_RESOLUTION;
  for (const utterance of inWindow) {
    const weight = speechWeight(utterance.text);
    if (weight <= 0) continue;
    const start = at(utterance.timestamp) * CONTOUR_RESOLUTION;
    const durationMs = (weight / WORDS_PER_SECOND) * 1000;
    // Always at least one bucket: a one-word "no" is still a moment of speech.
    const width = Math.max(1, durationMs / bucketMs);
    const share = weight / width;
    for (let offset = 0; offset < width; offset += 1) {
      const bucket = Math.floor(start + offset);
      if (bucket < 0) continue;
      // `bucket` only ever increases, so running off the end means done — not
      // skip. `width` is `durationMs / bucketMs` and grows without bound as the
      // window shrinks, so with `continue` a transcript whose segments were all
      // stamped from a near-identical clock (200 utterances spanning 2ms) span
      // this loop for two seconds on the main thread. `break` caps it at 96.
      if (bucket >= CONTOUR_RESOLUTION) break;
      // The final bucket is usually a partial one.
      raw[bucket] += share * Math.min(1, width - offset);
    }
  }

  const smoothed = raw.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -SMOOTHING; offset <= SMOOTHING; offset += 1) {
      const neighbour = index + offset;
      if (neighbour < 0 || neighbour >= CONTOUR_RESOLUTION) continue;
      total += raw[neighbour];
      count += 1;
    }
    return total / count;
  });

  const peak = Math.max(...smoothed, 0);
  const points = smoothed.map((value, index) => {
    const normalized = peak > 0 ? value / peak : 0;
    return {
      x: round(index / (CONTOUR_RESOLUTION - 1)),
      y: round(normalized),
      // Marked rather than dropped: a silence in a conversation is content, and
      // the renderer draws it as a thinning of the line rather than a gap.
      quiet: normalized <= QUIET_THRESHOLD,
    };
  });

  // 2. Questions, as marks above the trace.
  const marks = questions
    .filter((card) => Number.isFinite(card?.createdAt))
    .filter((card) => card.createdAt >= firstAt && card.createdAt <= lastAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((card) => {
      const x = round(at(card.createdAt));
      const bucket = Math.min(CONTOUR_RESOLUTION - 1, Math.floor(x * CONTOUR_RESOLUTION));
      return {
        id: card.id ?? `q-${card.createdAt}`,
        x,
        // Sits on the line it belongs to, so a question reads as having been
        // asked *into* the conversation rather than floating over it.
        y: points[bucket]?.y ?? 0,
        state: card.state ?? "asked",
        fill: OUTCOME_FILL[card.state] ?? OUTCOME_FILL.asked,
        question: card.question ?? "",
        groupKey: card.groupKey ?? card.id ?? `q-${card.createdAt}`,
        occurrence: card.occurrence ?? 1,
      };
    });

  // 3. Topic shifts, as notches in the baseline.
  const shifts = topics
    .filter((topic) => Number.isFinite(topic?.startedAt))
    .filter((topic) => topic.startedAt > firstAt && topic.startedAt <= lastAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((topic) => ({
      id: topic.id ?? `t-${topic.startedAt}`,
      x: round(at(topic.startedAt)),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  // 4. Returns — the room coming back to a thread it had left.
  //
  // This is the one thing in the contour that a transcript cannot show you and
  // a summary always flattens: it is the difference between a subject that was
  // covered and a subject that would not go away. Drawn as an arc from where
  // the thread started to where it was picked up again.
  const returns = topics
    .filter((topic) => Number.isFinite(topic?.startedAt) && Number.isFinite(topic?.lastTouchedAt))
    .filter((topic) => topic.lastTouchedAt > topic.startedAt)
    .filter((topic) => topic.startedAt >= firstAt && topic.lastTouchedAt <= lastAt)
    // A thread touched again inside its own opening moment is one continuous
    // stretch of talking, not a return to it.
    .filter((topic) => topic.lastTouchedAt - topic.startedAt > span / CONTOUR_RESOLUTION)
    .map((topic) => ({
      id: topic.id ?? `r-${topic.startedAt}`,
      from: round(at(topic.startedAt)),
      to: round(at(topic.lastTouchedAt)),
      label: topic.label ?? "",
      state: topic.state ?? "open",
    }));

  // 5. Moments somebody marked, under the baseline. Outside the window they
  //    are dropped, like speech, rather than piled onto an edge.
  const marked = (Array.isArray(moments) ? moments : [])
    .filter((moment) => Number.isFinite(moment?.at))
    .filter((moment) => moment.at >= firstAt && moment.at <= lastAt)
    .sort((a, b) => a.at - b.at)
    .map((moment) => ({
      id: moment.id ?? `m-${moment.at}`,
      x: round(at(moment.at)),
      at: moment.at,
      note: moment.note ?? "",
    }));

  return {
    points,
    marks,
    shifts,
    returns,
    moments: marked,
    span,
    start: firstAt,
    empty: false,
  };
}

/**
 * The miniature used beside a conversation in the Intelligence list.
 *
 * Same model, fewer buckets: at 40px wide a 96-point trace is a smear. Marks
 * are kept — one glance should say "this conversation had three unanswered
 * questions in its last third", which is exactly the thing worth scanning a
 * list for.
 */
export function contourStrip(contour, buckets = 24) {
  if (!contour || contour.empty || !contour.points.length) {
    return {
      points: [],
      marks: [],
      shifts: [],
      returns: [],
      moments: [],
      span: 0,
      start: 0,
      empty: true,
    };
  }
  const points = [];
  for (let index = 0; index < buckets; index += 1) {
    const from = Math.floor((index / buckets) * contour.points.length);
    const to = Math.max(from + 1, Math.floor(((index + 1) / buckets) * contour.points.length));
    const slice = contour.points.slice(from, to);
    const value = slice.reduce((total, point) => total + point.y, 0) / (slice.length || 1);
    points.push({
      x: round(index / (buckets - 1)),
      y: round(value),
      quiet: value <= QUIET_THRESHOLD,
    });
  }
  // A complete contour, not a narrower shape.
  //
  // It used to return only points and trimmed marks while every caller cast it
  // to the full type, so a `label` prop on a list row would have read
  // `.shifts.length` off `undefined` and crashed with no type error to warn
  // anybody. The notches and arcs are genuinely empty at this size — that is a
  // rendering decision, and saying so in the data is cheaper than a second type
  // that has to be kept in step.
  return {
    points,
    marks: contour.marks.map((mark) => ({ ...mark })),
    shifts: [],
    returns: [],
    moments: [],
    span: contour.span,
    start: contour.start ?? 0,
    empty: false,
  };
}
